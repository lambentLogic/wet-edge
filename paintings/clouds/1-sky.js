// Lifted clouds: a blue sky wash, then while it's wet, a thirsty brush
// (Lift mode: squeezed nearly dry, it soaks up wet paint) swirled through it
// to lift soft cloud shapes. Run with tools/paint.mjs --looks.
var S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
var pts = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
let seed = 41; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
window.__paintDone = (async () => {
  h.setPaper('coldPress', 1); h.setTone('natural'); S.clear();
  h.setBrushPreset('mop'); h.setMode(0);
  h.setBrush([['French Ultramarine', 2], ['Phthalo Blue (GS)', 1]]);
  V.brushPigment = 0.35;
  await M.fill([[-10, -10], [1034, -10], [1034, 520], [-10, 520]], { grade: [1.4, 0.4] });
  await S.look('sky-wet');
  // Clouds: clusters of small circular scrubs with a clean damp brush.
  // Quickly, while the wash is still wet (lifting from paint that has
  // dried leaves hard edges): a few quick swirls per cloud, soft mop.
  const wetAt = async () => (await S.sense(500, 200, 20)).water.toFixed(3);
  // Once the shine has gone (a flooded wash rushes back into a lift, or the
  // lifted spot dries first and the wash rings it): the dryer, briefly.
  await M.waitDamp([[300, 200], [700, 200]], { below: 0.12, maxS: 20 });
  console.log('[paint] water before lifting ' + await wetAt());
  h.setBrushPreset('mop'); h.setMode(2); V.brushRadius = 26;
  for (const [cx, cy, w, n] of [[220, 150, 220, 4], [620, 110, 280, 5], [860, 260, 180, 3], [400, 330, 240, 4]]) {
    for (let k = 0; k < n; k++) {
      const x = cx + (rnd() - 0.5) * w, y = cy + (rnd() - 0.3) * w * 0.2 - Math.abs(x - cx) * 0.1, r = 12 + rnd() * 16;
      await S.path(pts(s => [x + Math.cos(s * 9) * r, y + Math.sin(s * 9) * r * 0.6, 0.8], 10), 1);
    }
  }
  console.log('[paint] water after lifting ' + await wetAt());
  h.setMode(0);
  await S.look('clouds-lifted');
  await M.waitDry([[200, 100], [800, 300]]);
  await S.look('sky-dry');
})();
