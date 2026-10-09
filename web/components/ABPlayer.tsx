import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioContext, formatTime, peaksFromBlob } from '../lib/audio.ts';

type Side = 'A' | 'B';

interface Props {
  original: Blob | null;
  dub: Blob | null;
  /** Shown in lane B while there's no dub yet. */
  dubPlaceholder?: React.ReactNode;
  labelA?: string;
  labelB?: string;
  /** Extra note under lane B, e.g. "dev engine: unchanged". */
  dubNote?: string;
}

interface Lane {
  url: string | null;
  peaks: number[] | null;
  duration: number;
  error: string | null;
}

function useLane(blob: Blob | null): Lane {
  const [lane, setLane] = useState<Lane>({ url: null, peaks: null, duration: 0, error: null });
  useEffect(() => {
    if (!blob) {
      setLane({ url: null, peaks: null, duration: 0, error: null });
      return;
    }
    const url = URL.createObjectURL(blob);
    let alive = true;
    setLane({ url, peaks: null, duration: 0, error: null });
    peaksFromBlob(blob)
      .then(({ peaks, duration }) => alive && setLane({ url, peaks, duration, error: null }))
      .catch(() => alive && setLane({ url, peaks: null, duration: 0, error: 'Can’t draw this waveform, but it should still play.' }));
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return lane;
}

/**
 * The A/B deck. One transport, two takes. Flipping sides keeps your place in the recording,
 * so you hear the same moment in both versions. Take A draws up, Take B draws down.
 */
export function ABPlayer({ original, dub, dubPlaceholder, labelA = 'Original', labelB = 'Dub', dubNote }: Props) {
  const a = useLane(original);
  const b = useLane(dub);
  const audioA = useRef<HTMLAudioElement>(null);
  const audioB = useRef<HTMLAudioElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const wired = useRef(new WeakSet<HTMLAudioElement>());
  const [side, setSide] = useState<Side>('A');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [level, setLevel] = useState(0);
  const [announce, setAnnounce] = useState('');

  const hasB = !!b.url;
  const el = useCallback((s: Side) => (s === 'A' ? audioA.current : audioB.current), []);
  const duration = Math.max(a.duration, b.duration, el(side)?.duration || 0) || 0;

  // If the dub disappears (new take), fall back to A.
  useEffect(() => {
    if (!hasB && side === 'B') setSide('A');
  }, [hasB, side]);

  // Stop everything when sources change.
  useEffect(() => {
    audioA.current?.pause();
    audioB.current?.pause();
    setPlaying(false);
    setTime(0);
  }, [a.url, b.url]);

  /** Real-time level from the analyser — the meter moves with what you're actually hearing. */
  const wire = useCallback((media: HTMLAudioElement) => {
    try {
      const ctx = audioContext();
      if (ctx.state === 'suspended') void ctx.resume();
      if (!analyser.current) {
        analyser.current = ctx.createAnalyser();
        analyser.current.fftSize = 1024;
        analyser.current.connect(ctx.destination);
      }
      if (!wired.current.has(media)) {
        ctx.createMediaElementSource(media).connect(analyser.current);
        wired.current.add(media);
      }
    } catch {
      /* metering is a nicety; playback still works without it */
    }
  }, []);

  const play = useCallback(async () => {
    const m = el(side);
    if (!m) return;
    wire(m);
    try {
      await m.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [el, side, wire]);

  const pause = useCallback(() => {
    el('A')?.pause();
    el('B')?.pause();
    setPlaying(false);
  }, [el]);

  const flip = useCallback(
    (to: Side) => {
      if (to === side || (to === 'B' && !hasB)) return;
      const from = el(side);
      const next = el(to);
      if (!next) return;
      const t = from?.currentTime ?? 0;
      const wasPlaying = playing;
      from?.pause();
      next.currentTime = Math.min(t, (next.duration || t) - 0.05 > 0 ? (next.duration || t) - 0.05 : t);
      setSide(to);
      setAnnounce(to === 'A' ? `Now playing ${labelA}` : `Now playing ${labelB}`);
      if (wasPlaying) {
        wire(next);
        void next.play().catch(() => setPlaying(false));
      }
    },
    [side, hasB, el, playing, wire, labelA, labelB],
  );

  const seek = useCallback(
    (t: number) => {
      const m = el(side);
      if (!m) return;
      m.currentTime = Math.max(0, Math.min(t, (m.duration || duration) - 0.01));
      setTime(m.currentTime);
    },
    [el, side, duration],
  );

  // Animation loop: playhead + meter.
  useEffect(() => {
    let raf = 0;
    const buf = new Float32Array(1024);
    const loop = () => {
      const m = el(side);
      if (m) setTime(m.currentTime);
      if (analyser.current && playing) {
        analyser.current.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      } else setLevel(0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [el, side, playing]);

  // Draw both lanes: A up from the centre line, B down. Played region is solid.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== w * dpr || c.height !== h * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(c);
    const colA = css.getPropertyValue('--lane-a').trim() || '#fff';
    const colB = css.getPropertyValue('--lane-b').trim() || '#f60';
    const colRule = css.getPropertyValue('--lane-rule').trim() || '#888';
    const mid = h / 2;
    const prog = duration > 0 ? time / duration : 0;
    const drawLane = (peaks: number[] | null, color: string, dir: 1 | -1, active: boolean) => {
      if (!peaks) return;
      const n = peaks.length;
      const bw = w / n;
      for (let i = 0; i < n; i++) {
        const x = i * bw;
        const amp = Math.max(1.5, peaks[i] * (mid - 6));
        const played = (i + 0.5) / n <= prog;
        g.globalAlpha = active ? (played ? 1 : 0.42) : played ? 0.34 : 0.16;
        g.fillStyle = color;
        g.fillRect(x + bw * 0.18, dir === 1 ? mid - amp - 1 : mid + 1, Math.max(1, bw * 0.64), amp);
      }
    };
    drawLane(a.peaks, colA, 1, side === 'A');
    drawLane(b.peaks, colB, -1, side === 'B');
    g.globalAlpha = 1;
    g.fillStyle = colRule;
    g.fillRect(0, mid - 0.5, w, 1);
    if (duration > 0) {
      g.fillStyle = side === 'A' ? colA : colB;
      g.fillRect(Math.round(prog * w) - 1, 0, 2, h);
    }
  }, [a.peaks, b.peaks, time, duration, side]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      playing ? pause() : void play();
    } else if (e.key === 'a' || e.key === 'A') flip('A');
    else if (e.key === 'b' || e.key === 'B') flip('B');
    else if (e.key === 'ArrowRight') seek(time + 5);
    else if (e.key === 'ArrowLeft') seek(time - 5);
  };

  const onEnded = () => setPlaying(false);
  const pointerSeek = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * duration);
  };

  const ready = !!a.url;
  const meterStyle = useMemo(() => ({ '--level': level.toFixed(3) }) as React.CSSProperties, [level]);

  return (
    <div className="deck" onKeyDown={onKey} data-side={side}>
      <audio ref={audioA} src={a.url ?? undefined} preload="auto" onEnded={onEnded} />
      <audio ref={audioB} src={b.url ?? undefined} preload="auto" onEnded={onEnded} />

      <div className="deck__bar" aria-hidden="true">
        <span className="deck__title">A/B check</span>
        <span className="deck__vs">
          {labelA} <i>vs</i> {labelB}
        </span>
      </div>
      <div className="deck__lanes">
        <button
          type="button"
          className="deck__lane deck__lane--a"
          aria-pressed={side === 'A'}
          onClick={() => flip('A')}
          disabled={!ready}
        >
          <span className="deck__key" aria-hidden="true">A</span>
          <span className="deck__side" aria-hidden="true">Before</span>
          <span className="deck__name">{labelA}</span>
          <span className="deck__meter" style={side === 'A' ? meterStyle : undefined} aria-hidden="true" />
        </button>
        <div
          className="deck__wave"
          onPointerDown={duration ? pointerSeek : undefined}
          role="slider"
          tabIndex={ready ? 0 : -1}
          aria-label="Position in recording"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
        >
          <canvas ref={canvas} className="deck__canvas" aria-hidden="true" />
          {!hasB && <div className="deck__placeholder">{dubPlaceholder ?? 'Your dub lands here.'}</div>}
          {(a.error || b.error) && <p className="deck__waverr">{a.error || b.error}</p>}
        </div>
        <button
          type="button"
          className="deck__lane deck__lane--b"
          aria-pressed={side === 'B'}
          onClick={() => flip('B')}
          disabled={!hasB}
        >
          <span className="deck__key" aria-hidden="true">B</span>
          <span className="deck__side" aria-hidden="true">After</span>
          <span className="deck__name">{labelB}</span>
          <span className="deck__meter" style={side === 'B' ? meterStyle : undefined} aria-hidden="true" />
        </button>
      </div>

      <div className="deck__transport">
        <button
          type="button"
          className="key key--play"
          onClick={() => (playing ? pause() : void play())}
          disabled={!ready}
          aria-label={playing ? 'Pause' : `Play ${side === 'A' ? labelA : labelB}`}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="deck__flip" role="group" aria-label="Choose which take you hear">
          <button type="button" className="flip" aria-pressed={side === 'A'} onClick={() => flip('A')} disabled={!ready}>
            A
          </button>
          <button type="button" className="flip flip--b" aria-pressed={side === 'B'} onClick={() => flip('B')} disabled={!hasB}>
            B
          </button>
        </div>
        <span className="deck__time" aria-hidden="true">
          {formatTime(time)} <span>/ {formatTime(duration)}</span>
        </span>
        <span className="deck__hint">Space to play. A and B to flip.</span>
      </div>
      {dubNote && hasB && <p className="deck__note">{dubNote}</p>}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M6 4.5h4.5v15H6zM13.5 4.5H18v15h-4.5z" fill="currentColor" />
    </svg>
  );
}
