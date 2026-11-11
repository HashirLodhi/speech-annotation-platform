import type { PIISpan, PIIType } from '../types';
import { uid } from './util';

export const PII_TYPES: { type: PIIType; label: string; color: string }[] = [
  { type: 'NAME', label: 'Name', color: '#f472b6' },
  { type: 'PHONE', label: 'Phone', color: '#60a5fa' },
  { type: 'EMAIL', label: 'Email', color: '#22d3ee' },
  { type: 'ADDRESS', label: 'Address', color: '#fb923c' },
  { type: 'CARD', label: 'Card no.', color: '#f87171' },
  { type: 'SSN', label: 'SSN / ID', color: '#e879f9' },
  { type: 'ACCOUNT', label: 'Account', color: '#a78bfa' },
  { type: 'DOB', label: 'Date of birth', color: '#fbbf24' },
  { type: 'ORDER_ID', label: 'Order / ticket', color: '#4ade80' },
  { type: 'OTHER', label: 'Other', color: '#94a3b8' },
];
export const piiColor = (t: PIIType) => PII_TYPES.find((p) => p.type === t)?.color ?? '#94a3b8';

const DIGIT_WORDS = 'zero|oh|one|two|three|four|five|six|seven|eight|nine';
const MONTHS =
  'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
const STOP_NAMES = new Set([
  'thank', 'thanks', 'welcome', 'how', 'good', 'yes', 'no', 'okay', 'ok', 'sorry', 'calling', 'just', 'looking',
  'trying', 'having', 'not', 'the', 'a', 'an', 'so', 'well', 'please', 'there', 'here', 'sure', 'great', 'happy',
  'glad', 'afraid', 'going', 'ready', 'still', 'also', 'again', 'now', 'today', 'with', 'from', 'for', 'and',
]);

interface Rule {
  type: PIIType;
  re: RegExp;
  group?: number;
  accept?: (m: string) => PIIType | null;
}

const RULES: Rule[] = [
  { type: 'EMAIL', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/dg },
  {
    type: 'EMAIL',
    re: /\b[a-z0-9][a-z0-9.]*(?: dot [a-z0-9.]+)* at [a-z0-9]+ dot (?:com|net|org|io|co|edu|gov)\b/dgi,
  },
  { type: 'SSN', re: /\b\d{3}-\d{2}-\d{4}\b/dg },
  {
    type: 'CARD',
    re: /(?<![\d-])(?:\d[ -]?){13,19}(?!\d)/dg,
    accept: (m) => {
      const n = m.replace(/\D/g, '').length;
      return n >= 13 && n <= 19 ? 'CARD' : null;
    },
  },
  { type: 'PHONE', re: /(?<![\w])(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/dg },
  {
    type: 'DOB',
    re: new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2}\\b`, 'dgi'),
  },
  { type: 'DOB', re: /\b\d{1,2}\/\d{1,2}\/(?:19|20)?\d{2}\b/dg },
  {
    type: 'ADDRESS',
    re: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way|Place|Pl)\b\.?/dg,
  },
  {
    type: 'ORDER_ID',
    re: /\b(?:order|ticket|case|confirmation|reference)(?:\s+(?:number|no\.?|id|#))?\s*(?:is|:|#)?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,})\b/dgi,
    group: 1,
  },
  {
    type: 'ACCOUNT',
    re: /\baccount(?:\s+(?:number|no\.?|id|#))?\s*(?:is|:|#)?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,})\b/dgi,
    group: 1,
  },
  {
    type: 'NAME',
    re: /\b(?:[Mm]y name is|[Tt]his is|I'm|I am|[Nn]ame's|[Ss]peaking (?:with|to)|[Tt]alking to|[Cc]alling for|[Aa]sk for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/dg,
    group: 1,
  },
  {
    type: 'NAME',
    re: /\b(?:Hi|Hello|Hey|Thanks|Thank you|Dear|Mr\.?|Mrs\.?|Ms\.?|Dr\.?),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/dg,
    group: 1,
  },
];

const SPOKEN_DIGITS = new RegExp(`\\b(?:(?:${DIGIT_WORDS})\\b[\\s,.-]*){7,}`, 'dgi');

function trimSpan(text: string, s: number, e: number): [number, number] {
  while (e > s && /[\s,.;:-]/.test(text[e - 1])) e--;
  return [s, e];
}

/** Heuristic PII detection. Intended as pre-annotation — a human verifies every span. */
export function detectPII(text: string): PIISpan[] {
  const found: { start: number; end: number; type: PIIType }[] = [];

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      const idx = (m as RegExpMatchArray & { indices?: [number, number][] }).indices;
      let [s, e] = rule.group && idx?.[rule.group] ? idx[rule.group] : [m.index ?? 0, (m.index ?? 0) + m[0].length];
      [s, e] = trimSpan(text, s, e);
      const raw = text.slice(s, e);
      let type: PIIType | null = rule.type;
      if (rule.accept) type = rule.accept(raw);
      if (rule.type === 'NAME') {
        const first = raw.split(/\s+/)[0].toLowerCase();
        if (STOP_NAMES.has(first)) type = null;
      }
      if (type && e > s) found.push({ start: s, end: e, type });
    }
  }

  SPOKEN_DIGITS.lastIndex = 0;
  for (const m of text.matchAll(SPOKEN_DIGITS)) {
    const [s, e] = trimSpan(text, m.index ?? 0, (m.index ?? 0) + m[0].length);
    const words = text.slice(s, e).split(/[\s,.-]+/).filter(Boolean).length;
    const type: PIIType = words >= 13 ? 'CARD' : words === 10 ? 'PHONE' : words === 9 ? 'SSN' : 'ACCOUNT';
    found.push({ start: s, end: e, type });
  }

  // Resolve overlaps: earliest start wins, longer span wins ties.
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: PIISpan[] = [];
  let lastEnd = -1;
  for (const f of found) {
    if (f.start < lastEnd) continue;
    out.push({ id: uid(), start: f.start, end: f.end, type: f.type, text: text.slice(f.start, f.end), auto: true });
    lastEnd = f.end;
  }
  return out;
}

export type RedactionStyle = 'tag' | 'mask';

export function applyRedaction(text: string, spans: PIISpan[], style: RedactionStyle = 'tag'): string {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const s of sorted) {
    if (s.start < pos) continue;
    out += text.slice(pos, s.start);
    out += style === 'tag' ? `[${s.type}]` : '[REDACTED]';
    pos = s.end;
  }
  return out + text.slice(pos);
}

/** Keep spans valid after the segment text was edited; drops spans whose text vanished. */
export function reconcileSpans(spans: PIISpan[], newText: string): PIISpan[] {
  const out: PIISpan[] = [];
  for (const s of spans) {
    if (newText.slice(s.start, s.end) === s.text) {
      out.push(s);
      continue;
    }
    // choose the occurrence nearest to the old position
    let best = -1;
    let from = 0;
    for (;;) {
      const i = newText.indexOf(s.text, from);
      if (i < 0) break;
      if (best < 0 || Math.abs(i - s.start) < Math.abs(best - s.start)) best = i;
      from = i + 1;
    }
    if (best >= 0) out.push({ ...s, start: best, end: best + s.text.length });
  }
  return out;
}

/** Approximate time ranges of PII inside a segment (proportional to character position). */
export function piiTimeRanges(
  seg: { start: number; end: number; text: string; pii: PIISpan[] },
  pad = 0.12,
): [number, number][] {
  const len = Math.max(1, seg.text.length);
  const dur = seg.end - seg.start;
  return seg.pii.map((p) => [
    Math.max(seg.start, seg.start + (p.start / len) * dur - pad),
    Math.min(seg.end, seg.start + (p.end / len) * dur + pad),
  ]);
}
