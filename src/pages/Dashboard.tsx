import { ArrowRight, Database, Mic2, PhoneCall, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, Stat } from '../components/ui';
import { PROJECT_ACCENT } from '../lib/constants';
import { loadDemoData } from '../lib/demo';
import { computeStats } from '../lib/stats';
import { PROJECT_META, useStore } from '../lib/store';
import { fmtDuration } from '../lib/util';
import type { ProjectType } from '../types';

const ICONS: Record<ProjectType, React.ReactNode> = {
  meeting: <Mic2 size={20} />,
  support: <PhoneCall size={20} />,
  cv_qa: <ShieldCheck size={20} />,
};

const SKILLS: Record<ProjectType, string[]> = {
  meeting: ['Speaker diarization', 'Verbatim transcription', 'Overlap handling', 'RTTM export'],
  support: ['PII detection', 'Text + audio redaction', 'Agent/customer turns', 'Privacy-safe export'],
  cv_qa: ['WER / CER scoring', 'Error taxonomy', 'Audio quality checks', 'Accept / fix / reject'],
};

export default function Dashboard() {
  const projects = useStore((s) => s.projects);
  const items = useStore((s) => s.items);
  const resetAll = useStore((s) => s.resetAll);
  const [busy, setBusy] = useState(false);

  const total = useMemo(() => computeStats(items, 'meeting'), [items]);
  const empty = items.length === 0;

  const demo = async () => {
    setBusy(true);
    try {
      await loadDemoData(projects);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <section className="relative overflow-hidden rounded-2xl border border-ink-600 bg-gradient-to-br from-ink-800 via-ink-800 to-ink-700 p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
            <Database size={12} /> Speech data annotation portfolio
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Annotate, review and ship speech datasets.</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            A working annotation studio for three real-world tasks: diarized meeting transcripts, PII-redacted support calls and Common Voice transcription QA —
            with waveform editing, validation, review workflow and production-ready exports.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {(empty || busy) && (
              <button className="btn btn-primary px-4 py-2" onClick={demo} disabled={busy}>
                <Sparkles size={14} /> {busy ? 'Generating demo audio…' : 'Load demo data'}
              </button>
            )}
            <Link to="/guidelines" className="btn px-4 py-2">
              Read the annotation guidelines
            </Link>
          </div>
          {empty && <p className="mt-3 text-[11px] text-slate-500">Demo audio is synthetic (no real speakers). Import your own recordings inside any project.</p>}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Recordings" value={items.length} sub={`${total.byStatus.approved} approved`} />
        <Stat label="Audio" value={fmtDuration(total.audioSec)} sub={`${fmtDuration(total.annotatedSec)} annotated`} />
        <Stat label="Segments" value={total.segments.toLocaleString()} sub={`${total.words.toLocaleString()} words`} />
        <Stat label="Annotation time" value={fmtDuration(total.timeSpentSec)} sub={total.rtf ? `${total.rtf.toFixed(1)}× real-time` : '—'} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {projects.map((p) => {
          const its = items.filter((i) => i.projectId === p.id);
          const st = computeStats(its, p.type);
          const done = st.byStatus.approved + st.byStatus.rejected;
          return (
            <Link key={p.id} to={`/p/${p.id}`} className="card group flex flex-col p-5 transition hover:border-ink-500 hover:bg-ink-700/60">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: PROJECT_ACCENT[p.type] + '22', color: PROJECT_ACCENT[p.type] }}>
                  {ICONS[p.type]}
                </div>
                <ArrowRight size={16} className="ml-auto text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
              </div>
              <h3 className="text-sm font-semibold text-white">{PROJECT_META[p.type].label}</h3>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-400">{PROJECT_META[p.type].blurb}</p>
              <div className="mt-4 flex flex-wrap gap-1">
                {SKILLS[p.type].map((s) => (
                  <span key={s} className="chip">{s}</span>
                ))}
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>{its.length} recordings</span>
                  <span>{done}/{its.length} reviewed</span>
                </div>
                <Bar value={done} max={its.length} color={PROJECT_ACCENT[p.type]} />
              </div>
            </Link>
          );
        })}
      </section>

      {!empty && (
        <div className="flex justify-end">
          <button
            className="btn btn-ghost text-slate-500"
            onClick={async () => {
              if (confirm('Delete ALL recordings and annotations stored in this browser?')) await resetAll();
            }}
          >
            <RotateCcw size={13} /> Reset workspace
          </button>
        </div>
      )}
    </div>
  );
}
