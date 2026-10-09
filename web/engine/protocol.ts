// Messages between the page and the engine worker.

export type EngineAccent = 'en-GB' | 'en-US';

export const ENGINE_ACCENTS: { id: EngineAccent; label: string; code: string; voices: { male: string; female: string } }[] = [
  { id: 'en-GB', label: 'British', code: 'GB', voices: { male: 'bm_george', female: 'bf_emma' } },
  { id: 'en-US', label: 'American', code: 'US', voices: { male: 'am_michael', female: 'af_heart' } },
];

export const VOICE_NAMES: Record<string, string> = {
  bm_george: 'George',
  bf_emma: 'Emma',
  am_michael: 'Michael',
  af_heart: 'Heart',
};

export const MODELS = {
  asr: 'onnx-community/whisper-base_timestamped',
  tts: 'onnx-community/Kokoro-82M-v1.0-ONNX',
};

export type ToWorker =
  | { type: 'warm'; ortPath: string }
  | { type: 'dub'; ortPath: string; pcm16k: Float32Array; accent: EngineAccent; voice?: 'male' | 'female' };

export type Stage = 'loading' | 'listening' | 'speaking' | 'finishing';

export type FromWorker =
  | { type: 'download'; loaded: number; total: number; files: number; done: boolean }
  | { type: 'stage'; stage: Stage; done?: number; count?: number }
  | { type: 'heard'; text: string; voice: string }
  | { type: 'done'; wav: ArrayBuffer; text: string; voice: string; durationSec: number }
  | { type: 'error'; message: string };
