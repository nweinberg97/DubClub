// Renders public/og.png (1200x630 social card) from the live brand CSS.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto('http://localhost:8787/');
await p.locator('h1').waitFor();
await p.evaluate(() => {
  const line = '<span class="hero__l1">Your words.</span><span class="hero__l2">New accent.</span>';
  document.body.innerHTML = `<div style="width:1200px;height:630px;background:var(--black);padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;position:relative;overflow:hidden">
    <span style="position:absolute;right:-180px;top:-200px;width:640px;height:640px;border:3px solid var(--line);border-radius:50%"></span>
    <span class="wordmark" style="font-size:44px">${'<span class="wordmark__a">DUB</span><span class="wordmark__b">CLUB</span>'}</span>
    <h1 class="echo hero__h" style="font-size:150px;line-height:.84;--echo-step:-.055em">
      <span class="echo__repeat" style="--i:3;animation:none">${line}</span><span class="echo__repeat" style="--i:2;animation:none">${line}</span><span class="echo__repeat" style="--i:1;animation:none">${line}</span><span class="echo__line">${line}</span></h1>
    <span class="sticker" style="position:absolute;right:80px;top:70px;animation:none">No<br>re-records</span></div>`;
});
await p.waitForTimeout(400);
await p.screenshot({ path: 'public/og.png' });
await b.close();
