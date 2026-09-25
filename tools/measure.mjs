// Runs calibration probes in a private headless Chrome (WebGPU on Metal),
// independent of any visible browser window.
//
//   python3 -m http.server 8765 &     # serve the app
//   node tools/measure.mjs                         # all probes, defaults
//   node tools/measure.mjs edge bleed              # selected probes
//   node tools/measure.mjs edge --set marangoni=0  # with knob overrides
//   node tools/measure.mjs --paper vellum          # on another paper preset
//
// CHROME_PATH overrides the browser; APP_URL overrides the address.

import puppeteer from 'puppeteer-core';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:8765/';

const args = process.argv.slice(2);
const overrides = {};
const names = [];
let paper = 'coldPress';
let shot = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--paper') paper = args[++i];
  else if (args[i] === '--shot') shot = args[++i];
  else if (args[i] === '--set') {
    const [k, v] = args[++i].split('=');
    overrides[k] = parseFloat(v);
  } else names.push(args[i]);
}

const profile = await mkdtemp(join(tmpdir(), 'watercolor-measure-'));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  userDataDir: profile,
  args: ['--enable-unsafe-webgpu'],
  protocolTimeout: 600_000,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 900, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.__sim?.headless, { timeout: 20_000 });
  await page.evaluate(await readFile(new URL('./probes.js', import.meta.url), 'utf8'));

  const all = await page.evaluate(() => Object.keys(window.__probes).filter(k => k !== 'withValues'));
  const run = names.length ? names : all;
  const results = {};
  for (const name of run) {
    const t0 = Date.now();
    results[name] = await page.evaluate(
      (name, over, paper) => window.__probes.withValues(over, () => window.__probes[name](paper)),
      name, overrides, paper,
    );
    console.error(`${name}: ${JSON.stringify(results[name])}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  if (shot) {
    // Canvas at native resolution (1 px = 1 cell = 0.2 mm), after a frame
    // has rendered the final state.
    await new Promise(r => setTimeout(r, 300));
    const el = await page.$('#canvas');
    await page.evaluate(() => { const c = document.getElementById('canvas'); c.style.width = c.width + 'px'; c.style.maxWidth = 'none'; c.style.maxHeight = 'none'; });
    await new Promise(r => setTimeout(r, 300));
    await el.screenshot({ path: shot });
    console.error(`saved ${shot}`);
  }
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await rm(profile, { recursive: true, force: true });
}
