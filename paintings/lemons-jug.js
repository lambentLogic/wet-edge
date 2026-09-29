// Lemons and a blue jug on a table, window light from the left. Painted
// the way the painter works: a light pencil sketch first, whose closed
// outlines then bound each shape's wash (click inside a shape); the jug and
// lemons variegated light-to-shadow; the wall and table washed around
// them; cast shadows glazed on and softened while wet; highlights lifted
// and dark accents last. Run with tools/paint.mjs.
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
const pts = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
const TABLE = 520;

// The jug: half-width by height, a spout at the rim on the right.
const JX = 330;
const PROFILE = [[190, 45], [230, 40], [280, 80], [330, 105], [370, 110], [430, 100], [480, 84], [512, 74]];
const halfW = y => {
  for (let k = 1; k < PROFILE.length; k++) {
    const [y0, w0] = PROFILE[k - 1], [y1, w1] = PROFILE[k];
    if (y <= y1) { const t = (y - y0) / (y1 - y0), s = t * t * (3 - 2 * t); return w0 + (w1 - w0) * s; }
  }
  return PROFILE[PROFILE.length - 1][1];
};
const jugOutline = [
  [JX + 45, 190], [JX + 72, 180],   // the spout's lip
  ...pts(s => { const y = 196 + s * 316; return [JX + halfW(y), y]; }, 30),
  ...pts(s => [JX + 74 - s * 148, 512 + 6 * Math.sin(s * Math.PI)], 8),   // the base, curving toward us
  ...pts(s => { const y = 512 - s * 322; return [JX - halfW(y), y]; }, 30),
];
// Lemons: an ellipse with a nib at each end.
const lemon = (cx, cy, rx, ry, ang) => pts(s => {
  const a = s * Math.PI * 2, nib = 1 + 0.16 * Math.exp(-((Math.cos(a) - 1) ** 2) / 0.004) + 0.1 * Math.exp(-((Math.cos(a) + 1) ** 2) / 0.006);
  const x = Math.cos(a) * rx * nib, y = Math.sin(a) * ry;
  return [cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)];
}, 72);
const LEMONS = [
  { c: [632, 478], r: [74, 50], a: -0.12 },
  { c: [774, 494], r: [66, 46], a: 0.22 },
  { c: [708, 428], r: [60, 42], a: -0.32 },   // behind the other two
];
// The handle: from the neck, curving out to the left and back to the body.
const handle = s => [JX - halfW(220) + (halfW(220) - halfW(330)) * s - 72 * Math.sin(Math.PI * s), 220 + 110 * s];
const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

window.__paintDone = (async () => {
  h.setPaper('coldPress', 3); h.setTone('natural'); S.clear();

  log('pencil: the table line, the jug, three lemons (the back one hidden behind the others)');
  S.tool('pencil'); V.pencilRadius = 2.2; V.pencilDark = 0.35;
  // The table's edge only where it shows: not through the objects on it
  // (a line through a lemon cut its outline in two).
  const onTable = x => !inside(jugOutline, x, TABLE) && !LEMONS.some(L => inside(lemon(L.c[0], L.c[1], L.r[0] + 4, L.r[1] + 4, L.a), x, TABLE));
  let seg = [];
  for (let x = -10; x <= 1034; x += 6) {
    if (onTable(x)) seg.push([x, TABLE, 0.5]);
    else { if (seg.length > 1) await S.path(seg, 3); seg = []; }
  }
  if (seg.length > 1) await S.path(seg, 3);
  await S.path(jugOutline.map(([x, y]) => [x, y, 0.55]), 3);
  await S.path(pts(s => [JX + Math.cos(s * 2 * Math.PI) * 45, 190 + Math.sin(s * 2 * Math.PI) * 9, 0.45], 24), 3);   // the rim
  await S.path(pts(s => [...handle(s), 0.45], 12), 3);            // the handle
  const fronts = LEMONS.slice(0, 2).map(L => lemon(L.c[0], L.c[1], L.r[0], L.r[1], L.a));
  for (const L of LEMONS) {
    const o = lemon(L.c[0], L.c[1], L.r[0], L.r[1], L.a);
    const behind = L === LEMONS[2];
    // The back lemon's outline only where the front ones don't hide it.
    let run = [];
    for (const [x, y] of o) {
      if (behind && fronts.some(f => inside(f, x, y))) { if (run.length > 1) await S.path(run, 3); run = []; }
      else run.push([x, y, 0.5]);
    }
    if (run.length > 1) await S.path(run, 3);
  }
  await S.look('1-sketch');

  log('masking fluid over the jug and lemons, so the wall and table can be washed freely');
  h.setBrushPreset('round'); V.brushRadius = 10; S.tool('mask');
  const rim = pts(s => [JX + Math.cos(s * 2 * Math.PI) * 48, 190 + Math.sin(s * 2 * Math.PI) * 11], 24);
  for (const area of [jugOutline, rim, ...LEMONS.map(L => lemon(L.c[0], L.c[1], L.r[0], L.r[1], L.a))]) {
    await M.washAround(area, { mist: false, avoidPaint: false, even: false });
  }
  V.brushRadius = 6;
  await S.path(pts(s => [...handle(s), 1], 12), 3);   // the handle

  log('the wall: warm grey, lighter toward the window, straight over the mask');
  h.setBrushPreset('mop'); V.brushRadius = 60; V.brushPigment = 0.16;
  h.setBrush([['Raw Umber', 2], ['French Ultramarine', 1], ['Transparent Yellow Oxide', 1]]);
  S.tool('wash');
  await S.wash([[-10, -10], [1034, -10], [1034, TABLE], [-10, TABLE]], { kind: 'graded', fadeTo: 1.5 });
  log(`wall dry after ${(await M.waitDry([[100, 200], [900, 200], [500, 450]], { maxS: 300 })).toFixed(1)}s`);

  log('the table: ochre-brown, graded darker toward us');
  V.brushPigment = 0.22;
  h.setBrush([['Transparent Yellow Oxide', 2], ['Raw Umber', 1], ['Transparent Red Oxide', 1]]);
  await S.wash([[-10, TABLE], [1034, TABLE], [1034, 778], [-10, 778]], { kind: 'graded', fadeTo: 1.8 });
  log(`table dry after ${(await M.waitDry([[300, 650], [800, 650]], { maxS: 300 })).toFixed(1)}s`);
  await S.look('2-ground');

  log('peel the mask');
  S.unmask(); await new Promise(r => setTimeout(r, 400));

  log('the jug: a highlight reserved with masking fluid, then ultramarine, pale on the lit left into violet-blue on the right');
  S.tool('mask'); h.setBrushPreset('round'); V.brushRadius = 5;
  await S.path(pts(s => { const y = 285 + s * 170; return [JX - halfW(y) * 0.45, y, 0.4 + 0.6 * Math.sin(s * Math.PI)]; }, 10), 4);
  h.setBrushPreset('mop'); V.brushRadius = 34; V.brushPigment = 0.32;
  h.setBrush([['French Ultramarine', 3], ['Phthalo Blue (GS)', 1]]);
  S.tool('wash');
  await S.wash({ at: [JX - 20, 400] }, { kind: 'variegated', into: [['French Ultramarine', 2], ['Perylene Violet', 1]], direction: 'across' });
  // While it's wet: the shadow side dropped in, broad and strong, so it melts in.
  S.tool('paint'); V.brushRadius = 26; V.brushPigment = 1.1;
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1]]);
  await S.path(pts(s => { const y = 240 + s * 260; return [JX + halfW(y) * 0.55, y, 0.6 + 0.4 * Math.sin(s * Math.PI)]; }, 12), 3);
  S.tool('wash');

  log('the lemons: bismuth yellow into a warm shadow of PY110 and red oxide');
  V.brushRadius = 24; V.brushPigment = 0.35;
  for (const L of LEMONS) {
    h.setBrush('Bismuth Vanadate Yellow');
    await S.wash({ at: [L.c[0] - 10, L.c[1] - 5] }, { kind: 'variegated', into: [['Isoindolinone Yellow', 2], ['Transparent Red Oxide', 1]], direction: 'across' });
    // The turning-away side dropped in while wet, so it melts in.
    S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 18; V.brushPigment = 1.0;
    h.setBrush([['Isoindolinone Yellow', 3], ['Transparent Red Oxide', 2], ['Perylene Violet', 1]]);
    await S.path(pts(s => { const a = 0.1 + s * 1.5; return [L.c[0] + Math.cos(a) * L.r[0] * 0.62, L.c[1] + Math.sin(a) * L.r[1] * 0.55, 0.6]; }, 8), 3);
    h.setBrushPreset('mop'); V.brushRadius = 24; V.brushPigment = 0.35; S.tool('wash');
  }
  log(`jug and lemons dry after ${(await M.waitDry([[JX, 400], [632, 478], [774, 494], [708, 420]])).toFixed(1)}s`);
  await S.look('3-objects');

  log('cast shadows to the right, violet-grey, painted into damp paper so they soften');
  h.setBrushPreset('round'); V.brushRadius = 16; V.brushPigment = 0.3;
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1], ['Transparent Red Oxide', 1]]);
  // Flattened ellipses on the table, reaching right, away from the light.
  const oval = (x0, x1, yTop, depth) => pts(t => { const a = t * 2 * Math.PI; return [(x0 + x1) / 2 + Math.cos(a) * (x1 - x0) / 2, yTop + depth / 2 + Math.sin(a) * depth / 2]; }, 24);
  const shadows = [oval(JX - 40, JX + 230, TABLE - 4, 40), oval(640, 820, TABLE + 4, 36), oval(760, 920, TABLE + 12, 34)];
  for (const [k, sh] of shadows.entries()) {
    // Dampen a little beyond the shadow, then paint it: its edge softens
    // into the damp paper by itself.
    const [x0, x1, yTop, depth] = [[JX - 40, JX + 230, TABLE - 4, 40], [640, 820, TABLE + 4, 36], [760, 920, TABLE + 12, 34]][k];
    await S.wash(oval(x0 - 12, x1 + 30, yTop - 6, depth + 14), { dampenOnly: true });
    await S.wash(sh, { kind: 'flat', dampen: false });
  }
  log(`shadows dry after ${(await M.waitDry([[JX + 150, 530], [760, 540], [880, 550]])).toFixed(1)}s`);

  log("the rim's dark inside and the handle");
  S.tool('paint'); V.brushRadius = 5; V.brushPigment = 0.7;
  h.setBrush([['Perylene Violet', 1], ['French Ultramarine', 1], ['Raw Umber', 1]]);
  await S.path(pts(s => [JX - 40 + s * 80, 191 - 6 * Math.sin(s * Math.PI), 0.9], 8), 2);
  // The handle, a firm curve.
  V.brushRadius = 7; V.brushPigment = 0.45; h.setBrush([['French Ultramarine', 3], ['Perylene Violet', 1]]);
  await S.path(pts(s => [...handle(s), 0.9 - 0.2 * Math.sin(Math.PI * s)], 12), 3);

  log('contact shadows under the lemons and the jug');
  await M.waitDry([[JX, 380]]);
  S.tool('paint'); h.setBrushPreset('round');
  V.brushRadius = 3; V.brushPigment = 0.8; h.setBrush([['Perylene Violet', 1], ['Raw Umber', 2]]);
  for (const L of LEMONS.slice(0, 2)) await S.path(pts(s => [L.c[0] - L.r[0] * 0.5 + s * L.r[0], L.c[1] + L.r[1] * 0.92 + 2 * Math.sin(s * Math.PI), 0.8], 6), 2);
  await S.path(pts(s => [JX - 60 + s * 130, 516 + 3 * Math.sin(s * Math.PI), 0.8], 8), 2);   // under the jug
  log(`all dry after ${(await M.waitDry([[JX, 380], [632, 478], [774, 494]])).toFixed(1)}s`);
  log('peel the highlight');
  S.unmask(); await new Promise(r => setTimeout(r, 400));
  await S.look('4-finish');
  log('done');
})();
