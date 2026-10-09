// Types shared by the server and the web app. Keep this file dependency-free.

/** What kind of transformation an engine actually performs. Drives honest UI copy. */
export type EngineKind =
  /** Changes accent, aims to keep the speaker. The product promise. */
  | 'accent-conversion'
  /** Replaces the speaker with a target voice that has the accent. Not identity-preserving. */
  | 'voice-swap'
  /** Dev engine: runs the pipeline, does not change the accent. */
  | 'dev-passthrough';

export interface AccentOption {
  id: string; // BCP-47-ish, e.g. "en-GB"
  label: string; // "British"
  place: string; // "London, UK" — what the stamp says
  stampCode: string; // "GB"
  note?: string; // engine-specific caveat
  previewUrl?: string; // genuine preview sample, if the engine provides one
}

export interface Capabilities {
  brand: string;
  engine: {
    id: string;
    name: string;
    kind: EngineKind;
    changesAccent: boolean;
    preservesSpeaker: boolean;
    external: boolean; // audio leaves this server for a third party
    providerNote: string; // plain-language note about where audio goes
    supportsStrength: boolean;
    ready: boolean; // configured and reachable as far as we know
    readyNote?: string;
  };
  accents: AccentOption[];
  limits: {
    maxUploadMb: number;
    maxDurationSec: number;
    minDurationSec: number;
    retentionMinutes: number;
    acceptedExtensions: string[];
  };
  exports: { audio: string[]; video: boolean };
}

export type MediaKind = 'audio' | 'video';

export interface UploadInfo {
  id: string;
  name: string; // display name only (sanitized). Never used as a path.
  sizeBytes: number;
  durationSec: number;
  kind: MediaKind;
  container: string;
  hasVideo: boolean;
  createdAt: string;
  warnings: string[];
}

export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type JobStage = 'waiting' | 'preparing' | 'converting' | 'stitching' | 'finished';

export interface JobInfo {
  id: string;
  uploadId: string;
  state: JobState;
  stage: JobStage;
  /** Real progress: segments completed / total. Null until segmentation is known. */
  segments: { done: number; total: number } | null;
  queuePosition: number | null;
  accent: string;
  strength: number | null;
  engine: { id: string; kind: EngineKind; config: Record<string, string | number | boolean> };
  error: { code: string; message: string } | null;
  createdAt: string;
  finishedAt: string | null;
  output: { durationSec: number } | null;
}

export interface ApiError {
  error: { code: string; message: string };
}
