// Fit a camera (for src/drawing.js) to landmarks on a reference photo.
//   node tools/fit-camera.mjs landmarks.json [mirror]
// landmarks.json: [[[x, y, z], [cx, cy]], ...]: points on the subject in its own frame
// (y up; units as you like, e.g. mm), and where each appears on the photo fitted to
// the 1024x768 canvas (tools/ref-grid.mjs to measure). The subject's width and length
// scales (x, z) are fitted too; mirror -1 flips x (try both). The camera is kept
// upright-ish, in front (+z) and above (y > 60). Prints the camera for D.camera().
// Example: drawings/crab-construction.js (its camera came from this).
import { makeDrawing } from '../src/drawing.js';
import { readFileSync } from 'node:fs';
const D = makeDrawing(null);
const L = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const MIR = +(process.argv[3] ?? 1);
const err = q => { if (q[6] < 300 || q[1] < 60 || q[2] < 0 || Math.abs(q[7]) > 0.7 || q[8] < 0.6 || q[8] > 1.6 || q[9] < 0.6 || q[9] > 1.6) return 1e12; const cam = D.camera({ eye: [q[0], q[1], q[2]], target: [q[3], q[4], q[5]], focal: q[6], up: [Math.sin(q[7]), Math.cos(q[7]), 0] });
  return L.reduce((s, [p, t]) => { const [x, y, z] = cam.project([p[0] * MIR * q[8], p[1], p[2] * q[9]]); return s + (z <= 0 ? 1e9 : (x - t[0]) ** 2 + (y - t[1]) ** 2); }, 0); };
let best = null, be = Infinity, seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let trial = 0; trial < 400; trial++) {
  let q = [(rnd() - 0.5) * 800, 100 + rnd() * 600, rnd() * 800, (rnd() - 0.5) * 60, rnd() * 40, (rnd() - 0.5) * 60, 600 + rnd() * 2400, (rnd() - 0.5) * 1, 1, 1];
  let e = err(q), stepK = 1;
  for (let it = 0; it < 4000; it++) {
    const sc = [40, 40, 40, 5, 5, 5, 100, 0.05, 0.03, 0.03].map(v => v * stepK), c = q.map((v, i) => v + (rnd() - 0.5) * 2 * sc[i]);
    const ec = err(c); if (ec < e) { q = c; e = ec; } else if (it % 200 === 199) stepK *= 0.8;
  }
  if (e < be) { be = e; best = q; }
}
console.log('rms px', Math.sqrt(be / L.length).toFixed(1));
console.log(JSON.stringify({ eye: best.slice(0, 3).map(v => +v.toFixed(1)), target: best.slice(3, 6).map(v => +v.toFixed(1)), focal: +best[6].toFixed(0), roll: +best[7].toFixed(3), sx: +best[8].toFixed(3), sz: +best[9].toFixed(3) }));
const cam = D.camera({ eye: best.slice(0, 3), target: best.slice(3, 6), focal: best[6], up: [Math.sin(best[7]), Math.cos(best[7]), 0] });
for (const [p, t] of L) console.log(p.join(','), '->', cam.project([p[0] * MIR * best[8], p[1], p[2] * best[9]]).slice(0, 2).map(v => v.toFixed(0)).join(','), 'want', t.join(','));
