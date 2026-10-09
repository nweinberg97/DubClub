import path from 'node:path';
import fs from 'node:fs';

/** Load KEY=VALUE pairs from .env if present (no dependency). Real env vars win. */
function loadDotEnv(file = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function num(name: string, fallback: number, min = 0): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= min ? v : fallback;
}

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  brand: string;
  maxUploadBytes: number;
  maxDurationSec: number;
  minDurationSec: number;
  retentionMinutes: number;
  workerConcurrency: number;
  maxUploadsPerSession: number;
  engine: string;
  remote: { url: string; key: string; timeoutSec: number };
  elevenlabs: { apiKey: string; modelId: string; voices: Record<string, string> };
  isProd: boolean;
  staticDir: string;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  loadDotEnv();
  const voices: Record<string, string> = {};
  for (const pair of (process.env.ELEVENLABS_VOICES ?? '').split(',')) {
    const [accent, voice] = pair.split(':').map((s) => s?.trim());
    if (accent && voice) voices[accent] = voice;
  }
  const cfg: Config = {
    port: num('PORT', 8787),
    host: process.env.HOST || '0.0.0.0',
    dataDir: path.resolve(process.env.DATA_DIR || './data'),
    brand: process.env.BRAND_NAME || 'Dub Club',
    maxUploadBytes: num('MAX_UPLOAD_MB', 200, 1) * 1024 * 1024,
    maxDurationSec: num('MAX_DURATION_SEC', 600, 1),
    minDurationSec: num('MIN_DURATION_SEC', 1, 0),
    retentionMinutes: num('RETENTION_MINUTES', 60, 1),
    workerConcurrency: Math.max(1, Math.floor(num('WORKER_CONCURRENCY', 1, 1))),
    maxUploadsPerSession: Math.max(1, Math.floor(num('MAX_UPLOADS_PER_SESSION', 5, 1))),
    engine: (process.env.ENGINE || 'passthrough').trim(),
    remote: {
      url: (process.env.REMOTE_ENGINE_URL || '').replace(/\/+$/, ''),
      key: process.env.REMOTE_ENGINE_KEY || '',
      timeoutSec: num('REMOTE_ENGINE_TIMEOUT_SEC', 600, 1),
    },
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY || '',
      modelId: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_sts_v2',
      voices,
    },
    isProd: process.env.NODE_ENV === 'production',
    staticDir: path.resolve(process.cwd(), 'dist'),
    ...overrides,
  };
  return cfg;
}
