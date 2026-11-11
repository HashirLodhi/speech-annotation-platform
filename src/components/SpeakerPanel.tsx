import { Plus, Trash2 } from 'lucide-react';
import type { AudioItem } from '../types';
import type { Editor } from '../editor/useEditor';
import { Bar } from './ui';
import { fmtDuration } from '../lib/util';

export function SpeakerPanel({ item, ed }: { item: AudioItem; ed: Editor }) {
  const talk = new Map<string, { time: number; turns: number }>();
  item.segments.forEach((s) => {
    if (!s.speakerId) return;
    const t = talk.get(s.speakerId) ?? { time: 0, turns: 0 };
    t.time += Math.max(0, s.end - s.start);
    t.turns++;
    talk.set(s.speakerId, t);
  });
  const total = [...talk.values()].reduce((a, b) => a + b.time, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Speakers are per recording. Use <span className="kbd">Alt</span>+<span className="kbd">1–9</span> to assign the selected segment.
        </p>
        <button className="btn" onClick={() => ed.addSpeaker()}>
          <Plus size={13} /> Add
        </button>
      </div>
      {item.speakers.length === 0 && <p className="rounded-lg border border-dashed border-ink-500 p-4 text-center text-xs text-slate-500">Add at least one speaker to start labelling turns.</p>}
      {item.speakers.map((sp, i) => {
        const t = talk.get(sp.id) ?? { time: 0, turns: 0 };
        return (
          <div key={sp.id} className="card space-y-2 p-3">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={sp.color}
                onChange={(e) => ed.updateSpeaker(sp.id, { color: e.target.value }, 'color')}
                className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label="Speaker colour"
              />
              <input className="input" value={sp.name} onChange={(e) => ed.updateSpeaker(sp.id, { name: e.target.value }, 'name')} />
              <span className="kbd">{i < 9 ? i + 1 : '–'}</span>
              <button
                className="btn btn-ghost btn-icon text-red-400"
                title="Remove speaker (segments become unassigned)"
                onClick={() => {
                  if (confirm(`Remove "${sp.name}"? Their ${t.turns} segment(s) will become unassigned.`)) ed.removeSpeaker(sp.id);
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <input className="input" placeholder="Role (optional)" value={sp.role ?? ''} onChange={(e) => ed.updateSpeaker(sp.id, { role: e.target.value }, 'role')} />
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                <span>
                  {t.turns} turns · {fmtDuration(t.time)}
                </span>
                <span>{total ? Math.round((t.time / total) * 100) : 0}%</span>
              </div>
              <Bar value={t.time} max={total} color={sp.color} />
            </div>
            {item.speakers.length > 1 && (
              <select
                className="input"
                value=""
                onChange={(e) => {
                  if (e.target.value && confirm(`Merge "${sp.name}" into the selected speaker?`)) ed.removeSpeaker(sp.id, e.target.value);
                }}
              >
                <option value="">Merge into…</option>
                {item.speakers.filter((o) => o.id !== sp.id).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
