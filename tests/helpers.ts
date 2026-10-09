import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp, type App } from '../server/app.ts';
import { loadConfig, type Config } from '../server/config.ts';
import type { Engine } from '../server/engines/types.ts';
import { run } from '../server/media/ffmpeg.ts';

process.env.DUBCLUB_SILENT = '1';

export async function tmpDir(prefix = 'dubclub-test-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function ff(args: string[]) {
  const r = await run('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args]);
  if (r.code !== 0) throw new Error(r.stderr.slice(-500));
}

/**
 * Speech-like test signal: voiced bursts (harmonic tone with syllable-rate modulation)
 * separated by short pauses, so silence detection and segmentation have something real to find.
 * These are synthetic fixtures — not recordings of people.
 */
export async function makeSpeechLike(out: string, seconds: number, opts: { container?: 'wav' | 'mp3' | 'm4a' } = {}) {
  const expr =
    '0.35*(sin(2*PI*140*t)+0.5*sin(2*PI*280*t)+0.25*sin(2*PI*420*t))*(0.6+0.4*sin(2*PI*4*t))*between(mod(t\\,3)\\,0\\,2.2)';
  const codec = opts.container === 'mp3' ? ['-c:a', 'libmp3lame'] : opts.container === 'm4a' ? ['-c:a', 'aac'] : ['-c:a', 'pcm_s16le'];
  await ff(['-f', 'lavfi', '-i', `aevalsrc=${expr}:s=44100:d=${seconds}`, ...codec, out]);
}

export async function makeSilence(out: string, seconds: number) {
  await ff(['-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', String(seconds), '-c:a', 'pcm_s16le', out]);
}

export async function makeVideo(out: string, seconds: number, withAudio = true) {
  const expr = '0.3*sin(2*PI*160*t)*between(mod(t\\,3)\\,0\\,2.2)';
  const args = ['-f', 'lavfi', '-i', `testsrc2=size=320x240:rate=25:d=${seconds}`];
  if (withAudio) args.push('-f', 'lavfi', '-i', `aevalsrc=${expr}:s=44100:d=${seconds}`);
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast');
  if (withAudio) args.push('-c:a', 'aac', '-shortest');
  args.push(out);
  await ff(args);
}

export interface TestServer {
  app: App;
  base: string;
  cfg: Config;
  close: () => Promise<void>;
}

export async function startServer(engine: Engine, overrides: Partial<Config> = {}): Promise<TestServer> {
  const dataDir = await tmpDir('dubclub-data-');
  const cfg = loadConfig({ dataDir, staticDir: path.join(dataDir, 'no-static'), ...overrides });
  const app = await createApp(cfg, engine);
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', () => r()));
  const { port } = app.server.address() as AddressInfo;
  return {
    app,
    cfg,
    base: `http://127.0.0.1:${port}`,
    close: async () => {
      await app.close();
      await fs.rm(dataDir, { recursive: true, force: true });
    },
  };
}

export async function newSession(base: string) {
  const r = await fetch(`${base}/api/session`, { method: 'POST' });
  const { token } = (await r.json()) as { token: string };
  return token;
}

export async function upload(base: string, token: string, file: string, name = path.basename(file)) {
  const body = await fs.readFile(file);
  return fetch(`${base}/api/uploads`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'x-file-name': encodeURIComponent(name), 'content-type': 'application/octet-stream' },
    body,
  });
}

export async function api(base: string, token: string, p: string, init: RequestInit = {}) {
  return fetch(`${base}${p}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

export async function waitForJob(base: string, token: string, id: string, timeoutMs = 60_000) {
  const t0 = Date.now();
  for (;;) {
    const r = await api(base, token, `/api/jobs/${id}`);
    const { job } = (await r.json()) as { job: any };
    if (['done', 'failed', 'cancelled'].includes(job.state)) return job;
    if (Date.now() - t0 > timeoutMs) throw new Error('job timeout: ' + JSON.stringify(job));
    await new Promise((res) => setTimeout(res, 100));
  }
}
