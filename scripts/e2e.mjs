// Browser end-to-end test of the real product, with the real open-source models:
//   record (fake mic playing a spoken WAV) → pick British → dub in the browser → compare → download WAV,
//   then transcribe the downloaded dub in Node to prove the words survived.
// Needs: npm install (engine packages), npm run build, a server on BASE, ffmpeg + espeak-ng, network to huggingface.co.
// Usage: BASE=http://localhost:8787 OUT=./e2e-out npm run e2e
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = process.env.BASE ?? 'http://localhost:8787';
const out = path.resolve(process.env.OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'dubclub-e2e-')));
fs.mkdirSync(out, { recursive: true });
const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
const LINE = 'Hello, my name is John. Today I want to see if I can pull off a British accent.';

// Spoken input: espeak-ng, then padded with silence so the fake mic loops cleanly.
execFileSync('espeak-ng', ['-v', 'en-us', '-s', '150', '-w', path.join(out, 'espeak.wav'), LINE]);
const speechFile = path.join(out, 'input.wav');
ff('-i', path.join(out, 'espeak.wav'), '-af', 'apad=pad_dur=4', '-ar', '48000', '-ac', '1', speechFile);
const uploadFile = path.join(out, 'Creator take.wav');
fs.copyFileSync(path.join(out, 'espeak.wav'), uploadFile);
const badFile = path.join(out, 'notes.txt');
fs.writeFileSync(badFile, 'not audio');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString());
const errors = [];
const requests = [];
const metrics = {};

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${speechFile}`],
});

async function transcribe(file) {
  const { pipeline } = await import('@huggingface/transformers');
  const asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base_timestamped', { dtype: 'q8' });
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-']);
  const r = await asr(new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), { language: 'english' });
  return r.text.trim();
}

async function waitForDub(page, label) {
  const t0 = Date.now();
  let maxMb = 0;
  const poll = setInterval(async () => {
    const t = await page.locator('.qd__progress [role=status]').innerText().catch(() => '');
    const m = /of (\d+) MB/.exec(t);
    if (m) maxMb = Math.max(maxMb, Number(m[1]));
  }, 500);
  try {
    await page.getByText(/version is ready/).waitFor({ timeout: 15 * 60_000 });
  } finally {
    clearInterval(poll);
  }
  metrics[`${label}_seconds`] = (Date.now() - t0) / 1000;
  if (maxMb) metrics.model_download_mb = maxMb;
  return (Date.now() - t0) / 1000;
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, permissions: ['microphone'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('  [console]', m.text().slice(0, 300)));
  ctx.on('request', (r) => requests.push({ url: r.url(), method: r.method() }));

  await page.goto(base + '/');
  check('landing loads', /your words/i.test(await page.locator('h1').innerText()));
  check('two accents offered', (await page.locator('.qd__accent').count()) === 2);

  // 1. Record from the (fake) mic
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(7500);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.locator('.qd__takename', { hasText: 'Your recording' }).waitFor({ timeout: 30_000 });
  check('mic recording captured', true);

  const dubBtn = page.getByRole('button', { name: /^Dub it/ });
  check('dub disabled until consent', await dubBtn.isDisabled());
  await page.getByLabel(/This is my voice/).check();
  await page.getByRole('radio', { name: /British/ }).click();

  // 2. Dub in the browser with the real models
  await dubBtn.click();
  const s1 = await waitForDub(page, 'first_dub');
  check('British dub completes in the browser', true, `${s1.toFixed(1)}s including first model download`);
  const heard = await page.locator('.qd__result .qd__heard').innerText();
  check('engine heard the words', /john/i.test(heard) && /british/i.test(heard), heard);

  // Compare flips at the same moment
  await page.locator('.cmp__play').click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => {
    const [a, b] = document.querySelectorAll('.cmp audio');
    return { aPlaying: !a.paused, bPaused: b.paused, aTime: a.currentTime };
  });
  check('compare plays and flips at the same moment', st.aPlaying && st.bPaused && st.aTime > 0.5, JSON.stringify(st));
  await page.locator('.cmp__play').click();

  // 3. Download
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download WAV/ }).click()]);
  const gb = path.join(out, 'dub-british.wav');
  await dl.saveAs(gb);
  const p = probe(gb);
  const dur = Number(p.format.duration);
  check('download is a valid WAV', p.format.format_name === 'wav' && dur > 3, `${dl.suggestedFilename()} ${dur.toFixed(2)}s`);

  // 4. Another accent, models already loaded
  await page.getByRole('button', { name: 'Try another accent' }).click();
  await page.getByRole('radio', { name: /American/ }).click();
  await page.getByRole('button', { name: /^Dub it American/ }).click();
  const s2 = await waitForDub(page, 'second_dub');
  check('second accent reuses loaded models', s2 < s1, `${s2.toFixed(1)}s`);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download WAV/ }).click()]);
  await dl2.saveAs(path.join(out, 'dub-american.wav'));

  // 5. Studio: upload path + validation
  await page.getByRole('link', { name: 'Get dubbing' }).first().click();
  await page.waitForURL('**/studio');
  await page.locator('input[type=file]').setInputFiles(badFile);
  await page.locator('.notice--error').waitFor({ timeout: 15_000 });
  check('bad file rejected with a message', (await page.locator('.notice--error').innerText()).length > 10);
  await page.locator('input[type=file]').setInputFiles(uploadFile);
  await page.locator('.qd__takename', { hasText: 'Creator take.wav' }).waitFor({ timeout: 30_000 });
  await page.getByLabel(/This is my voice/).check();
  await page.getByRole('button', { name: /^Dub it/ }).click();
  await waitForDub(page, 'upload_dub');
  check('uploaded file dubs', true);

  // Privacy: nothing went anywhere except our own origin and the model host, and nothing was POSTed.
  const origin = new URL(base).origin;
  const foreign = requests.filter((r) => !r.url.startsWith(origin) && !/^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)\//.test(r.url) && !r.url.startsWith('blob:') && !r.url.startsWith('data:') && !r.url.startsWith('https://images.unsplash.com/'));
  check('only talks to this site and the model host', foreign.length === 0, foreign.slice(0, 3).map((r) => r.url).join(' '));
  const posts = requests.filter((r) => r.method !== 'GET' && r.method !== 'HEAD');
  check('no audio uploaded (no POST/PUT requests)', posts.length === 0, posts.slice(0, 3).map((r) => `${r.method} ${r.url}`).join(' '));
  metrics.model_requests = requests.filter((r) => /huggingface|hf\.co/.test(r.url)).length;

  // Mobile layout + menu
  const m = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await m.goto(base + '/');
  await m.getByRole('button', { name: 'Menu' }).click();
  check('mobile menu opens', await m.getByRole('link', { name: 'Use cases' }).isVisible());
  for (const pth of ['/', '/studio']) {
    await m.goto(base + pth);
    const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`no horizontal scroll on mobile ${pth}`, over <= 0, `overflow ${over}px`);
  }
  await m.close();

  const k = await browser.newPage();
  await k.goto(base + '/');
  await k.locator('h1').waitFor();
  await k.keyboard.press('Tab');
  check('skip link is first in tab order', (await k.evaluate(() => document.activeElement?.textContent)) === 'Skip to content');
  await k.close();

  check('no uncaught page errors', errors.length === 0, errors.join(' | '));
  await browser.close();

  // 6. Independent check: transcribe the downloaded dub in Node.
  const said = await transcribe(gb);
  metrics.british_transcript = said;
  const want = ['name', 'john', 'today', 'british', 'accent'];
  const missing = want.filter((w) => !said.toLowerCase().includes(w));
  check('downloaded dub says the same words', missing.length <= 1, `"${said}"${missing.length ? ' missing: ' + missing.join(',') : ''}`);
} catch (e) {
  check('e2e run', false, e.message.split('\n')[0]);
  await browser.close().catch(() => {});
}

fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, metrics }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify(metrics, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
