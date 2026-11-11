import { useCallback, useEffect, useRef, useState } from 'react';
import type { Segment } from '../types';
import { PEAKS_PER_SEC, type Player } from '../lib/audio';
import { clamp } from '../lib/util';

interface Props {
  peaks: Float32Array | null;
  duration: number;
  segments: Segment[];
  colorOf: (speakerId: string | null) => string;
  labelOf: (seg: Segment, index: number) => string;
  selectedId: string | null;
  player: Player | null;
  zoom: number; // px per second
  onZoom: (z: number) => void;
  follow: boolean;
  onSelect: (id: string | null) => void;
  onBegin: () => void;
  onChange: (id: string, patch: { start?: number; end?: number }) => void;
  onCreate: (start: number, end: number) => void;
}

const H = 150;
const RULER = 22;
const MIN_LEN = 0.05;

type Drag =
  | { mode: 'move'; id: string; t0: number; start: number; end: number }
  | { mode: 'l' | 'r'; id: string }
  | { mode: 'new'; t0: number; moved: boolean; x0: number };

export function Waveform(p: Props) {
  const { peaks, duration, segments, zoom, player } = p;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [vw, setVw] = useState(800);
  const [ghost, setGhost] = useState<[number, number] | null>(null);
  const width = Math.max(vw, Math.ceil(duration * zoom));

  const draw = useCallback(() => {
    const c = canvas.current;
    const w = wrap.current;
    if (!c || !w) return;
    const dpr = window.devicePixelRatio || 1;
    const W = w.clientWidth;
    if (c.width !== Math.floor(W * dpr) || c.height !== Math.floor(H * dpr)) {
      c.width = Math.floor(W * dpr);
      c.height = Math.floor(H * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const sl = w.scrollLeft;
    const mid = RULER + (H - RULER) / 2;
    const amp = (H - RULER) / 2 - 4;

    // ruler
    g.fillStyle = '#9aa7bd';
    g.font = '10px "JetBrains Mono", monospace';
    g.strokeStyle = '#222d41';
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = steps.find((s) => s * zoom >= 70) ?? 600;
    for (let t = Math.floor(sl / zoom / step) * step; t * zoom - sl < W; t += step) {
      const x = t * zoom - sl;
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, H);
      g.stroke();
      const m = Math.floor(t / 60);
      g.fillText(`${m}:${(t % 60).toFixed(step < 1 ? 1 : 0).padStart(step < 1 ? 4 : 2, '0')}`, x + 3, 12);
    }
    // centre line
    g.strokeStyle = '#33415a';
    g.beginPath();
    g.moveTo(0, mid);
    g.lineTo(W, mid);
    g.stroke();

    if (!peaks) return;
    g.fillStyle = '#7dd3c8';
    for (let x = 0; x < W; x++) {
      const t0 = (sl + x) / zoom;
      const t1 = (sl + x + 1) / zoom;
      if (t0 > duration) break;
      const i0 = Math.floor(t0 * PEAKS_PER_SEC);
      const i1 = Math.max(i0 + 1, Math.ceil(t1 * PEAKS_PER_SEC));
      let mn = 1;
      let mx = -1;
      for (let i = i0; i < i1 && i * 2 + 1 < peaks.length; i++) {
        if (peaks[i * 2] < mn) mn = peaks[i * 2];
        if (peaks[i * 2 + 1] > mx) mx = peaks[i * 2 + 1];
      }
      if (mx < mn) continue;
      const y1 = mid - mx * amp;
      const y2 = mid - mn * amp;
      g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
  }, [peaks, zoom, duration]);

  useEffect(() => {
    const w = wrap.current;
    if (!w) return;
    const ro = new ResizeObserver(() => {
      setVw(w.clientWidth);
      draw();
    });
    ro.observe(w);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw, vw]);

  // playhead (updated imperatively for smoothness) + follow scrolling
  useEffect(() => {
    const place = (t: number) => {
      const h = head.current;
      const w = wrap.current;
      if (!h || !w) return;
      const x = t * zoom;
      h.style.transform = `translateX(${x}px)`;
      if (p.follow) {
        if (x < w.scrollLeft || x > w.scrollLeft + w.clientWidth - 40) w.scrollLeft = Math.max(0, x - 60);
      }
    };
    place(player?.time ?? 0);
    return player?.onTime(place);
  }, [player, zoom, p.follow]);

  const timeAt = (clientX: number) => {
    const w = wrap.current!;
    return clamp((clientX - w.getBoundingClientRect().left + w.scrollLeft) / zoom, 0, duration);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const t = timeAt(e.clientX);
      if (d.mode === 'new') {
        if (Math.abs(e.clientX - d.x0) > 5) d.moved = true;
        if (d.moved) setGhost([Math.min(d.t0, t), Math.max(d.t0, t)]);
      } else if (d.mode === 'move') {
        const len = d.end - d.start;
        const s = clamp(d.start + (t - d.t0), 0, duration - len);
        p.onChange(d.id, { start: s, end: s + len });
      } else {
        const seg = segments.find((x) => x.id === d.id);
        if (!seg) return;
        if (d.mode === 'l') p.onChange(d.id, { start: Math.min(t, seg.end - MIN_LEN) });
        else p.onChange(d.id, { end: Math.max(t, seg.start + MIN_LEN) });
      }
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (d.mode === 'new') {
        const t = timeAt(e.clientX);
        if (d.moved && Math.abs(t - d.t0) > 0.1) p.onCreate(Math.min(d.t0, t), Math.max(d.t0, t));
        else {
          p.onSelect(null);
          player?.seek(d.t0);
        }
        setGhost(null);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });

  // Native, non-passive listener: React's onWheel is passive and cannot preventDefault (browser page-zoom).
  const zoomRef = useRef({ zoom, onZoom: p.onZoom });
  zoomRef.current = { zoom, onZoom: p.onZoom };
  useEffect(() => {
    const w = wrap.current;
    if (!w) return;
    const h = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const { zoom: z, onZoom } = zoomRef.current;
      onZoom(clamp(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 10, 1000));
    };
    w.addEventListener('wheel', h, { passive: false });
    return () => w.removeEventListener('wheel', h);
  }, []);

  const startRegion = (e: React.PointerEvent, s: Segment, mode: 'move' | 'l' | 'r') => {
    e.stopPropagation();
    p.onSelect(s.id);
    p.onBegin();
    if (mode === 'move') {
      drag.current = { mode: 'move', id: s.id, t0: timeAt(e.clientX), start: s.start, end: s.end };
      player?.seek(s.start);
    } else drag.current = { mode, id: s.id };
  };

  return (
    <div
      ref={wrap}
      className="relative overflow-x-auto overflow-y-hidden rounded-lg border border-ink-600 bg-ink-900"
      style={{ height: H + 8 }}
      onScroll={draw}
    >
      <div
        className="relative select-none"
        style={{ width, height: H }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = { mode: 'new', t0: timeAt(e.clientX), moved: false, x0: e.clientX };
        }}
      >
        <canvas ref={canvas} className="sticky left-0 top-0 block" style={{ width: vw, height: H }} />
        {segments.map((s, i) => {
          const color = p.colorOf(s.speakerId);
          const sel = s.id === p.selectedId;
          return (
            <div
              key={s.id}
              className="absolute cursor-grab overflow-hidden border-x"
              style={{
                left: s.start * zoom,
                width: Math.max(2, (s.end - s.start) * zoom),
                top: RULER,
                height: H - RULER,
                background: color + (sel ? '40' : '22'),
                borderColor: color + (sel ? 'ff' : '88'),
                boxShadow: sel ? `inset 0 0 0 1px ${color}` : undefined,
              }}
              onPointerDown={(e) => startRegion(e, s, 'move')}
            >
              <div className="pointer-events-none truncate px-1.5 pt-0.5 text-[10px] font-medium" style={{ color }}>
                {p.labelOf(s, i)}
              </div>
              <div className="absolute inset-y-0 left-0 w-2 cursor-col-resize hover:bg-white/20" onPointerDown={(e) => startRegion(e, s, 'l')} />
              <div className="absolute inset-y-0 right-0 w-2 cursor-col-resize hover:bg-white/20" onPointerDown={(e) => startRegion(e, s, 'r')} />
            </div>
          );
        })}
        {ghost && (
          <div
            className="pointer-events-none absolute border border-dashed border-accent bg-accent/15"
            style={{ left: ghost[0] * zoom, width: (ghost[1] - ghost[0]) * zoom, top: RULER, height: H - RULER }}
          />
        )}
        <div ref={head} className="pointer-events-none absolute left-0 top-0 z-10 h-full w-px bg-white" style={{ willChange: 'transform' }}>
          <div className="absolute -left-[5px] top-0 h-0 w-0 border-x-[5.5px] border-t-[8px] border-x-transparent border-t-white" />
        </div>
      </div>
    </div>
  );
}
