// Renders public/og.png (1200x630 social card) from the live brand CSS.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto('http://localhost:8787/');
await p.locator('h1').waitFor();
await p.evaluate(() => {
  document.body.innerHTML = `<div style="width:1200px;height:630px;background:var(--cobalt);color:var(--sleeve);padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box">
    <span class="wordmark" style="font-size:40px"><span class="wordmark__dub">Dub<span class="wordmark__ghost">Dub</span></span><span class="wordmark__club">Club</span></span>
    <h1 class="echo" style="font-size:132px;line-height:.88;letter-spacing:-.055em;--echo-step:.05em"><span class="echo__repeat" style="--i:3;animation:none">Same voice.<br>New postcode.</span><span class="echo__repeat" style="--i:2;animation:none">Same voice.<br>New postcode.</span><span class="echo__repeat" style="--i:1;animation:none">Same voice.<br>New postcode.</span><span class="echo__line">Same voice.<br>New postcode.</span></h1></div>`;
});
await p.waitForTimeout(300);
await p.screenshot({ path: 'public/og.png' });
await b.close();
