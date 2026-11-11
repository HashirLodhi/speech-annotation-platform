export interface NormOpts {
  lowercase: boolean;
  stripPunct: boolean;
}
export const defaultNorm: NormOpts = { lowercase: true, stripPunct: true };

export function normalize(s: string, o: NormOpts = defaultNorm): string {
  let t = s.normalize('NFC').replace(/[’‘]/g, "'");
  if (o.lowercase) t = t.toLowerCase();
  if (o.stripPunct) t = t.replace(/[^\p{L}\p{N}\s'-]/gu, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

export type OpType = 'equal' | 'sub' | 'del' | 'ins';
export interface Op {
  type: OpType;
  ref?: string;
  hyp?: string;
}

/** Word-level Levenshtein alignment with backtrace. */
export function alignWords(ref: string[], hyp: string[]): Op[] {
  const n = ref.length;
  const m = hyp.length;
  const w = m + 1;
  const d = new Uint32Array((n + 1) * w);
  for (let i = 0; i <= n; i++) d[i * w] = i;
  for (let j = 0; j <= m; j++) d[j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      d[i * w + j] = Math.min(d[(i - 1) * w + j] + 1, d[i * w + j - 1] + 1, d[(i - 1) * w + j - 1] + cost);
    }
  }
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const same = ref[i - 1] === hyp[j - 1];
      if (d[i * w + j] === d[(i - 1) * w + j - 1] + (same ? 0 : 1)) {
        ops.push({ type: same ? 'equal' : 'sub', ref: ref[i - 1], hyp: hyp[j - 1] });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && d[i * w + j] === d[(i - 1) * w + j] + 1) {
      ops.push({ type: 'del', ref: ref[i - 1] });
      i--;
    } else {
      ops.push({ type: 'ins', hyp: hyp[j - 1] });
      j--;
    }
  }
  return ops.reverse();
}

export interface WerResult {
  wer: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  refWords: number;
  ops: Op[];
}

export function computeWer(reference: string, hypothesis: string, o: NormOpts = defaultNorm): WerResult {
  const r = normalize(reference, o);
  const h = normalize(hypothesis, o);
  const ref = r ? r.split(' ') : [];
  const hyp = h ? h.split(' ') : [];
  const ops = alignWords(ref, hyp);
  const substitutions = ops.filter((x) => x.type === 'sub').length;
  const deletions = ops.filter((x) => x.type === 'del').length;
  const insertions = ops.filter((x) => x.type === 'ins').length;
  const wer = ref.length === 0 ? (hyp.length === 0 ? 0 : 1) : (substitutions + deletions + insertions) / ref.length;
  return { wer, substitutions, deletions, insertions, refWords: ref.length, ops };
}

export function computeCer(reference: string, hypothesis: string, o: NormOpts = defaultNorm): number {
  const a = Array.from(normalize(reference, o));
  const b = Array.from(normalize(hypothesis, o));
  if (a.length === 0) return b.length === 0 ? 0 : 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length] / a.length;
}

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
