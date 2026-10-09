import { useEffect, useId, useState } from 'react';
import type { Capabilities } from '../../shared/types.ts';
import { download } from '../lib/api.ts';
import { formatBytes, formatTime } from '../lib/audio.ts';
import { useDub } from '../lib/hooks.ts';
import { ABPlayer } from './ABPlayer.tsx';
import { DubStatus } from './DubStatus.tsx';
import { EngineNote } from './EngineNote.tsx';
import { StampPicker } from './Stamps.tsx';
import { TakeInput } from './TakeInput.tsx';

interface Props {
  caps: Capabilities | null;
  capsError?: string | null;
  dub: ReturnType<typeof useDub>;
  initialAccent?: string | null;
  compact?: boolean;
}

/** The whole flow on one surface: take → postcode → dub → A/B → take it away. */
export function DubDesk({ caps, capsError, dub, initialAccent, compact }: Props) {
  const { state } = dub;
  const [accent, setAccent] = useState<string | null>(initialAccent ?? null);
  const [strength, setStrength] = useState(0.7);
  const [consent, setConsent] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const consentId = useId();
  const strengthId = useId();

  useEffect(() => {
    if (initialAccent) setAccent(initialAccent);
  }, [initialAccent]);
  useEffect(() => {
    if (caps && (!accent || !caps.accents.some((a) => a.id === accent))) setAccent(caps.accents[0]?.id ?? null);
  }, [caps]); // eslint-disable-line react-hooks/exhaustive-deps

  const engine = caps?.engine;
  const accentOpt = caps?.accents.find((a) => a.id === (state.job?.accent ?? accent));
  const busy = state.phase === 'uploading' || state.phase === 'dubbing';
  const canDub = !!state.upload && !!accent && consent && !!engine?.ready && state.phase === 'ready';

  const doExport = async (format: string) => {
    if (!state.job) return;
    setExportError(null);
    setExporting(format);
    try {
      await download(`/api/jobs/${state.job.id}/export?format=${format}`, `dub.${format === 'video' ? 'mp4' : format}`);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const dubLabel = accentOpt ? `${accentOpt.label} dub` : 'Dub';
  const dubNote =
    engine?.kind === 'dev-passthrough'
      ? 'Test mode: Take B is your original, level-matched. No accent change.'
      : engine?.kind === 'voice-swap'
        ? 'Voice swap: delivery kept, speaker replaced.'
        : undefined;

  return (
    <div className={`desk ${compact ? 'desk--compact' : ''}`}>
      <EngineNote caps={caps} />
      {capsError && (
        <p className="notice notice--error" role="alert">
          {capsError} Refresh to try again.
        </p>
      )}

      {/* 1 — The take */}
      <section className="desk__step" aria-labelledby="step-take">
        <h3 id="step-take" className="desk__h">
          <span className="desk__n">1</span> Your take
        </h3>
        {!state.upload && state.phase !== 'uploading' && (
          <TakeInput limits={caps?.limits ?? null} onTake={(f, n) => void dub.sendFile(f, n)} compact={compact} />
        )}
        {state.phase === 'uploading' && (
          <div className="filecard">
            <p className="filecard__name">Uploading…</p>
            <div className="meter" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.uploadProgress * 100)}>
              <span style={{ width: `${Math.max(2, state.uploadProgress * 100)}%` }} />
            </div>
            <p className="filecard__meta">
              {state.uploadProgress >= 1 ? 'Checking it’s a recording we can work with…' : `${Math.round(state.uploadProgress * 100)}% sent`}
            </p>
            <button type="button" className="btn btn--ghost" onClick={dub.cancelUpload}>
              Cancel upload
            </button>
          </div>
        )}
        {state.upload && (
          <div className="filecard">
            <p className="filecard__name" title={state.upload.name}>
              {state.upload.name}
            </p>
            <p className="filecard__meta">
              <span>{state.upload.kind === 'video' ? 'Video' : 'Audio'}</span>
              <span>{formatTime(state.upload.durationSec)}</span>
              <span>{formatBytes(state.upload.sizeBytes)}</span>
            </p>
            {state.upload.warnings.map((w) => (
              <p key={w} className="notice notice--warn">
                {w}
              </p>
            ))}
            <div className="filecard__actions">
              <button type="button" className="btn btn--ghost" onClick={() => void dub.remove()} disabled={state.phase === 'dubbing'}>
                Delete this take
              </button>
            </div>
          </div>
        )}
        {state.error && state.phase === 'empty' && (
          <p className="notice notice--error" role="alert">
            {state.error}
          </p>
        )}
      </section>

      {/* 2 — Pick a postcode */}
      <section className="desk__step" aria-labelledby="step-accent">
        <h3 id="step-accent" className="desk__h">
          <span className="desk__n">2</span> Pick a postcode
        </h3>
        {caps && caps.accents.length > 0 ? (
          <StampPicker accents={caps.accents} value={accent} onChange={setAccent} disabled={busy} size={compact ? 'sm' : 'lg'} />
        ) : caps ? (
          <p className="notice">No accents are available on this engine right now.</p>
        ) : (
          <p className="desk__muted">Loading accents…</p>
        )}
        {accentOpt?.note && <p className="desk__muted">{accentOpt.note}</p>}
        {engine?.supportsStrength && (
          <div className="field">
            <label htmlFor={strengthId}>
              How far to travel <output>{Math.round(strength * 100)}%</output>
            </label>
            <input id={strengthId} type="range" min={0.2} max={1} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} disabled={busy} />
            <p className="desk__muted">Lower keeps more of your own pronunciation. Higher commits to the new accent.</p>
          </div>
        )}
      </section>

      {/* 3 — Dub it */}
      <section className="desk__step" aria-labelledby="step-dub">
        <h3 id="step-dub" className="desk__h">
          <span className="desk__n">3</span> Dub it
        </h3>
        {(state.phase === 'ready' || state.phase === 'empty' || state.phase === 'uploading') && (
          <>
            <label className="check" htmlFor={consentId}>
              <input id={consentId} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>It’s my voice, or I have permission to transform this recording.</span>
            </label>
            <button
              type="button"
              className="btn btn--dub btn--big"
              disabled={!canDub}
              onClick={() => accent && void dub.startDub(accent, consent, engine?.supportsStrength ? strength : undefined)}
            >
              {accentOpt ? `Dub it ${accentOpt.label}` : 'Dub it'}
            </button>
            {!state.upload && <p className="desk__muted">Add a take first.</p>}
            {state.upload && !consent && <p className="desk__muted">Tick the box to continue.</p>}
            {state.error && state.phase === 'ready' && (
              <p className="notice notice--error" role="alert">
                {state.error}
              </p>
            )}
          </>
        )}
        {state.phase === 'dubbing' && <DubStatus job={state.job} onCancel={() => void dub.cancelDub()} />}
        {state.phase === 'failed' && (
          <div className="notice notice--error" role="alert">
            <p>{state.error ?? 'That dub didn’t work.'} Your original is safe.</p>
            <div className="row">
              <button type="button" className="btn btn--ink" onClick={() => void dub.retryDub()}>
                Try again
              </button>
              <button type="button" className="btn btn--ghost" onClick={dub.another}>
                Change settings
              </button>
            </div>
          </div>
        )}
        {state.phase === 'cancelled' && (
          <div className="notice" role="status">
            <p>Cancelled. Nothing was kept from that run.</p>
            <button type="button" className="btn btn--ink" onClick={dub.another}>
              Back to settings
            </button>
          </div>
        )}
        {state.phase === 'done' && (
          <p className="desk__done" role="status">
            Done. Flip between A and B below.
          </p>
        )}
      </section>

      {/* 4 — Listen */}
      <section className="desk__step desk__step--wide" aria-labelledby="step-listen">
        <h3 id="step-listen" className="desk__h">
          <span className="desk__n">4</span> Hear the difference
        </h3>
        <ABPlayer
          original={state.original}
          dub={state.dub}
          labelA="Original"
          labelB={dubLabel}
          dubNote={dubNote}
          dubPlaceholder={state.phase === 'dubbing' ? 'Dubbing… this lane fills when it’s done.' : state.original ? 'Your dub lands here.' : 'Add a take to start.'}
        />
      </section>

      {/* 5 — Take it away */}
      {state.phase === 'done' && state.job && (
        <section className="desk__step desk__step--wide" aria-labelledby="step-export">
          <h3 id="step-export" className="desk__h">
            <span className="desk__n">5</span> Take it away
          </h3>
          <div className="exports">
            {caps?.exports.audio.map((f) => (
              <button key={f} type="button" className="btn btn--ink" onClick={() => void doExport(f)} disabled={!!exporting}>
                {exporting === f ? 'Preparing…' : `Download ${f.toUpperCase()}`}
              </button>
            ))}
            {state.upload?.hasVideo && caps?.exports.video && (
              <button type="button" className="btn btn--dub" onClick={() => void doExport('video')} disabled={!!exporting}>
                {exporting === 'video' ? 'Rebuilding the video…' : 'Download video with new audio'}
              </button>
            )}
          </div>
          {exportError && (
            <p className="notice notice--error" role="alert">
              {exportError}
            </p>
          )}
          <div className="row">
            <button type="button" className="btn btn--ghost" onClick={dub.another}>
              Try another accent
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => void dub.remove()}>
              Delete and start over
            </button>
          </div>
          {caps && (
            <p className="desk__muted">
              Files are deleted automatically after {caps.limits.retentionMinutes} minutes without activity.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
