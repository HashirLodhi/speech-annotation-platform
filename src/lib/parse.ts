/** Parsers for importing transcripts / metadata alongside audio. */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

function tsToSec(s: string): number {
  const m = s.trim().replace(',', '.').match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return NaN;
  return (m[1] ? Number(m[1]) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3]);
}

/** Parses SRT or WebVTT into cues. */
export function parseSubtitles(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== '');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, bRaw] = lines[ti].split('-->');
    const start = tsToSec(a);
    const end = tsToSec(bRaw.trim().split(/\s+/)[0]);
    if (!isFinite(start) || !isFinite(end)) continue;
    cues.push({ start, end, text: lines.slice(ti + 1).join(' ').trim() });
  }
  return cues;
}

/** Splits "Speaker: text" prefixes that many tools embed in cue text. */
export function splitSpeakerPrefix(text: string): { speaker: string | null; text: string } {
  const m = text.match(/^\[?([A-Z][\w .'-]{0,24})\]?:\s+(.*)$/);
  return m ? { speaker: m[1].trim(), text: m[2] } : { speaker: null, text };
}

/** Minimal CSV/TSV parser (auto-detects delimiter, supports quoted fields in CSV). */
export function parseDelimited(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '').replace(/\r/g, '');
  const firstLine = clean.split('\n', 1)[0] ?? '';
  const delim = firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];

  if (delim === '\t') {
    // Common Voice TSVs contain stray quote characters; do not treat them as quoting.
    for (const line of clean.split('\n')) if (line.length) rows.push(line.split('\t'));
  } else {
    let cur: string[] = [];
    let field = '';
    let q = false;
    for (let i = 0; i < clean.length; i++) {
      const c = clean[i];
      if (q) {
        if (c === '"' && clean[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') {
        cur.push(field);
        field = '';
      } else if (c === '\n') {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = '';
      } else field += c;
    }
    if (field.length || cur.length) {
      cur.push(field);
      rows.push(cur);
    }
  }
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
