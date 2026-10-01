// Mist scumbled over the second pass (open okefenokee-2.wcpaint with
// --open): titanium buff tinted with the sky's rose and ultramarine,
// dragged dry and light across the forest base, the distant trees and the
// far channel, so the dark shows through the broken paint as haze. (The
// painter's idea; lifting can only take the dark away.)
const S = window.__sim, h = S.headless, V = S.values;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
const pts = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
const P = ([x, y]) => [x, y * 768 / 682];
let seed = 21; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
window.__paintDone = (async () => {
  S.tool('paint'); h.setBrushPreset('round');
  h.setBrush([['Titanium Buff', 6], ['Quinacridone Rose', 1], ['French Ultramarine', 1]]);   // white gouache covered too strongly (the painter: titanium buff works better)
  V.dipLoad = 0.12; V.brushPigment = 0.25; V.brushFirmness = 0.3;
  log('scumble: light, fast, dry horizontal drags of tinted white across the forest base');
  for (let k = 0; k < 24; k++) {
    const y = 288 + rnd() * 30, x0 = 120 + rnd() * 600, len = 150 + rnd() * 300;
    V.brushRadius = 10 + rnd() * 8;
    h.lift(); await S.path(pts(t => { const [x, yy] = P([x0 + len * t, y + 4 * Math.sin(t * 6 + k)]); return [x, yy, 0.25 + 0.15 * Math.sin(Math.PI * t)]; }, 12), 1);
  }
  log('a thinner veil drifting up into the trunks, and over the far channel');
  V.brushPigment = 0.15;
  for (let k = 0; k < 8; k++) {
    const y = 255 + rnd() * 35, x0 = 420 + rnd() * 500, len = 100 + rnd() * 200;
    V.brushRadius = 8 + rnd() * 6;
    h.lift(); await S.path(pts(t => { const [x, yy] = P([x0 + len * t, y + 3 * Math.sin(t * 5 + k)]); return [x, yy, 0.2]; }, 10), 1);
  }
  for (let k = 0; k < 5; k++) {
    const x0 = 560 + rnd() * 380, y = 460 + (x0 - 540) * 0.12 + rnd() * 20;
    V.brushRadius = 7 + rnd() * 5;
    h.lift(); await S.path(pts(t => { const [x, yy] = P([x0 + 120 * t, y + 6 * t]); return [x, yy, 0.2]; }, 8), 1);
  }
  V.dipLoad = 1;
  await S.skipTo('dry');
  await S.look('scumbled');
  log('done');
})();
