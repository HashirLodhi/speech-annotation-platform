import { Pause, Play, Repeat, Rewind, FastForward, ZoomIn, ZoomOut, Crosshair } from 'lucide-react';
import type { Player } from '../lib/audio';
import { fmtTime } from '../lib/util';

interface Props {
  player: Player | null;
  playing: boolean;
  time: number;
  duration: number;
  rate: number;
  onRate: (r: number) => void;
  loop: boolean;
  onLoop: (v: boolean) => void;
  zoom: number;
  onZoom: (z: number) => void;
  follow: boolean;
  onFollow: (v: boolean) => void;
}

export function Transport(p: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn btn-icon" onClick={() => p.player?.seek(p.time - 2)} title="Back 2s (Alt+←)">
        <Rewind size={15} />
      </button>
      <button className="btn btn-primary w-20" onClick={() => p.player?.toggle()} title="Play / pause (Space)">
        {p.playing ? <Pause size={15} /> : <Play size={15} />}
        {p.playing ? 'Pause' : 'Play'}
      </button>
      <button className="btn btn-icon" onClick={() => p.player?.seek(p.time + 2)} title="Forward 2s (Alt+→)">
        <FastForward size={15} />
      </button>
      <div className="rounded-md border border-ink-500 bg-ink-900 px-2.5 py-1 font-mono text-xs text-slate-100">
        {fmtTime(p.time)} <span className="text-slate-500">/ {fmtTime(p.duration)}</span>
      </div>
      <select
        className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1.5 text-xs"
        value={p.rate}
        onChange={(e) => p.onRate(Number(e.target.value))}
        title="Playback speed"
      >
        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
          <option key={r} value={r}>
            {r}×
          </option>
        ))}
      </select>
      <button className={`btn ${p.loop ? 'border-accent text-accent' : ''}`} onClick={() => p.onLoop(!p.loop)} title="Loop selected segment (L)">
        <Repeat size={14} /> Loop
      </button>
      <button className={`btn ${p.follow ? 'border-accent text-accent' : ''}`} onClick={() => p.onFollow(!p.follow)} title="Follow playhead">
        <Crosshair size={14} /> Follow
      </button>
      <div className="ml-auto flex items-center gap-2 text-slate-400">
        <ZoomOut size={14} />
        <input
          type="range"
          min={Math.log(10)}
          max={Math.log(1000)}
          step={0.01}
          value={Math.log(p.zoom)}
          onChange={(e) => p.onZoom(Math.exp(Number(e.target.value)))}
          className="w-28 accent-teal-400"
          aria-label="Zoom"
        />
        <ZoomIn size={14} />
      </div>
    </div>
  );
}
