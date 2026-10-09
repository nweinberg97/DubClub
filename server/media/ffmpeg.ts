import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export class MediaError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Spawn a process with no shell, bounded output, optional abort + timeout. */
export function run(
  cmd: string,
  args: string[],
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const cap = 4 * 1024 * 1024;
    child.stdout.on('data', (d) => {
      if (stdout.length < cap) stdout += d;
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < cap) stderr += d;
    });
    const kill = () => child.kill('SIGKILL');
    const timer = opts.timeoutMs ? setTimeout(kill, opts.timeoutMs) : null;
    opts.signal?.addEventListener('abort', kill, { once: true });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', kill);
      if (opts.signal?.aborted) return reject(new MediaError('cancelled', 'Cancelled'));
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function ffmpeg(args: string[], signal?: AbortSignal, timeoutMs = 10 * 60_000) {
  const res = await run('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { signal, timeoutMs });
  if (res.code !== 0) {
    const tail = res.stderr.split('\n').filter(Boolean).slice(-3).join(' | ');
    throw new MediaError('ffmpeg_failed', `ffmpeg failed: ${tail.slice(0, 400)}`);
  }
  return res;
}

export interface ProbeResult {
  durationSec: number;
  formatName: string;
  hasAudio: boolean;
  hasVideo: boolean;
  audioCodec: string | null;
  videoCodec: string | null;
}

export async function probe(file: string): Promise<ProbeResult> {
  const res = await run(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { timeoutMs: 30_000 },
  );
  if (res.code !== 0) throw new MediaError('unreadable', 'We could not read that file. It may be corrupted or not a media file.');
  let data: any;
  try {
    data = JSON.parse(res.stdout);
  } catch {
    throw new MediaError('unreadable', 'We could not read that file.');
  }
  const streams: any[] = data.streams ?? [];
  const audio = streams.find((s) => s.codec_type === 'audio');
  // Cover art in audio files shows up as a video stream with attached_pic; ignore it.
  const video = streams.find((s) => s.codec_type === 'video' && !(s.disposition?.attached_pic === 1));
  let duration = Number(data.format?.duration);
  if (!Number.isFinite(duration)) duration = Number(audio?.duration ?? video?.duration);
  return {
    durationSec: Number.isFinite(duration) ? duration : 0,
    formatName: String(data.format?.format_name ?? ''),
    hasAudio: !!audio,
    hasVideo: !!video,
    audioCodec: audio?.codec_name ?? null,
    videoCodec: video?.codec_name ?? null,
  };
}

export const WORK_RATE = 44100;

/** Decode any input's first audio track to mono 16-bit PCM WAV at the working rate. */
export async function toWorkingWav(input: string, out: string, signal?: AbortSignal) {
  await ffmpeg(['-i', input, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(WORK_RATE), '-c:a', 'pcm_s16le', out], signal);
}

/** Small rendition for in-browser playback. MP3 because every browser decodes it (AAC isn't universal on Linux/Chromium builds). */
export async function toPreview(inputWav: string, out: string, signal?: AbortSignal) {
  await ffmpeg(['-i', inputWav, '-c:a', 'libmp3lame', '-b:a', '160k', out], signal);
}

export interface LevelReport {
  meanDb: number;
  maxDb: number;
  silences: Array<[number, number]>;
  audibleSec: number;
}

/** Loudness + silence map. This is a level check, not a true voice-activity detector. */
export async function analyzeLevels(wav: string, durationSec: number, signal?: AbortSignal): Promise<LevelReport> {
  const res = await ffmpeg(
    ['-i', wav, '-af', 'volumedetect,silencedetect=noise=-38dB:d=0.25', '-f', 'null', '-'],
    signal,
  );
  const meanDb = Number(/mean_volume:\s*(-?[\d.]+|-inf)/.exec(res.stderr)?.[1] ?? -91);
  const maxDb = Number(/max_volume:\s*(-?[\d.]+|-inf)/.exec(res.stderr)?.[1] ?? -91);
  const silences: Array<[number, number]> = [];
  let open: number | null = null;
  for (const line of res.stderr.split('\n')) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) open = Math.max(0, Number(s[1]));
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && open !== null) {
      silences.push([open, Number(e[1])]);
      open = null;
    }
  }
  if (open !== null) silences.push([open, durationSec]);
  const silent = silences.reduce((acc, [a, b]) => acc + Math.max(0, b - a), 0);
  return {
    meanDb: Number.isFinite(meanDb) ? meanDb : -91,
    maxDb: Number.isFinite(maxDb) ? maxDb : -91,
    silences,
    audibleSec: Math.max(0, durationSec - silent),
  };
}

/**
 * Plan cut points so each segment is <= maxLen seconds, preferring the middle of a
 * silence so we don't slice through words. Pure function — unit tested.
 */
export function planSegments(
  durationSec: number,
  silences: Array<[number, number]>,
  maxLen: number,
  minLen = Math.min(4, maxLen / 2),
): Array<[number, number]> {
  if (durationSec <= maxLen) return [[0, durationSec]];
  const mids = silences
    .map(([a, b]) => (a + b) / 2)
    .filter((m) => m > 0 && m < durationSec)
    .sort((x, y) => x - y);
  const segs: Array<[number, number]> = [];
  let start = 0;
  while (durationSec - start > maxLen) {
    const limit = start + maxLen;
    const candidates = mids.filter((m) => m > start + minLen && m <= limit);
    const cut = candidates.length ? candidates[candidates.length - 1] : limit; // hard cut if no silence
    segs.push([start, cut]);
    start = cut;
  }
  segs.push([start, durationSec]);
  return segs;
}

export async function cutWav(input: string, start: number, end: number, out: string, signal?: AbortSignal) {
  await ffmpeg(['-i', input, '-ss', start.toFixed(3), '-to', end.toFixed(3), '-c:a', 'pcm_s16le', out], signal);
}

/** Normalize any engine output back to our working WAV format. */
export async function normalizeWav(input: string, out: string, signal?: AbortSignal) {
  await ffmpeg(['-i', input, '-vn', '-ac', '1', '-ar', String(WORK_RATE), '-c:a', 'pcm_s16le', out], signal);
}

/** Join working WAVs with a few ms of crossfade-free concat (same format guaranteed). */
export async function concatWavs(files: string[], out: string, signal?: AbortSignal) {
  if (files.length === 1) {
    await fs.copyFile(files[0], out);
    return;
  }
  const list = out + '.txt';
  await fs.writeFile(list, files.map((f) => `file '${path.resolve(f).replace(/'/g, "'\\''")}'`).join('\n'));
  try {
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'pcm_s16le', out], signal);
  } finally {
    await fs.rm(list, { force: true });
  }
}

/** Apply a gain so the output's mean level matches the original's. */
export async function matchLevel(input: string, targetMeanDb: number, out: string, signal?: AbortSignal) {
  const res = await ffmpeg(['-i', input, '-af', 'volumedetect', '-f', 'null', '-'], signal);
  const mean = Number(/mean_volume:\s*(-?[\d.]+)/.exec(res.stderr)?.[1]);
  const gain = Number.isFinite(mean) ? Math.max(-20, Math.min(20, targetMeanDb - mean)) : 0;
  // alimiter keeps the boost from clipping.
  await ffmpeg(['-i', input, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.97`, '-c:a', 'pcm_s16le', out], signal);
}

export const AUDIO_EXPORTS = {
  wav: { ext: 'wav', mime: 'audio/wav', args: ['-c:a', 'pcm_s16le'] },
  mp3: { ext: 'mp3', mime: 'audio/mpeg', args: ['-c:a', 'libmp3lame', '-b:a', '192k'] },
  m4a: { ext: 'm4a', mime: 'audio/mp4', args: ['-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'] },
} as const;
export type AudioExportFormat = keyof typeof AUDIO_EXPORTS;

export async function exportAudio(wav: string, format: AudioExportFormat, out: string, signal?: AbortSignal) {
  await ffmpeg(['-i', wav, ...AUDIO_EXPORTS[format].args, out], signal);
}

/**
 * Replace a video's audio with the dub. Video stream is copied untouched.
 * The dub is padded/trimmed to the video's length so the picture never gets cut short.
 */
export async function muxVideo(
  video: string,
  dubWav: string,
  out: string,
  container: 'mp4' | 'webm',
  videoDurationSec: number,
  signal?: AbortSignal,
) {
  const audioArgs = container === 'webm' ? ['-c:a', 'libopus', '-b:a', '160k'] : ['-c:a', 'aac', '-b:a', '192k'];
  const base = ['-i', video, '-i', dubWav, '-map', '0:v:0', '-map', '1:a:0', '-af', 'apad', '-t', videoDurationSec.toFixed(3)];
  const fmt = ['-f', container]; // explicit: output path may not end in the container extension
  try {
    await ffmpeg([...base, '-c:v', 'copy', ...audioArgs, ...(container === 'mp4' ? ['-movflags', '+faststart'] : []), ...fmt, out], signal);
  } catch (err) {
    if ((err as MediaError).code === 'cancelled') throw err;
    // Source video codec can't be copied into this container — re-encode the picture.
    const vArgs = container === 'webm' ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'];
    await ffmpeg([...base, ...vArgs, ...audioArgs, ...(container === 'mp4' ? ['-movflags', '+faststart'] : []), ...fmt, out], signal, 30 * 60_000);
  }
}
