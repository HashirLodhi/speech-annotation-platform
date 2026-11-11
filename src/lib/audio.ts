export interface PCM {
  sampleRate: number;
  channels: Float32Array[];
}

export const PEAKS_PER_SEC = 100;

export async function decodeBlob(blob: Blob): Promise<PCM> {
  const ab = await blob.arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(ab);
    return {
      sampleRate: buf.sampleRate,
      channels: Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice()),
    };
  } finally {
    void ctx.close();
  }
}

/** Interleaved [min,max] pairs, PEAKS_PER_SEC buckets per second (mono-mixed). */
export function computePeaks(pcm: PCM, perSec = PEAKS_PER_SEC): Float32Array {
  const len = pcm.channels[0].length;
  const bucket = Math.max(1, Math.floor(pcm.sampleRate / perSec));
  const n = Math.ceil(len / bucket);
  const peaks = new Float32Array(n * 2);
  const nch = pcm.channels.length;
  for (let b = 0; b < n; b++) {
    let min = 1;
    let max = -1;
    const end = Math.min(len, (b + 1) * bucket);
    for (let i = b * bucket; i < end; i++) {
      let v = 0;
      for (let c = 0; c < nch; c++) v += pcm.channels[c][i];
      v /= nch;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks[b * 2] = min;
    peaks[b * 2 + 1] = max;
  }
  return peaks;
}

export interface AudioStats {
  peakDb: number;
  rmsDb: number;
  clipRatio: number;
  leadSilence: number;
  trailSilence: number;
  silenceRatio: number;
}

const db = (v: number) => (v <= 1e-9 ? -90 : 20 * Math.log10(v));

/** Objective audio-quality measurements used to pre-fill the QA checklist. */
export function analyzeAudio(pcm: PCM): AudioStats {
  const ch = pcm.channels[0];
  const sr = pcm.sampleRate;
  const win = Math.max(1, Math.floor(sr * 0.02));
  let peak = 0;
  let sum = 0;
  let clip = 0;
  for (let i = 0; i < ch.length; i++) {
    const a = Math.abs(ch[i]);
    if (a > peak) peak = a;
    if (a >= 0.999) clip++;
    sum += ch[i] * ch[i];
  }
  const rms = Math.sqrt(sum / Math.max(1, ch.length));
  const frames: number[] = [];
  for (let i = 0; i + win <= ch.length; i += win) {
    let s = 0;
    for (let k = i; k < i + win; k++) s += ch[k] * ch[k];
    frames.push(Math.sqrt(s / win));
  }
  const thr = Math.max(0.005, peak * 0.03);
  let lead = 0;
  while (lead < frames.length && frames[lead] < thr) lead++;
  let trail = 0;
  while (trail < frames.length - lead && frames[frames.length - 1 - trail] < thr) trail++;
  const silent = frames.filter((f) => f < thr).length;
  const fd = win / sr;
  return {
    peakDb: db(peak),
    rmsDb: db(rms),
    clipRatio: clip / Math.max(1, ch.length),
    leadSilence: lead * fd,
    trailSilence: trail * fd,
    silenceRatio: silent / Math.max(1, frames.length),
  };
}

export function redactPCM(pcm: PCM, ranges: [number, number][], mode: 'silence' | 'beep'): PCM {
  const channels = pcm.channels.map((c) => c.slice());
  for (const [a, b] of ranges) {
    const s = Math.max(0, Math.floor(a * pcm.sampleRate));
    const e = Math.min(channels[0].length, Math.ceil(b * pcm.sampleRate));
    for (const ch of channels) {
      for (let i = s; i < e; i++) {
        ch[i] = mode === 'beep' ? 0.12 * Math.sin((2 * Math.PI * 1000 * (i - s)) / pcm.sampleRate) : 0;
      }
    }
  }
  return { sampleRate: pcm.sampleRate, channels };
}

export function encodeWav(pcm: PCM): Blob {
  const nch = pcm.channels.length;
  const len = pcm.channels[0].length;
  const buf = new ArrayBuffer(44 + len * nch * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + len * nch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nch, true);
  v.setUint32(24, pcm.sampleRate, true);
  v.setUint32(28, pcm.sampleRate * nch * 2, true);
  v.setUint16(32, nch * 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, len * nch * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nch; c++) {
      const s = Math.max(-1, Math.min(1, pcm.channels[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function probeDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      const d = a.duration;
      URL.revokeObjectURL(url);
      if (isFinite(d)) resolve(d);
      else decodeBlob(blob).then((p) => resolve(p.channels[0].length / p.sampleRate), reject);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unsupported or corrupt audio file'));
    };
    a.src = url;
  });
}

/** Playback controller: wraps HTMLAudioElement, supports looped ranges and cheap time subscriptions. */
export class Player {
  el = new Audio();
  private url: string;
  private timeListeners = new Set<(t: number) => void>();
  private stateListeners = new Set<() => void>();
  private raf = 0;
  rangeStart = 0;
  rangeEnd: number | null = null;
  loop = false;

  constructor(blob: Blob) {
    this.url = URL.createObjectURL(blob);
    this.el.src = this.url;
    this.el.preload = 'auto';
    this.el.addEventListener('play', () => {
      this.emitState();
      this.tick();
    });
    this.el.addEventListener('pause', () => {
      cancelAnimationFrame(this.raf);
      this.emitState();
      this.emitTime();
    });
    this.el.addEventListener('ended', () => this.emitState());
    this.el.addEventListener('seeked', () => this.emitTime());
  }

  private tick = () => {
    const t = this.el.currentTime;
    if (this.rangeEnd != null && t >= this.rangeEnd) {
      if (this.loop) this.el.currentTime = this.rangeStart;
      else {
        this.rangeEnd = null;
        this.el.pause();
        return;
      }
    }
    this.emitTime();
    if (!this.el.paused) this.raf = requestAnimationFrame(this.tick);
  };

  private emitTime() {
    const t = this.el.currentTime;
    this.timeListeners.forEach((l) => l(t));
  }
  private emitState() {
    this.stateListeners.forEach((l) => l());
  }

  get playing() {
    return !this.el.paused;
  }
  get time() {
    return this.el.currentTime;
  }
  onTime(cb: (t: number) => void) {
    this.timeListeners.add(cb);
    return () => void this.timeListeners.delete(cb);
  }
  onState(cb: () => void) {
    this.stateListeners.add(cb);
    return () => void this.stateListeners.delete(cb);
  }
  play() {
    void this.el.play();
  }
  pause() {
    this.el.pause();
  }
  toggle() {
    if (this.playing) this.pause();
    else {
      this.rangeEnd = null;
      this.play();
    }
  }
  seek(t: number) {
    this.el.currentTime = Math.max(0, t);
    this.emitTime();
  }
  playRange(a: number, b: number, loop = this.loop) {
    this.rangeStart = a;
    this.rangeEnd = b;
    this.loop = loop;
    this.el.currentTime = a;
    this.play();
  }
  setRate(r: number) {
    this.el.playbackRate = r;
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
    URL.revokeObjectURL(this.url);
  }
}
