import fs from 'node:fs/promises';
import path from 'node:path';
import { accentOption } from '../../shared/accents.ts';
import type { Engine, SegmentRequest } from './types.ts';

/**
 * DEV ENGINE. Runs every real stage of the pipeline but returns the input audio unchanged
 * (the pipeline then level-matches it). It does NOT change accent and says so everywhere.
 * Exists so the product can be built and tested end to end without a GPU or API keys.
 */
export class PassthroughEngine implements Engine {
  readonly id = 'passthrough';
  readonly maxSegmentSec = 20; // small segments so progress is visible on short test clips

  describe() {
    return {
      id: this.id,
      name: 'Dev monitor',
      kind: 'dev-passthrough' as const,
      changesAccent: false,
      preservesSpeaker: true,
      external: false,
      providerNote: 'Processed on this server only. Nothing is sent to a third party.',
      supportsStrength: false,
      ready: true,
      readyNote: 'Development engine: your audio goes through the full pipeline but the accent is not changed.',
    };
  }

  async accents() {
    // Shown so the full flow can be exercised; each one is clearly marked as a no-op.
    const note = 'Dev engine — pipeline test only, accent unchanged';
    return ['en-GB', 'en-AU', 'en-US'].map((id) => accentOption(id, { note }));
  }

  configSummary() {
    return { mode: 'passthrough' };
  }

  async transformSegment(req: SegmentRequest) {
    if (req.signal.aborted) throw new Error('aborted');
    const out = path.join(req.outDir, 'out.wav');
    await fs.copyFile(req.inputWav, out);
    return out;
  }
}
