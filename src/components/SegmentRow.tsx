import { AlertTriangle, Merge, Play, Scissors, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PIIType, ProjectType, Segment, Speaker } from '../types';
import { PII_TYPES, piiColor } from '../lib/pii';
import { fmtTime, parseTime } from '../lib/util';
import { TAGS } from '../lib/constants';
import type { Severity } from '../lib/validate';

export function TimeInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) {
      const v = parseTime(draft);
      if (isFinite(v)) onCommit(v);
      setDraft(null);
    }
  };
  return (
    <input
      className="w-[74px] rounded border border-ink-500 bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] text-slate-300 focus:border-accent focus:outline-none"
      value={draft ?? fmtTime(value)}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}

export function HighlightedText({ seg }: { seg: Segment }) {
  const parts: React.ReactNode[] = [];
  let pos = 0;
  [...seg.pii]
    .sort((a, b) => a.start - b.start)
    .forEach((p) => {
      if (p.start < pos) return;
      parts.push(seg.text.slice(pos, p.start));
      parts.push(
        <mark key={p.id} className="rounded px-0.5 text-white" style={{ background: piiColor(p.type) + '55', boxShadow: `inset 0 -2px 0 ${piiColor(p.type)}` }} title={p.type}>
          {seg.text.slice(p.start, p.end)}
          <sup className="ml-0.5 text-[8px] font-semibold opacity-80">{p.type}</sup>
        </mark>,
      );
      pos = p.end;
    });
  parts.push(seg.text.slice(pos));
  return <div className="rounded-md bg-ink-900/60 px-2 py-1.5 text-xs leading-relaxed text-slate-300">{parts}</div>;
}

interface Props {
  seg: Segment;
  index: number;
  type: ProjectType;
  speakers: Speaker[];
  selected: boolean;
  active: boolean;
  worst: Severity | null;
  onSelect: () => void;
  onPlay: () => void;
  onSplit: () => void;
  onMerge: () => void;
  onDelete: () => void;
  onChange: (patch: Partial<Segment>, key?: string) => void;
  onPII: (start: number, end: number, type: PIIType) => void;
  onRemovePII: (spanId: string) => void;
  onAutoPII: () => void;
  isLast: boolean;
}

export function SegmentRow(p: Props) {
  const { seg, speakers } = p;
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const speaker = speakers.find((s) => s.id === seg.speakerId);
  const color = speaker?.color ?? '#64748b';

  useEffect(() => {
    const t = taRef.current;
    if (t) {
      t.style.height = 'auto';
      t.style.height = `${t.scrollHeight}px`;
    }
  }, [seg.text]);

  const hasSel = sel[1] > sel[0];
  const tags = TAGS[p.type];
  const sevColor = p.worst === 'error' ? 'text-red-400' : p.worst === 'warn' ? 'text-amber-400' : 'text-sky-400';

  return (
    <div
      id={`seg-${seg.id}`}
      onMouseDown={p.onSelect}
      className={`rounded-lg border-l-4 border-y border-r px-3 py-2 transition-colors ${
        p.selected ? 'border-y-ink-500 border-r-ink-500 bg-ink-700' : 'border-y-ink-600 border-r-ink-600 bg-ink-800 hover:bg-ink-700/60'
      } ${p.active ? 'ring-1 ring-accent/60' : ''}`}
      style={{ borderLeftColor: color }}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="w-6 font-mono text-[11px] text-slate-500">#{p.index + 1}</span>
        <select
          className="rounded border border-ink-500 bg-ink-900 px-1.5 py-0.5 text-[11px] focus:border-accent focus:outline-none"
          style={{ color }}
          value={seg.speakerId ?? ''}
          onChange={(e) => p.onChange({ speakerId: e.target.value || null })}
        >
          <option value="">— no speaker —</option>
          {speakers.map((s, i) => (
            <option key={s.id} value={s.id}>
              {i < 9 ? `${i + 1} · ` : ''}
              {s.name}
            </option>
          ))}
        </select>
        <TimeInput value={seg.start} onCommit={(v) => p.onChange({ start: v })} />
        <span className="text-slate-600">→</span>
        <TimeInput value={seg.end} onCommit={(v) => p.onChange({ end: v })} />
        <span className="font-mono text-[10px] text-slate-500">{(seg.end - seg.start).toFixed(2)}s</span>
        {p.worst && <AlertTriangle size={13} className={sevColor} />}
        <div className="ml-auto flex items-center gap-0.5">
          <button className="btn btn-ghost btn-icon" title="Play segment (Ctrl+Enter)" onClick={p.onPlay}>
            <Play size={13} />
          </button>
          <button className="btn btn-ghost btn-icon" title="Split at playhead (S)" onClick={p.onSplit}>
            <Scissors size={13} />
          </button>
          <button className="btn btn-ghost btn-icon" title="Merge with next" onClick={p.onMerge} disabled={p.isLast}>
            <Merge size={13} />
          </button>
          <button className="btn btn-ghost btn-icon text-red-400" title="Delete (Del)" onClick={p.onDelete}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <textarea
        ref={taRef}
        rows={1}
        value={seg.text}
        placeholder="Type what is said…"
        className="w-full resize-none rounded-md border border-ink-500 bg-ink-900 px-2.5 py-1.5 text-[13px] leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-accent focus:outline-none"
        onChange={(e) => p.onChange({ text: e.target.value }, `text-${seg.id}`)}
        onFocus={p.onSelect}
        onSelect={(e) => {
          const t = e.currentTarget;
          setSel([t.selectionStart, t.selectionEnd]);
        }}
        onBlur={() => undefined}
      />

      {(tags.length > 0 || p.type === 'support') && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {tags.map((t) => {
            const on = seg.tags.includes(t);
            return (
              <button
                key={t}
                onClick={() => p.onChange({ tags: on ? seg.tags.filter((x) => x !== t) : [...seg.tags, t] })}
                className={`rounded-full border px-2 py-0.5 text-[10px] transition ${on ? 'border-accent bg-accent/20 text-accent' : 'border-ink-500 text-slate-500 hover:text-slate-300'}`}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}

      {p.type === 'support' && (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">{hasSel ? 'Tag selection as' : 'Select text to tag PII'}</span>
            {PII_TYPES.map((t) => (
              <button
                key={t.type}
                disabled={!hasSel}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  p.onPII(sel[0], sel[1], t.type);
                  setSel([0, 0]);
                }}
                className="rounded-full border px-2 py-0.5 text-[10px] transition disabled:opacity-30"
                style={{ borderColor: t.color + '99', color: t.color }}
              >
                {t.label}
              </button>
            ))}
            <button className="btn btn-ghost ml-auto px-2 py-0.5 text-[10px]" onClick={p.onAutoPII}>
              Auto-detect
            </button>
          </div>
          {seg.pii.length > 0 && (
            <>
              <HighlightedText seg={seg} />
              <div className="flex flex-wrap gap-1">
                {seg.pii.map((s) => (
                  <span key={s.id} className="chip" style={{ borderColor: piiColor(s.type) + '88' }}>
                    <span style={{ color: piiColor(s.type) }}>{s.type}</span>
                    <span className="max-w-[140px] truncate text-slate-400">{s.text}</span>
                    {s.auto && <span className="text-[9px] text-slate-500">auto</span>}
                    <button className="text-slate-500 hover:text-red-400" onClick={() => p.onRemovePII(s.id)} aria-label="Remove PII span">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
