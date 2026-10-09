// Browser end-to-end test: drives the real UI against a real server and real ffmpeg pipeline.
// Usage: npm run build && (server running) BASE=http://localhost:8787 npm run e2e
// Verifies what a user does: land, navigate, upload, pick accent, consent, dub, A/B, export, delete.
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
const videoFile = path.join(tmp, 'Vlog intro.mp4');
const badFile = path.join(tmp, 'notes.txt');
ff('-f', 'lavfi', '-i', `aevalsrc=${speech}:s=44100:d=24`, audioFile);
ff('-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25:d=7', '-f', 'lavfi', '-i', `aevalsrc=${speech}:s=44100:d=7`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', videoFile);
fs.writeFileSync(badFile, 'not audio');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString());

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  // 1–3. Landing, nav, CTA
  await page.goto(base + '/');
  check('landing loads', (await page.locator('h1').innerText()).includes('Same voice'));
  await page.getByRole('link', { name: 'How it works' }).first().click();
  await page.waitForTimeout(300);
  check('nav anchors work', page.url().endsWith('#how'));
  await page.getByRole('link', { name: 'Get dubbing' }).first().click();
  await page.waitForURL('**/studio');
  check('primary CTA opens the studio', (await page.locator('h1').innerText()) === 'The studio');

  // 7. Accent list reflects engine capabilities
  const caps = await (await page.request.get(base + '/api/capabilities')).json();
  const stamps = await page.getByRole('radio').count();
  check('accent stamps match engine capabilities', stamps === caps.accents.length, `${stamps} stamps, engine reports ${caps.accents.length}`);
  check('engine honesty banner shown', caps.engine.kind !== 'dev-passthrough' || (await page.getByText('Test mode.').count()) > 0);

  // 5–6. Invalid file rejected with a human message
  await page.locator('input[type=file]').setInputFiles(badFile);
  check('unsupported file rejected in the UI', await page.getByText('.txt files aren’t supported').isVisible());

  // 4. Valid upload
  await page.locator('input[type=file]').setInputFiles(audioFile);
  await page.getByText('Creator take.wav').first().waitFor({ timeout: 30_000 });
  check('upload accepted with metadata', await page.getByText('0:24').first().isVisible());

  // Keyboard: arrow through stamps
  await page.getByRole('radio').first().focus();
  await page.keyboard.press('ArrowRight');
  const checkedId = await page.getByRole('radio', { checked: true }).innerText();
  check('stamps are keyboard navigable', checkedId.includes(caps.accents[1]?.label ?? '__'));

  // Consent gate
  const dubBtn = page.getByRole('button', { name: /^Dub it/ });
  check('dub disabled until consent', await dubBtn.isDisabled());
  await page.getByLabel(/It’s my voice/).check();

  // 8–9. Real processing with real status
  await dubBtn.click();
  await page.getByRole('status').first().waitFor();
  await page.getByText('Done. Flip between A and B below.').waitFor({ timeout: 60_000 });
  check('job completes through the real pipeline', true);

  // 10–11. Playback and A/B flip
  const playBtn = page.getByRole('button', { name: /^Play / });
  await playBtn.click();
  await page.waitForTimeout(900);
  const tA = await page.evaluate(() => document.querySelectorAll('audio')[0].currentTime);
  await page.keyboard.press('b');
  await page.waitForTimeout(700);
  const state = await page.evaluate(() => {
    const [a, b] = document.querySelectorAll('audio');
    return { aPaused: a.paused, bPaused: b.paused, bTime: b.currentTime };
  });
  check('original plays', tA > 0.3, `t=${tA.toFixed(2)}s`);
  check('flipping to B keeps position and plays B', state.aPaused && !state.bPaused && state.bTime > tA, JSON.stringify(state));
  await page.getByRole('button', { name: 'Pause' }).click();

  // 12. Audio export
  for (const fmt of ['WAV', 'MP3']) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: `Download ${fmt}` }).click()]);
    const f = path.join(tmp, dl.suggestedFilename());
    await dl.saveAs(f);
    const p = probe(f);
    check(`${fmt} export is a valid file`, Math.abs(Number(p.format.duration) - 24) < 0.4, `${dl.suggestedFilename()} ${Number(p.format.duration).toFixed(2)}s`);
  }

  // Try another accent → back to settings
  await page.getByRole('button', { name: 'Try another accent' }).click();
  check('try another accent returns to settings', await dubBtn.isVisible());

  // 13. Video upload + export
  await page.getByRole('button', { name: 'Delete this take' }).click();
  await page.locator('input[type=file]').setInputFiles(videoFile);
  await page.getByText('Vlog intro.mp4').first().waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Dub it/ }).click();
  await page.getByText('Done. Flip between A and B below.').waitFor({ timeout: 60_000 });
  const [vdl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download video with new audio' }).click()]);
  const vf = path.join(tmp, vdl.suggestedFilename());
  await vdl.saveAs(vf);
  const vp = probe(vf);
  check(
    'video export has picture + replaced audio',
    vp.streams.some((s) => s.codec_type === 'video') && vp.streams.some((s) => s.codec_type === 'audio') && Math.abs(Number(vp.format.duration) - 7) < 0.3,
    vdl.suggestedFilename(),
  );

  // Takes list + 16. deletion via UI hits the server
  const listed = await page.locator('.takes__item').count();
  check('session takes are listed', listed >= 1, `${listed} listed`);
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
  await page.waitForTimeout(500);
  const token = await page.evaluate(() => sessionStorage.getItem('dubclub.session'));
  check('delete everything clears the session', (await page.locator('.takes__item').count()) === 0 && !token);

  // 17. No secrets in client code
  const js = await (await page.request.get(base + '/assets/main.js')).text();
  check('no credentials in client bundle', !/ELEVENLABS_API_KEY|REMOTE_ENGINE_KEY|xi-api-key|sk_[a-z0-9]{10}/i.test(js));

  // 18. Mobile: menu works, nothing overflows
  const m = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await m.goto(base + '/');
  await m.getByRole('button', { name: 'Menu' }).click();
  check('mobile menu opens', await m.getByRole('link', { name: 'Use cases' }).isVisible());
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no horizontal scroll on mobile landing', overflow <= 0, `overflow ${overflow}px`);
  await m.goto(base + '/studio');
  const overflow2 = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no horizontal scroll on mobile studio', overflow2 <= 0, `overflow ${overflow2}px`);

  // 19. Keyboard: first tab hits skip link
  await m.close();
  const k = await browser.newPage();
  await k.goto(base + '/');
  await k.locator('h1').waitFor();
  await k.keyboard.press('Tab');
  check('skip link is first in tab order', (await k.evaluate(() => document.activeElement?.textContent)) === 'Skip to content');
  await k.close();

  // Landing demo: record from a (fake) microphone, dub it on the page
  const micBrowser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const mc = await micBrowser.newContext({ permissions: ['microphone'] });
  const mp = await mc.newPage();
  mp.on('pageerror', (e) => errors.push('mic page: ' + e.message));
  await mp.goto(base + '/#try');
  await mp.getByRole('button', { name: 'Record a take' }).click();
  await mp.waitForTimeout(3200);
  await mp.getByRole('button', { name: /Stop recording/ }).click();
  await mp.getByText(/mic-take-/).first().waitFor({ timeout: 30_000 });
  check('landing demo: mic recording uploads', true);
  await mp.getByLabel(/It’s my voice/).check();
  await mp.getByRole('button', { name: /^Dub it/ }).click();
  await mp.getByText('Done. Flip between A and B below.').waitFor({ timeout: 60_000 });
  check('landing demo: recording dubs end to end', await mp.getByRole('button', { name: 'Download WAV' }).isVisible());
  await micBrowser.close();

  check('no uncaught page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('e2e run', false, e.message);
  await page.screenshot({ path: path.join(tmp, 'failure.png'), fullPage: true });
  console.log('screenshot:', path.join(tmp, 'failure.png'));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
