// Browser end-to-end test of the core loop: record (or upload) → pick accent → dub → compare → download.
// Runs the real UI against a real server and the real ffmpeg pipeline.
// Usage: npm run build && (server running) BASE=http://localhost:8787 npm run e2e
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = process.env.BASE ?? 'http://localhost:8787';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dubclub-e2e-'));
const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
const speech = '0.35*(sin(2*PI*140*t)+0.5*sin(2*PI*280*t))*(0.6+0.4*sin(2*PI*4*t))*between(mod(t\\,3)\\,0\\,2.2)';
const audioFile = path.join(tmp, 'Creator take.wav');
const badFile = path.join(tmp, 'notes.txt');
ff('-f', 'lavfi', '-i', `aevalsrc=${speech}:s=44100:d=12`, audioFile);
fs.writeFileSync(badFile, 'not audio');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString());
const errors = [];

// Fake microphone so recording can be tested headlessly.
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, permissions: ['microphone'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));

  // Landing + recorder in the hero
  await page.goto(base + '/');
  check('landing loads', /same voice/i.test(await page.locator('h1').innerText()));
  const caps = await (await page.request.get(base + '/api/capabilities')).json();
  const accents = await page.locator('.qd__accent').count();
  check('accent choices match engine', accents === caps.accents.length, `${accents} shown, engine has ${caps.accents.length}`);

  // 1. Record with the mic
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(3200);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.locator('.qd__takename', { hasText: 'Your recording' }).waitFor({ timeout: 30_000 });
  check('mic recording uploads', true);

  // Consent gates the dub
  const dubBtn = page.getByRole('button', { name: /^Dub it/ });
  check('dub disabled until consent', await dubBtn.isDisabled());
  await page.getByLabel(/This is my voice/).check();

  // 2. Pick an accent (keyboard-free click on the second option)
  const second = page.locator('.qd__accent').nth(1);
  await second.click();
  check('accent selectable', (await second.getAttribute('aria-checked')) === 'true');
  const label = (await second.innerText()).replace(/^\w{2}\s*/, '').trim();

  // 3. Dub through the real pipeline
  await dubBtn.click();
  await page.getByText(/version is ready/).waitFor({ timeout: 60_000 });
  check('dub completes through the real pipeline', true, label);

  // Compare: play, flip to original at the same moment
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

  // 4. Download
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download MP3/ }).click()]);
  const f = path.join(tmp, dl.suggestedFilename());
  await dl.saveAs(f);
  const p = probe(f);
  check('download is a valid MP3', p.format.format_name === 'mp3' && Number(p.format.duration) > 2, `${dl.suggestedFilename()} ${Number(p.format.duration).toFixed(1)}s`);

  // Try another accent goes back with the same take
  await page.getByRole('button', { name: 'Try another accent' }).click();
  check('try another accent keeps the take', await page.locator('.qd__takename').isVisible());

  // Studio page: upload path + validation
  await page.getByRole('link', { name: 'Get dubbing' }).first().click();
  await page.waitForURL('**/studio');
  check('nav CTA opens the studio', /the studio/i.test(await page.locator('h1').innerText()));
  await page.locator('input[type=file]').setInputFiles(badFile);
  await page.locator('.notice--error').waitFor({ timeout: 15_000 });
  check('bad file rejected with a message', (await page.locator('.notice--error').innerText()).length > 10);
  await page.locator('input[type=file]').setInputFiles(audioFile);
  await page.locator('.qd__takename', { hasText: 'Creator take.wav' }).waitFor({ timeout: 30_000 });
  check('file upload works', true);
  await page.getByLabel(/This is my voice/).check();
  await page.getByRole('button', { name: /^Dub it/ }).click();
  await page.getByText(/version is ready/).waitFor({ timeout: 60_000 });
  check('uploaded file dubs', true);

  // Re-record deletes the take on the server
  const token = await page.evaluate(() => sessionStorage.getItem('dubclub.session'));
  const listUploads = async () =>
    (await (await page.request.get(base + '/api/uploads', { headers: { authorization: `Bearer ${token}` } })).json()).uploads.map((u) => u.name);
  const before = await listUploads();
  await page.getByRole('button', { name: 'Record a new take' }).click();
  await page.getByRole('button', { name: 'Start recording' }).waitFor();
  await page.waitForTimeout(300);
  const after = await listUploads();
  check('starting over deletes that take from the server', before.includes('Creator take.wav') && !after.includes('Creator take.wav'), `before ${before.length}, after ${after.length}`);

  // Secrets stay server-side
  const js = await (await page.request.get(base + '/assets/main.js')).text();
  check('no credentials in client bundle', !/ELEVENLABS_API_KEY|REMOTE_ENGINE_KEY|xi-api-key|sk_[a-z0-9]{10}/i.test(js));

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

  // Keyboard: skip link first
  const k = await browser.newPage();
  await k.goto(base + '/');
  await k.locator('h1').waitFor();
  await k.keyboard.press('Tab');
  check('skip link is first in tab order', (await k.evaluate(() => document.activeElement?.textContent)) === 'Skip to content');
  await k.close();

  // Offline state when the API can't be reached (e.g. static hosting without the service)
  const o = await browser.newPage();
  await o.route('**/api/**', (r) => r.abort());
  await o.goto(base + '/');
  await o.getByText('The dubbing studio is offline right now.').waitFor({ timeout: 10_000 });
  check('shows a clear offline state without the server', true);
  await o.close();

  check('no uncaught page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('e2e run', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
