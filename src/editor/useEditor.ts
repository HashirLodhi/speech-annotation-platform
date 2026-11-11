import { useCallback, useRef, useState } from 'react';
import type { AudioItem, PIISpan, PIIType, Segment, Speaker } from '../types';
import { useStore } from '../lib/store';
import { detectPII, reconcileSpans } from '../lib/pii';
import { SPEAKER_COLORS, clamp, uid } from '../lib/util';

interface Snap {
  segments: Segment[];
  speakers: Speaker[];
}

const byStart = (a: Segment, b: Segment) => a.start - b.start || a.end - b.end;

/** Editing operations + undo/redo for one item. Items are immutable so snapshots are just references. */
export function useEditor(itemId: string) {
  const item = useStore((s) => s.items.find((i) => i.id === itemId));
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const coalesce = useRef<{ key: string; t: number } | null>(null);
  const [, bump] = useState(0);

  const cur = () => useStore.getState().items.find((i) => i.id === itemId)!;
  const write = (patch: Partial<AudioItem>) => useStore.getState().updateItem(itemId, patch);

  const push = useCallback((key?: string) => {
    const now = Date.now();
    if (key && coalesce.current?.key === key && now - coalesce.current.t < 1500) {
      coalesce.current.t = now;
      return;
    }
    coalesce.current = key ? { key, t: now } : null;
    const it = useStore.getState().items.find((i) => i.id === itemId)!;
    past.current.push({ segments: it.segments, speakers: it.speakers });
    if (past.current.length > 200) past.current.shift();
    future.current = [];
    bump((n) => n + 1);
  }, [itemId]);

  const setSegments = (segments: Segment[], key?: string) => {
    push(key);
    write({ segments: [...segments].sort(byStart) });
  };

  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    const it = cur();
    future.current.push({ segments: it.segments, speakers: it.speakers });
    coalesce.current = null;
    write(prev);
    bump((n) => n + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    const it = cur();
    past.current.push({ segments: it.segments, speakers: it.speakers });
    coalesce.current = null;
    write(next);
    bump((n) => n + 1);
  };

  return {
    item,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    undo,
    redo,
    beginTransaction: () => push(),
    patch: write,

    /** Edit segment fields. Pass a coalesce key while typing so one undo step covers a burst of keystrokes. */
    updateSegment(id: string, patch: Partial<Segment>, key?: string, transient = false) {
      const it = cur();
      if (!transient) push(key);
      const segments = it.segments.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        if (patch.text !== undefined) next.pii = reconcileSpans(s.pii, patch.text);
        return next;
      });
      write({ segments: transient ? segments : [...segments].sort(byStart) });
    },

    addSegment(start: number, end: number, speakerId: string | null = null): string {
      const it = cur();
      const seg: Segment = { id: uid(), start, end, speakerId, text: '', tags: [], pii: [] };
      setSegments([...it.segments, seg]);
      return seg.id;
    },

    deleteSegment(id: string) {
      setSegments(cur().segments.filter((s) => s.id !== id));
    },

    splitAt(id: string, t: number): string | null {
      const it = cur();
      const s = it.segments.find((x) => x.id === id);
      if (!s || t <= s.start + 0.1 || t >= s.end - 0.1) return null;
      const words = s.text.trim() ? s.text.trim().split(/\s+/) : [];
      const k = Math.round((words.length * (t - s.start)) / (s.end - s.start));
      const aText = words.slice(0, k).join(' ');
      const bText = words.slice(k).join(' ');
      const a: Segment = { ...s, end: t, text: aText, pii: reconcileSpans(s.pii, aText) };
      const b: Segment = { ...s, id: uid(), start: t, text: bText, pii: reconcileSpans(s.pii, bText) };
      setSegments([...it.segments.filter((x) => x.id !== id), a, b]);
      return b.id;
    },

    mergeNext(id: string) {
      const it = cur();
      const sorted = [...it.segments].sort(byStart);
      const i = sorted.findIndex((x) => x.id === id);
      if (i < 0 || i >= sorted.length - 1) return;
      const a = sorted[i];
      const b = sorted[i + 1];
      const text = [a.text, b.text].filter(Boolean).join(' ');
      const off = a.text ? a.text.length + 1 : 0;
      const pii = [...a.pii, ...b.pii.map((p) => ({ ...p, start: p.start + off, end: p.end + off }))];
      const merged: Segment = { ...a, end: Math.max(a.end, b.end), text, tags: [...new Set([...a.tags, ...b.tags])], pii: reconcileSpans(pii, text) };
      setSegments([...sorted.slice(0, i), merged, ...sorted.slice(i + 2)]);
    },

    // ---- speakers ----
    addSpeaker(name?: string): string {
      const it = cur();
      push();
      const sp: Speaker = { id: uid(), name: name ?? `Speaker ${it.speakers.length + 1}`, color: SPEAKER_COLORS[it.speakers.length % SPEAKER_COLORS.length] };
      write({ speakers: [...it.speakers, sp] });
      return sp.id;
    },
    updateSpeaker(id: string, patch: Partial<Speaker>, key?: string) {
      push(key ? `sp-${id}-${key}` : undefined);
      write({ speakers: cur().speakers.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
    },
    /** Remove a speaker; its segments move to `reassignTo` (or become unassigned). */
    removeSpeaker(id: string, reassignTo: string | null = null) {
      const it = cur();
      push();
      write({
        speakers: it.speakers.filter((s) => s.id !== id),
        segments: it.segments.map((s) => (s.speakerId === id ? { ...s, speakerId: reassignTo } : s)),
      });
    },

    // ---- PII ----
    addPII(segId: string, start: number, end: number, type: PIIType) {
      const it = cur();
      const s = it.segments.find((x) => x.id === segId);
      if (!s || end <= start) return;
      push();
      const span: PIISpan = { id: uid(), start, end, type, text: s.text.slice(start, end) };
      const kept = s.pii.filter((p) => p.end <= start || p.start >= end);
      write({ segments: it.segments.map((x) => (x.id === segId ? { ...x, pii: [...kept, span].sort((a, b) => a.start - b.start) } : x)) });
    },
    removePII(segId: string, spanId: string) {
      push();
      write({ segments: cur().segments.map((x) => (x.id === segId ? { ...x, pii: x.pii.filter((p) => p.id !== spanId) } : x)) });
    },
    /** Run heuristic detection; keeps existing manual spans and adds non-overlapping detections. Returns count added. */
    autoDetectPII(onlySegId?: string): number {
      const it = cur();
      push();
      let added = 0;
      const segments = it.segments.map((s) => {
        if (onlySegId && s.id !== onlySegId) return s;
        const fresh = detectPII(s.text).filter((d) => !s.pii.some((p) => p.start < d.end && p.end > d.start));
        added += fresh.length;
        return { ...s, pii: [...s.pii, ...fresh].sort((a, b) => a.start - b.start) };
      });
      write({ segments });
      return added;
    },
    clearAutoPII() {
      push();
      write({ segments: cur().segments.map((s) => ({ ...s, pii: s.pii.filter((p) => !p.auto) })) });
    },

    clampTime: (t: number) => clamp(t, 0, cur().duration),
  };
}

export type Editor = ReturnType<typeof useEditor>;
