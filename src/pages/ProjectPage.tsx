import { FileAudio, Loader2, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ExportOptionsForm } from '../components/ExportDialog';
import { Bar, Empty, StatusBadge, Stat } from '../components/ui';
import { PROJECT_ACCENT, STATUS_META, STATUS_ORDER } from '../lib/constants';
import { buildProjectZip, cvReportCSV, defaultExportOptions, segmentsCSV, type ExportOptions } from '../lib/export';
import { importFiles, type ImportResult } from '../lib/importer';
import { PII_TYPES } from '../lib/pii';
import { computeStats } from '../lib/stats';
import { PROJECT_META, useStore } from '../lib/store';
import { pct, computeWer } from '../lib/text';
import { downloadBlob, fmtDuration, safeName } from '../lib/util';
import { validateItem } from '../lib/validate';
import type { ItemStatus } from '../types';

type Tab = 'items' | 'analytics' | 'export';

/** Keyed by project so tab/filter/search state never leaks between projects. */
export default function ProjectRoute() {
  const { projectId = '' } = useParams();
  return <ProjectPage key={projectId} />;
}

function ProjectPage() {
  const { projectId = '' } = useParams();
  const nav = useNavigate();
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const allItems = useStore((s) => s.items);
  const updateItem = useStore((s) => s.updateItem);
  const deleteItem = useStore((s) => s.deleteItem);
  const getAudio = useStore((s) => s.getAudio);
  const [tab, setTab] = useState<Tab>('items');
  const [filter, setFilter] = useState<ItemStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [drag, setDrag] = useState(false);
  const [opts, setOpts] = useState<ExportOptions>(defaultExportOptions);
  const [onlyApproved, setOnlyApproved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => allItems.filter((i) => i.projectId === projectId), [allItems, projectId]);
  const stats = useMemo(() => (project ? computeStats(items, project.type) : null), [items, project]);
  const shown = items.filter((i) => (filter === 'all' || i.status === filter) && i.name.toLowerCase().includes(q.toLowerCase()));
  const rows = useMemo(
    () =>
      shown.map((it) => {
        const issues = project ? validateItem(it, project.type) : [];
        const text = it.segments.map((s) => s.text).join(' ');
        return {
          it,
          errors: issues.filter((i) => i.severity === 'error').length,
          warns: issues.filter((i) => i.severity === 'warn').length,
          wer: project?.type === 'cv_qa' && it.cv?.reference && text ? computeWer(it.cv.reference, text).wer : null,
        };
      }),
    [shown, project],
  );

  if (!project || !stats) {
    return (
      <div className="p-10 text-slate-400">
        Project not found. <Link className="text-accent" to="/">Go back</Link>
      </div>
    );
  }
  const accent = PROJECT_ACCENT[project.type];

  const doImport = async (files: File[]) => {
    if (!files.length) return;
    setBusy('Importing…');
    try {
      setResult(await importFiles(project, files, (d, t) => setBusy(`Importing ${d}/${t}…`)));
    } finally {
      setBusy(null);
    }
  };

  const exportZip = async () => {
    const list = items.filter((i) => !onlyApproved || i.status === 'approved');
    if (!list.length) return alert('No recordings match the selection.');
    setBusy('Building ZIP…');
    try {
      const blob = await buildProjectZip({ project, items: list, getAudio, options: opts, onProgress: (d, t) => setBusy(`Exporting ${d}/${t}…`) });
      downloadBlob(blob, `${safeName(project.type)}_dataset.zip`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <header className="flex flex-wrap items-start gap-4">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>{PROJECT_META[project.type].short}</div>
          <h1 className="text-xl font-semibold text-white">{project.name}</h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">{project.description}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <input ref={fileRef} type="file" multiple hidden accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg,.srt,.vtt,.tsv,.csv" onChange={(e) => { void doImport([...(e.target.files ?? [])]); e.target.value = ''; }} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {busy ?? 'Import audio'}
          </button>
        </div>
      </header>

      <div className="flex gap-1 border-b border-ink-600">
        {(['items', 'analytics', 'export'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-4 py-2 text-xs font-medium capitalize transition ${tab === t ? 'border-accent text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'items' && (
        <div
          className="space-y-4"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void doImport([...e.dataTransfer.files]); }}
        >
          {result && (
            <div className="card space-y-1 p-3 text-xs">
              <div className="font-medium text-white">Imported {result.added} recording{result.added === 1 ? '' : 's'}.</div>
              {[...result.notes, ...result.skipped.map((s) => `Skipped: ${s}`)].map((n, i) => <div key={i} className="text-slate-400">{n}</div>)}
              <button className="text-[11px] text-slate-500 hover:text-slate-300" onClick={() => setResult(null)}>Dismiss</button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2 text-slate-500" />
              <input className="input w-56 pl-8" placeholder="Search files…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {(['all', ...STATUS_ORDER] as const).map((s) => (
              <button key={s} onClick={() => setFilter(s)} className={`rounded-full border px-3 py-1 text-[11px] transition ${filter === s ? 'border-accent bg-accent/15 text-accent' : 'border-ink-500 text-slate-400 hover:text-slate-200'}`}>
                {s === 'all' ? `All (${items.length})` : `${STATUS_META[s].label} (${stats.byStatus[s]})`}
              </button>
            ))}
          </div>

          {items.length === 0 ? (
            <div className={drag ? 'rounded-xl ring-2 ring-accent' : ''}>
              <Empty title="No recordings yet">
                Drop audio files here (WAV, MP3, FLAC, M4A, OGG).{' '}
                {project.type === 'cv_qa' && 'Include the Common Voice validated.tsv so reference sentences are matched by filename. '}
                {project.type !== 'cv_qa' && 'Optionally include .srt/.vtt files with the same name to pre-load a draft transcript. '}
                Or load demo data from the Overview page.
              </Empty>
            </div>
          ) : (
            <div className={`card overflow-hidden ${drag ? 'ring-2 ring-accent' : ''}`}>
              <table className="w-full text-xs">
                <thead className="border-b border-ink-600 bg-ink-900 text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Recording</th>
                    <th className="px-3 py-2.5">Duration</th>
                    <th className="px-3 py-2.5">Segments</th>
                    {project.type === 'cv_qa' && <th className="px-3 py-2.5">WER</th>}
                    <th className="px-3 py-2.5">Issues</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Time</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ it, errors, warns, wer }) => (
                    <tr key={it.id} className="cursor-pointer border-b border-ink-700 transition last:border-0 hover:bg-ink-700/50" onClick={() => nav(`/p/${project.id}/i/${it.id}`)}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 font-medium text-slate-200">
                          <FileAudio size={14} className="text-slate-500" /> {it.name}
                        </div>
                        {it.cv?.reference && <div className="ml-6 mt-0.5 max-w-md truncate text-[11px] text-slate-500">{it.cv.reference}</div>}
                      </td>
                      <td className="px-3 font-mono text-slate-400">{fmtDuration(it.duration)}</td>
                      <td className="px-3 text-slate-400">{it.segments.length}</td>
                      {project.type === 'cv_qa' && <td className={`px-3 font-mono ${wer === null ? 'text-slate-600' : wer > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{wer === null ? '—' : pct(wer, 0)}</td>}
                      <td className="px-3">
                        {errors === 0 && warns === 0 ? <span className="text-emerald-400">✓</span> : (
                          <span className="space-x-1.5">
                            {errors > 0 && <span className="text-red-400">{errors} err</span>}
                            {warns > 0 && <span className="text-amber-400">{warns} warn</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-3" onClick={(e) => e.stopPropagation()}>
                        <select className="cursor-pointer appearance-none bg-transparent" value={it.status} onChange={(e) => updateItem(it.id, { status: e.target.value as ItemStatus })}>
                          {STATUS_ORDER.map((s) => <option key={s} value={s} className="bg-ink-800">{STATUS_META[s].label}</option>)}
                        </select>
                        <StatusBadge status={it.status} />
                      </td>
                      <td className="px-3 text-right font-mono text-slate-500">{fmtDuration(it.timeSpentSec)}</td>
                      <td className="px-2" onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-icon text-slate-600 hover:text-red-400" title="Delete" onClick={() => confirm(`Delete ${it.name}?`) && void deleteItem(it.id)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <div className="p-6 text-center text-xs text-slate-500">No recordings match the filter.</div>}
            </div>
          )}
        </div>
      )}

      {tab === 'analytics' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Recordings" value={stats.items} sub={`${stats.byStatus.approved} approved · ${stats.byStatus.rejected} rejected`} accent={accent} />
            <Stat label="Audio" value={fmtDuration(stats.audioSec)} sub={`${fmtDuration(stats.annotatedSec)} labelled`} />
            <Stat label="Throughput" value={stats.rtf ? `${stats.rtf.toFixed(1)}×` : '—'} sub="annotation time ÷ audio time" />
            <Stat label="Open issues" value={stats.errors} sub={`${stats.warnings} warnings`} accent={stats.errors ? '#f87171' : '#4ade80'} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Workflow status">
              {STATUS_ORDER.map((s) => (
                <Row key={s} label={STATUS_META[s].label} value={stats.byStatus[s]} max={stats.items} />
              ))}
            </Panel>
            {project.type === 'meeting' && (
              <Panel title="Speaking time by speaker">
                {stats.speakerTime.length === 0 && <Muted>No labelled speech yet.</Muted>}
                {stats.speakerTime.map((s) => <Row key={s.name} label={s.name} value={s.sec} max={stats.speakerTime[0].sec} color={s.color} fmt={fmtDuration} />)}
              </Panel>
            )}
            {project.type === 'support' && (
              <Panel title="PII by category">
                {PII_TYPES.filter((t) => stats.piiByType[t.type]).length === 0 && <Muted>No PII marked yet.</Muted>}
                {PII_TYPES.filter((t) => stats.piiByType[t.type]).map((t) => (
                  <Row key={t.type} label={t.label} value={stats.piiByType[t.type] ?? 0} max={Math.max(...Object.values(stats.piiByType).map(Number))} color={t.color} />
                ))}
              </Panel>
            )}
            {project.type === 'cv_qa' && (
              <>
                <Panel title="Verdicts">
                  <Row label="Accept" value={stats.verdicts.accept} max={stats.items} color="#34d399" />
                  <Row label="Fix" value={stats.verdicts.fix} max={stats.items} color="#fbbf24" />
                  <Row label="Reject" value={stats.verdicts.reject} max={stats.items} color="#f87171" />
                  <Row label="Pending" value={stats.verdicts.none} max={stats.items} color="#64748b" />
                  <div className="mt-3 flex gap-6 border-t border-ink-600 pt-3 text-xs text-slate-400">
                    <span>Avg WER <b className="ml-1 font-mono text-white">{stats.avgWer === null ? '—' : pct(stats.avgWer)}</b></span>
                    <span>Avg CER <b className="ml-1 font-mono text-white">{stats.avgCer === null ? '—' : pct(stats.avgCer)}</b></span>
                  </div>
                </Panel>
                <Panel title="Top transcript error types">
                  {stats.errorTypes.length === 0 && <Muted>None recorded.</Muted>}
                  {stats.errorTypes.map(([k, v]) => <Row key={k} label={k} value={v} max={stats.errorTypes[0][1]} color="#fbbf24" />)}
                </Panel>
                <Panel title="Top audio issues">
                  {stats.audioIssues.length === 0 && <Muted>None recorded.</Muted>}
                  {stats.audioIssues.map(([k, v]) => <Row key={k} label={k} value={v} max={stats.audioIssues[0][1]} color="#60a5fa" />)}
                </Panel>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'export' && (
        <div className="max-w-2xl space-y-4">
          <div className="card space-y-4 p-5">
            <h3 className="text-sm font-semibold text-white">Dataset export</h3>
            <p className="text-xs text-slate-400">
              ZIP with per-file JSON, SRT/VTT, timestamped transcripts
              {project.type === 'meeting' && ', NIST RTTM diarization files'}
              {project.type === 'support' && ', redacted audio'}
              {project.type === 'cv_qa' && ', QA report with WER/CER'}, a segments CSV and a manifest.
            </p>
            <ExportOptionsForm project={project} o={opts} set={setOpts} />
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={onlyApproved} onChange={(e) => setOnlyApproved(e.target.checked)} /> Approved recordings only ({stats.byStatus.approved})
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={!!busy || items.length === 0} onClick={exportZip}>
                {busy ? busy : 'Download dataset ZIP'}
              </button>
              <button className="btn" disabled={items.length === 0} onClick={() => downloadBlob(new Blob([segmentsCSV(items, project.type, opts)], { type: 'text/csv' }), `${project.type}_segments.csv`)}>
                Segments CSV
              </button>
              {project.type === 'cv_qa' && (
                <button className="btn" disabled={items.length === 0} onClick={() => downloadBlob(new Blob([cvReportCSV(items)], { type: 'text/csv' }), 'common_voice_qa_report.csv')}>
                  QA report CSV
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}
const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-slate-600">{children}</p>;
function Row({ label, value, max, color, fmt }: { label: string; value: number; max: number; color?: string; fmt?: (n: number) => string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-300">
        <span>{label}</span>
        <span className="font-mono text-slate-400">{fmt ? fmt(value) : value}</span>
      </div>
      <Bar value={value} max={max} color={color} />
    </div>
  );
}
