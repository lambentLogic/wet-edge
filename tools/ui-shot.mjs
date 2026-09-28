// Screenshot of the whole page (panel included), for checking the UI
// headlessly: node tools/ui-shot.mjs out.png [js to run first]
import puppeteer from 'puppeteer-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:8765/';
const [out = 'ui.png', js = ''] = process.argv.slice(2);
const profile = await mkdtemp(join(tmpdir(), 'watercolor-ui-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: profile, args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: +(process.env.UI_H ?? 1000), deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.__sim?.act, { timeout: 20_000 });
  if (js) await page.evaluate(js);
  await new Promise(r => setTimeout(r, 400));
  // The panel scrolls; show all of it by letting it grow.
  await page.evaluate(() => { document.querySelector('aside').style.height = 'auto'; document.documentElement.style.height = 'auto'; document.body.style.height = 'auto'; document.body.style.alignItems = 'flex-start'; });
  await page.screenshot({ path: out, fullPage: true });
  console.error(`saved ${out}`);
} finally {
  await browser.close();
  await rm(profile, { recursive: true, force: true });
}
