import type { AudioItem, ProjectType } from '../types';
import { computeWer } from './text';
import { detectPII } from './pii';

export type Severity = 'error' | 'warn' | 'info';
export interface Issue {
  id: string;
  severity: Severity;
  code: string;
  message: string;
  segmentId?: string;
}

export const NON_SPEECH_TAGS = ['[noise]', '[music]', '[silence]', '[unintelligible]'];

/** Rule-based QA. Every issue links back to a segment so reviewers can jump straight to it. */
export function validateItem(item: AudioItem, type: ProjectType): Issue[] {
  const issues: Issue[] = [];
  let n = 0;
  const add = (severity: Severity, code: string, message: string, segmentId?: string) =>
    issues.push({ id: `${code}-${n++}`, severity, code, message, segmentId });

  const segs = [...item.segments].sort((a, b) => a.start - b.start);
  const speakerIds = new Set(item.speakers.map((s) => s.id));
  const label = (i: number) => `#${i + 1}`;

  if (type !== 'cv_qa' && segs.length === 0) add('warn', 'EMPTY_ITEM', 'No segments yet — nothing annotated.');

  segs.forEach((s, i) => {
    const nonSpeech = s.tags.some((t) => NON_SPEECH_TAGS.includes(t));
    const dur = s.end - s.start;
    if (s.end <= s.start) add('error', 'BAD_RANGE', `Segment ${label(i)}: end must be after start.`, s.id);
    if (s.start < 0 || s.end > item.duration + 0.05)
      add('error', 'OUT_OF_BOUNDS', `Segment ${label(i)} extends outside the audio (0–${item.duration.toFixed(2)}s).`, s.id);
    if (!s.text.trim() && !nonSpeech) add('error', 'EMPTY_TEXT', `Segment ${label(i)} has no text.`, s.id);
    if (type !== 'cv_qa') {
      if (!s.speakerId) add('error', 'NO_SPEAKER', `Segment ${label(i)} has no speaker assigned.`, s.id);
      else if (!speakerIds.has(s.speakerId))
        add('error', 'UNKNOWN_SPEAKER', `Segment ${label(i)} references a speaker that no longer exists.`, s.id);
    }
    if (dur > 30) add('warn', 'TOO_LONG', `Segment ${label(i)} is ${dur.toFixed(0)}s — split into shorter turns (≤30s).`, s.id);
    if (dur > 0 && dur < 0.3 && !nonSpeech) add('warn', 'TOO_SHORT', `Segment ${label(i)} is only ${dur.toFixed(2)}s.`, s.id);
    if (dur >= 2 && !nonSpeech && s.text.trim()) {
      const cps = s.text.length / dur;
      if (cps > 25) add('warn', 'FAST_SPEECH', `Segment ${label(i)}: ${cps.toFixed(0)} chars/s — text likely too long for the time range.`, s.id);
      if (cps < 2 && dur >= 4) add('warn', 'SLOW_SPEECH', `Segment ${label(i)}: ${cps.toFixed(1)} chars/s — time range likely too wide or text incomplete.`, s.id);
    }
    if (/\s{2,}/.test(s.text) || s.text !== s.text.trim())
      add('info', 'WHITESPACE', `Segment ${label(i)} has extra whitespace.`, s.id);
    const brackets = (s.text.match(/\[/g)?.length ?? 0) - (s.text.match(/\]/g)?.length ?? 0);
    if (brackets !== 0) add('warn', 'BRACKETS', `Segment ${label(i)} has unbalanced brackets.`, s.id);
    const rep = s.text.match(/\b([a-z']+)\s+\1\b/i);
    if (rep && !s.tags.includes('[disfluency]'))
      add('info', 'REPEATED_WORD', `Segment ${label(i)} repeats a word ("${rep[1]}") — transcribe verbatim only if spoken.`, s.id);

    if (i > 0) {
      const p = segs[i - 1];
      const overlap = p.end - s.start;
      if (overlap > 0.05) {
        const tagged = p.tags.includes('[overlap]') && s.tags.includes('[overlap]');
        if (!tagged)
          add(type === 'meeting' ? 'warn' : 'error', 'OVERLAP',
            `Segments ${label(i - 1)} and ${label(i)} overlap by ${overlap.toFixed(2)}s — tag both [overlap] if speakers talk over each other.`, s.id);
      } else if (-overlap > 2.5 && type !== 'cv_qa') {
        add('warn', 'GAP', `${(-overlap).toFixed(1)}s gap before ${label(i)} — possible untranscribed speech.`, s.id);
      }
    }

    if (type === 'support') {
      const detected = detectPII(s.text);
      for (const d of detected) {
        const covered = s.pii.some((p) => p.start < d.end && p.end > d.start);
        if (!covered)
          add('error', 'UNREDACTED_PII', `Segment ${label(i)}: possible unredacted ${d.type} "${d.text}".`, s.id);
      }
      for (const p of s.pii) {
        if (s.text.slice(p.start, p.end) !== p.text)
          add('error', 'STALE_PII', `Segment ${label(i)}: PII span "${p.text}" no longer matches the text.`, s.id);
      }
    }
  });

  if (type !== 'cv_qa' && segs.length > 0) {
    const first = segs[0];
    if (first.start > 5) add('info', 'LEAD_GAP', `First segment starts at ${first.start.toFixed(1)}s.`, first.id);
    const last = segs[segs.length - 1];
    if (item.duration - last.end > 5)
      add('info', 'TRAIL_GAP', `Audio continues ${(item.duration - last.end).toFixed(1)}s after the last segment.`, last.id);
    const counts = new Map<string, number>();
    segs.forEach((s) => s.speakerId && counts.set(s.speakerId, (counts.get(s.speakerId) ?? 0) + 1));
    for (const sp of item.speakers) {
      const c = counts.get(sp.id) ?? 0;
      if (c === 0) add('info', 'UNUSED_SPEAKER', `Speaker "${sp.name}" has no segments — remove or merge.`);
      else if (c === 1 && segs.length > 6) add('info', 'SINGLE_TURN', `Speaker "${sp.name}" speaks only once — possible diarization split error.`);
    }
  }

  if (type === 'support' && segs.length > 0 && segs.every((s) => s.pii.length === 0))
    add('info', 'NO_PII', 'No PII marked in this call — confirm the call genuinely contains none.');

  if (type === 'cv_qa') {
    const text = segs.map((s) => s.text).join(' ').trim();
    const ref = item.cv?.reference ?? '';
    const qa = item.qa;
    if (!text) add('error', 'NO_TRANSCRIPT', 'No transcript entered.');
    if (!qa?.verdict) add('error', 'NO_VERDICT', 'Choose a verdict (accept / fix / reject).');
    if (text && ref) {
      const { wer } = computeWer(ref, text);
      if (qa?.verdict === 'accept' && wer > 0) add('warn', 'ACCEPT_MISMATCH', `Verdict is "accept" but transcript differs from the reference (WER ${(wer * 100).toFixed(0)}%).`);
      if (qa?.verdict === 'fix' && wer === 0) add('warn', 'FIX_NO_DIFF', 'Verdict is "fix" but transcript matches the reference after normalisation.');
    }
    if (qa?.verdict === 'reject' && qa.errorTypes.length === 0 && qa.audioIssues.length === 0)
      add('error', 'REJECT_NO_REASON', 'Rejected clips need at least one error type or audio issue.');
    if (/\d/.test(text)) add('warn', 'DIGITS', 'Transcript contains digits — Common Voice convention is to spell numbers out.');
    if (/[<>{}|\\]/.test(text)) add('warn', 'SYMBOLS', 'Transcript contains symbols that are not part of normal text.');
  }

  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
