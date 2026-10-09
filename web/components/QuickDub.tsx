import { useEffect, useId, useRef, useState } from 'react';
import { formatTime } from '../lib/audio.ts';
import { LIMITS, saveBlob, useLocalDub } from '../engine/client.ts';
import { ENGINE_ACCENTS, type EngineAccent } from '../engine/protocol.ts';

/** Size of the open models fetched on first use (Whisper base + Kokoro, quantised). Measured in CI. */
const MODEL_MB = 170;

/**
 * The whole product on one card: record → pick an accent → dub → listen → download.
 * Everything runs in the visitor's browser with open-source models; the recording is never uploaded.
 */
export function QuickDub() {
  const dub = useLocalDub();
  const { state } = dub;
  const [accent, setAccent] = useState<EngineAccent>('en-GB');
  const [voice, setVoice] = useState<'auto' | 'male' | 'female'>('auto');
  const [consent, setConsent] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const consentId = useId();

  const accentOpt = ENGINE_ACCENTS.find((a) => a.id === (state.result?.accent ?? accent))!;
  const take = state.take;
  const working = state.phase === 'dubbing' || state.phase === 'reading';
  const canDub = !!take && consent && state.phase === 'ready';
  const go = () => dub.start(accent, voice === 'auto' ? undefined : voice);

  const pick = (b: Blob, name: string, fromMic: boolean) => void dub.setTake(b, name, fromMic);
  const doDownload = () => {
    if (!state.result) return;
    const base = take && !take.fromMic ? take.name.replace(/\.[^.]+$/, '') : 'dubclub';
    saveBlob(state.result.wav, `${base} (${accentOpt.label}).wav`);
  };

  return (
    <div className="qd">
      {/* ① Record */}
      {state.phase !== 'done' && (
        <div className="qd__section">
          <p className="qd__label">
            <span className="qd__n">1</span> Record yourself
          </p>
          {!take && state.phase !== 'reading' ? (
            <>
              <Recorder disabled={working} onStart={dub.warm} onDone={(b) => pick(b, 'Your recording', true)} />
              <p className="qd__muted qd__alt">
                Already have a recording?{' '}
                <button type="button" className="qd__link" onClick={() => fileInput.current?.click()}>
                  Upload a file
                </button>
              </p>
              <input
                ref={fileInput}
                type="file"
                accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.webm,.mp4,.mov,.m4v"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    dub.warm();
                    pick(f, f.name, false);
                  }
                  e.target.value = '';
                }}
              />
            </>
          ) : state.phase === 'reading' ? (
            <div className="qd__take">
              <span className="qd__spinner" aria-hidden="true" />
              <span className="qd__muted" role="status">
                Reading your recording…
              </span>
            </div>
          ) : (
            <div className="qd__take">
              <MiniPlay blob={take!.blob} label="Play your take" />
              <span className="qd__takeinfo">
                <span className="qd__takename">{take!.name}</span>
                <span className="qd__muted">{formatTime(take!.durationSec)}</span>
              </span>
              <button type="button" className="btn btn--ghost" onClick={dub.clear} disabled={working}>
                Re-record
              </button>
            </div>
          )}
          {state.error && (state.phase === 'empty' || state.phase === 'ready') && (
            <p className="notice notice--error" role="alert">
              {state.error}
            </p>
          )}
        </div>
      )}

      {/* ② Accent */}
      {state.phase !== 'done' && (
        <div className="qd__section">
          <p className="qd__label">
            <span className="qd__n">2</span> Pick an accent
          </p>
          <div className="qd__accents" role="radiogroup" aria-label="Accent">
            {ENGINE_ACCENTS.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={accent === a.id} className="qd__accent" disabled={working} onClick={() => setAccent(a.id)}>
                <span className="qd__code" aria-hidden="true">
                  {a.code}
                </span>
                {a.label}
              </button>
            ))}
          </div>
          <div className="qd__voice" role="radiogroup" aria-label="Voice">
            <span className="qd__muted">Voice</span>
            {(
              [
                ['auto', 'Match my pitch'],
                ['male', 'Lower'],
                ['female', 'Higher'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={voice === id} className="qd__vopt" disabled={working} onClick={() => setVoice(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ③ Dub */}
      {state.phase !== 'done' && (
        <div className="qd__section qd__go">
          {state.phase === 'dubbing' ? (
            <Progress state={state} label={accentOpt.label} onCancel={dub.cancel} />
          ) : state.phase === 'failed' ? (
            <div className="notice notice--error" role="alert">
              <p>{state.error ?? 'That didn’t work.'}</p>
              <div className="row">
                <button type="button" className="btn btn--ink" onClick={go}>
                  Try again
                </button>
                <button type="button" className="btn btn--ghost" onClick={dub.another}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="check" htmlFor={consentId}>
                <input id={consentId} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>This is my voice, or I have permission to use it.</span>
              </label>
              <button type="button" className="btn btn--accent btn--big qd__cta" disabled={!canDub} onClick={go}>
                {`Dub it ${accentOpt.label}`}
              </button>
              <p className="qd__muted qd__fine">
                Runs on your device — your recording is never uploaded. The first dub downloads the open-source voice models once (about {MODEL_MB} MB).
              </p>
            </>
          )}
        </div>
      )}

      {/* Result */}
      {state.phase === 'done' && state.result && take && (
        <div className="qd__result">
          <p className="qd__title">Your {accentOpt.label} version is ready.</p>
          <Compare original={take.blob} dub={state.result.wav} dubLabel={accentOpt.label} />
          <p className="qd__heard">
            <span className="qd__muted">Heard:</span> “{state.result.text}”
          </p>
          <div className="qd__actions">
            <button type="button" className="btn btn--accent btn--big" onClick={doDownload}>
              <svg className="btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" />
              </svg>
              Download WAV
            </button>
            <button type="button" className="btn btn--big" onClick={dub.another}>
              Try another accent
            </button>
            <button type="button" className="btn btn--ghost" onClick={dub.clear}>
              Record a new take
            </button>
          </div>
          <p className="qd__muted qd__fine">
            Your words and timing, re-spoken by “{state.result.voice}”, an open-source {accentOpt.label} voice — not a clone of yours. Made on your device; nothing was
            uploaded.
          </p>
        </div>
      )}
    </div>
  );
}

function Progress({ state, label, onCancel }: { state: ReturnType<typeof useLocalDub>['state']; label: string; onCancel: () => void }) {
  const dl = state.download;
  const mb = (n: number) => Math.round(n / 1e6);
  let text: string;
  let frac: number | null = null;
  if (state.stage === 'loading') {
    if (dl && !dl.done && dl.total > 0) {
      text = `Downloading the voice models — ${mb(dl.loaded)} of ${mb(dl.total)} MB. First time only.`;
      frac = dl.loaded / dl.total;
    } else text = 'Warming up the engine…';
  } else if (state.stage === 'listening') text = 'Listening to your take…';
  else if (state.stage === 'speaking') {
    const sp = state.speaking;
    text = `Re-speaking it in ${label}${sp && sp.count > 1 ? ` — phrase ${Math.min(sp.done + 1, sp.count)} of ${sp.count}` : ''}…`;
    if (sp && sp.count > 1) frac = sp.done / sp.count;
  } else text = 'Putting it together…';
  return (
    <div className="qd__progress" aria-busy="true">
      <div className="qd__progtop">
        <span className="qd__spinner" aria-hidden="true" />
        <p role="status" aria-live="polite">
          {text}
        </p>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {frac !== null && (
        <div className="meter" aria-hidden="true">
          <span style={{ width: `${Math.max(4, Math.round(frac * 100))}%` }} />
        </div>
      )}
      {state.heard && (
        <p className="qd__heard">
          <span className="qd__muted">Heard:</span> “{state.heard}”
        </p>
      )}
    </div>
  );
}

/* ─── Recorder: one big button ─── */
function Recorder({ onDone, onStart, disabled }: { onDone: (b: Blob) => void; onStart?: () => void; disabled?: boolean }) {
  const MAX = LIMITS.maxSec;
  const [live, setLive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const mr = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const chunks = useRef<Blob[]>([]);
  const t0 = useRef(0);

  const cleanup = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
    setLive(false);
    setLevel(0);
  };
  useEffect(() => cleanup, []);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      const s = (Date.now() - t0.current) / 1000;
      setElapsed(s);
      if (s >= MAX) stop();
    }, 200);
    return () => clearInterval(t);
  }, [live]);

  const start = async () => {
    setErr(null);
    onStart?.();
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErr('This browser can’t record audio. Try Chrome or Safari, or upload a file.');
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      stream.current = s;
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        const mime = r.mimeType || type || 'audio/webm';
        const blob = new Blob(chunks.current, { type: mime });
        cleanup();
        if (blob.size > 0) onDone(blob);
      };
      mr.current = r;
      r.start(250);
      ctx.current = new AudioContext();
      const an = ctx.current.createAnalyser();
      an.fftSize = 512;
      ctx.current.createMediaStreamSource(s).connect(an);
      const buf = new Float32Array(512);
      const tick = () => {
        if (!ctx.current) return;
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
        requestAnimationFrame(tick);
      };
      tick();
      t0.current = Date.now();
      setElapsed(0);
      setLive(true);
    } catch {
      cleanup();
      setErr('We couldn’t use your microphone. Allow mic access in your browser and try again.');
    }
  };

  const stop = () => {
    if (mr.current && mr.current.state !== 'inactive') mr.current.stop();
  };

  return (
    <div className="rec">
      <button
        type="button"
        className={`rec__btn ${live ? 'is-live' : ''}`}
        onClick={live ? stop : () => void start()}
        disabled={disabled}
        aria-label={live ? 'Stop recording' : 'Start recording'}
        style={{ '--level': level.toFixed(3) } as React.CSSProperties}
      >
        {live ? (
          <span className="rec__stop" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        )}
      </button>
      <div className="rec__text">
        <p className="qd__title">{live ? 'Recording…' : 'Tap to record'}</p>
        <p className="qd__muted" aria-live="polite">
          {live ? `${formatTime(elapsed)} / ${formatTime(MAX)} · tap to stop` : 'Say a sentence or two. Up to a minute.'}
        </p>
      </div>
      {err && (
        <p className="notice notice--error rec__err" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

/* ─── Small play button for a blob ─── */
function MiniPlay({ blob, label }: { blob: Blob | null; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const a = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <>
      <audio ref={a} src={url ?? undefined} onEnded={() => setOn(false)} onPause={() => setOn(false)} onPlay={() => setOn(true)} />
      <button type="button" className="qd__play" disabled={!url} aria-label={on ? 'Pause' : label} onClick={() => (on ? a.current?.pause() : void a.current?.play())}>
        <PlayIcon on={on} />
      </button>
    </>
  );
}

function PlayIcon({ on }: { on: boolean }) {
  return on ? (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

/* ─── Before / after: one play button, flip sides at the same moment ─── */
function Compare({ original, dub, dubLabel }: { original: Blob | null; dub: Blob | null; dubLabel: string }) {
  const [side, setSide] = useState<'a' | 'b'>('b');
  const [on, setOn] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const A = useRef<HTMLAudioElement>(null);
  const B = useRef<HTMLAudioElement>(null);
  const [urls, setUrls] = useState<{ a?: string; b?: string }>({});
  useEffect(() => {
    const a = original ? URL.createObjectURL(original) : undefined;
    const b = dub ? URL.createObjectURL(dub) : undefined;
    setUrls({ a, b });
    return () => {
      if (a) URL.revokeObjectURL(a);
      if (b) URL.revokeObjectURL(b);
    };
  }, [original, dub]);
  const el = (s: 'a' | 'b') => (s === 'a' ? A.current : B.current);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const m = el(side);
      if (m) {
        setT(m.currentTime);
        if (m.duration && Number.isFinite(m.duration)) setDur(m.duration);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [side]);
  const toggle = () => {
    const m = el(side);
    if (!m) return;
    if (on) m.pause();
    else void m.play();
  };
  const flip = (to: 'a' | 'b') => {
    if (to === side) return;
    const from = el(side);
    const next = el(to);
    if (!next) return;
    const wasOn = on;
    const time = from?.currentTime ?? 0;
    from?.pause();
    next.currentTime = Math.min(time, Math.max(0, (next.duration || time) - 0.05));
    setSide(to);
    if (wasOn) void next.play();
  };
  const pct = dur ? (t / dur) * 100 : 0;
  return (
    <div className="cmp">
      <audio ref={A} src={urls.a} onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => setOn(false)} />
      <audio ref={B} src={urls.b} onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => setOn(false)} />
      <button type="button" className="cmp__play" onClick={toggle} aria-label={on ? 'Pause' : `Play ${side === 'a' ? 'original' : dubLabel}`}>
        <PlayIcon on={on} />
      </button>
      <div className="cmp__mid">
        <div className="cmp__seg" role="group" aria-label="Which version you hear">
          <button type="button" aria-pressed={side === 'a'} onClick={() => flip('a')}>
            Original
          </button>
          <button type="button" aria-pressed={side === 'b'} onClick={() => flip('b')}>
            {dubLabel}
          </button>
        </div>
        <div className="cmp__bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="cmp__time">{formatTime(t)}</span>
    </div>
  );
}

