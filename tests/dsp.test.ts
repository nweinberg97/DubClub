import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assemble, cleanWords, encodeWav, fitSpeed, groupPhrases, medianPitch, trimSilence } from '../web/engine/dsp.ts';

const tone = (hz: number, sec: number, rate = 16000, amp = 0.4) => {
  const x = new Float32Array(Math.round(sec * rate));
  for (let i = 0; i < x.length; i++) x[i] = amp * (Math.sin((2 * Math.PI * hz * i) / rate) + 0.5 * Math.sin((4 * Math.PI * hz * i) / rate));
  return x;
};

test('cleanWords drops non-speech tokens and fills missing end times', () => {
  const w = cleanWords(
    [
      { text: ' [Music]', timestamp: [0, 1] },
      { text: ' Hello,', timestamp: [1, 1.4] },
      { text: ' (laughs)', timestamp: [1.4, 1.6] },
      { text: ' John.', timestamp: [1.6, null] },
    ],
    3,
  );
  assert.deepEqual(w.map((x) => x.text), ['Hello,', 'John.']);
  assert.equal(w[1].end, 3);
});

test('groupPhrases splits at pauses, sentence ends and long runs', () => {
  const words = [
    { text: 'Hello,', start: 0, end: 0.4 },
    { text: 'my', start: 0.72, end: 0.88 },
    { text: 'name', start: 0.88, end: 1.12 },
    { text: 'is', start: 1.12, end: 1.36 },
    { text: 'John.', start: 1.36, end: 1.58 },
    { text: 'Today', start: 2.14, end: 2.42 },
    { text: 'rocks', start: 2.42, end: 2.7 },
  ];
  const p = groupPhrases(words);
  assert.deepEqual(p.map((x) => x.text), ['Hello, my name is John.', 'Today rocks']);
  assert.equal(p[1].start, 2.14);
  assert.equal(p[0].end, 1.58);
  assert.equal(groupPhrases(words, { gap: 0.3 })[1].text, 'my name is John.');
  const many = Array.from({ length: 30 }, (_, i) => ({ text: 'w', start: i * 0.2, end: i * 0.2 + 0.15 }));
  assert.ok(groupPhrases(many).every((x) => x.text.split(' ').length <= 14));
});

test('fitSpeed stays in a natural range', () => {
  assert.equal(fitSpeed(2, 2), 1);
  assert.equal(fitSpeed(4, 2), 1.3);
  assert.equal(fitSpeed(1, 2), 0.85);
  assert.equal(fitSpeed(1, 0), 1);
});

test('trimSilence removes quiet edges', () => {
  const x = new Float32Array(16000 * 2);
  x.set(tone(200, 0.5), 8000);
  const t = trimSilence(x, 16000);
  assert.ok(Math.abs(t.length / 16000 - 0.56) < 0.03, String(t.length / 16000));
  assert.equal(trimSilence(new Float32Array(100), 16000).length, 0);
});

test('medianPitch separates low and high voices', () => {
  assert.ok(Math.abs(medianPitch(tone(110, 1), 16000) - 110) < 6);
  assert.ok(Math.abs(medianPitch(tone(220, 1), 16000) - 220) < 10);
  assert.equal(medianPitch(new Float32Array(16000), 16000), 0);
});

test('assemble places phrases in time without overlap and never clips', () => {
  const a = tone(200, 1, 24000, 0.9);
  const b = tone(300, 1, 24000, 0.9);
  const out = assemble([{ audio: a, start: 0.5 }, { audio: b, start: 1.2 }], 24000, 3, 0.5);
  assert.ok(out.length >= 3 * 24000);
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(peak <= 0.951);
  // first phrase starts at 0.5s, second pushed after the first ends (1.5s + gap)
  const firstNonZero = out.findIndex((v) => Math.abs(v) > 1e-4);
  assert.ok(Math.abs(firstNonZero / 24000 - 0.5) < 0.01);
  assert.ok(Math.abs(out[Math.round(1.3 * 24000)]) > 0); // still first phrase
});

test('encodeWav writes a valid 16-bit mono header', () => {
  const buf = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 24000);
  const v = new DataView(buf);
  assert.equal(String.fromCharCode(...new Uint8Array(buf, 0, 4)), 'RIFF');
  assert.equal(v.getUint32(24, true), 24000);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 8);
  assert.equal(v.getInt16(46, true), 16383);
});
