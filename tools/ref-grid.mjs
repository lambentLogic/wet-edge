// node tools/ref-grid.mjs ref.jpg out.png [x0 y0 w] [step]: the reference fitted to the 1024x768
// canvas, then the canvas region (x0, y0, w, w*0.75) zoomed to fill the image, with a grid
// labelled in canvas coordinates every `step` cells, for measuring shapes off a reference.
import puppeteer from 'puppeteer-core';
import { readFile, writeFile } from 'node:fs/promises';
const [,, src, out, x0 = '0', y0 = '0', w = '1024', step = '64'] = process.argv;
const b64 = (await readFile(src)).toString('base64');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 768 });
await page.setContent(`<canvas id=c width=1024 height=768></canvas><style>body{margin:0}</style>`);
const res = await page.evaluate(async (b64, x0, y0, w, step) => {
  const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
  const k = img.width / 1024, z = 1024 / w, c = document.getElementById('c'), g = c.getContext('2d');
  g.drawImage(img, x0 * k, y0 * k, w * k, w * 0.75 * k, 0, 0, 1024, 768);
  g.strokeStyle = 'rgba(255,255,0,0.5)'; g.fillStyle = 'yellow'; g.font = 'bold 12px sans-serif';
  for (let X = Math.ceil(x0 / step) * step; X <= x0 + w; X += step) { const x = (X - x0) * z; g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, 768); g.stroke(); g.fillText(X, x + 2, 12); }
  for (let Y = Math.ceil(y0 / step) * step; Y <= y0 + w * 0.75; Y += step) { const y = (Y - y0) * z; g.beginPath(); g.moveTo(0, y + .5); g.lineTo(1024, y + .5); g.stroke(); g.fillText(Y, 2, y - 2); }
  return c.toDataURL('image/png').split(',')[1];
}, b64, +x0, +y0, +w, +step);
await writeFile(out, Buffer.from(res, 'base64'));
await browser.close();
