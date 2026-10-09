import fs from 'node:fs/promises';
import path from 'node:path';
import { accentOption } from '../../shared/accents.ts';
import type { AccentOption } from '../../shared/types.ts';
import { EngineError, type Engine, type EngineDescription, type SegmentRequest } from './types.ts';

/** Shape returned by GET {url}/v1/capabilities. See docs/ENGINE_CONTRACT.md. */
interface RemoteCaps {
  name?: string;
  /** Set false for test servers that don't really convert; the UI then shows test mode. */
  changesAccent?: boolean;
  preservesSpeaker?: boolean;
  supportsStrength?: boolean;
  maxSegmentSec?: number;
  external?: boolean;
  providerNote?: string;
  accents: Array<{ id: string; note?: string; previewUrl?: string }>;
}

/**
 * The production path: any accent-conversion model server that implements the small HTTP
 * contract in docs/ENGINE_CONTRACT.md (a self-hosted model on a GPU, or an adapter in front of a vendor).
 */
export class RemoteEngine implements Engine {
  readonly id = 'remote';
  private caps: RemoteCaps | null = null;
  private capsAt = 0;
  private lastError: string | null = null;

  constructor(
    private url: string,
    private key: string,
    private timeoutSec: number,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  get maxSegmentSec() {
    const v = Number(this.caps?.maxSegmentSec);
    return Number.isFinite(v) && v >= 5 ? v : 30;
  }

  private headers(extra: Record<string, string> = {}) {
    return { ...(this.key ? { authorization: `Bearer ${this.key}` } : {}), ...extra };
  }

  async refresh(force = false): Promise<RemoteCaps | null> {
    if (!this.url) {
      this.lastError = 'REMOTE_ENGINE_URL is not set.';
      return null;
    }
    if (!force && this.caps && Date.now() - this.capsAt < 60_000) return this.caps;
    try {
      const res = await this.fetchImpl(`${this.url}/v1/capabilities`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`capabilities returned ${res.status}`);
      const body = (await res.json()) as RemoteCaps;
      if (!Array.isArray(body.accents)) throw new Error('capabilities missing accents');
      this.caps = body;
      this.capsAt = Date.now();
      this.lastError = null;
    } catch (err) {
      this.lastError = `Accent engine unreachable (${(err as Error).message}).`;
      // keep stale caps if we had them
    }
    return this.caps;
  }

  describe(): EngineDescription {
    const c = this.caps;
    const converts = c?.changesAccent !== false;
    return {
      id: this.id,
      name: c?.name || 'Accent engine',
      kind: converts ? 'accent-conversion' : 'dev-passthrough',
      changesAccent: converts,
      preservesSpeaker: c?.preservesSpeaker ?? true,
      external: c?.external ?? false,
      providerNote:
        c?.providerNote ||
        'Audio is sent to the Dub Club accent engine for conversion, then returned here. The engine does not keep it.',
      supportsStrength: !!c?.supportsStrength,
      ready: !!c && !this.lastError,
      readyNote: this.lastError ?? undefined,
    };
  }

  async accents(): Promise<AccentOption[]> {
    const c = await this.refresh();
    return (c?.accents ?? []).map((a) => accentOption(a.id, { note: a.note, previewUrl: a.previewUrl }));
  }

  configSummary() {
    let host = '';
    try {
      host = new URL(this.url).host;
    } catch {
      /* not configured */
    }
    return { endpointHost: host, model: this.caps?.name ?? 'unknown' };
  }

  async transformSegment(req: SegmentRequest): Promise<string> {
    const body = await fs.readFile(req.inputWav);
    const qs = new URLSearchParams({ accent: req.accent });
    if (req.strength !== null && this.caps?.supportsStrength) qs.set('strength', String(req.strength));
    const timeout = AbortSignal.timeout(this.timeoutSec * 1000);
    const signal = AbortSignal.any([req.signal, timeout]);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.url}/v1/convert?${qs}`, {
        method: 'POST',
        headers: this.headers({ 'content-type': 'audio/wav' }),
        body,
        signal,
      });
    } catch (err) {
      if (req.signal.aborted) throw new EngineError('cancelled', 'Cancelled', false);
      if (timeout.aborted) throw new EngineError('engine_timeout', 'The accent engine took too long on part of this recording.');
      throw new EngineError('engine_unreachable', 'We couldn’t reach the accent engine.');
    }
    if (!res.ok) {
      let msg = `The accent engine returned an error (${res.status}).`;
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        if (j?.error?.message) msg = `Accent engine: ${String(j.error.message).slice(0, 200)}`;
      } catch {
        /* non-JSON error */
      }
      throw new EngineError('engine_error', msg, res.status >= 500 || res.status === 429);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) throw new EngineError('engine_empty', 'The accent engine returned an empty result.');
    const out = path.join(req.outDir, 'remote.out');
    await fs.writeFile(out, buf);
    return out;
  }
}
