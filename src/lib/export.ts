import { zipSync, strToU8 } from 'fflate';
import type { AudioItem, Project, Segment } from '../types';
import { applyRedaction, piiTimeRanges, type RedactionStyle } from './pii';
import { computeCer, computeWer } from './text';
import { decodeBlob, encodeWav, redactPCM } from './audio';
import { baseName, safeName } from './util';

export interface ExportOptions {
  redactionStyle: RedactionStyle;
  /** Support projects: include original (unredacted) text + PII values. Off by default for privacy. */
  includeRawPII: boolean;
  redactAudio: boolean;
  audioRedactMode: 'silence' | 'beep';
}
export const defaultExportOptions: ExportOptions = {
  redactionStyle: 'tag',
  includeRawPII: false,
  redactAudio: true,
  audioRedactMode: 'beep',
};

const speakerName = (item: AudioItem, id: string | null) => item.speakers.find((s) => s.id === id)?.name ?? 'Unknown';
const sorted = (item: AudioItem): Segment[] => [...item.segments].sort((a, b) => a.start - b.start);

export const segText = (s: Segment, type: Project['type'], o: ExportOptions) =>
  type === 'support' ? applyRedaction(s.text, s.pii, o.redactionStyle) : s.text;

function ts(sec: number, sep: ',' | '.') {
  const t = Math.round(sec * 1000);
  const h = Math.floor(t / 3600000);
  const m = Math.floor(t / 60000) % 60;
  const s = Math.floor(t / 1000) % 60;
  const ms = t % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms, 3)}`;
}

export function toSRT(item: AudioItem, type: Project['type'], o: ExportOptions): string {
  return sorted(item)
    .map((s, i) => {
      const prefix = type === 'cv_qa' ? '' : `${speakerName(item, s.speakerId)}: `;
      return `${i + 1}\n${ts(s.start, ',')} --> ${ts(s.end, ',')}\n${prefix}${segText(s, type, o)}\n`;
    })
    .join('\n');
}

export function toVTT(item: AudioItem, type: Project['type'], o: ExportOptions): string {
  const body = sorted(item)
    .map((s) => {
      const text = segText(s, type, o);
      const v = type === 'cv_qa' ? text : `<v ${speakerName(item, s.speakerId)}>${text}`;
      return `${ts(s.start, '.')} --> ${ts(s.end, '.')}\n${v}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

export function toTXT(item: AudioItem, type: Project['type'], o: ExportOptions): string {
  return sorted(item)
    .map((s) => {
      const t = `[${ts(s.start, '.').slice(3, 9)}]`;
      const sp = type === 'cv_qa' ? '' : ` ${speakerName(item, s.speakerId)}:`;
      const tags = s.tags.length ? ` ${s.tags.join(' ')}` : '';
      return `${t}${sp} ${segText(s, type, o)}${tags}`;
    })
    .join('\n');
}

/** NIST RTTM — the standard input for diarization-error-rate (DER) scoring tools. */
export function toRTTM(item: AudioItem): string {
  const file = safeName(baseName(item.name));
  return sorted(item)
    .filter((s) => s.speakerId && s.end > s.start)
    .map(
      (s) =>
        `SPEAKER ${file} 1 ${s.start.toFixed(3)} ${(s.end - s.start).toFixed(3)} <NA> <NA> ${speakerName(item, s.speakerId).replace(/\s+/g, '_')} <NA> <NA>`,
    )
    .join('\n');
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

export function segmentsCSV(items: AudioItem[], type: Project['type'], o: ExportOptions): string {
  const head =
    type === 'support'
      ? ['file', 'segment_id', 'start', 'end', 'duration', 'speaker', 'redacted_text', 'pii_types', 'tags', ...(o.includeRawPII ? ['raw_text'] : [])]
      : ['file', 'segment_id', 'start', 'end', 'duration', 'speaker', 'text', 'tags'];
  const rows: unknown[][] = [head];
  for (const item of items) {
    for (const s of sorted(item)) {
      const base = [item.name, s.id, s.start.toFixed(3), s.end.toFixed(3), (s.end - s.start).toFixed(3), type === 'cv_qa' ? '' : speakerName(item, s.speakerId)];
      if (type === 'support')
        rows.push([...base, segText(s, type, o), [...new Set(s.pii.map((p) => p.type))].join('|'), s.tags.join('|'), ...(o.includeRawPII ? [s.text] : [])]);
      else rows.push([...base, s.text, s.tags.join('|')]);
    }
  }
  return csv(rows);
}

export function cvReportCSV(items: AudioItem[]): string {
  const rows: unknown[][] = [
    ['path', 'reference_sentence', 'annotator_transcript', 'verdict', 'wer', 'cer', 'substitutions', 'deletions', 'insertions', 'error_types', 'audio_issues', 'gender', 'age', 'accent', 'up_votes', 'down_votes', 'notes', 'status'],
  ];
  for (const it of items) {
    const text = it.segments.map((s) => s.text).join(' ');
    const ref = it.cv?.reference ?? '';
    const w = computeWer(ref, text);
    rows.push([
      it.name, ref, text, it.qa?.verdict ?? '', w.wer.toFixed(4), computeCer(ref, text).toFixed(4),
      w.substitutions, w.deletions, w.insertions,
      (it.qa?.errorTypes ?? []).join('|'), (it.qa?.audioIssues ?? []).join('|'),
      it.cv?.gender ?? '', it.cv?.age ?? '', it.cv?.accent ?? '', it.cv?.upVotes ?? '', it.cv?.downVotes ?? '',
      it.qa?.notes ?? '', it.status,
    ]);
  }
  return csv(rows);
}

export function itemJSON(item: AudioItem, project: Project, o: ExportOptions) {
  const type = project.type;
  const raw = type !== 'support' || o.includeRawPII;
  return {
    schema_version: '1.0',
    file: item.name,
    project: { name: project.name, type },
    duration_sec: Number(item.duration.toFixed(3)),
    status: item.status,
    annotator: item.annotator,
    time_spent_sec: item.timeSpentSec,
    speakers: item.speakers.map((s) => ({ id: s.id, name: s.name, role: s.role ?? null })),
    segments: sorted(item).map((s) => ({
      id: s.id,
      start: Number(s.start.toFixed(3)),
      end: Number(s.end.toFixed(3)),
      speaker: s.speakerId ? speakerName(item, s.speakerId) : null,
      ...(raw ? { text: s.text } : {}),
      ...(type === 'support' ? { redacted_text: applyRedaction(s.text, s.pii, o.redactionStyle) } : {}),
      tags: s.tags,
      ...(type === 'support'
        ? {
            pii: s.pii.map((p) => ({
              type: p.type,
              char_start: p.start,
              char_end: p.end,
              ...(o.includeRawPII ? { text: p.text } : {}),
            })),
          }
        : {}),
    })),
    ...(type === 'cv_qa'
      ? (() => {
          const text = item.segments.map((s) => s.text).join(' ');
          const w = computeWer(item.cv?.reference ?? '', text);
          return {
            common_voice: item.cv ?? null,
            qa: item.qa ?? null,
            metrics: { wer: Number(w.wer.toFixed(4)), cer: Number(computeCer(item.cv?.reference ?? '', text).toFixed(4)), substitutions: w.substitutions, deletions: w.deletions, insertions: w.insertions },
          };
        })()
      : {}),
    comments: item.comments.map((c) => ({ author: c.author, text: c.text, resolved: !!c.resolved })),
  };
}

export async function redactedAudio(item: AudioItem, blob: Blob, o: ExportOptions): Promise<Blob> {
  const pcm = await decodeBlob(blob);
  const ranges = item.segments.flatMap((s) => piiTimeRanges(s));
  return encodeWav(redactPCM(pcm, ranges, o.audioRedactMode));
}

export interface ProjectBundleInput {
  project: Project;
  items: AudioItem[];
  getAudio: (id: string) => Promise<Blob | undefined>;
  options: ExportOptions;
  onProgress?: (done: number, total: number) => void;
}

/** Builds a full dataset ZIP: transcripts, subtitles, RTTM, reports, (redacted) audio and a manifest. */
export async function buildProjectZip({ project, items, getAudio, options, onProgress }: ProjectBundleInput): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const type = project.type;
  const approved = items.filter((i) => i.status === 'approved').length;

  for (let n = 0; n < items.length; n++) {
    const it = items[n];
    const b = safeName(baseName(it.name));
    files[`annotations/${b}.json`] = strToU8(JSON.stringify(itemJSON(it, project, options), null, 2));
    files[`subtitles/${b}.srt`] = strToU8(toSRT(it, type, options));
    files[`subtitles/${b}.vtt`] = strToU8(toVTT(it, type, options));
    files[`transcripts/${b}.txt`] = strToU8(toTXT(it, type, options));
    if (type === 'meeting') files[`rttm/${b}.rttm`] = strToU8(toRTTM(it) + '\n');
    if (type === 'support' && options.redactAudio) {
      const blob = await getAudio(it.id);
      if (blob) {
        const out = await redactedAudio(it, blob, options);
        files[`audio_redacted/${b}.wav`] = new Uint8Array(await out.arrayBuffer());
      }
    }
    onProgress?.(n + 1, items.length);
  }

  if (type === 'cv_qa') files['reports/qa_report.csv'] = strToU8(cvReportCSV(items));
  files['reports/segments.csv'] = strToU8(segmentsCSV(items, type, options));

  const manifest = {
    schema_version: '1.0',
    exported_at: new Date().toISOString(),
    project: { name: project.name, type, description: project.description },
    items: items.length,
    approved,
    total_duration_sec: Number(items.reduce((a, i) => a + i.duration, 0).toFixed(2)),
    total_segments: items.reduce((a, i) => a + i.segments.length, 0),
    privacy: type === 'support' ? { raw_pii_included: options.includeRawPII, redaction_style: options.redactionStyle, audio_redacted: options.redactAudio } : undefined,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['README.txt'] = strToU8(
    `${project.name}\n${'='.repeat(project.name.length)}\n\nExported ${manifest.exported_at}\n\n` +
      `annotations/   Full per-file JSON (segments, speakers, tags${type === 'support' ? ', PII spans' : ''}${type === 'cv_qa' ? ', QA verdicts, WER/CER' : ''})\n` +
      `subtitles/     SRT + WebVTT\ntranscripts/   Timestamped plain text\n` +
      (type === 'meeting' ? 'rttm/          NIST RTTM diarization reference files\n' : '') +
      (type === 'support' && options.redactAudio ? `audio_redacted/ PII regions replaced by ${options.audioRedactMode}\n` : '') +
      `reports/       CSV reports\nmanifest.json  Dataset summary\n`,
  );
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}
