import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const f = '/tmp/qa-take.wav';
execFileSync('ffmpeg', ['-loglevel','error','-y','-f','lavfi','-i',"aevalsrc=0.35*(sin(2*PI*140*t)+0.5*sin(2*PI*280*t))*(0.4+0.6*abs(sin(2*PI*1.3*t)))*between(mod(t\\,3)\\,0\\,2.2):s=44100:d=20", f]);
const b = await chromium.launch();
for (const [n, vp] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]) {
  const p = await b.newPage({ viewport: vp });
  await p.goto('http://localhost:8787/studio'); await p.locator('h1').waitFor();
  await p.locator('input[type=file]').setInputFiles(f);
  await p.getByText('qa-take.wav').first().waitFor();
  await p.getByLabel(/It’s my voice/).check();
  await p.getByRole('button', { name: /^Run it back/ }).click();
  await p.waitForTimeout(150);
  await p.screenshot({ path: `qa/screens/working-${n}.png`, fullPage: true });
  await p.getByText('Done. Flip').waitFor();
  await p.getByRole('button', { name: /^Play / }).click(); await p.waitForTimeout(2500); await p.keyboard.press('b'); await p.waitForTimeout(800);
  console.log(n, await p.evaluate(() => document.activeElement?.className + '|' + document.activeElement?.textContent?.slice(0,30)));
  await p.screenshot({ path: `qa/screens/done-${n}.png`, fullPage: true });
  await p.close();
}
await b.close();
