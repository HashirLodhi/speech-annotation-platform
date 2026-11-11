import { CheckCircle2, Copy, Wrench, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AudioItem, Verdict } from '../types';
import type { Editor } from '../editor/useEditor';
import type { AudioStats } from '../lib/audio';
import { CV_AUDIO_ISSUES, CV_ERROR_TYPES } from '../lib/constants';
import { computeCer, computeWer, defaultNorm, pct, type NormOpts } from '../lib/text';

const VERDICTS: { v: Verdict; label: string; icon: React.ReactNode; cls: string; hint: string }[] = [
  { v: 'accept', label: 'Accept', icon: <CheckCircle2 size={15} />, cls: 'border-emerald-500 bg-emerald-500/15 text-emerald-300', hint: 'Audio matches the sentence' },
  { v: 'fix', label: 'Fix', icon: <Wrench size={15} />, cls: 'border-amber-500 bg-amber-500/15 text-amber-300', hint: 'Transcript needs correction' },
  { v: 'reject', label: 'Reject', icon: <XCircle size={15} />, cls: 'border-red-500 bg-red-500/15 text-red-300', hint: 'Unusable clip' },
];

export function suggestAudioIssues(s: AudioStats): string[] {
  const out: string[] = [];
  if (s.clipRatio > 0.002) out.push('Distortion / clipping');
  if (s.rmsDb < -38 || s.peakDb < -18) out.push('Low volume');
  if (s.leadSilence > 1.5 || s.trailSilence > 1.5 || s.silenceRatio > 0.6) out.push('Long silence');
  if (s.silenceRatio < 0.08 && s.rmsDb > -22) out.push('Background noise');
  return out;
}

export function CVPanel({ item, ed, stats }: { item: AudioItem; ed: Editor; stats: AudioStats | null }) {
  const [norm, setNorm] = useState<NormOpts>(defaultNorm);
  const qa = item.qa ?? { verdict: null, errorTypes: [], audioIssues: [], notes: '' };
  const ref = item.cv?.reference ?? '';
  const seg = item.segments[0];
  const text = seg?.text ?? '';

  const w = useMemo(() => computeWer(ref, text, norm), [ref, text, norm]);
  const cer = useMemo(() => computeCer(ref, text, norm), [ref, text, norm]);
  const suggested = stats ? suggestAudioIssues(stats).filter((s) => !qa.audioIssues.includes(s)) : [];

  const setText = (t: string) => {
    if (seg) ed.updateSegment(seg.id, { text: t }, 'cv-text');
    else {
      const id = ed.addSegment(0, item.duration);
      ed.updateSegment(id, { text: t }, 'cv-text');
    }
  };
  const setQA = (patch: Partial<typeof qa>) => ed.patch({ qa: { ...qa, ...patch } });
  const toggle = (key: 'errorTypes' | 'audioIssues', v: string) =>
    setQA({ [key]: qa[key].includes(v) ? qa[key].filter((x) => x !== v) : [...qa[key], v] });

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-5">
      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label mb-0">Reference sentence (Common Voice)</span>
          <div className="flex flex-wrap gap-1">
            {[item.cv?.gender, item.cv?.age, item.cv?.accent].filter(Boolean).map((m) => (
              <span key={m} className="chip">{m}</span>
            ))}
            {item.cv?.upVotes !== undefined && <span className="chip">▲ {item.cv.upVotes} ▼ {item.cv.downVotes ?? 0}</span>}
          </div>
        </div>
        <textarea
          className="input min-h-[52px] text-sm"
          value={ref}
          placeholder="Reference sentence (import a Common Voice .tsv to fill this automatically)"
          onChange={(e) => ed.patch({ cv: { ...(item.cv ?? { reference: '' }), reference: e.target.value } })}
        />
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label mb-0">Your transcript (what you hear)</span>
          <button className="btn btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setText(ref)} disabled={!ref}>
            <Copy size={12} /> Copy reference
          </button>
        </div>
        <textarea
          className="input min-h-[70px] text-sm"
          autoFocus
          value={text}
          placeholder="Listen to the clip, then type exactly what was said…"
          onChange={(e) => setText(e.target.value)}
        />
        {ref && text && (
          <>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
              <Metric label="WER" value={pct(w.wer)} bad={w.wer > 0} />
              <Metric label="CER" value={pct(cer)} bad={cer > 0} />
              <Metric label="Sub" value={w.substitutions} />
              <Metric label="Del" value={w.deletions} />
              <Metric label="Ins" value={w.insertions} />
              <label className="ml-auto flex items-center gap-1 text-slate-400">
                <input type="checkbox" checked={norm.lowercase} onChange={(e) => setNorm({ ...norm, lowercase: e.target.checked })} /> ignore case
              </label>
              <label className="flex items-center gap-1 text-slate-400">
                <input type="checkbox" checked={norm.stripPunct} onChange={(e) => setNorm({ ...norm, stripPunct: e.target.checked })} /> ignore punctuation
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5 rounded-lg bg-ink-900 p-3 text-[13px]">
              {w.ops.map((o, i) =>
                o.type === 'equal' ? (
                  <span key={i} className="text-slate-300">{o.ref}</span>
                ) : o.type === 'sub' ? (
                  <span key={i} className="rounded bg-amber-500/20 px-1 text-amber-200" title="substitution">
                    <s className="opacity-60">{o.ref}</s> → {o.hyp}
                  </span>
                ) : o.type === 'del' ? (
                  <span key={i} className="rounded bg-red-500/20 px-1 text-red-300" title="deletion (in reference, missing from transcript)">
                    <s>{o.ref}</s>
                  </span>
                ) : (
                  <span key={i} className="rounded bg-sky-500/20 px-1 text-sky-200" title="insertion (extra word in transcript)">
                    +{o.hyp}
                  </span>
                ),
              )}
            </div>
          </>
        )}
      </section>

      <section className="card space-y-4 p-4">
        <div>
          <span className="label">Verdict</span>
          <div className="grid grid-cols-3 gap-2">
            {VERDICTS.map((v) => (
              <button
                key={v.v}
                onClick={() => setQA({ verdict: qa.verdict === v.v ? null : v.v })}
                className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-medium transition ${qa.verdict === v.v ? v.cls : 'border-ink-500 text-slate-400 hover:bg-ink-700'}`}
              >
                <span className="flex items-center gap-1.5">{v.icon} {v.label}</span>
                <span className="text-[10px] font-normal opacity-70">{v.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <ChipGroup label="Transcript error types" options={CV_ERROR_TYPES} value={qa.errorTypes} onToggle={(v) => toggle('errorTypes', v)} />
        <ChipGroup label="Audio issues" options={CV_AUDIO_ISSUES} value={qa.audioIssues} onToggle={(v) => toggle('audioIssues', v)} />

        {stats && (
          <div className="rounded-lg bg-ink-900 p-3 text-xs">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label mb-0">Automatic audio analysis</span>
              {suggested.length > 0 && (
                <button className="btn px-2 py-0.5 text-[11px]" onClick={() => setQA({ audioIssues: [...qa.audioIssues, ...suggested] })}>
                  Apply suggested: {suggested.join(', ')}
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-slate-300">
              <span>Peak {stats.peakDb.toFixed(1)} dBFS</span>
              <span>RMS {stats.rmsDb.toFixed(1)} dBFS</span>
              <span>Clipped {(stats.clipRatio * 100).toFixed(2)}%</span>
              <span>Lead silence {stats.leadSilence.toFixed(2)}s</span>
              <span>Trail silence {stats.trailSilence.toFixed(2)}s</span>
              <span>Silence {(stats.silenceRatio * 100).toFixed(0)}%</span>
            </div>
          </div>
        )}

        <div>
          <span className="label">Reviewer notes</span>
          <textarea className="input min-h-[60px]" value={qa.notes} onChange={(e) => setQA({ notes: e.target.value })} placeholder="Optional context for the decision…" />
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, bad }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <span className="text-slate-400">
      {label} <span className={`font-mono text-sm font-semibold ${bad ? 'text-amber-300' : 'text-emerald-300'}`}>{value}</span>
    </span>
  );
}

function ChipGroup({ label, options, value, onToggle }: { label: string; options: string[]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${value.includes(o) ? 'border-accent bg-accent/20 text-accent' : 'border-ink-500 text-slate-400 hover:text-slate-200'}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
