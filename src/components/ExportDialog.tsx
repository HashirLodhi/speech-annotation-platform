import { useState } from 'react';
import type { AudioItem, Project } from '../types';
import { Modal } from './ui';
import { useStore } from '../lib/store';
import { baseName, downloadBlob, safeName } from '../lib/util';
import { cvReportCSV, defaultExportOptions, itemJSON, redactedAudio, segmentsCSV, toRTTM, toSRT, toTXT, toVTT, buildProjectZip, type ExportOptions } from '../lib/export';

export function ExportOptionsForm({ project, o, set }: { project: Project; o: ExportOptions; set: (o: ExportOptions) => void }) {
  if (project.type !== 'support') return null;
  return (
    <div className="space-y-2 rounded-lg border border-ink-600 bg-ink-900 p-3 text-xs">
      <div className="label">PII handling</div>
      <label className="flex items-center gap-2">
        Redaction style
        <select className="rounded border border-ink-500 bg-ink-800 px-1.5 py-0.5" value={o.redactionStyle} onChange={(e) => set({ ...o, redactionStyle: e.target.value as ExportOptions['redactionStyle'] })}>
          <option value="tag">[TYPE] tags</option>
          <option value="mask">[REDACTED]</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={o.redactAudio} onChange={(e) => set({ ...o, redactAudio: e.target.checked })} /> Redact audio (PII regions replaced)
      </label>
      {o.redactAudio && (
        <label className="flex items-center gap-2 pl-5">
          Replace with
          <select className="rounded border border-ink-500 bg-ink-800 px-1.5 py-0.5" value={o.audioRedactMode} onChange={(e) => set({ ...o, audioRedactMode: e.target.value as ExportOptions['audioRedactMode'] })}>
            <option value="beep">1 kHz beep</option>
            <option value="silence">Silence</option>
          </select>
        </label>
      )}
      <label className="flex items-center gap-2 text-amber-300">
        <input type="checkbox" checked={o.includeRawPII} onChange={(e) => set({ ...o, includeRawPII: e.target.checked })} /> Include raw (unredacted) text &amp; PII values — internal use only
      </label>
    </div>
  );
}

export function ItemExportDialog({ item, project, onClose }: { item: AudioItem; project: Project; onClose: () => void }) {
  const [o, setO] = useState<ExportOptions>(defaultExportOptions);
  const [busy, setBusy] = useState(false);
  const getAudio = useStore((s) => s.getAudio);
  const b = safeName(baseName(item.name));
  const type = project.type;
  const text = (name: string, content: string, mime = 'text/plain') => downloadBlob(new Blob([content], { type: mime }), name);

  const buttons: { label: string; run: () => void | Promise<void> }[] = [
    { label: 'JSON (full annotation)', run: () => text(`${b}.json`, JSON.stringify(itemJSON(item, project, o), null, 2), 'application/json') },
    { label: 'SRT subtitles', run: () => text(`${b}.srt`, toSRT(item, type, o)) },
    { label: 'WebVTT', run: () => text(`${b}.vtt`, toVTT(item, type, o), 'text/vtt') },
    { label: 'Timestamped TXT', run: () => text(`${b}.txt`, toTXT(item, type, o)) },
    { label: 'Segments CSV', run: () => text(`${b}.csv`, segmentsCSV([item], type, o), 'text/csv') },
    ...(type === 'meeting' ? [{ label: 'RTTM (diarization)', run: () => text(`${b}.rttm`, toRTTM(item) + '\n') }] : []),
    ...(type === 'cv_qa' ? [{ label: 'QA report CSV', run: () => text(`${b}_qa.csv`, cvReportCSV([item]), 'text/csv') }] : []),
    ...(type === 'support'
      ? [
          {
            label: 'Redacted audio (WAV)',
            run: async () => {
              setBusy(true);
              try {
                const blob = await getAudio(item.id);
                if (blob) downloadBlob(await redactedAudio(item, blob, o), `${b}_redacted.wav`);
              } finally {
                setBusy(false);
              }
            },
          },
        ]
      : []),
  ];

  return (
    <Modal title={`Export — ${item.name}`} onClose={onClose}>
      <div className="space-y-4">
        <ExportOptionsForm project={project} o={o} set={setO} />
        <div className="grid grid-cols-2 gap-2">
          {buttons.map((x) => (
            <button key={x.label} className="btn justify-start py-2" disabled={busy} onClick={() => void x.run()}>
              {x.label}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              downloadBlob(await buildProjectZip({ project, items: [item], getAudio, options: o }), `${b}_bundle.zip`);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Working…' : 'Download everything for this file (ZIP)'}
        </button>
      </div>
    </Modal>
  );
}
