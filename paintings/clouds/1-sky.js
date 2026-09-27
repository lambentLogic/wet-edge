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
  // Blot clouds out while the wash is wet, as the painter does: a crumpled
  // paper towel pressed down, a fresh crumple each press, rolled a little.
  h.setMode(6);
  for (const [x, y, sz] of [[200, 140, 60], [290, 160, 50], [600, 100, 70], [690, 120, 55], [540, 125, 45], [860, 250, 55], [930, 270, 45], [420, 320, 60], [500, 335, 45]]) {
    V.blotRadius = sz;
    await S.path([[x, y, 0.8], [x + 6, y + 2, 0.8], [x + 10, y + 1, 0.6]], 6);
  }
  h.setMode(0);
  await S.look('clouds-lifted');
  await M.waitDry([[200, 100], [800, 300]]);
  await S.look('sky-dry');
})();
