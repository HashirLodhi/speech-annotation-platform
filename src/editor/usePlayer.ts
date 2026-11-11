import { useEffect, useState } from 'react';
import { Player, PEAKS_PER_SEC, computePeaks, decodeBlob, analyzeAudio, type AudioStats } from '../lib/audio';
import { useStore } from '../lib/store';

/** Loads the item's audio, builds a Player, decodes peaks (+ quality stats). Time state refreshes at ~10 Hz. */
export function usePlayer(itemId: string) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [stats, setStats] = useState<AudioStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  useEffect(() => {
    let alive = true;
    let p: Player | null = null;
    let offT: (() => void) | undefined;
    let offS: (() => void) | undefined;
    (async () => {
      const blob = await useStore.getState().getAudio(itemId);
      if (!alive) return;
      if (!blob) {
        setError('Audio data missing for this item.');
        return;
      }
      p = new Player(blob);
      let last = 0;
      offT = p.onTime((t) => {
        const n = performance.now();
        if (n - last > 100 || !p!.playing) {
          last = n;
          setTime(t);
        }
      });
      offS = p.onState(() => setPlaying(p!.playing));
      setPlayer(p);
      try {
        const pcm = await decodeBlob(blob);
        if (!alive) return;
        setPeaks(computePeaks(pcm, PEAKS_PER_SEC));
        setStats(analyzeAudio(pcm));
      } catch {
        if (alive) setError('Could not decode audio for waveform display (playback may still work).');
      }
    })();
    return () => {
      alive = false;
      offT?.();
      offS?.();
      p?.destroy();
    };
  }, [itemId]);

  return { player, peaks, stats, error, playing, time };
}
