import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { ElevenLabsEngine } from '../server/engines/elevenlabs.ts';
import { RemoteEngine } from '../server/engines/remote.ts';
import { probe } from '../server/media/ffmpeg.ts';
import { api, makeSpeechLike, newSession, startServer, tmpDir, upload, waitForJob } from './helpers.ts';

/**
 * A reference implementation of docs/ENGINE_CONTRACT.md, used to prove the remote engine
 * speaks the contract correctly. It "converts" by echoing the audio — it is a protocol test,
 * not a model.
 */
function contractServer(opts: { failFirst?: number; badRequest?: boolean; key?: string } = {}) {
  const calls: Array<{ accent: string | null; strength: string | null; bytes: number; auth?: string }> = [];
  let failures = opts.failFirst ?? 0;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    if (opts.key && req.headers.authorization !== `Bearer ${opts.key}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 'auth', message: 'bad key' } }));
    }
    if (url.pathname === '/v1/capabilities') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({
          name: 'contract-echo',
          preservesSpeaker: true,
          supportsStrength: true,
          maxSegmentSec: 10,
          accents: [{ id: 'en-GB', note: 'Southern English' }, { id: 'en-AU' }],
        }),
      );
    }
    if (url.pathname === '/v1/convert' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = Buffer.concat(chunks);
      calls.push({ accent: url.searchParams.get('accent'), strength: url.searchParams.get('strength'), bytes: body.length, auth: req.headers.authorization });
      if (opts.badRequest) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { code: 'too_noisy', message: 'Input too noisy for conversion' } }));
      }
      if (failures > 0) {
        failures--;
        res.writeHead(503);
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'audio/wav' });
      return res.end(body);
    }
    res.writeHead(404);
    res.end();
  });
  return {
    calls,
    async start() {
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    },
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}

let fx: string;
let clip: string;
before(async () => {
  fx = await tmpDir();
  clip = path.join(fx, 'clip.wav');
  await makeSpeechLike(clip, 26);
});
after(async () => fs.rm(fx, { recursive: true, force: true }));

describe('remote engine (contract)', () => {
  it('reads capabilities and exposes only what the engine supports', async () => {
    const cs = contractServer({ key: 'k123' });
    const url = await cs.start();
    try {
      const e = new RemoteEngine(url, 'k123', 30);
      await e.refresh(true);
      const d = e.describe();
      assert.equal(d.kind, 'accent-conversion');
      assert.equal(d.ready, true);
      assert.equal(d.supportsStrength, true);
      assert.equal(e.maxSegmentSec, 10);
      const accents = await e.accents();
      assert.deepEqual(accents.map((a) => a.id), ['en-GB', 'en-AU']);
      assert.equal(accents[0].label, 'British');
      assert.equal(accents[0].note, 'Southern English');
    } finally {
      await cs.stop();
    }
  });

  it('is not ready when unconfigured or unreachable', async () => {
    const e = new RemoteEngine('', '', 30);
    await e.refresh(true);
    assert.equal(e.describe().ready, false);
    const e2 = new RemoteEngine('http://127.0.0.1:1', '', 30);
    await e2.refresh(true);
    assert.equal(e2.describe().ready, false);
    assert.match(e2.describe().readyNote ?? '', /unreachable/);
  });

  it('runs a full job through the contract, segmenting to the engine limit, with retries', async () => {
    const cs = contractServer({ failFirst: 1, key: 'k123' });
    const url = await cs.start();
    const e = new RemoteEngine(url, 'k123', 30);
    await e.refresh(true);
    const s = await startServer(e);
    try {
      const t = await newSession(s.base);
      const { upload: u } = (await (await upload(s.base, t, clip)).json()) as any;
      const r = await api(s.base, t, '/api/jobs', { method: 'POST', body: JSON.stringify({ uploadId: u.id, accent: 'en-AU', strength: 0.4, consent: true }) });
      assert.equal(r.status, 202);
      const done = await waitForJob(s.base, t, ((await r.json()) as any).job.id);
      assert.equal(done.state, 'done', JSON.stringify(done.error));
      assert.equal(done.strength, 0.4);
      assert.equal(done.engine.config.model, 'contract-echo');
      assert.ok(done.segments.total >= 3);
      assert.ok(cs.calls.every((c) => c.accent === 'en-AU' && c.strength === '0.4' && c.auth === 'Bearer k123'));
      assert.equal(cs.calls.length, done.segments.total + 1, 'one transient 503 retried');
      const wav = await api(s.base, t, `/api/jobs/${done.id}/export?format=wav`);
      const out = path.join(fx, 'remote.wav');
      await fs.writeFile(out, Buffer.from(await wav.arrayBuffer()));
      assert.ok(Math.abs((await probe(out)).durationSec - 26) < 0.3);
    } finally {
      await s.close();
      await cs.stop();
    }
  });

  it('surfaces engine errors to the user without retrying non-retryable ones', async () => {
    const cs = contractServer({ badRequest: true });
    const url = await cs.start();
    const e = new RemoteEngine(url, '', 30);
    await e.refresh(true);
    const s = await startServer(e);
    try {
      const t = await newSession(s.base);
      const { upload: u } = (await (await upload(s.base, t, clip)).json()) as any;
      const r = await api(s.base, t, '/api/jobs', { method: 'POST', body: JSON.stringify({ uploadId: u.id, accent: 'en-GB', consent: true }) });
      const done = await waitForJob(s.base, t, ((await r.json()) as any).job.id);
      assert.equal(done.state, 'failed');
      assert.equal(done.error.code, 'engine_error');
      assert.match(done.error.message, /too noisy/);
      assert.equal(cs.calls.length, 1);
      // the original is untouched and still downloadable as a preview
      assert.equal((await api(s.base, t, `/api/uploads/${u.id}/preview`)).status, 200);
    } finally {
      await s.close();
      await cs.stop();
    }
  });
});

describe('elevenlabs voice-swap engine', () => {
  it('describes itself honestly as voice swap', () => {
    const e = new ElevenLabsEngine('key', 'eleven_multilingual_sts_v2', { 'en-GB': 'v1' });
    const d = e.describe();
    assert.equal(d.kind, 'voice-swap');
    assert.equal(d.preservesSpeaker, false);
    assert.equal(d.external, true);
    assert.equal(new ElevenLabsEngine('', 'm', {}).describe().ready, false);
  });

  it('sends the segment to the mapped voice with the key server-side', async () => {
    const seenBox: { v: { url: string; key: string | null; model: unknown; hasAudio: boolean } | null } = { v: null };
    const fakeFetch = (async (url: string, init: RequestInit) => {
      const form = init.body as FormData;
      seenBox.v = {
        url,
        key: new Headers(init.headers).get('xi-api-key'),
        model: form.get('model_id'),
        hasAudio: form.get('audio') instanceof Blob,
      };
      return new Response(new Uint8Array(2048), { status: 200 });
    }) as unknown as typeof fetch;
    const e = new ElevenLabsEngine('secret', 'eleven_multilingual_sts_v2', { 'en-GB': 'voiceGB' }, fakeFetch);
    const outDir = await tmpDir();
    const out = await e.transformSegment({ inputWav: clip, outDir, accent: 'en-GB', strength: null, signal: new AbortController().signal });
    assert.ok(out.endsWith('.mp3'));
    const seen = seenBox.v;
    assert.ok(seen);
    assert.match(seen!.url, /\/v1\/speech-to-speech\/voiceGB\?output_format=mp3_44100_128$/);
    assert.equal(seen!.key, 'secret');
    assert.equal(seen!.model, 'eleven_multilingual_sts_v2');
    assert.equal(seen!.hasAudio, true);
  });
});
