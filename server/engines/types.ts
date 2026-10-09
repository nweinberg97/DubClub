import type { AccentOption, Capabilities } from '../../shared/types.ts';

export type EngineDescription = Capabilities['engine'];

export interface SegmentRequest {
  /** Mono 16-bit PCM WAV at the working rate. */
  inputWav: string;
  /** Directory the engine may write into. Return the path of the file it produced (any audio format). */
  outDir: string;
  accent: string;
  strength: number | null;
  signal: AbortSignal;
}

export class EngineError extends Error {
  constructor(public code: string, message: string, public retryable = true) {
    super(message);
  }
}

/**
 * The one interface every transformation engine implements.
 * Add a model or provider by writing a new file in this folder and registering it in registry.ts.
 * Nothing in the UI, jobs, or export code needs to change.
 */
export interface Engine {
  readonly id: string;
  /** Plain-language self-description. Must be honest — the UI renders it verbatim. */
  describe(): EngineDescription;
  /** Accents this engine can genuinely target right now. */
  accents(): Promise<AccentOption[]>;
  /** Longest segment the engine accepts, in seconds. Jobs are split at silences to fit. */
  readonly maxSegmentSec: number;
  /** Non-secret config recorded with every job (model id, voice id, endpoint host...). */
  configSummary(accent: string): Record<string, string | number | boolean>;
  /** Transform one segment. Must respect `signal`. Returns the produced file path. */
  transformSegment(req: SegmentRequest): Promise<string>;
}
