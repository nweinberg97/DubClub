import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import type { Capabilities, UploadInfo } from '../shared/types.ts';
import type { Config } from './config.ts';
import type { Engine } from './engines/types.ts';
import { HttpError, RateLimiter, clientIp, json, readJson, securityHeaders, sendError, sendFile } from './http/util.ts';
import { JobQueue } from './jobs/queue.ts';
import { log } from './log.ts';
import * as ff from './media/ffmpeg.ts';
import { ACCEPTED_EXTENSIONS, checkExtension, checkProbe, sanitizeDisplayName } from './media/validate.ts';
import { Storage, hashToken, isId, newId, newToken, type UploadRecord } from './storage.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export interface App {
  server: http.Server;
  queue: JobQueue;
  storage: Storage;
  sweep: () => Promise<string[]>;
  close: () => Promise<void>;
}

export async function createApp(cfg: Config, engine: Engine): Promise<App> {
  const storage = new Storage(cfg.dataDir);
  await storage.init();
  const queue = new JobQueue(storage, engine, cfg.workerConcurrency);
  await queue.restore();

  const sessionLimiter = new RateLimiter(30, 60 * 60_000);
  const uploadLimiter = new RateLimiter(30, 60 * 60_000);
  const jobLimiter = new RateLimiter(60, 60 * 60_000);

  function auth(req: IncomingMessage): string {
    const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(String(req.headers.authorization ?? ''));
    if (!m) throw new HttpError(401, 'no_session', 'Your session has expired. Refresh the page to start a new one.');
    return hashToken(m[1]);
  }

  async function capabilities(): Promise<Capabilities> {
    const accents = await engine.accents();
    return {
      brand: cfg.brand,
      engine: engine.describe(),
      accents,
      limits: {
        maxUploadMb: Math.round(cfg.maxUploadBytes / 1024 / 1024),
        maxDurationSec: cfg.maxDurationSec,
        minDurationSec: cfg.minDurationSec,
        retentionMinutes: cfg.retentionMinutes,
        acceptedExtensions: [...ACCEPTED_EXTENSIONS],
      },
      exports: { audio: ['wav', 'mp3', 'm4a'], video: true },
    };
  }

  function publicUpload(u: UploadRecord): UploadInfo {
    const { sessionHash: _s, ext: _e, lastAccess: _l, meanDb: _m, ...rest } = u;
    return rest;
  }

  async function ownUpload(sessionHash: string, id: string) {
    if (!isId(id)) throw new HttpError(404, 'not_found', 'Upload not found.');
    const u = await storage.getUpload(sessionHash, id);
    if (!u) throw new HttpError(404, 'not_found', 'That recording isn’t here any more — it may have expired.');
    await storage.touch(u);
    return u;
  }

  function ownJob(sessionHash: string, id: string) {
    if (!isId(id)) throw new HttpError(404, 'not_found', 'Job not found.');
    const j = queue.get(sessionHash, id);
    if (!j) throw new HttpError(404, 'not_found', 'That dub isn’t here any more — it may have expired.');
    return j;
  }

  async function handleUpload(req: IncomingMessage, res: ServerResponse) {
    const sessionHash = auth(req);
    if (!uploadLimiter.allow(sessionHash)) throw new HttpError(429, 'rate_limited', 'That’s a lot of uploads. Take five and try again shortly.');
    const existing = await storage.listUploads(sessionHash);
    if (existing.length >= cfg.maxUploadsPerSession) {
      throw new HttpError(409, 'too_many_uploads', `You can keep ${cfg.maxUploadsPerSession} recordings at a time. Delete one to add another.`);
    }
    let rawName = 'recording';
    try {
      rawName = decodeURIComponent(String(req.headers['x-file-name'] ?? 'recording'));
    } catch {
      /* keep default */
    }
    const name = sanitizeDisplayName(rawName);
    let ext: string;
    try {
      ext = checkExtension(name);
    } catch (e) {
      throw new HttpError(415, (e as ff.MediaError).code, (e as Error).message);
    }
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > cfg.maxUploadBytes) {
      throw new HttpError(413, 'too_large', `That file is over the ${Math.round(cfg.maxUploadBytes / 1048576)} MB limit.`);
    }

    const id = newId();
    const dir = await storage.createUploadDir(sessionHash, id);
    const source = path.join(dir, `source.${ext}`);
    let bytes = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        bytes += chunk.length;
        if (bytes > cfg.maxUploadBytes) return cb(new HttpError(413, 'too_large', `That file is over the ${Math.round(cfg.maxUploadBytes / 1048576)} MB limit.`));
        cb(null, chunk);
      },
    });
    try {
      await pipeline(req, counter, fs.createWriteStream(source, { mode: 0o600 }));
      if (bytes === 0) throw new HttpError(400, 'empty', 'That file is empty.');
      const p = await ff.probe(source);
      const work = path.join(dir, 'work.wav');
      let decoded = false;
      // Browser recordings (MediaRecorder WebM) often have no duration in their header.
      // The upload is already size-capped, so decode it and measure what's really there.
      if (!(p.durationSec > 0) && p.hasAudio) {
        await ff.toWorkingWav(source, work);
        p.durationSec = (await ff.probe(work)).durationSec;
        decoded = true;
      }
      checkProbe(p, { maxDurationSec: cfg.maxDurationSec, minDurationSec: cfg.minDurationSec });
      if (!decoded) await ff.toWorkingWav(source, work);
      const levels = await ff.analyzeLevels(work, p.durationSec);
      if (levels.maxDb < -50 || levels.audibleSec < 0.5) {
        throw new HttpError(422, 'no_speech', 'We couldn’t hear anything in that recording. Check the mic was on and try again.');
      }
      await fsp.writeFile(path.join(dir, 'levels.json'), JSON.stringify({ ...levels, durationSec: p.durationSec }), { mode: 0o600 });
      await ff.toPreview(work, path.join(dir, 'preview.mp3'));
      const warnings: string[] = [];
      if (levels.audibleSec / p.durationSec < 0.25) warnings.push('This recording is mostly quiet. Results are best with clear, continuous speech.');
      if (levels.maxDb > -0.2) warnings.push('Parts of this recording are clipping (too loud). That can make dubs sound rough.');
      if (levels.meanDb < -40) warnings.push('This recording is very quiet. Results are best with a clear, close-mic take.');
      const rec: UploadRecord = {
        id,
        sessionHash,
        name,
        ext,
        sizeBytes: bytes,
        durationSec: Math.round(p.durationSec * 100) / 100,
        kind: p.hasVideo ? 'video' : 'audio',
        hasVideo: p.hasVideo,
        container: p.formatName.split(',')[0],
        createdAt: new Date().toISOString(),
        lastAccess: Date.now(),
        meanDb: levels.meanDb,
        warnings,
      };
      await storage.saveUpload(rec);
      log.info('upload.ok', { upload: id, kind: rec.kind, sec: Math.round(p.durationSec) });
      json(res, 201, { upload: publicUpload(rec) });
    } catch (err) {
      await storage.deleteUpload(sessionHash, id);
      if (err instanceof HttpError) throw err;
      if (err instanceof ff.MediaError) {
        const status = err.code === 'too_long' || err.code === 'too_short' ? 422 : 415;
        throw new HttpError(err.code === 'ffmpeg_failed' ? 422 : status, err.code, err.code === 'ffmpeg_failed' ? 'We couldn’t decode the audio in that file. It may be damaged or use an unusual codec.' : err.message);
      }
      if ((err as NodeJS.ErrnoException).code === 'ERR_STREAM_PREMATURE_CLOSE') throw new HttpError(400, 'aborted', 'Upload interrupted.');
      throw err;
    }
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    // Refuse any dot-segment or encoded traversal outright, before URL normalization hides it.
    const rawPath = (req.url ?? '/').split('?')[0];
    if (/(^|\/)\.\.?(\/|$)|%2e|%2f|%5c|\\/i.test(rawPath)) throw new HttpError(404, 'not_found', 'Not found.');
    const url = new URL(req.url ?? '/', 'http://local');
    const p = url.pathname;
    const method = req.method ?? 'GET';
    const seg = p.split('/').filter(Boolean); // ['api', 'jobs', ':id', 'cancel']

    if (p === '/api/health') return json(res, 200, { ok: true });
    if (p === '/api/capabilities' && method === 'GET') return json(res, 200, await capabilities());

    if (p === '/api/session' && method === 'POST') {
      if (!sessionLimiter.allow(clientIp(req))) throw new HttpError(429, 'rate_limited', 'Too many new sessions from here. Try again later.');
      return json(res, 201, { token: newToken() });
    }
    if (p === '/api/session' && method === 'DELETE') {
      const s = auth(req);
      queue.dropSession(s);
      await storage.deleteSession(s);
      log.info('session.deleted');
      return json(res, 200, { deleted: true });
    }

    if (p === '/api/uploads' && method === 'PUT') return handleUpload(req, res);
    if (p === '/api/uploads' && method === 'GET') {
      const s = auth(req);
      const ups = await storage.listUploads(s);
      return json(res, 200, { uploads: ups.map(publicUpload) });
    }

    if (seg[0] === 'api' && seg[1] === 'uploads' && seg[2]) {
      const s = auth(req);
      const u = await ownUpload(s, seg[2]);
      if (seg.length === 3 && method === 'GET') {
        const jobs = queue.listForUpload(s, u.id).map((j) => queue.public(j));
        return json(res, 200, { upload: publicUpload(u), jobs });
      }
      if (seg.length === 3 && method === 'DELETE') {
        queue.dropUpload(s, u.id);
        await storage.deleteUpload(s, u.id);
        log.info('upload.deleted', { upload: u.id });
        return json(res, 200, { deleted: true });
      }
      if (seg[3] === 'preview' && (method === 'GET' || method === 'HEAD')) {
        return sendFile(req, res, path.join(storage.uploadDir(s, u.id), 'preview.mp3'), 'audio/mpeg');
      }
    }

    if (p === '/api/jobs' && method === 'POST') {
      const s = auth(req);
      if (!jobLimiter.allow(s)) throw new HttpError(429, 'rate_limited', 'That’s a lot of dubs in a row. Give it a minute.');
      const body = await readJson<{ uploadId?: string; accent?: string; strength?: number; consent?: boolean }>(req);
      if (body.consent !== true) {
        throw new HttpError(400, 'consent_required', 'Please confirm you have the right to process this recording.');
      }
      const u = await ownUpload(s, String(body.uploadId ?? ''));
      const desc = engine.describe();
      if (!desc.ready) throw new HttpError(503, 'engine_unavailable', desc.readyNote ?? 'The accent engine isn’t available right now.');
      const accents = await engine.accents();
      if (!accents.some((a) => a.id === body.accent)) {
        throw new HttpError(400, 'unsupported_accent', 'That accent isn’t available on this engine.');
      }
      let strength: number | null = null;
      if (desc.supportsStrength && body.strength !== undefined) {
        const v = Number(body.strength);
        if (!Number.isFinite(v) || v < 0 || v > 1) throw new HttpError(400, 'bad_strength', 'Strength must be between 0 and 1.');
        strength = Math.round(v * 100) / 100;
      }
      if (queue.activeCount(s) >= 2) throw new HttpError(429, 'busy', 'You already have two dubs cooking. Let one finish first.');
      const job = await queue.enqueue(u, body.accent!, strength);
      return json(res, 202, { job: queue.public(job) });
    }

    if (seg[0] === 'api' && seg[1] === 'jobs' && seg[2]) {
      const s = auth(req);
      const job = ownJob(s, seg[2]);
      if (seg.length === 3 && method === 'GET') return json(res, 200, { job: queue.public(job) });
      if (seg[3] === 'cancel' && method === 'POST') {
        queue.cancel(job);
        return json(res, 200, { job: queue.public(job) });
      }
      if (seg[3] === 'retry' && method === 'POST') {
        if (job.state === 'queued' || job.state === 'running') throw new HttpError(409, 'still_running', 'That one is still going.');
        if (queue.activeCount(s) >= 2) throw new HttpError(429, 'busy', 'You already have two dubs cooking. Let one finish first.');
        const u = await ownUpload(s, job.uploadId);
        const next = await queue.enqueue(u, job.accent, job.strength);
        return json(res, 202, { job: queue.public(next) });
      }
      if (seg[3] === 'preview' || seg[3] === 'export') {
        if (job.state !== 'done') throw new HttpError(409, 'not_ready', 'This dub isn’t finished yet.');
        const u = await ownUpload(s, job.uploadId);
        const dir = storage.jobDir(s, u.id, job.id);
        if (seg[3] === 'preview') return sendFile(req, res, path.join(dir, 'preview.mp3'), 'audio/mpeg');
        const format = url.searchParams.get('format') ?? 'wav';
        const base = u.name.replace(/\.[^.]+$/, '') || 'recording';
        const tag = `dubclub-${job.accent}`;
        if (format === 'video') {
          if (!u.hasVideo) throw new HttpError(400, 'no_video', 'This recording has no video to export.');
          const container = u.container === 'matroska' || u.ext === 'webm' ? 'webm' : 'mp4';
          const out = path.join(dir, `export.${container}`);
          if (!fs.existsSync(out)) {
            try {
              await ff.muxVideo(path.join(storage.uploadDir(s, u.id), `source.${u.ext}`), path.join(dir, 'dub.wav'), out + '.part', container, u.durationSec);
              await fsp.rename(out + '.part', out);
            } catch {
              await fsp.rm(out + '.part', { force: true });
              throw new HttpError(500, 'video_export_failed', 'We couldn’t rebuild the video. Your dubbed audio is fine — download it as WAV or MP3 and drop it into your editor.');
            }
          }
          return sendFile(req, res, out, container === 'webm' ? 'video/webm' : 'video/mp4', { download: `${base} (${tag}).${container}` });
        }
        if (!(format in ff.AUDIO_EXPORTS)) throw new HttpError(400, 'bad_format', 'Choose wav, mp3, m4a or video.');
        const f = format as ff.AudioExportFormat;
        const spec = ff.AUDIO_EXPORTS[f];
        const out = path.join(dir, `export.${spec.ext}`);
        if (!fs.existsSync(out)) {
          if (f === 'wav') await fsp.copyFile(path.join(dir, 'dub.wav'), out);
          else await ff.exportAudio(path.join(dir, 'dub.wav'), f, out);
        }
        return sendFile(req, res, out, spec.mime, { download: `${base} (${tag}).${spec.ext}` });
      }
    }

    if (p.startsWith('/api/')) throw new HttpError(404, 'not_found', 'No such endpoint.');
    return serveStatic(req, res, p);
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, p: string) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method', 'Method not allowed.');
    const root = cfg.staticDir;
    const decoded = decodeURIComponent(p);
    const file = path.resolve(root, '.' + decoded);
    if (!file.startsWith(root + path.sep) && file !== root) throw new HttpError(404, 'not_found', 'Not found.');
    let target = file;
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      // SPA: unknown non-asset paths get the shell; missing assets 404.
      if (path.extname(decoded)) throw new HttpError(404, 'not_found', 'Not found.');
      target = path.join(root, 'index.html');
      if (!fs.existsSync(target)) throw new HttpError(503, 'not_built', 'Web app not built. Run `npm run build`.');
    }
    const ext = path.extname(target);
    const immutable = /\/assets\//.test(target) || /\/fonts\//.test(target);
    return sendFile(req, res, target, MIME[ext] ?? 'application/octet-stream', {
      cache: ext === '.html' ? 'no-cache' : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    });
  }

  const server = http.createServer((req, res) => {
    securityHeaders(res);
    // CORS for a web app hosted on another origin (GitHub Pages). Auth is a bearer header, no cookies.
    const origin = String(req.headers.origin ?? '');
    if (origin && cfg.allowedOrigins.includes(origin) && (req.url ?? '').startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Range, Content-Length');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-File-Name, Range',
          'Access-Control-Max-Age': '600',
        });
        return res.end();
      }
    }
    route(req, res).catch((err) => {
      if (res.headersSent) return res.destroy();
      if (err instanceof HttpError) {
        if (err.status === 413 || err.code === 'aborted') res.setHeader('connection', 'close');
        return sendError(res, err);
      }
      log.error('request.error', { path: (req.url ?? '').split('?')[0].slice(0, 80), err: (err as Error).name });
      sendError(res, new HttpError(500, 'internal', 'Something went wrong on our side. Try again.'));
    });
  });
  server.requestTimeout = 15 * 60_000; // large uploads on slow links

  const sweep = async () => {
    const removed = await storage.sweep(cfg.retentionMinutes * 60_000, Date.now(), (id) => queue.isUploadBusy(id));
    queue.forgetUploads(removed);
    return removed;
  };
  const timer = setInterval(() => void sweep().catch(() => {}), 60_000);
  timer.unref();

  return {
    server,
    queue,
    storage,
    sweep,
    close: async () => {
      clearInterval(timer);
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
