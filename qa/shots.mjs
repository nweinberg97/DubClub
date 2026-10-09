// Visual QA: full-page screenshots at desktop and mobile widths.
import { chromium } from 'playwright';
const base = process.env.BASE ?? 'http://localhost:8787';
const out = process.env.OUT ?? 'qa/screens';
const pages = (process.env.PAGES ?? '/,/studio').split(',');
const browser = await chromium.launch();
const stub = process.env.PHOTO_STUB;
for (const [label, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  // Sandbox can't reach Unsplash: stand in a placeholder photo so layout can be reviewed.
  if (stub) await page.route('https://images.unsplash.com/**', (r) => r.fulfill({ path: stub, contentType: 'image/jpeg' }));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${label}] console:`, m.text()));
  page.on('pageerror', (e) => console.log(`[${label}] pageerror:`, e.message));
  for (const p of pages) {
    await page.goto(base + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const name = p === '/' ? 'home' : p.replace(/\W+/g, '');
    await page.screenshot({ path: `${out}/${name}-${label}.png`, fullPage: true });
    await page.screenshot({ path: `${out}/${name}-${label}-fold.png` });
  }
  await page.close();
}
await browser.close();
