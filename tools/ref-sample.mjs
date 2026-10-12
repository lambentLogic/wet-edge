// node tools/ref-sample.mjs ref.jpg '[[name,x,y,r],...]': mean colour (sRGB) of the reference,
// fitted to the 1024x768 canvas, in a disc of radius r around each canvas point.
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
const [,, src, list] = process.argv;
const b64 = (await readFile(src)).toString('base64');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
const out = await page.evaluate(async (b64, pts) => {
  const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
  const c = new OffscreenCanvas(1024, 768), g = c.getContext('2d'); g.drawImage(img, 0, 0, 1024, 768);
  const d = g.getImageData(0, 0, 1024, 768).data;
  return pts.map(([n, x, y, r]) => { let s = [0, 0, 0], k = 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) { const o = ((y + j) * 1024 + x + i) * 4; s[0] += d[o]; s[1] += d[o + 1]; s[2] += d[o + 2]; k++; } return `${n.padEnd(22)} ${s.map(v => Math.round(v / k)).join(',')}`; });
}, b64, JSON.parse(list));
console.log(out.join('\n')); await browser.close();
