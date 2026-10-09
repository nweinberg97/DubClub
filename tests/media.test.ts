import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { planSegments, analyzeLevels, probe, toWorkingWav } from '../server/media/ffmpeg.ts';
import { checkExtension, checkProbe, sanitizeDisplayName } from '../server/media/validate.ts';
import { RateLimiter } from '../server/http/util.ts';
import { makeSpeechLike, tmpDir } from './helpers.ts';

describe('planSegments', () => {
  it('keeps short audio whole', () => {
    assert.deepEqual(planSegments(12, [], 30), [[0, 12]]);
  });

  it('cuts in the middle of silences, never longer than maxLen', () => {
    const silences: Array<[number, number]> = [[9, 10], [19, 21], [28, 29], [41, 42]];
    const segs = planSegments(50, silences, 20);
    // Chooses the latest silence that still fits, so segments stay long but never split a word.
    assert.deepEqual(segs, [[0, 20], [20, 28.5], [28.5, 41.5], [41.5, 50]]);
    for (const [a, b] of segs) assert.ok(b - a <= 20);
    assert.equal(segs[0][0], 0);
    assert.equal(segs.at(-1)![1], 50);
  });

  it('falls back to hard cuts when there is no silence', () => {
    const segs = planSegments(45, [], 20);
    assert.deepEqual(segs, [[0, 20], [20, 40], [40, 45]]);
  });

  it('segments are contiguous', () => {
    const segs = planSegments(301.7, [[50, 51], [110, 112], [170, 171]], 60);
    for (let i = 1; i < segs.length; i++) assert.equal(segs[i][0], segs[i - 1][1]);
  });
});

describe('validation', () => {
  it('sanitizes display names and strips paths', () => {
    assert.equal(sanitizeDisplayName('../../etc/passwd'), 'passwd');
    assert.equal(sanitizeDisplayName('C:\\Users\\me\\take<1>.mp3'), 'take1.mp3');
    assert.equal(sanitizeDisplayName(''), 'recording');
    assert.equal(sanitizeDisplayName('a'.repeat(300)).length, 120);
  });

  it('accepts known extensions only', () => {
    assert.equal(checkExtension('Take 3.MP4'), 'mp4');
    assert.throws(() => checkExtension('notes.txt'), /aren’t supported/);
    assert.throws(() => checkExtension('noext'), /no extension/);
  });

  it('rejects probes with no audio, too long, too short', () => {
    const base = { durationSec: 30, formatName: 'mov,mp4,m4a', hasAudio: true, hasVideo: true, audioCodec: 'aac', videoCodec: 'h264' };
    const limits = { maxDurationSec: 60, minDurationSec: 1 };
    assert.doesNotThrow(() => checkProbe(base, limits));
    assert.throws(() => checkProbe({ ...base, hasAudio: false }, limits), /no audio track/);
    assert.throws(() => checkProbe({ ...base, durationSec: 120 }, limits), /1-minute limit/);
    assert.throws(() => checkProbe({ ...base, durationSec: 0.4 }, limits), /under 1s/);
    assert.throws(() => checkProbe({ ...base, formatName: 'image2' }, limits), /isn’t an audio or video format/);
  });
});

describe('levels', () => {
  it('finds the pauses in a speech-like signal', async () => {
    const dir = await tmpDir();
    const src = path.join(dir, 's.wav');
    await makeSpeechLike(src, 12);
    const work = path.join(dir, 'w.wav');
    await toWorkingWav(src, work);
    const p = await probe(work);
    assert.ok(Math.abs(p.durationSec - 12) < 0.05);
    const lv = await analyzeLevels(work, p.durationSec);
    assert.ok(lv.silences.length >= 3, `expected pauses, got ${lv.silences.length}`);
    assert.ok(lv.audibleSec > 7 && lv.audibleSec < 10);
    assert.ok(lv.maxDb > -10);
  });
});

describe('RateLimiter', () => {
  it('allows up to the limit per window', () => {
    const rl = new RateLimiter(2, 1000);
    assert.equal(rl.allow('a', 0), true);
    assert.equal(rl.allow('a', 1), true);
    assert.equal(rl.allow('a', 2), false);
    assert.equal(rl.allow('b', 2), true);
    assert.equal(rl.allow('a', 1001), true);
  });
});
