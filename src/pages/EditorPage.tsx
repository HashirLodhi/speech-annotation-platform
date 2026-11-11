import { ArrowLeft, Download, Keyboard, Plus, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CVPanel } from '../components/CVPanel';
import { CommentsPanel } from '../components/CommentsPanel';
import { ItemExportDialog } from '../components/ExportDialog';
import { IssuesPanel } from '../components/IssuesPanel';
import { PIIPanel } from '../components/PIIPanel';
import { SegmentRow } from '../components/SegmentRow';
import { SpeakerPanel } from '../components/SpeakerPanel';
import { Transport } from '../components/Transport';
import { Modal } from '../components/ui';
import { Waveform } from '../components/Waveform';
import { useEditor } from '../editor/useEditor';
import { usePlayer } from '../editor/usePlayer';
import { STATUS_META, STATUS_ORDER } from '../lib/constants';
import { useStore } from '../lib/store';
import { validateItem } from '../lib/validate';
import type { ItemStatus } from '../types';

type Tab = 'speakers' | 'pii' | 'issues' | 'comments';

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause (when not typing)'],
  ['Ctrl + Space', 'Play / pause (anywhere)'],
  ['Ctrl + Enter', 'Play selected segment'],
  ['Alt + ← / →', 'Seek −2s / +2s'],
  ['Alt + ↑ / ↓', 'Previous / next segment'],
  ['Alt + 1…9', 'Assign speaker to selected segment'],
  ['N', 'New segment at playhead'],
  ['S', 'Split selected segment at playhead'],
  ['[  /  ]', 'Set selected start / end to playhead'],
  ['L', 'Toggle loop'],
  ['Delete', 'Delete selected segment'],
  ['Ctrl + Z / Y', 'Undo / redo (outside text boxes)'],
  ['Drag on waveform', 'Create segment'],
  ['Ctrl + wheel', 'Zoom waveform'],
];

export default function EditorPage() {
  const { itemId = '' } = useParams();
  const nav = useNavigate();
  const ed = useEditor(itemId);
  const { item } = ed;
  const project = useStore((s) => s.projects.find((p) => p.id === item?.projectId));
  const { player, peaks, stats, error, playing, time } = usePlayer(itemId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [follow, setFollow] = useState(true);
  const [loop, setLoop] = useState(false);
  const [rate, setRate] = useState(1);
  const [tab, setTab] = useState<Tab>('issues');
  const [showExport, setShowExport] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const type = project?.type ?? 'meeting';
  const sorted = useMemo(() => (item ? [...item.segments].sort((a, b) => a.start - b.start) : []), [item]);
  const issues = useMemo(() => (item ? validateItem(item, type) : []), [item, type]);
  const worstBySeg = useMemo(() => {
    const m = new Map<string, 'error' | 'warn' | 'info'>();
    const rank = { error: 0, warn: 1, info: 2 };
    issues.forEach((i) => {
      if (!i.segmentId) return;
      const c = m.get(i.segmentId);
      if (!c || rank[i.severity] < rank[c]) m.set(i.segmentId, i.severity);
    });
    return m;
  }, [issues]);
  const activeId = playing || time > 0 ? sorted.find((s) => time >= s.start && time < s.end)?.id ?? null : null;

  useEffect(() => {
    if (type === 'meeting') setTab('speakers');
    else if (type === 'support') setTab('pii');
    else setTab('issues');
  }, [type]);

  useEffect(() => {
    player?.setRate(rate);
  }, [player, rate]);
  useEffect(() => {
    if (player) player.loop = loop;
  }, [player, loop]);

  // productivity tracking: count time only while the tab is focused
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hasFocus()) {
        const cur = useStore.getState().items.find((i) => i.id === itemId);
        if (cur) useStore.getState().updateItem(itemId, { timeSpentSec: cur.timeSpentSec + 5 });
      }
    }, 5000);
    return () => clearInterval(t);
  }, [itemId]);

  // first-time status nudge
  useEffect(() => {
    if (item?.status === 'todo' && item.segments.length > 0) ed.patch({ status: 'in_progress' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.segments.length]);

  const select = (id: string | null, scroll = false) => {
    setSelectedId(id);
    if (id && scroll) setTimeout(() => document.getElementById(`seg-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
  };

  const jump = (id: string) => {
    const s = sorted.find((x) => x.id === id);
    if (!s) return;
    select(id, true);
    player?.seek(s.start);
  };

  const idx = sorted.findIndex((s) => s.id === selectedId);
  const selected = idx >= 0 ? sorted[idx] : null;

  const focusText = (id: string) => setTimeout(() => (document.querySelector(`#seg-${id} textarea`) as HTMLTextAreaElement | null)?.focus(), 30);

  const newAtPlayhead = () => {
    if (!player || !item) return;
    const t = player.time;
    const next = sorted.find((s) => s.start > t);
    const end = Math.min(item.duration, next ? Math.min(next.start, t + 4) : t + 4);
    if (end - t < 0.1) return;
    const id = ed.addSegment(t, end, selected?.speakerId ?? item.speakers[0]?.id ?? null);
    select(id, true);
    focusText(id);
  };

  const split = (id: string) => {
    if (!player) return;
    const nid = ed.splitAt(id, player.time);
    if (nid) select(nid, true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT';
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'Space') {
        e.preventDefault();
        player?.toggle();
      } else if (mod && e.key === 'Enter' && selected) {
        e.preventDefault();
        player?.playRange(selected.start, selected.end, loop);
      } else if (e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        player?.seek(player.time + (e.key === 'ArrowLeft' ? -2 : 2));
      } else if (e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const n = sorted[clampIdx(idx + (e.key === 'ArrowUp' ? -1 : 1), sorted.length)];
        if (n) {
          jump(n.id);
          if (typing) focusText(n.id);
        }
      } else if (e.altKey && /^[1-9]$/.test(e.key) && selected && item) {
        e.preventDefault();
        const sp = item.speakers[Number(e.key) - 1];
        if (sp) ed.updateSegment(selected.id, { speakerId: sp.id });
      } else if (!typing && !mod && !e.altKey) {
        if (e.code === 'Space') {
          e.preventDefault();
          player?.toggle();
        } else if (e.key === 'n') newAtPlayhead();
        else if (e.key === 's' && selected) split(selected.id);
        else if (e.key === 'l') setLoop((v) => !v);
        else if (e.key === '[' && selected && player) ed.updateSegment(selected.id, { start: Math.min(player.time, selected.end - 0.05) });
        else if (e.key === ']' && selected && player) ed.updateSegment(selected.id, { end: Math.max(player.time, selected.start + 0.05) });
        else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && type !== 'cv_qa') {
          ed.deleteSegment(selected.id);
          select(null);
        } else if (e.key === '?') setShowKeys(true);
      } else if (!typing && mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) ed.redo();
        else ed.undo();
      } else if (!typing && mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        ed.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!item || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-slate-400">Recording not found.</p>
        <button className="btn" onClick={() => nav('/')}>Back to dashboard</button>
      </div>
    );
  }

  const speakerOf = (id: string | null) => item.speakers.find((s) => s.id === id);
  const errCount = issues.filter((i) => i.severity === 'error').length;

  const setStatus = (s: ItemStatus) => {
    if ((s === 'approved' || s === 'review') && errCount > 0 && !confirm(`${errCount} validation error(s) remain. Continue anyway?`)) return;
    ed.patch({ status: s });
  };

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    ...(type !== 'cv_qa' ? [{ id: 'speakers' as Tab, label: 'Speakers' }] : []),
    ...(type === 'support' ? [{ id: 'pii' as Tab, label: 'PII' }] : []),
    { id: 'issues', label: 'Issues', badge: issues.filter((i) => i.severity !== 'info').length },
    { id: 'comments', label: 'Comments', badge: item.comments.filter((c) => !c.resolved).length },
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-ink-600 bg-ink-900 px-4 py-2">
        <Link to={`/p/${project.id}`} className="btn btn-ghost btn-icon" title="Back to project">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{item.name}</div>
          <div className="truncate text-[11px] text-slate-500">{project.name}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-slate-500">Autosaved</span>
          <button className="btn btn-icon" onClick={ed.undo} disabled={!ed.canUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={14} />
          </button>
          <button className="btn btn-icon" onClick={ed.redo} disabled={!ed.canRedo} title="Redo (Ctrl+Y)">
            <Redo2 size={14} />
          </button>
          <select className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1.5 text-xs" value={item.status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
          <button className="btn btn-icon" onClick={() => setShowKeys(true)} title="Keyboard shortcuts (?)">
            <Keyboard size={14} />
          </button>
          <button className="btn btn-primary" onClick={() => setShowExport(true)}>
            <Download size={13} /> Export
          </button>
        </div>
      </header>

      <div className="space-y-2 px-4 py-3">
        {error && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">{error}</div>}
        <Waveform
          peaks={peaks}
          duration={item.duration}
          segments={sorted}
          colorOf={(id) => speakerOf(id)?.color ?? '#94a3b8'}
          labelOf={(s, i) => (type === 'cv_qa' ? 'clip' : `${i + 1} · ${speakerOf(s.speakerId)?.name ?? '?'}`)}
          selectedId={selectedId}
          player={player}
          zoom={zoom}
          onZoom={setZoom}
          follow={follow}
          onSelect={(id) => select(id, true)}
          onBegin={ed.beginTransaction}
          onChange={(id, patch) => ed.updateSegment(id, patch, undefined, true)}
          onCreate={(a, b) => {
            if (type === 'cv_qa' && item.segments.length) return;
            const id = ed.addSegment(a, b, selected?.speakerId ?? item.speakers[0]?.id ?? null);
            select(id, true);
            focusText(id);
          }}
        />
        <Transport player={player} playing={playing} time={time} duration={item.duration} rate={rate} onRate={setRate} loop={loop} onLoop={setLoop} zoom={zoom} onZoom={setZoom} follow={follow} onFollow={setFollow} />
      </div>

      <div className="flex min-h-0 flex-1 border-t border-ink-600">
        <main ref={listRef} className="min-w-0 flex-1 overflow-y-auto bg-ink-950">
          {type === 'cv_qa' ? (
            <CVPanel item={item} ed={ed} stats={stats} />
          ) : (
            <div className="mx-auto max-w-4xl space-y-2 p-4">
              {sorted.length === 0 && (
                <div className="rounded-xl border border-dashed border-ink-500 p-10 text-center text-xs text-slate-500">
                  No segments yet. Drag across the waveform to mark speech, or press <span className="kbd">N</span> at the playhead.
                </div>
              )}
              {sorted.map((s, i) => (
                <SegmentRow
                  key={s.id}
                  seg={s}
                  index={i}
                  type={type}
                  speakers={item.speakers}
                  selected={s.id === selectedId}
                  active={s.id === activeId}
                  worst={worstBySeg.get(s.id) ?? null}
                  isLast={i === sorted.length - 1}
                  onSelect={() => s.id !== selectedId && select(s.id)}
                  onPlay={() => player?.playRange(s.start, s.end, loop)}
                  onSplit={() => split(s.id)}
                  onMerge={() => ed.mergeNext(s.id)}
                  onDelete={() => {
                    ed.deleteSegment(s.id);
                    if (selectedId === s.id) select(null);
                  }}
                  onChange={(patch, key) => ed.updateSegment(s.id, patch, key)}
                  onPII={(a, b, t) => ed.addPII(s.id, a, b, t)}
                  onRemovePII={(sid) => ed.removePII(s.id, sid)}
                  onAutoPII={() => ed.autoDetectPII(s.id)}
                />
              ))}
              <button className="btn w-full border-dashed" onClick={newAtPlayhead}>
                <Plus size={13} /> New segment at playhead
              </button>
            </div>
          )}
        </main>
        <aside className="flex w-[360px] shrink-0 flex-col border-l border-ink-600 bg-ink-900">
          <div className="flex border-b border-ink-600">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 border-b-2 px-3 py-2.5 text-xs font-medium transition ${tab === t.id ? 'border-accent text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
              >
                {t.label}
                {!!t.badge && <span className="ml-1.5 rounded-full bg-ink-600 px-1.5 py-0.5 text-[10px]">{t.badge}</span>}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {tab === 'speakers' && <SpeakerPanel item={item} ed={ed} />}
            {tab === 'pii' && <PIIPanel item={item} ed={ed} onJump={jump} />}
            {tab === 'issues' && <IssuesPanel issues={issues} onJump={jump} />}
            {tab === 'comments' && <CommentsPanel item={item} />}
          </div>
        </aside>
      </div>

      {showExport && <ItemExportDialog item={item} project={project} onClose={() => setShowExport(false)} />}
      {showKeys && (
        <Modal title="Keyboard shortcuts" onClose={() => setShowKeys(false)}>
          <div className="space-y-1.5">
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{d}</span>
                <span className="kbd">{k}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

const clampIdx = (i: number, n: number) => Math.max(0, Math.min(n - 1, i));
