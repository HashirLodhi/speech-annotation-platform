import { ShieldCheck, Wand2 } from 'lucide-react';
import { useState } from 'react';
import type { AudioItem } from '../types';
import type { Editor } from '../editor/useEditor';
import { PII_TYPES, applyRedaction, piiColor, type RedactionStyle } from '../lib/pii';

export function PIIPanel({ item, ed, onJump }: { item: AudioItem; ed: Editor; onJump: (id: string) => void }) {
  const [style, setStyle] = useState<RedactionStyle>('tag');
  const [msg, setMsg] = useState('');
  const all = item.segments.flatMap((s, i) => s.pii.map((p) => ({ ...p, segId: s.id, idx: i })));
  const counts = PII_TYPES.map((t) => ({ ...t, n: all.filter((p) => p.type === t.type).length })).filter((t) => t.n > 0);
  const sorted = [...item.segments].sort((a, b) => a.start - b.start);

  return (
    <div className="space-y-4">
      <div className="card space-y-2 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <ShieldCheck size={14} className="text-accent" /> {all.length} PII span{all.length === 1 ? '' : 's'} marked
        </div>
        <div className="flex flex-wrap gap-1">
          {counts.length === 0 && <span className="text-xs text-slate-500">Nothing marked yet.</span>}
          {counts.map((c) => (
            <span key={c.type} className="chip" style={{ borderColor: c.color + '88', color: c.color }}>
              {c.label} · {c.n}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-primary flex-1"
            onClick={() => {
              const n = ed.autoDetectPII();
              setMsg(n ? `Added ${n} suggested span${n === 1 ? '' : 's'} — review each one.` : 'No new PII detected.');
            }}
          >
            <Wand2 size={13} /> Auto-detect all
          </button>
          <button className="btn" onClick={() => ed.clearAutoPII()} title="Remove spans created by auto-detect (keeps manual ones)">
            Clear auto
          </button>
        </div>
        {msg && <p className="text-[11px] text-slate-400">{msg}</p>}
        <p className="text-[11px] leading-relaxed text-slate-500">
          Auto-detect is a heuristic pre-annotation (regex + cue phrases). It never replaces human review — the Issues tab flags anything still unredacted.
        </p>
      </div>

      <div>
        <span className="label">All spans</span>
        <div className="space-y-1">
          {all.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-md bg-ink-800 px-2 py-1.5 text-xs">
              <span className="w-16 shrink-0 text-[10px] font-semibold" style={{ color: piiColor(p.type) }}>
                {p.type}
              </span>
              <button className="min-w-0 flex-1 truncate text-left text-slate-300 hover:text-white" onClick={() => onJump(p.segId)}>
                {p.text}
              </button>
              <span className="font-mono text-[10px] text-slate-500">#{p.idx + 1}</span>
              <button className="text-slate-500 hover:text-red-400" onClick={() => ed.removePII(p.segId, p.id)} aria-label="Remove">
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="label mb-0">Redacted transcript preview</span>
          <select className="rounded border border-ink-500 bg-ink-900 px-1.5 py-0.5 text-[11px]" value={style} onChange={(e) => setStyle(e.target.value as RedactionStyle)}>
            <option value="tag">[TYPE] tags</option>
            <option value="mask">[REDACTED]</option>
          </select>
        </div>
        <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-ink-600 bg-ink-900 p-2.5 text-xs leading-relaxed text-slate-300">
          {sorted.map((s) => (
            <p key={s.id}>
              <span className="font-semibold" style={{ color: item.speakers.find((x) => x.id === s.speakerId)?.color }}>
                {item.speakers.find((x) => x.id === s.speakerId)?.name ?? '?'}:
              </span>{' '}
              {applyRedaction(s.text, s.pii, style)}
            </p>
          ))}
          {sorted.length === 0 && <span className="text-slate-600">No transcript.</span>}
        </div>
      </div>
    </div>
  );
}
