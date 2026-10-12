// node tools/ref-overlay.mjs ref.jpg drawing.png out.png [x0 y0 w]: the drawing's dark lines over the reference (faded), to check
// alignment; with x0 y0 w, the reference's canvas region (x0, y0, w, w*0.75) is zoomed to fill (for a study drawn of a crop).
import puppeteer from 'puppeteer-core';
import { readFile, writeFile } from 'node:fs/promises';
const [,, ref, drw, out, x0 = '0', y0 = '0', w = '1024'] = process.argv;
const b = async f => (await readFile(f)).toString('base64');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
const res = await page.evaluate(async (r, d, x0, y0, w) => {
  const load = async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; };
  const R = await load('data:image/jpeg;base64,' + r), Dr = await load('data:image/png;base64,' + d);
  const c = new OffscreenCanvas(1024, 768), g = c.getContext('2d');
  const k = R.width / 1024; g.drawImage(R, x0 * k, y0 * k, w * k, w * 0.75 * k, 0, 0, 1024, 768); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 0, 1024, 768);
  const t = new OffscreenCanvas(1024, 768), tg = t.getContext('2d'); tg.drawImage(Dr, 0, 0, 1024, 768);
  const id = tg.getImageData(0, 0, 1024, 768), px = id.data;
  for (let k = 0; k < px.length; k += 4) { const l = (px[k] + px[k + 1] + px[k + 2]) / 3, a = Math.max(0, Math.min(1, (235 - l) / 80)); px[k] = 200; px[k + 1] = 0; px[k + 2] = 40; px[k + 3] = a * 255; }
  tg.putImageData(id, 0, 0); g.drawImage(t, 0, 0);
  const blob = await c.convertToBlob({ type: 'image/png' }); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s);
}, await b(ref), await b(drw), +x0, +y0, +w);
await writeFile(out, Buffer.from(res, 'base64')); await browser.close();
