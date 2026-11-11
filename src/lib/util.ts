export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const SPEAKER_COLORS = [
  '#2dd4bf', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa',
  '#fb923c', '#4ade80', '#f87171', '#22d3ee', '#e879f9',
];

export function fmtTime(sec: number, withMs = true): string {
  if (!isFinite(sec)) sec = 0;
  const neg = sec < 0;
  const total = Math.round(Math.abs(sec) * 1000);
  const m = Math.floor(total / 60000);
  const s = Math.floor(total / 1000) % 60;
  const ms = total % 1000;
  const base = `${m}:${String(s).padStart(2, '0')}`;
  return (neg ? '-' : '') + (withMs ? `${base}.${String(ms).padStart(3, '0')}` : base);
}

/** Accepts "83.4", "1:23.4", "0:01:23.400". Returns NaN if invalid. */
export function parseTime(str: string): number {
  const s = str.trim();
  if (!s) return NaN;
  const parts = s.split(':');
  if (parts.length > 3) return NaN;
  let total = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!isFinite(n) || n < 0) return NaN;
    total = total * 60 + n;
  }
  return total;
}

export function fmtDuration(sec: number): string {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const baseName = (n: string) => n.replace(/\.[^.]+$/, '');
export const safeName = (n: string) => n.replace(/[^\w.-]+/g, '_');
