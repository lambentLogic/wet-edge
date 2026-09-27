// Misty morning on a lake: fog made with the spray bottle. Pale sky dropped
// into misted paper; three ranges of pines, the far ones painted into mist
// so they melt, the near ones on dry paper so they stay crisp; the water
// misted and laid in horizontal strokes with reflections; a spray over the
// damp far range to break it up. Run with tools/paint.mjs.
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
let seed = 29; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pts = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
const SHORE = 470;

// Spray a band: passes of the mist across it.
async function mist(y0, y1, step = 60) {
  h.setMode(4);
  for (let y = y0, d = 1; y <= y1; y += step, d = -d) {
    await S.path(pts(s => [d > 0 ? -60 + s * 1144 : 1084 - s * 1144, y, 1], 12), 1);
  }
  h.setMode(0);
}

// A range of pines as a silhouette: a jagged treetop line (spires of
// varying height), filled with close vertical strokes that start as a point
// at the line (light pressure) and press down into the mass below.
function treeline(base, height, spacing) {
  const tops = [];
  for (let x = -20; x <= 1044; x += spacing * (0.6 + 0.8 * rnd())) tops.push([x, base - height * (0.35 + 0.65 * rnd())]);
  return x => {   // top of the silhouette at x: spires with sloping sides
    let t = base;
    for (const [px, py] of tops) t = Math.min(t, py + Math.abs(x - px) * 2.4);
    return t;
  };
}
async function pines(top, bottom, mix, pigment, radius, dx = null) {
  h.setBrushPreset('round'); V.dipLoad = 1;
  h.setBrush(mix); V.brushPigment = pigment; V.brushRadius = radius;
  for (let x = -10; x <= 1034; x += dx ?? radius * 0.9) {
    const t = top(x);
    if (t >= bottom - 2) continue;   // no trees here
    await S.path([[x, t, 0.05], [x, t + radius * 2.5, 0.8], [x, bottom, 1]], 1);
  }
}

window.__paintDone = (async () => {
  h.setPaper('coldPress', 1); h.setTone('natural'); S.clear();

  log('sky: mist the paper, then drop pale warm and cool colour in');
  await mist(0, SHORE, 55);
  h.setBrushPreset('mop'); V.dipLoad = 1;
  h.setBrush([['Transparent Yellow Oxide', 1], ['Quinacridone Rose', 1]]); V.brushPigment = 0.12;
  for (let y = SHORE - 150; y <= SHORE - 40; y += 40) await S.path(pts(s => [-20 + s * 1064, y + Math.sin(s * 4) * 10, 1], 10), 2);
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1]]); V.brushPigment = 0.14;
  for (let y = 20; y <= SHORE - 200; y += 36) await S.path(pts(s => [-20 + s * 1064, y + Math.sin(s * 3 + y) * 12, 1], 10), 2);

  log('far pines: straight into freshly misted, still-damp sky, so they melt');
  await mist(SHORE - 170, SHORE, 45);
  await pines(treeline(SHORE - 20, 110, 26), SHORE + 4, [['French Ultramarine', 2], ['Perylene Violet', 1], ['Raw Umber', 1]], 0.22, 6);
  log(`sky and far range dry after ${(await M.waitDry([[500, 200], [500, SHORE - 60]])).toFixed(1)}s`);

  log('middle pines: on dry paper, lower and to the right, then a light spray to soften them');
  const mid = treeline(SHORE + 2, 140, 34);
  await pines(x => (x < 380 ? SHORE + 20 : mid(x)), SHORE + 6, [['Perylene Green', 1], ['French Ultramarine', 1], ['Raw Umber', 1]], 0.4, 6);
  await M.waitDamp([[700, SHORE - 30]], { below: 0.08 });
  await mist(SHORE - 120, SHORE - 20, 70);

  log('water: mist it, then horizontal strokes, lighter toward the far shore');
  await M.waitDry([[500, SHORE - 60]]);
  await mist(SHORE + 10, 778, 60);
  h.setBrushPreset('mop'); V.dipLoad = 1;
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1]]);
  for (let y = SHORE + 20; y < 778; y += 30) {
    V.brushPigment = 0.06 + 0.16 * (y - SHORE) / (778 - SHORE);
    await S.path(pts(s => [-20 + s * 1064, y + (rnd() - 0.5) * 4, 1], 10), 2);
  }
  log('reflections of the middle pines, pulled down into the damp water');
  h.setBrushPreset('round'); V.brushRadius = 6;
  h.setBrush([['Perylene Green', 1], ['French Ultramarine', 1], ['Raw Umber', 1]]); V.brushPigment = 0.25;
  for (let x = 390; x <= 1034; x += 7) {
    const len = (SHORE + 6 - mid(x)) * 0.9;
    if (len < 6) continue;
    await S.path([[x, SHORE + 12, 1], [x + (rnd() - 0.5) * 3, SHORE + 12 + len, 0.1]], 1);
  }

  log('near pines: crisp, dark, on dry paper at the left');
  await M.waitDry([[300, 600], [700, 650]]);
  h.setBrushPreset('rigger'); V.dipLoad = 1; h.setBrush([['Perylene Green', 2], ['Mars Black', 1]]); V.brushPigment = 0.7;
  for (const [x, ht] of [[70, 420], [130, 330], [900, 260]]) {
    const y = 790;
    V.brushRadius = 4;
    await S.path(pts(s => [x + s * 3, y - s * ht, 1 - 0.7 * s], 8), 2);
    V.brushRadius = 3;
    for (let t = 0.2; t < 0.97; t += 0.03 + rnd() * 0.02) {
      const cy = y - ht * t, len = (1 - t) * 60 + 8 + rnd() * 10;
      for (const side of [-1, 1]) {
        if (rnd() < 0.12) continue;
        const l = len * (0.7 + rnd() * 0.5);
        await S.path([[x + side * 2, cy, 0.9], [x + side * l * 0.5, cy + l * 0.2, 0.7], [x + side * l, cy + l * 0.15 - 3, 0.15]], 2);
      }
    }
  }
  log(`all dry after ${(await M.waitDry([[100, 500], [500, 400], [900, 600]])).toFixed(1)}s`);
  log('done');
})();
