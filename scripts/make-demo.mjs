// Makes the landing-page sample: a line spoken by a sample American voice ("John"), then that exact
// recording run through the real Dub Club studio in Chromium to get the British cut.
// Output: <OUT>/demo/{original.mp3, en-GB.mp3, manifest.json} — commit into public/demo/ to publish.
// Usage (server running, engine installed): BASE=http://localhost:8787 OUT=./demo-out node scripts/make-demo.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BASE ?? 'http://localhost:8787';
const out = path.resolve(process.env.OUT ?? 'demo-out', 'demo');
fs.mkdirSync(out, { recursive: true });
const TEXT = 'Hey, my name is John — and welcome back to the channel.';
const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);

const { KokoroTTS } = await import('kokoro-js');
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
const john = await tts.generate(TEXT, { voice: 'am_michael' });
const originalWav = path.join(out, 'John.wav');
await john.save(originalWav);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base + '/studio');
await page.locator('input[type=file]').setInputFiles(originalWav);
await page.locator('.qd__takename', { hasText: 'John.wav' }).waitFor({ timeout: 30_000 });
await page.getByLabel(/This is my voice/).check();
await page.getByRole('radio', { name: /British/ }).click();
await page.getByRole('button', { name: /^Dub it British/ }).click();
await page.getByText(/version is ready/).waitFor({ timeout: 15 * 60_000 });
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download WAV/ }).click()]);
const gbWav = path.join(out, 'gb.wav');
await dl.saveAs(gbWav);
await browser.close();

ff('-i', originalWav, '-ac', '1', '-b:a', '128k', path.join(out, 'original.mp3'));
ff('-i', gbWav, '-ac', '1', '-b:a', '128k', path.join(out, 'en-GB.mp3'));
fs.rmSync(originalWav);
fs.rmSync(gbWav);
fs.writeFileSync(
  path.join(out, 'manifest.json'),
  JSON.stringify(
    {
      speaker: 'John',
      text: TEXT,
      original: 'original.mp3',
      cuts: { 'en-GB': 'en-GB.mp3' },
      note: 'John is a sample American voice. The British cut is that exact recording run through Dub Club in a browser.',
    },
    null,
    2,
  ) + '\n',
);
console.log('demo written to', out);
