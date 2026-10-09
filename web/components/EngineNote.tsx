import type { Capabilities } from '../../shared/types.ts';

/** Always-visible, plain statement of what the running engine really does. */
export function EngineNote({ caps }: { caps: Capabilities | null }) {
  if (!caps) return null;
  const e = caps.engine;
  if (e.kind === 'dev-passthrough') {
    return (
      <div className="engine-note engine-note--dev" role="note">
        <strong>Test mode.</strong> This studio is running the development engine. Your take goes through the whole
        pipeline, but Take B comes back in your own accent. No accent model is connected yet.
      </div>
    );
  }
  if (e.kind === 'voice-swap') {
    return (
      <div className="engine-note engine-note--swap" role="note">
        <strong>Voice swap.</strong> This engine keeps your timing and delivery but re-voices it as a different speaker
        with the accent you pick. You won’t sound like you. {e.external && 'Audio is processed by an outside provider.'}
      </div>
    );
  }
  if (!e.ready) {
    return (
      <div className="engine-note engine-note--down" role="note">
        <strong>The accent engine is offline.</strong> You can still upload and listen back; dubbing will work once it’s
        back.
      </div>
    );
  }
  return null;
}
