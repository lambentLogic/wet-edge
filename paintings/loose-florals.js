// Loose florals: three roses dropped in wet-in-wet, leaves with crisp and
// soft edges, a background wash painted around them, dark accents last.
// Painted back to front where it matters, and without glazing over shapes
// that should stay hidden. Run with tools/paint.mjs.
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const line = (x0, y0, x1, y1, bend = 0, n = 8, p0 = 1, p1 = 0.1) =>
  Array.from({ length: n + 1 }, (_, k) => { const t = k / n; return [x0 + (x1 - x0) * t + bend * Math.sin(t * Math.PI), y0 + (y1 - y0) * t, p0 + (p1 - p0) * t]; });

// Flower heads: centre, radius, petal mix, dark centre mix.
const ROSES = [
  { x: 420, y: 330, r: 105, mix: [['Quinacridone Rose', 1]], deep: [['Pyrrole Rubine', 2], ['Quinacridone Magenta', 1]] },
  { x: 640, y: 290, r: 80, mix: [['Quinacridone Magenta', 1], ['Quinacridone Rose', 1]], deep: [['Quinacridone Magenta', 2], ['Dioxazine Violet', 1]] },
  { x: 560, y: 480, r: 70, mix: [['Pyrrole Scarlet', 1], ['Quinacridone Rose', 2]], deep: [['Pyrrole Rubine', 1], ['Perylene Maroon', 1]] },
];
const inRose = (x, y, pad = 0) => ROSES.some(f => Math.hypot(x - f.x, y - f.y) < f.r + pad);
// Leaves: base point, angle, length, width.
const LEAVES = [
  { x: 330, y: 420, a: 200, l: 150, w: 45 }, { x: 350, y: 250, a: 150, l: 130, w: 40 },
  { x: 720, y: 360, a: 20, l: 150, w: 42 }, { x: 700, y: 220, a: -30, l: 120, w: 36 },
  { x: 500, y: 560, a: 110, l: 130, w: 38 }, { x: 620, y: 560, a: 70, l: 120, w: 34 },
];

window.__paintDone = (async () => {
  h.setPaper('coldPress', 1); h.setTone('natural'); S.clear();

  log('roses: wet each head with clean water, then drop colour in');
  for (const f of ROSES) {
    h.setBrushPreset('round'); h.setMode(1); V.brushCapacity = 0; V.brushRadius = 22;
    // Wet the head: one continuous spiral, finely stepped, with a wobbly,
    // petal-lobed outline so it doesn't read as a polygon or a disc.
    const lobe = a => 1 + 0.12 * Math.sin(a * 5 + f.x) + 0.06 * Math.sin(a * 9 + f.y);
    const spiral = [];
    for (let t = 0; t <= 1; t += 0.01) {
      const a = t * Math.PI * 7, rr = f.r * (0.12 + 0.8 * t) * lobe(a);
      spiral.push([f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.85, 0.9]);
    }
    h.lift(); await S.path(spiral, 1);
    h.setMode(0);
    // Petal colour: curved strokes, lighter toward the outside.
    h.setBrush(f.mix); V.brushPigment = 0.5; V.brushRadius = 14;
    for (let k = 0; k < 10; k++) {
      const a = rnd() * Math.PI * 2, rr = f.r * (0.35 + 0.5 * rnd());
      h.lift(); await S.path(line(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.85, f.x + Math.cos(a + 0.9) * rr * 0.8, f.y + Math.sin(a + 0.9) * rr * 0.7, 10, 5, 0.9, 0.4), 2);
    }
    // The heart: deeper colour dropped into the centre while still wet.
    h.setBrush(f.deep); V.brushPigment = 0.9; V.brushRadius = 10;
    for (let k = 0; k < 4; k++) {
      const a = rnd() * Math.PI * 2;
      h.lift(); await S.path(line(f.x + Math.cos(a) * 12, f.y + Math.sin(a) * 10, f.x + Math.cos(a + 1.5) * f.r * 0.3, f.y + Math.sin(a + 1.5) * f.r * 0.25, 6, 4, 0.9, 0.3), 2);
    }
  }
  log(`roses dry after ${(await M.waitDry(ROSES.map(f => [f.x, f.y]))).toFixed(1)}s`);

  log('petal edges: a few darker curved strokes on the dry flowers (crisp)');
  for (const f of ROSES) {
    h.setBrushPreset('round'); V.brushCapacity = 0; V.brushRadius = 6;
    h.setBrush(f.deep); V.brushPigment = 0.45;
    for (let k = 0; k < 5; k++) {
      const a = rnd() * Math.PI * 2, rr = f.r * (0.25 + 0.4 * rnd());
      h.lift(); await S.path(line(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.85, f.x + Math.cos(a + 1.2) * rr, f.y + Math.sin(a + 1.2) * rr * 0.85, rr * 0.15, 6, 0.8, 0.1), 2);
    }
  }

  log('leaves: each in one go with the flat, a yellow-green charged in');
  for (const lf of LEAVES) {
    const a = lf.a * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
    const tipX = lf.x + dx * lf.l, tipY = lf.y + dy * lf.l;
    // Two curved strokes with the round, one per half of the leaf, pressure
    // swelling then lifting so the leaf is pointed at both ends; any part
    // that would glaze over a flower is left out (the leaf is tucked behind).
    h.setBrushPreset('round'); V.brushCapacity = 0; V.brushRadius = lf.w * 0.32;
    h.setBrush([['Perylene Green', 2], ['Isoindolinone Yellow', 1]]); V.brushPigment = 0.55;
    for (const side of [-1, 1]) {
      const ox = -dy * side * lf.w * 0.28, oy = dx * side * lf.w * 0.28;
      const pts = Array.from({ length: 13 }, (_, k) => { const t = k / 12, bulge = Math.sin(t * Math.PI); return [lf.x + dx * lf.l * t + ox * bulge, lf.y + dy * lf.l * t + oy * bulge, 0.15 + 0.85 * bulge]; })
        .filter(([x, y]) => !inRose(x, y, 4));
      if (pts.length > 1) { h.lift(); await S.path(pts, 2); }
    }
    // Yellow charged into the wet leaf near its base, and a darker vein side.
    h.setBrushPreset('round'); V.brushCapacity = 0; V.brushRadius = 9;
    h.setBrush([['Isoindolinone Yellow', 1], ['Bismuth Vanadate Yellow', 1]]); V.brushPigment = 0.6;
    if (!inRose(lf.x + dx * 30, lf.y + dy * 30, 4)) { h.lift(); await S.path(line(lf.x + dx * 15, lf.y + dy * 15, lf.x + dx * 55, lf.y + dy * 55, 0, 3, 0.9, 0.5), 2); }
    h.setBrush([['Perylene Green', 2], ['French Ultramarine', 1]]); V.brushPigment = 0.6;
    const vx = lf.x + dx * lf.l * 0.55 + dy * lf.w * 0.2, vy = lf.y + dy * lf.l * 0.55 - dx * lf.w * 0.2;
    if (!inRose(vx, vy, 4)) { h.lift(); await S.path(line(lf.x + dx * lf.l * 0.3, lf.y + dy * lf.l * 0.3, tipX - dx * 20, tipY - dy * 20, 0, 3, 0.8, 0.2), 2); }
  }
  log(`leaves dry after ${(await M.waitDry(LEAVES.map(lf => [lf.x + Math.cos(lf.a * Math.PI / 180) * 60, lf.y + Math.sin(lf.a * Math.PI / 180) * 60]))).toFixed(1)}s`);

  log('background: a graded wash around the flowers and leaves (washAround senses them)');
  h.setBrushPreset('mop'); V.brushCapacity = 0; V.brushRadius = 26;
  await M.washAround(null, {
    margin: 3, cutRadius: 6, log,
    brushAt: (x, y) => (y < 380 ? [['French Ultramarine', 2], ['Quinacridone Rose', 1]] : [['French Ultramarine', 1], ['Perylene Green', 1], ['Raw Umber', 1]]),
    pigmentAt: (x, y) => 0.12 + 0.12 * Math.abs(y / 760 - 0.45) * 2,
  });
  log(`background dry after ${(await M.waitDry([[100, 100], [900, 100], [100, 700], [900, 700]])).toFixed(1)}s`);

  log('dark accents and stems with the rigger');
  h.setBrushPreset('rigger'); V.brushCapacity = 0;
  h.setBrush([['Perylene Green', 2], ['Perylene Maroon', 1]]); V.brushPigment = 0.8; V.brushRadius = 3.5;
  for (const [x0, y0, x1, y1, b] of [[560, 550, 520, 760, -15], [470, 420, 430, 760, 20], [660, 360, 700, 760, -25]]) {
    if (!inRose(x0, y0, -10)) { h.lift(); await S.path(line(x0, y0, x1, y1, b, 10, 0.9, 0.3), 2); }
  }
  for (const f of ROSES) {
    h.setBrush(f.deep); V.brushPigment = 0.9; V.brushRadius = 4;
    for (let k = 0; k < 3; k++) {
      const a = rnd() * Math.PI * 2;
      h.lift(); await S.path(line(f.x + Math.cos(a) * 6, f.y + Math.sin(a) * 5, f.x + Math.cos(a + 0.8) * f.r * 0.22, f.y + Math.sin(a + 0.8) * f.r * 0.18, 4, 4, 0.9, 0.1), 2);
    }
  }
  log(`all dry after ${(await M.waitDry(ROSES.map(f => [f.x, f.y]))).toFixed(1)}s`);
  log('done');
})();
