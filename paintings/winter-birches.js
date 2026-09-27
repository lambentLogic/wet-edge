// Winter birches: masking fluid for the trunks, a misted wet-in-wet wood
// behind, snow shadows with the flat, the mask peeled, then trunk shading,
// dry-brush bark (Wetness down) and rigger branches tapered by pressure.
// Run with tools/paint.mjs.
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
let seed = 17; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pts = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
const GROUND = 560;

// Trunks: base x, lean, width (cells), top (y, may be off the sheet).
const TRUNKS = [
  { x: 210, lean: -18, w: 26, top: -20 }, { x: 330, lean: 10, w: 18, top: -20 },
  { x: 610, lean: 6, w: 34, top: -20 }, { x: 760, lean: -12, w: 16, top: 40 }, { x: 860, lean: 14, w: 22, top: -20 },
];
const trunkX = (t, y) => t.x + t.lean * (1 - (y - t.top) / (GROUND + 20 - t.top));

window.__paintDone = (async () => {
  h.setPaper('coldPress', 1); h.setTone('natural'); S.clear();

  log('masking fluid on the trunks');
  h.setBrushPreset('round'); h.setMode(5);
  for (const t of TRUNKS) {
    V.brushRadius = t.w / 2;
    // Slightly narrower toward the top.
    await S.path(pts(s => { const y = GROUND + 20 - s * (GROUND + 20 - t.top); return [trunkX(t, y), y, 1 - 0.3 * s]; }, 16), 2);
  }

  log('the wood behind: mist, then violet-grey wet-in-wet');
  h.setMode(4); V.brushRadius = 45;
  for (let y = 20; y < GROUND; y += 50) await S.path(pts(s => [-10 + s * 1044, y, 0.9], 10), 1);
  h.setMode(0); h.setBrushPreset('mop'); V.dipLoad = 1;
  // The wood's lower edge wanders a little (snow drifts against it).
  const wood = [[-10, -10], [1034, -10], ...pts(s => [1034 - s * 1044, GROUND + 6 + 10 * Math.sin(s * 17) + 6 * Math.sin(s * 41)], 30)];
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1], ['Raw Umber', 1]]); V.brushPigment = 0.22;
  await M.fill(wood, { grade: [0.6, 1.4], log });
  // Warmth dropped in low, and soft distant trunks while it's still wet.
  h.setBrush([['Transparent Red Oxide', 1], ['Raw Umber', 1]]); V.brushPigment = 0.3; V.brushRadius = 22;
  for (let k = 0; k < 6; k++) { const x = rnd() * 1000; await S.path(pts(s => [x + s * 160, GROUND - 60 + rnd() * 30, 0.8], 4), 2); }
  h.setBrushPreset('round'); V.brushRadius = 8;
  h.setBrush([['French Ultramarine', 1], ['Perylene Violet', 1], ['Raw Umber', 2]]); V.brushPigment = 0.7;
  for (let k = 0; k < 14; k++) {
    const x = 20 + rnd() * 990, top = 40 + rnd() * 200, drift = (rnd() - 0.5) * 10;
    await S.path(pts(s => [x + drift * s, top + s * (GROUND - top), 0.5 + 0.5 * s], 6), 2);
  }
  log(`wood dry after ${(await M.waitDry(wood)).toFixed(1)}s`);

  log('snow: wet it, then drop soft blue shadows into the dips');
  h.setBrushPreset('mop'); h.setMode(1);
  await M.fill([[-10, GROUND + 14], [1034, GROUND + 14], [1034, 778], [-10, 778]], { log });
  h.setMode(0);
  h.setBrush([['French Ultramarine', 2], ['Quinacridone Rose', 1]]); V.brushPigment = 0.14;
  for (let y = GROUND + 30, k = 0; y < 778; y += 46, k++) {
    const x0 = -20 + rnd() * 300, x1 = 500 + rnd() * 540, wob = rnd() * 6;
    await S.path(pts(s => [x0 + s * (x1 - x0), y + Math.sin(s * 3 + wob) * 10, 0.4 + 0.6 * Math.sin(s * Math.PI)], 10), 2);
  }
  // Shadows of the trunks across the snow, long and to the right, laid
  // once the snow is only damp so they stay soft but hold their shape.
  await M.waitDamp([[400, 650], [800, 700]], { below: 0.1 });
  h.setBrushPreset('round'); V.brushRadius = 9; V.brushPigment = 0.3;
  for (const t of TRUNKS) await S.path(pts(s => [t.x + s * 300, GROUND + 18 + s * 70, 1 - 0.8 * s], 8), 2);
  log(`snow dry after ${(await M.waitDry([[500, 650], [200, 700]])).toFixed(1)}s`);

  log('peel the mask');
  S.unmask(); await new Promise(r => setTimeout(r, 300));

  log('trunk shading: the shadow side, a cool grey');
  h.setBrushPreset('round'); V.dipLoad = 1;
  h.setBrush([['French Ultramarine', 1], ['Raw Umber', 1]]); V.brushPigment = 0.35;
  for (const t of TRUNKS) {
    V.brushRadius = t.w * 0.3;
    await S.path(pts(s => { const y = GROUND + 10 - s * (GROUND + 10 - Math.max(t.top, 0)); return [trunkX(t, y) + t.w * 0.28, y, 0.9]; }, 14), 2);
  }
  await M.waitDry(TRUNKS.map(t => [t.x, 300]));

  log('bark: dry-brush dashes (Wetness down) and dark knots');
  h.setBrushPreset('round'); V.dipLoad = 0.15;
  h.setBrush([['Mars Black', 1], ['Raw Umber', 1]]); V.brushPigment = 0.7;
  for (const t of TRUNKS) {
    for (let y = Math.max(t.top, 0) + 20; y < GROUND; y += 18 + rnd() * 34) {
      const cx = trunkX(t, y), half = t.w / 2;
      V.brushRadius = 12 + rnd() * 4;
      const from = rnd() < 0.5 ? -1 : 1, len = half * (0.8 + rnd() * 0.9);
      // A light sideways drag with a nearly dry brush, in from the trunk's
      // edge: it catches the tooth and skips the hollows.
      await S.path(pts(s => [cx + from * (half - 2) - from * s * len, y + s * 3, 0.5], 3), 1);
    }
  }
  V.dipLoad = 1; V.brushRadius = 4; V.brushPigment = 0.8;
  for (const t of TRUNKS) for (let k = 0; k < 3; k++) {
    const y = 60 + rnd() * (GROUND - 100), cx = trunkX(t, y);
    await S.path(pts(s => [cx - t.w * 0.3 + s * t.w * 0.5, y + s * 4 - 8 * Math.sin(s * Math.PI), 0.3 + 0.6 * Math.sin(s * Math.PI)], 4), 2);
  }

  log('branches: the rigger, tapered by pressure');
  h.setBrushPreset('rigger'); V.dipLoad = 1;
  h.setBrush([['Mars Black', 1], ['Raw Umber', 2]]); V.brushPigment = 0.7;
  for (const t of TRUNKS) {
    for (let k = 0; k < 4; k++) {
      const y = 30 + rnd() * 260, cx = trunkX(t, y), side = rnd() < 0.5 ? -1 : 1, len = 60 + rnd() * 110;
      const rise = 0.35 + 0.3 * rnd(), droop = 10 + rnd() * 25;
      await S.path(pts(s => [cx + side * (t.w * 0.4 + s * len), y - s * len * rise + s * s * droop, 1 - 0.95 * s], 8), 2);
    }
  }
  log(`all dry after ${(await M.waitDry(TRUNKS.map(t => [t.x, 300]))).toFixed(1)}s`);
  log('done');
})();
