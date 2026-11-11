import type { AudioItem, ItemStatus, PIIType } from '../types';
import { computeCer, computeWer } from './text';
import { validateItem } from './validate';
import type { ProjectType } from '../types';
import { wordCount } from './util';

export interface ProjectStats {
  items: number;
  byStatus: Record<ItemStatus, number>;
  audioSec: number;
  annotatedSec: number;
  segments: number;
  words: number;
  timeSpentSec: number;
  /** annotation time ÷ audio time, over items that have segments */
  rtf: number | null;
  errors: number;
  warnings: number;
  speakerTime: { name: string; color: string; sec: number }[];
  piiByType: Partial<Record<PIIType, number>>;
  avgWer: number | null;
  avgCer: number | null;
  verdicts: { accept: number; fix: number; reject: number; none: number };
  errorTypes: [string, number][];
  audioIssues: [string, number][];
}

const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

export function computeStats(items: AudioItem[], type: ProjectType): ProjectStats {
  const byStatus: Record<ItemStatus, number> = { todo: 0, in_progress: 0, review: 0, approved: 0, rejected: 0 };
  const st: ProjectStats = {
    items: items.length, byStatus, audioSec: 0, annotatedSec: 0, segments: 0, words: 0, timeSpentSec: 0, rtf: null,
    errors: 0, warnings: 0, speakerTime: [], piiByType: {}, avgWer: null, avgCer: null,
    verdicts: { accept: 0, fix: 0, reject: 0, none: 0 }, errorTypes: [], audioIssues: [],
  };
  const sp = new Map<string, { name: string; color: string; sec: number }>();
  const errs = new Map<string, number>();
  const aud = new Map<string, number>();
  let wers = 0, cers = 0, nWer = 0, rtfAudio = 0, rtfTime = 0;

  for (const it of items) {
    byStatus[it.status]++;
    st.audioSec += it.duration;
    st.timeSpentSec += it.timeSpentSec;
    if (it.segments.length) {
      rtfAudio += it.duration;
      rtfTime += it.timeSpentSec;
    }
    for (const s of it.segments) {
      st.segments++;
      st.words += wordCount(s.text);
      st.annotatedSec += Math.max(0, s.end - s.start);
      const spk = it.speakers.find((x) => x.id === s.speakerId);
      if (spk) {
        const key = `${it.id}:${spk.id}`;
        void key;
        const e = sp.get(spk.name) ?? { name: spk.name, color: spk.color, sec: 0 };
        e.sec += s.end - s.start;
        sp.set(spk.name, e);
      }
      for (const p of s.pii) st.piiByType[p.type] = (st.piiByType[p.type] ?? 0) + 1;
    }
    for (const i of validateItem(it, type)) {
      if (i.severity === 'error') st.errors++;
      else if (i.severity === 'warn') st.warnings++;
    }
    if (type === 'cv_qa') {
      const v = it.qa?.verdict;
      st.verdicts[v ?? 'none']++;
      it.qa?.errorTypes.forEach((e) => errs.set(e, (errs.get(e) ?? 0) + 1));
      it.qa?.audioIssues.forEach((e) => aud.set(e, (aud.get(e) ?? 0) + 1));
      const text = it.segments.map((s) => s.text).join(' ');
      if (text && it.cv?.reference) {
        wers += computeWer(it.cv.reference, text).wer;
        cers += computeCer(it.cv.reference, text);
        nWer++;
      }
    }
  }
  st.speakerTime = [...sp.values()].sort((a, b) => b.sec - a.sec);
  st.rtf = rtfAudio > 0 && rtfTime > 0 ? rtfTime / rtfAudio : null;
  if (nWer) {
    st.avgWer = wers / nWer;
    st.avgCer = cers / nWer;
  }
  st.errorTypes = top(errs);
  st.audioIssues = top(aud);
  return st;
}
