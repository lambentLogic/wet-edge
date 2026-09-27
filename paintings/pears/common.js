// Shared by the pear stages: shapes and helpers. Each stage runs with
// tools/paint.mjs --open the previous stage's save.
var S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
var log = m => console.log('[paint]', m);
var pts = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
// Pears: centre of the belly, size, tilt (radians).
var PEARS = [
  { x: 330, y: 470, r: 95, tilt: -0.18 },
  { x: 560, y: 450, r: 110, tilt: 0.08 },
  { x: 770, y: 490, r: 85, tilt: 0.25 },
];
var TABLE = 560;
// A pear outline: a round belly and a smaller round top, blended with a
// smooth minimum so there's a waist between them. Traced along rays from
// the belly's centre.
function pearOutline(p, n = 64) {
  const r = p.r, top = [0, -1.15 * r], rt = 0.58 * r, k = 0.35 * r;
  const smin = (a, b) => { const hh = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - hh * hh * k * 0.25; };
  const f = (x, y) => smin(Math.hypot(x, y) - r, Math.hypot(x - top[0], y - top[1]) - rt);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    let t = 0;
    while (t < 3 * r && f(dx * t, dy * t) < 0) t += 0.5;
    const c = Math.cos(p.tilt), s = Math.sin(p.tilt), x = dx * t, y = dy * t;
    out.push([p.x + x * c - y * s, p.y + x * s + y * c]);
  }
  return out;
}
function inPear(p, x, y) {
  const poly = pearOutline(p);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
