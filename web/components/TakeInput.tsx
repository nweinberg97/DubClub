import { useEffect, useRef, useState } from 'react';
import type { Capabilities } from '../../shared/types.ts';
import { formatTime } from '../lib/audio.ts';

interface Props {
  limits: Capabilities['limits'] | null;
  onTake: (file: Blob, name: string) => void;
  disabled?: boolean;
  /** Max mic recording length in seconds. */
  maxRecordSec?: number;
  compact?: boolean;
}

/** Drop a file, pick one, or record a take with the mic. */
export function TakeInput({ limits, onTake, disabled, maxRecordSec = 60, compact }: Props) {
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const accept = (limits?.acceptedExtensions ?? ['mp3', 'wav', 'm4a', 'mp4', 'mov', 'webm']).map((e) => '.' + e).join(',');

  const take = (file: File) => {
    setProblem(null);
    const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
    if (limits && !limits.acceptedExtensions.includes(ext)) {
      setProblem(`.${ext || '?'} files aren’t supported. Try ${limits.acceptedExtensions.slice(0, 6).join(', ')}…`);
      return;
    }
    if (limits && file.size > limits.maxUploadMb * 1024 * 1024) {
      setProblem(`That file is over the ${limits.maxUploadMb} MB limit.`);
      return;
    }
    onTake(file, file.name);
  };

  return (
    <div className={`take-in ${compact ? 'take-in--compact' : ''}`}>
      <div
        className={`drop ${over ? 'is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !disabled) take(f);
        }}
      >
        <p className="drop__title">{over ? 'Let go.' : 'Drop a recording here'}</p>
        <p className="drop__sub">
          Audio or video with someone talking.{' '}
          {limits && (
            <>
              Up to {Math.round(limits.maxDurationSec / 60)} minutes and {limits.maxUploadMb} MB.
            </>
          )}
        </p>
        <div className="drop__actions">
          <button type="button" className="btn btn--ink" onClick={() => input.current?.click()} disabled={disabled}>
            Choose a file
          </button>
          <Recorder maxSec={maxRecordSec} disabled={disabled} onDone={(blob, name) => onTake(blob, name)} onError={setProblem} />
        </div>
        <input
          ref={input}
          type="file"
          accept={accept}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) take(f);
            e.target.value = '';
          }}
        />
      </div>
      {problem && (
        <p className="notice notice--error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

function Recorder({
  maxSec,
  disabled,
  onDone,
  onError,
}: {
  maxSec: number;
  disabled?: boolean;
  onDone: (b: Blob, name: string) => void;
  onError: (m: string) => void;
}) {
  const [rec, setRec] = useState<{ started: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const mr = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const ctx = useRef<AudioContext | null>(null);

  const cleanup = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
    setRec(null);
    setLevel(0);
  };
  useEffect(() => cleanup, []);

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => {
      const s = (Date.now() - rec.started) / 1000;
      setElapsed(s);
      if (s >= maxSec) stop();
    }, 200);
    return () => clearInterval(t);
  }, [rec, maxSec]);

  const start = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onError('This browser can’t record audio. Upload a file instead.');
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
        const ext = mime.includes('mp4') ? 'm4a' : 'webm';
        cleanup();
        const stamp = new Date().toTimeString().slice(0, 5).replace(':', '');
        if (blob.size > 0) onDone(blob, `mic-take-${stamp}.${ext}`);
      };
      mr.current = r;
      r.start(250);
      // Live input meter: confirms the mic is actually hearing you.
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
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5));
        requestAnimationFrame(tick);
      };
      tick();
      setElapsed(0);
      setRec({ started: Date.now() });
    } catch {
      cleanup();
      onError('We couldn’t use your microphone. Check the browser’s permission and try again, or upload a file.');
    }
  };

  const stop = () => {
    if (mr.current && mr.current.state !== 'inactive') mr.current.stop();
  };

  if (rec) {
    return (
      <button type="button" className="btn btn--rec is-live" onClick={stop} style={{ '--level': level.toFixed(3) } as React.CSSProperties}>
        <span className="rec-dot" aria-hidden="true" />
        Stop recording <span className="btn__meta">{formatTime(elapsed)} / {formatTime(maxSec)}</span>
      </button>
    );
  }
  return (
    <button type="button" className="btn btn--rec" onClick={start} disabled={disabled}>
      <span className="rec-dot" aria-hidden="true" />
      Record a take
    </button>
  );
}
