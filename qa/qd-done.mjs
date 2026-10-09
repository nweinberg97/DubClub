import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
for (const [n, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const c = await b.newContext({ viewport: vp, permissions: ['microphone'] }); const p = await c.newPage();
  await p.goto('http://localhost:8787/');
  await p.getByRole('button', { name: 'Start recording' }).click(); await p.waitForTimeout(2600);
  await p.screenshot({ path: `qa/screens/qd-rec-${n}.png` });
  await p.getByRole('button', { name: 'Stop recording' }).click();
  await p.locator('.qd__takename').waitFor();
  await p.getByLabel(/This is my voice/).check();
  await p.screenshot({ path: `qa/screens/qd-ready-${n}.png` });
  await p.getByRole('button', { name: /^Dub it/ }).click();
  await p.getByText(/version is ready/).waitFor();
  await p.locator('.cmp__play').click(); await p.waitForTimeout(800);
  await p.locator('.qd').screenshot({ path: `qa/screens/qd-done-${n}.png` });
  await c.close();
}
await b.close();
