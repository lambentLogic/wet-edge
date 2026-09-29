// Runs a painting script in a private headless Chrome and saves the result,
// so a scripted painting doesn't need (or disturb) a visible browser tab.
//
//   node tools/paint.mjs script.js [--open in.wcpaint] [--save out.wcpaint] [--shot out.png] [--layer prefix]
//                              [--looks dir] [--replay strokes.json]
//   --looks: sim.look('name') calls in the script save dir/NN-name.png
//   sim.note('text') in the script adds an entry to notes/journal.md
//   --replay: replay a stroke recording (Record strokes in the app) after opening
//   (--layer writes prefix-filter-multiply.png and prefix-body-add.png)
//
// The script is evaluated in the page (window.__sim, window.__minds) and
// should set window.__paintDone to a promise; its log (window.__paintLog)
// is printed as it goes. APP_URL and CHROME_PATH as for measure.mjs.

import puppeteer from 'puppeteer-core';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { appendNote } from './journal.mjs';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:8765/';

const args = process.argv.slice(2);
let script = null, open = null, save = null, shot = null, layer = null, looks = null, replay = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--open') open = args[++i];
  else if (args[i] === '--save') save = args[++i];
  else if (args[i] === '--shot') shot = args[++i];
  else if (args[i] === '--layer') layer = args[++i];
  else if (args[i] === '--looks') looks = args[++i];
  else if (args[i] === '--replay') replay = args[++i];
  else script = args[i];
}

const profile = await mkdtemp(join(tmpdir(), 'watercolor-paint-'));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: profile,
  args: ['--enable-unsafe-webgpu'], protocolTimeout: 3_600_000,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 900, deviceScaleFactor: 1 });
  page.on('console', m => {
    const t = m.text();
    if (t.startsWith('[paint]')) console.error(t.slice(8));
    else if (m.type() === 'error' && !t.includes('404')) console.error('[page]', t);
  });
  if (process.env.PRE_JS) await page.evaluateOnNewDocument(process.env.PRE_JS);
  // sim.note('text') in the script: an entry in the painting journal.
  await page.exposeFunction('__saveNote', async text => {
    await appendNote(text, script ? basename(script, '.js') : null);
    console.error('noted in notes/journal.md');
  });
  let lookN = 0;
  if (looks) {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(looks, { recursive: true });
    await page.exposeFunction('__saveLook', async (name, b64) => {
      const f = `${looks}/${String(++lookN).padStart(2, '0')}-${name}.png`;
      await writeFile(f, Buffer.from(b64, 'base64'));
      console.error(`look ${f}`);
    });
  }
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.__sim?.open, { timeout: 20_000 });
  if (open) {
    const b64 = (await readFile(open)).toString('base64');
    await page.evaluate(async b64 => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      await window.__sim.open(new Blob([bytes]));
    }, b64);
    console.error(`opened ${open}`);
  }
  if (replay) {
    const rec = JSON.parse(await readFile(replay, 'utf8'));
    await page.evaluate(async rec => { await window.__sim.replay(rec); await new Promise(r => setTimeout(r, 500)); }, rec);
    console.error(`replayed ${rec.events.length} events`);
  }
  if (script) {
    await page.evaluate(await readFile(script, 'utf8'));
    await page.evaluate(() => window.__paintDone);
  }
  if (save) {
    const b64 = await page.evaluate(async () => {
      const buf = new Uint8Array(await (await window.__sim.paintingBlob()).arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    });
    await writeFile(save, Buffer.from(b64, 'base64'));
    console.error(`saved ${save}`);
  }
  if (layer) {
    const parts = await page.evaluate(async () => {
      const b64 = async blob => { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); };
      const { filter, body } = await window.__sim.layerBlobs();
      return { filter: await b64(filter), body: await b64(body) };
    });
    await writeFile(`${layer}-filter-multiply.png`, Buffer.from(parts.filter, 'base64'));
    await writeFile(`${layer}-body-add.png`, Buffer.from(parts.body, 'base64'));
    console.error(`saved ${layer}-filter-multiply.png and ${layer}-body-add.png`);
  }
  if (shot) {
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => { document.getElementById('stage').style.width = document.getElementById('canvas').width + 'px'; });
    await new Promise(r => setTimeout(r, 300));
    await (await page.$('#stage')).screenshot({ path: shot });
    console.error(`saved ${shot}`);
  }
} finally {
  await browser.close();
  await rm(profile, { recursive: true, force: true });
}
