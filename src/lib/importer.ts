import type { AudioItem, Project, Segment, Speaker } from '../types';
import { probeDuration } from './audio';
import { parseDelimited, parseSubtitles, splitSpeakerPrefix } from './parse';
import { newItem, useStore } from './store';
import { SPEAKER_COLORS, baseName, uid } from './util';

const AUDIO_RE = /\.(wav|mp3|ogg|oga|opus|flac|m4a|aac|webm)$/i;
export const isAudio = (f: File) => f.type.startsWith('audio/') || AUDIO_RE.test(f.name);

export interface ImportResult {
  added: number;
  skipped: string[];
  notes: string[];
}

/**
 * Imports audio files plus optional side-car files:
 *  - .srt / .vtt with the same basename → pre-segmented draft transcript (e.g. from an ASR tool)
 *  - .tsv / .csv with `path` + `sentence` columns → Common Voice metadata (Common Voice QA projects)
 */
export async function importFiles(project: Project, files: File[], onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  const audio = files.filter(isAudio);
  const result: ImportResult = { added: 0, skipped: [], notes: [] };
  const subs = new Map<string, File>();
  files.filter((f) => /\.(srt|vtt)$/i.test(f.name)).forEach((f) => subs.set(baseName(f.name).toLowerCase(), f));

  const cvRows = new Map<string, Record<string, string>>();
  if (project.type === 'cv_qa') {
    for (const f of files.filter((x) => /\.(tsv|csv)$/i.test(x.name))) {
      for (const row of parseDelimited(await f.text())) {
        const p = row.path || row.filename || row.file;
        if (p) cvRows.set(baseName(p).toLowerCase(), row);
      }
    }
    if (cvRows.size) result.notes.push(`Loaded Common Voice metadata for ${cvRows.size} clips.`);
  }

  const existing = new Set(useStore.getState().items.filter((i) => i.projectId === project.id).map((i) => i.name));
  for (let n = 0; n < audio.length; n++) {
    const f = audio[n];
    onProgress?.(n, audio.length);
    if (existing.has(f.name)) {
      result.skipped.push(`${f.name} (already imported)`);
      continue;
    }
    let duration: number;
    try {
      duration = await probeDuration(f);
    } catch {
      result.skipped.push(`${f.name} (cannot decode)`);
      continue;
    }
    const key = baseName(f.name).toLowerCase();
    const extra: Partial<AudioItem> = {};

    if (project.type === 'cv_qa') {
      const row = cvRows.get(key);
      extra.cv = {
        reference: row?.sentence ?? '',
        upVotes: row?.up_votes ? Number(row.up_votes) : undefined,
        downVotes: row?.down_votes ? Number(row.down_votes) : undefined,
        age: row?.age || undefined,
        gender: row?.gender || undefined,
        accent: row?.accents || row?.accent || undefined,
        locale: row?.locale || undefined,
      };
      extra.qa = { verdict: null, errorTypes: [], audioIssues: [], notes: '' };
      if (!row) result.notes.push(`${f.name}: no reference sentence found in metadata.`);
    }

    const sub = subs.get(key);
    if (sub && project.type !== 'cv_qa') {
      const speakers: Speaker[] = [];
      const speakerFor = (name: string) => {
        let s = speakers.find((x) => x.name === name);
        if (!s) {
          s = { id: uid(), name, color: SPEAKER_COLORS[speakers.length % SPEAKER_COLORS.length] };
          speakers.push(s);
        }
        return s.id;
      };
      const segments: Segment[] = parseSubtitles(await sub.text()).map((c) => {
        const { speaker, text } = splitSpeakerPrefix(c.text);
        return { id: uid(), start: c.start, end: c.end, speakerId: speaker ? speakerFor(speaker) : null, text, tags: [], pii: [] };
      });
      extra.segments = segments;
      extra.speakers = speakers;
      extra.status = 'in_progress';
      result.notes.push(`${f.name}: imported ${segments.length} draft segments from ${sub.name}.`);
    }

    await useStore.getState().addItem(newItem(project.id, f.name, duration, f.type || 'audio/wav', extra), f);
    result.added++;
  }
  onProgress?.(audio.length, audio.length);
  if (!audio.length) result.notes.push('No audio files found in the selection.');
  return result;
}
