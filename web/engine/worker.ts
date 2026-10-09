/// <reference lib="webworker" />
// The Dub Club engine, running entirely in the visitor's browser (a Web Worker).
//   1. Whisper (open source, MIT) listens to the take and writes down each word with its timing.
//   2. Kokoro (open source, Apache-2.0) re-speaks each phrase with a British or American voice,
//      sped up or slowed down so it lands where the original phrase did.
//   3. The phrases are laid back on the original timeline and returned as a WAV.
// The recording never leaves the device. Only the open model files are downloaded (once, then cached).
import { env, pipeline } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';
import { assemble, cleanWords, fitSpeed, groupPhrases, medianPitch, rms, trimSilence, encodeWav, type Placed } from './dsp.ts';
import { ENGINE_ACCENTS, MODELS, VOICE_NAMES, type FromWorker, type ToWorker } from './protocol.ts';

declare const self: DedicatedWorkerGlobalScope;
const post = (m: FromWorker, transfer: Transferable[] = []) => self.postMessage(m, transfer);

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string; chunks?: { text: string; timestamp: [number, number | null] }[] }>;

let asrP: Promise<Asr> | null = null;
let ttsP: Promise<KokoroTTS> | null = null;

// Real download progress, summed across every model file.
const files = new Map<string, { loaded: number; total: number }>();
let lastPost = 0;
function onProgress(p: { status: string; file?: string; name?: string; loaded?: number; total?: number }) {
  const key = `${p.name ?? ''}/${p.file ?? ''}`;
  if (p.status === 'progress' && p.total) files.set(key, { loaded: p.loaded ?? 0, total: p.total });
  if (p.status === 'done' && files.has(key)) files.set(key, { ...files.get(key)!, loaded: files.get(key)!.total });
  const now = Date.now();
  if (now - lastPost < 150 && p.status === 'progress') return;
  lastPost = now;
  let loaded = 0;
  let total = 0;
  for (const f of files.values()) {
    loaded += f.loaded;
    total += f.total;
  }
  post({ type: 'download', loaded, total, files: files.size, done: false });
}

function setup(ortPath: string) {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const wasm = env.backends.onnx.wasm!;
  wasm.wasmPaths = ortPath;
  wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
}

function load(ortPath: string) {
  setup(ortPath);
  asrP ??= (pipeline('automatic-speech-recognition', MODELS.asr, { dtype: 'q8', device: 'wasm', progress_callback: onProgress }) as unknown as Promise<Asr>).catch((e) => {
    asrP = null;
    throw e;
  });
  ttsP ??= KokoroTTS.from_pretrained(MODELS.tts, { dtype: 'q8', device: 'wasm', progress_callback: onProgress as never }).catch((e) => {
    ttsP = null;
    throw e;
  });
  return Promise.all([asrP, ttsP]);
}

async function dub(msg: Extract<ToWorker, { type: 'dub' }>) {
  post({ type: 'stage', stage: 'loading' });
  const [asr, tts] = await load(msg.ortPath);
  post({ type: 'download', loaded: 0, total: 0, files: files.size, done: true });

  const pcm = msg.pcm16k;
  const duration = pcm.length / 16000;

  post({ type: 'stage', stage: 'listening' });
  const heard = await asr(pcm, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5, language: 'english', task: 'transcribe' });
  const words = cleanWords(heard.chunks ?? [], duration);
  if (!words.length) throw new Error('We couldn’t hear any words in that take. Try again a little closer to the mic.');
  const phrases = groupPhrases(words);
  const text = phrases.map((p) => p.text).join(' ');

  const accent = ENGINE_ACCENTS.find((a) => a.id === msg.accent) ?? ENGINE_ACCENTS[0];
  const gender = msg.voice ?? (medianPitch(pcm.subarray(0, 16000 * 15), 16000) >= 165 ? 'female' : 'male');
  const voice = accent.voices[gender];
  post({ type: 'heard', text, voice: VOICE_NAMES[voice] ?? voice });

  const RATE = 24000;
  const parts: Placed[] = [];
  for (let i = 0; i < phrases.length; i++) {
    post({ type: 'stage', stage: 'speaking', done: i, count: phrases.length });
    const p = phrases[i];
    const slot = (phrases[i + 1]?.start ?? duration) - p.start;
    const target = Math.min(slot, Math.max(p.end - p.start, 0.25));
    let audio = trimSilence((await tts.generate(p.text, { voice: voice as never, speed: 1 })).audio as Float32Array, RATE);
    const natural = audio.length / RATE;
    if (Math.abs(natural / target - 1) > 0.12) {
      const speed = fitSpeed(natural, target);
      if (Math.abs(speed - 1) > 0.03) audio = trimSilence((await tts.generate(p.text, { voice: voice as never, speed })).audio as Float32Array, RATE);
    }
    parts.push({ audio, start: p.start });
  }

  post({ type: 'stage', stage: 'finishing' });
  const out = assemble(parts, RATE, duration, rms(pcm, 0.01));
  const wav = encodeWav(out, RATE);
  post({ type: 'done', wav, text, voice: VOICE_NAMES[voice] ?? voice, durationSec: out.length / RATE }, [wav]);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  const run = msg.type === 'warm' ? load(msg.ortPath).then(() => post({ type: 'download', loaded: 0, total: 0, files: files.size, done: true })) : dub(msg);
  run.catch((err: unknown) => {
    console.error(err);
    const m = err instanceof Error ? err.message : String(err);
    const friendly = /fetch|network|Failed to load|404|403/i.test(m)
      ? 'We couldn’t download the voice models. Check your connection and try again.'
      : /memory|allocation|OOM/i.test(m)
        ? 'Your device ran out of memory for this one. Try a shorter take or close a few tabs.'
        : m;
    post({ type: 'error', message: friendly });
  });
};
