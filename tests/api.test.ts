import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { PassthroughEngine } from '../server/engines/passthrough.ts';
import type { Engine, SegmentRequest } from '../server/engines/types.ts';
import { probe } from '../server/media/ffmpeg.ts';
import { api, makeSilence, makeSpeechLike, makeVideo, newSession, startServer, tmpDir, upload, waitForJob, type TestServer } from './helpers.ts';

let fx: string;
const files: Record<string, string> = {};

before(async () => {
  fx = await tmpDir('dubclub-fx-');
  files.speech = path.join(fx, 'my take.wav');
  files.mp3 = path.join(fx, 'voice.mp3');
  files.long = path.join(fx, 'long.wav');
  files.silent = path.join(fx, 'silent.wav');
  files.video = path.join(fx, 'clip.mp4');
  files.mute = path.join(fx, 'mute.mp4');
  files.fake = path.join(fx, 'fake.mp3');
  await Promise.all([
    makeSpeechLike(files.speech, 47),
    makeSpeechLike(files.mp3, 8, { container: 'mp3' }),
    makeSpeechLike(files.long, 30),
    makeSilence(files.silent, 5),
    makeVideo(files.video, 9),
    makeVideo(files.mute, 4, false),
    fs.writeFile(files.fake, 'this is definitely not audio, just text pretending'),
  ]);
});
after(async () => fs.rm(fx, { recursive: true, force: true }));

describe('studio API — passthrough pipeline (real ffmpeg, no mocks)', () => {
  let s: TestServer;
  let token: string;
  before(async () => {
    s = await startServer(new PassthroughEngine(), { maxDurationSec: 60 });
    token = await newSession(s.base);
  });
  after(async () => s.close());

  it('reports honest capabilities for the dev engine', async () => {
    const caps = (await (await fetch(`${s.base}/api/capabilities`)).json()) as any;
    assert.equal(caps.engine.kind, 'dev-passthrough');
    assert.equal(caps.engine.changesAccent, false);
    assert.equal(caps.engine.external, false);
    assert.ok(caps.accents.length > 0);
    assert.ok(caps.accents.every((a: any) => /accent unchanged/.test(a.note)));
  });

  it('requires a session for everything private', async () => {
    const r = await fetch(`${s.base}/api/uploads`);
    assert.equal(r.status, 401);
    const r2 = await fetch(`${s.base}/api/uploads`, { headers: { authorization: 'Bearer nope' } });
    assert.equal(r2.status, 401);
  });

  let uploadId = '';
  it('accepts a speech recording and reports real metadata', async () => {
    const r = await upload(s.base, token, files.speech);
    assert.equal(r.status, 201);
    const { upload: u } = (await r.json()) as any;
    uploadId = u.id;
    assert.equal(u.name, 'my take.wav');
    assert.equal(u.kind, 'audio');
    assert.ok(Math.abs(u.durationSec - 47) < 0.1);
    assert.ok(u.sizeBytes > 1000);
    // the user's filename never becomes a path on disk
    const dir = s.app.storage.uploadDir(require_hash(token), u.id);
    const listing = await fs.readdir(dir);
    assert.ok(!listing.some((f) => f.includes('my take')));
    const preview = await api(s.base, token, `/api/uploads/${u.id}/preview`);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('content-type'), 'audio/mpeg');
  });

  it('runs a real job: segments, converts, stitches, previews', async () => {
    const r = await api(s.base, token, '/api/jobs', { method: 'POST', body: JSON.stringify({ uploadId, accent: 'en-GB', consent: true }) });
    assert.equal(r.status, 202);
    const { job } = (await r.json()) as any;
    assert.equal(job.engine.id, 'passthrough');
    assert.deepEqual(job.engine.config, { mode: 'passthrough' });
    const done = await waitForJob(s.base, token, job.id);
    assert.equal(done.state, 'done', JSON.stringify(done.error));
    assert.ok(done.segments.total >= 3, 'should split 47s into multiple segments');
    assert.equal(done.segments.done, done.segments.total);
    assert.ok(Math.abs(done.output.durationSec - 47) < 0.25, `output duration ${done.output.durationSec}`);
    const prev = await api(s.base, token, `/api/jobs/${job.id}/preview`);
    assert.equal(prev.status, 200);
    // Range requests work (needed for seeking)
    const ranged = await api(s.base, token, `/api/jobs/${job.id}/preview`, { headers: { range: 'bytes=0-99' } });
    assert.equal(ranged.status, 206);
    assert.equal((await ranged.arrayBuffer()).byteLength, 100);
    jobId = job.id;
  });

  let jobId = '';
  for (const format of ['wav', 'mp3', 'm4a'] as const) {
    it(`exports a valid ${format}`, async () => {
      const r = await api(s.base, token, `/api/jobs/${jobId}/export?format=${format}`);
      assert.equal(r.status, 200);
      assert.match(r.headers.get('content-disposition') ?? '', new RegExp(`my take \\(dubclub-en-GB\\)\\.${format}`));
      const out = path.join(fx, `out.${format}`);
      await fs.writeFile(out, Buffer.from(await r.arrayBuffer()));
      const p = await probe(out);
      assert.ok(p.hasAudio);
      assert.ok(Math.abs(p.durationSec - 47) < 0.3, `${format} duration ${p.durationSec}`);
    });
  }

  it('refuses video export for audio-only uploads', async () => {
    const r = await api(s.base, token, `/api/jobs/${jobId}/export?format=video`);
    assert.equal(r.status, 400);
  });

  it('accepts video, dubs it, and exports a video with the audio replaced', async () => {
    const r = await upload(s.base, token, files.video);
    assert.equal(r.status, 201);
    const { upload: u } = (await r.json()) as any;
    assert.equal(u.kind, 'video');
    const jr = await api(s.base, token, '/api/jobs', { method: 'POST', body: JSON.stringify({ uploadId: u.id, accent: 'en-AU', consent: true }) });
    const { job } = (await jr.json()) as any;
    const done = await waitForJob(s.base, token, job.id);
    assert.equal(done.state, 'done');
    const vr = await api(s.base, token, `/api/jobs/${job.id}/export?format=video`);
    assert.equal(vr.status, 200);
    assert.equal(vr.headers.get('content-type'), 'video/mp4');
    const out = path.join(fx, 'out.mp4');
    await fs.writeFile(out, Buffer.from(await vr.arrayBuffer()));
    const p = await probe(out);
    assert.ok(p.hasVideo && p.hasAudio);
    assert.equal(p.videoCodec, 'h264', 'video stream copied, not re-encoded');
    assert.ok(Math.abs(p.durationSec - 9) < 0.2, `video duration ${p.durationSec}`);
    await api(s.base, token, `/api/uploads/${u.id}`, { method: 'DELETE' });
  });

  it('accepts mp3 input', async () => {
    const r = await upload(s.base, token, files.mp3);
    assert.equal(r.status, 201);
    const { upload: u } = (await r.json()) as any;
    await api(s.base, token, `/api/uploads/${u.id}`, { method: 'DELETE' });
  });

  it('accepts a browser-style WebM recording with no duration in its header', async () => {
    const webm = path.join(fx, 'mic-take.webm');
    const { spawnSync } = await import('node:child_process');
    // Writing to a pipe (non-seekable) leaves the duration out, exactly like MediaRecorder.
    const r = spawnSync('sh', ['-c', `ffmpeg -loglevel error -i "${files.mp3}" -c:a libopus -f webm pipe:1 > "${webm}"`]);
    assert.equal(r.status, 0);
    const res = await upload(s.base, token, webm);
    assert.equal(res.status, 201, await res.clone().text());
    const { upload: u } = (await res.json()) as any;
    assert.ok(Math.abs(u.durationSec - 8) < 0.2, `duration ${u.durationSec}`);
    await api(s.base, token, `/api/uploads/${u.id}`, { method: 'DELETE' });
  });

  it('rejects a text file pretending to be an mp3', async () => {
    const r = await upload(s.base, token, files.fake);
    assert.equal(r.status, 415);
    const body = (await r.json()) as any;
    assert.equal(body.error.code, 'unreadable');
  });

  it('rejects unsupported extensions before reading the body', async () => {
    const r = await upload(s.base, token, files.fake, 'notes.txt');
    assert.equal(r.status, 415);
  });

  it('rejects silence with a human explanation', async () => {
    const r = await upload(s.base, token, files.silent);
    assert.equal(r.status, 422);
    const body = (await r.json()) as any;
    assert.equal(body.error.code, 'no_speech');
    assert.match(body.error.message, /couldn’t hear anything/);
  });

  it('rejects a video with no audio track', async () => {
    const r = await upload(s.base, token, files.mute);
    assert.equal(r.status, 415);
    assert.equal(((await r.json()) as any).error.code, 'no_audio');
  });

  it('rejected uploads leave nothing behind', async () => {
    const list = (await (await api(s.base, token, '/api/uploads')).json()) as any;
    assert.equal(list.uploads.length, 1, 'only the good speech upload remains');
  });

  it('requires consent and a supported accent', async () => {
    const a = await api(s.base, token, '/api/jobs', { method: 'POST', body: JSON.stringify({ uploadId, accent: 'en-GB' }) });
    assert.equal(a.status, 400);
    assert.equal(((await a.json()) as any).error.code, 'consent_required');
    const b = await api(s.base, token, '/api/jobs', { method: 'POST', body: JSON.stringify({ uploadId, accent: 'xx-MARS', consent: true }) });
    assert.equal(b.status, 400);
    assert.equal(((await b.json()) as any).error.code, 'unsupported_accent');
  });

  it('isolates sessions: another session cannot see or download anything', async () => {
    const other = await newSession(s.base);
    for (const p of [`/api/uploads/${uploadId}`, `/api/uploads/${uploadId}/preview`, `/api/jobs/${jobId}`, `/api/jobs/${jobId}/export?format=wav`]) {
      const r = await api(s.base, other, p);
      assert.equal(r.status, 404, p);
    }
    const del = await api(s.base, other, `/api/uploads/${uploadId}`, { method: 'DELETE' });
    assert.equal(del.status, 404);
  });

  it('rejects path traversal and malformed ids', async () => {
    // Raw paths (no client-side normalization) straight to the socket.
    const raw = (p: string) =>
      new Promise<number>((resolve, reject) => {
        const u = new URL(s.base);
        const req = http.request({ host: u.hostname, port: u.port, path: p, headers: { authorization: `Bearer ${token}` } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
      });
    for (const p of [
      '/api/uploads/..%2F..%2Fetc',
      '/api/uploads/../../etc/passwd',
      `/api/uploads/${'a'.repeat(23)}/../preview`,
      '/api/jobs/zzzzzzzzzzzzzzzzzzzzzzzz',
      '/../../../../etc/passwd',
      '/%2e%2e/%2e%2e/etc/passwd.txt',
    ]) {
      const status = await raw(p);
      assert.ok(status === 404, `${p} -> ${status}`);
    }
  });

  it('retry creates a fresh job with the same settings', async () => {
    const r = await api(s.base, token, `/api/jobs/${jobId}/retry`, { method: 'POST' });
    assert.equal(r.status, 202);
    const { job } = (await r.json()) as any;
    assert.notEqual(job.id, jobId);
    assert.equal(job.accent, 'en-GB');
    const done = await waitForJob(s.base, token, job.id);
    assert.equal(done.state, 'done');
  });

  it('delete removes the upload and every output from disk', async () => {
    const dir = s.app.storage.uploadDir(require_hash(token), uploadId);
    assert.ok((await fs.stat(dir)).isDirectory());
    const r = await api(s.base, token, `/api/uploads/${uploadId}`, { method: 'DELETE' });
    assert.equal(r.status, 200);
    await assert.rejects(fs.stat(dir));
    const gone = await api(s.base, token, `/api/jobs/${jobId}/export?format=wav`);
    assert.equal(gone.status, 404);
  });

  it('enforces the duration limit', async () => {
    const short = await startServer(new PassthroughEngine(), { maxDurationSec: 20 });
    try {
      const t = await newSession(short.base);
      const r = await upload(short.base, t, files.long);
      assert.equal(r.status, 422);
      assert.equal(((await r.json()) as any).error.code, 'too_long');
    } finally {
      await short.close();
    }
  });

  it('enforces the size limit while streaming', async () => {
    const tiny = await startServer(new PassthroughEngine(), { maxUploadBytes: 50_000 });
    try {
      const t = await newSession(tiny.base);
      const r = await upload(tiny.base, t, files.speech);
      assert.equal(r.status, 413);
      const left = await tiny.app.storage.listUploads(require_hash(t));
      assert.equal(left.length, 0);
    } finally {
      await tiny.close();
    }
  });

  it('sweeper deletes idle uploads after the retention window', async () => {
    const t = await newSession(s.base);
    const r = await upload(s.base, t, files.mp3);
    const { upload: u } = (await r.json()) as any;
    const removedNow = await s.app.storage.sweep(60 * 60_000);
    assert.ok(!removedNow.includes(u.id));
    const removedLater = await s.app.storage.sweep(60 * 60_000, Date.now() + 2 * 60 * 60_000);
    assert.ok(removedLater.includes(u.id));
    const g = await api(s.base, t, `/api/uploads/${u.id}`);
    assert.equal(g.status, 404);
  });

  it('deleting a session wipes all of its media', async () => {
    const t = await newSession(s.base);
    await upload(s.base, t, files.mp3);
    const dir = s.app.storage.sessionDir(require_hash(t));
    assert.ok((await fs.stat(dir)).isDirectory());
    const r = await api(s.base, t, '/api/session', { method: 'DELETE' });
    assert.equal(r.status, 200);
    await assert.rejects(fs.stat(dir));
  });

  it('allows CORS only for configured origins', async () => {
    const cors = await startServer(new PassthroughEngine(), { allowedOrigins: ['https://example.github.io'] });
    try {
      const pre = await fetch(`${cors.base}/api/uploads`, {
        method: 'OPTIONS',
        headers: { origin: 'https://example.github.io', 'access-control-request-method': 'PUT' },
      });
      assert.equal(pre.status, 204);
      assert.equal(pre.headers.get('access-control-allow-origin'), 'https://example.github.io');
      assert.match(pre.headers.get('access-control-allow-headers') ?? '', /Authorization/);
      const other = await fetch(`${cors.base}/api/capabilities`, { headers: { origin: 'https://evil.example' } });
      assert.equal(other.headers.get('access-control-allow-origin'), null);
    } finally {
      await cors.close();
    }
  });

  it('sets security headers and never caches private media', async () => {
    const r = await fetch(`${s.base}/api/capabilities`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });
});

describe('cancellation', () => {
  /** Engine that waits until aborted — lets us test cancel deterministically. */
  class SlowEngine extends PassthroughEngine {
    override async transformSegment(req: SegmentRequest): Promise<string> {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 30_000);
        req.signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new Error('aborted'));
        });
      });
      return super.transformSegment(req);
    }
  }

  it('cancels a running job and a queued one', async () => {
    const s = await startServer(new SlowEngine() as Engine);
    try {
      const t = await newSession(s.base);
      const fx2 = await tmpDir();
      const f = path.join(fx2, 'a.wav');
      await makeSpeechLike(f, 6);
      const { upload: u } = (await (await upload(s.base, t, f)).json()) as any;
      const post = () => api(s.base, t, '/api/jobs', { method: 'POST', body: JSON.stringify({ uploadId: u.id, accent: 'en-GB', consent: true }) });
      const j1 = ((await (await post()).json()) as any).job;
      const j2 = ((await (await post()).json()) as any).job;
      const third = await post();
      assert.equal(third.status, 429, 'max two active jobs per session');
      // wait for j1 to be running
      for (;;) {
        const j = ((await (await api(s.base, t, `/api/jobs/${j1.id}`)).json()) as any).job;
        if (j.stage === 'converting') break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const q = ((await (await api(s.base, t, `/api/jobs/${j2.id}`)).json()) as any).job;
      assert.equal(q.state, 'queued');
      assert.equal(q.queuePosition, 1);
      await api(s.base, t, `/api/jobs/${j2.id}/cancel`, { method: 'POST' });
      await api(s.base, t, `/api/jobs/${j1.id}/cancel`, { method: 'POST' });
      assert.equal((await waitForJob(s.base, t, j1.id)).state, 'cancelled');
      assert.equal((await waitForJob(s.base, t, j2.id)).state, 'cancelled');
      await fs.rm(fx2, { recursive: true, force: true });
    } finally {
      await s.close();
    }
  });
});

import { hashToken } from '../server/storage.ts';
function require_hash(token: string) {
  return hashToken(token);
}
