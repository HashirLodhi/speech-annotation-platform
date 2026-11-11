import { describe, expect, it } from 'vitest';
import { applyRedaction, detectPII, reconcileSpans } from './pii';
import { computeCer, computeWer } from './text';
import { parseDelimited, parseSubtitles } from './parse';
import { fmtTime, parseTime } from './util';
import { validateItem } from './validate';
import { toRTTM, toSRT, defaultExportOptions } from './export';
import type { AudioItem } from '../types';

describe('WER / CER', () => {
  it('is zero for identical text after normalisation', () => {
    expect(computeWer('Hello, World!', 'hello world').wer).toBe(0);
  });
  it('counts substitution, deletion, insertion', () => {
    const r = computeWer('the cat sat on the mat', 'the dog sat the mat now');
    expect(r.substitutions).toBe(1);
    expect(r.deletions).toBe(1);
    expect(r.insertions).toBe(1);
    expect(r.wer).toBeCloseTo(3 / 6);
  });
  it('handles empty reference', () => {
    expect(computeWer('', '').wer).toBe(0);
    expect(computeWer('', 'x').wer).toBe(1);
  });
  it('CER', () => {
    expect(computeCer('abc', 'abd')).toBeCloseTo(1 / 3);
  });
});

describe('PII detection', () => {
  const types = (t: string) => detectPII(t).map((s) => `${s.type}:${s.text}`);
  it('finds email, phone and card', () => {
    const r = types('Mail me at a.b@example.com or call 415-555-0198, card 4111 1111 1111 1111.');
    expect(r).toContain('EMAIL:a.b@example.com');
    expect(r).toContain('PHONE:415-555-0198');
    expect(r.some((x) => x.startsWith('CARD:'))).toBe(true);
  });
  it('finds names after cue phrases but not stop words', () => {
    expect(types("My name is Michael Turner")).toContain('NAME:Michael Turner');
    expect(types('Hello, Thank you for calling')).toHaveLength(0);
  });
  it('finds spoken digits and spoken emails', () => {
    expect(types('it is five five five zero one four two').some((x) => x.startsWith('ACCOUNT'))).toBe(true);
    expect(types('jo dot park at gmail dot com')).toContain('EMAIL:jo dot park at gmail dot com');
    expect(types('email is jo.park at gmail dot com')).toContain('EMAIL:jo.park at gmail dot com');
  });
  it('requires a digit in order/account ids (no "number" false positive)', () => {
    expect(types('Can you give me your order number?')).toHaveLength(0);
    expect(types('Sure, order number NW-48213-US.')).toContain('ORDER_ID:NW-48213-US');
    expect(types('my account number is AC-7781203')).toContain('ACCOUNT:AC-7781203');
  });
  it('redacts and reconciles', () => {
    const text = 'call 415-555-0198 now';
    const spans = detectPII(text);
    expect(applyRedaction(text, spans)).toBe('call [PHONE] now');
    expect(reconcileSpans(spans, 'please call 415-555-0198 now')[0].start).toBe(12);
    expect(reconcileSpans(spans, 'call nobody')).toHaveLength(0);
  });
});

describe('parsing & formatting', () => {
  it('parses SRT', () => {
    const c = parseSubtitles('1\n00:00:01,500 --> 00:00:03,000\nHello there\n\n2\n00:00:04,000 --> 00:00:05,250\nBye');
    expect(c).toHaveLength(2);
    expect(c[0]).toEqual({ start: 1.5, end: 3, text: 'Hello there' });
  });
  it('parses Common Voice style TSV', () => {
    const rows = parseDelimited('client_id\tpath\tsentence\nabc\tclip1.mp3\tHello "world"\n');
    expect(rows[0].sentence).toBe('Hello "world"');
  });
  it('time helpers round-trip', () => {
    expect(fmtTime(83.4)).toBe('1:23.400');
    expect(parseTime('1:23.4')).toBeCloseTo(83.4);
    expect(parseTime('abc')).toBeNaN();
  });
});

const item = (over: Partial<AudioItem>): AudioItem => ({
  id: 'i', projectId: 'p', name: 'a.wav', duration: 20, mime: 'audio/wav', status: 'todo', segments: [], speakers: [{ id: 's1', name: 'A', color: '#fff' }],
  comments: [], annotator: 'x', timeSpentSec: 0, createdAt: 0, updatedAt: 0, ...over,
});

describe('validation & export', () => {
  it('flags overlap, missing speaker and unredacted PII', () => {
    const it = item({
      segments: [
        { id: 'a', start: 0, end: 5, speakerId: 's1', text: 'call 415-555-0198', tags: [], pii: [] },
        { id: 'b', start: 4, end: 8, speakerId: null, text: 'hi', tags: [], pii: [] },
      ],
    });
    const codes = validateItem(it, 'support').map((i) => i.code);
    expect(codes).toContain('OVERLAP');
    expect(codes).toContain('NO_SPEAKER');
    expect(codes).toContain('UNREDACTED_PII');
  });
  it('accepts tagged overlap', () => {
    const it = item({
      segments: [
        { id: 'a', start: 0, end: 5, speakerId: 's1', text: 'one', tags: ['[overlap]'], pii: [] },
        { id: 'b', start: 4, end: 8, speakerId: 's1', text: 'two', tags: ['[overlap]'], pii: [] },
      ],
    });
    expect(validateItem(it, 'meeting').map((i) => i.code)).not.toContain('OVERLAP');
  });
  it('exports RTTM and SRT', () => {
    const it = item({ segments: [{ id: 'a', start: 1, end: 2.5, speakerId: 's1', text: 'hi', tags: [], pii: [] }] });
    expect(toRTTM(it)).toBe('SPEAKER a 1 1.000 1.500 <NA> <NA> A <NA> <NA>');
    expect(toSRT(it, 'meeting', defaultExportOptions)).toContain('00:00:01,000 --> 00:00:02,500\nA: hi');
  });
});
