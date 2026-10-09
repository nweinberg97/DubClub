// Page side of the in-browser engine: decode the take, run the worker, keep React state.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BASE } from '../lib/env.ts';
import type { EngineAccent, FromWorker, Stage, ToWorker } from './protocol.ts';

export const LIMITS = { minSec: 1, maxSec: 60 };

export interface Take {
  blob: Blob;
  name: string;
  durationSec: number;
  pcm16k: Float32Array;
  fromMic: boolean;
}

export interface Result {
  wav: Blob;
  text: string;
  voice: string;
  accent: EngineAccent;
  durationSec: number;
}

export type Phase = 'empty' | 'reading' | 'ready' | 'dubbing' | 'done' | 'failed';

export interface LocalDubState {
  phase: Phase;
  take: Take | null;
  stage: Stage | null;
  speaking: { done: number; count: number } | null;
  download: { loaded: number; total: number; done: boolean } | null;
  heard: string | null;
  result: Result | null;
  error: string | null;
}

const initial: LocalDubState = { phase: 'empty', take: null, stage: null, speaking: null, download: null, heard: null, result: null, error: null };

const ortPath = () => new URL(`${BASE}/ort/`, location.href).href;

/** Decode any audio/video file the browser understands into 16 kHz mono for the engine. */
export async function decodeTo16k(blob: Blob): Promise<{ pcm: Float32Array; durationSec: number }> {
  const bytes = await blob.arrayBuffer();
  let decoded: AudioBuffer;
  try {
    decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes);
  } catch {
    throw new Error('We couldn’t read that file. Try an MP3, WAV, M4A or a phone video.');
  }
  const len = Math.max(1, Math.ceil(decoded.duration * 16000));
  const ctx = new OfflineAudioContext(1, len, 16000);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return { pcm: out.getChannelData(0).slice(), durationSec: decoded.duration };
}

export function engineSupported(): string | null {
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return 'This browser can’t run the dubbing engine. Try a recent Chrome, Safari, Edge or Firefox.';
  if (typeof OfflineAudioContext === 'undefined') return 'This browser can’t process audio. Try a recent Chrome, Safari, Edge or Firefox.';
  return null;
}

export function useLocalDub() {
  const [state, setState] = useState<LocalDubState>(initial);
  const worker = useRef<Worker | null>(null);
  const alive = useRef(true);
  const patch = useCallback((p: Partial<LocalDubState> | ((s: LocalDubState) => Partial<LocalDubState>)) => {
    if (!alive.current) return;
    setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
  }, []);

  const getWorker = useCallback(() => {
    if (worker.current) return worker.current;
    const w = new Worker(`${BASE}/assets/engine.js`, { type: 'module', name: 'dubclub-engine' });
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === 'download') patch({ download: { loaded: m.loaded, total: m.total, done: m.done } });
      else if (m.type === 'stage') patch({ stage: m.stage, speaking: m.count ? { done: m.done ?? 0, count: m.count } : null });
      else if (m.type === 'heard') patch({ heard: m.text });
      else if (m.type === 'error')
        patch((s) => (s.phase === 'dubbing' ? { phase: 'failed', error: m.message, stage: null } : { download: s.download && { ...s.download, done: true } }));
      else if (m.type === 'done')
        patch((s) => ({
          phase: 'done',
          stage: null,
          result: { wav: new Blob([m.wav], { type: 'audio/wav' }), text: m.text, voice: m.voice, accent: pendingAccent.current!, durationSec: m.durationSec },
        }));
    };
    w.onerror = () => patch((s) => (s.phase === 'dubbing' ? { phase: 'failed', error: 'The dubbing engine stopped unexpectedly. Try again.', stage: null } : {}));
    worker.current = w;
    return w;
  }, [patch]);

  const pendingAccent = useRef<EngineAccent | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);

  /** Start fetching the models in the background once someone shows intent (recording or picking a file). */
  const warm = useCallback(() => {
    if (engineSupported()) return;
    getWorker().postMessage({ type: 'warm', ortPath: ortPath() } satisfies ToWorker);
  }, [getWorker]);

  const setTake = useCallback(
    async (blob: Blob, name: string, fromMic: boolean) => {
      setState({ ...initial, phase: 'reading', download: state.download });
      try {
        const { pcm, durationSec } = await decodeTo16k(blob);
        if (durationSec < LIMITS.minSec) throw new Error('That take is too short. Say at least a few words.');
        if (durationSec > LIMITS.maxSec + 0.5) throw new Error('Keep it under a minute for now. Trim the take and try again.');
        patch({ phase: 'ready', take: { blob, name, durationSec, pcm16k: pcm, fromMic } });
      } catch (e) {
        patch({ phase: 'empty', error: (e as Error).message });
      }
    },
    [patch, state.download],
  );

  const start = useCallback(
    (accent: EngineAccent, voice?: 'male' | 'female') => {
      const take = state.take;
      if (!take) return;
      const unsupported = engineSupported();
      if (unsupported) return patch({ phase: 'failed', error: unsupported });
      pendingAccent.current = accent;
      patch({ phase: 'dubbing', stage: 'loading', speaking: null, heard: null, result: null, error: null });
      // Copy: the take stays playable and re-dubbable after the buffer is transferred.
      const pcm16k = take.pcm16k.slice();
      getWorker().postMessage({ type: 'dub', ortPath: ortPath(), pcm16k, accent, voice } satisfies ToWorker, [pcm16k.buffer]);
    },
    [state.take, patch, getWorker],
  );

  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    patch((s) => ({ phase: 'ready', stage: null, speaking: null, download: s.download?.done ? s.download : null, error: null }));
  }, [patch]);

  const another = useCallback(() => patch({ phase: 'ready', result: null, error: null, heard: null }), [patch]);
  const clear = useCallback(() => setState((s) => ({ ...initial, download: s.download })), []);

  return { state, warm, setTake, start, cancel, another, clear };
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
