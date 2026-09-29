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
const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

window.__paintDone = (async () => {
  h.setPaper('coldPress', 3); h.setTone('natural'); S.clear();

  log('pencil: the table line, the jug, three lemons (the back one hidden behind the others)');
  S.tool('pencil'); V.pencilRadius = 2.2; V.pencilDark = 0.35;
  await S.path([[-10, TABLE, 0.5], [1034, TABLE, 0.5]], 30);
  await S.path(jugOutline.map(([x, y]) => [x, y, 0.55]), 3);
  await S.path(pts(s => [JX + Math.cos(s * 2 * Math.PI) * 45, 190 + Math.sin(s * 2 * Math.PI) * 9, 0.45], 24), 3);   // the rim
  await S.path(pts(s => [JX - halfW(215) - s * 70 + 10 * s * s, 215 + s * 150 - 40 * s * s, 0.45], 10), 3);            // the handle
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

  log('the jug: ultramarine, pale on the lit left into violet-blue on the right');
  h.setBrushPreset('mop'); V.brushRadius = 34; V.brushPigment = 0.32;
  h.setBrush([['French Ultramarine', 3], ['Phthalo Blue (GS)', 1]]);
  S.tool('wash');
  await S.wash({ at: [JX - 20, 400] }, { kind: 'variegated', into: [['French Ultramarine', 2], ['Perylene Violet', 1]], direction: 'across' });
  // While it's wet: the shadow side dropped in (soft), a highlight lifted.
  S.tool('paint'); h.setBrushPreset('mop'); V.brushRadius = 20; V.brushPigment = 0.9;
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1]]);
  await S.path(pts(s => { const y = 250 + s * 250; return [JX + halfW(y) * 0.62, y, 0.5 + 0.3 * Math.sin(s * Math.PI)]; }, 12), 3);
  // The highlight lifted once the shine has gone (lifted while very wet,
  // the wash just flowed back in).
  await M.waitDamp([[JX - 40, 380]], { below: 0.12 });
  S.tool('lift'); h.setBrushPreset('round'); V.dipLoad = 0.1; V.brushRadius = 9;
  for (let k = 0; k < 2; k++) await S.path(pts(s => { const y = 290 + s * 160; return [JX - halfW(y) * 0.42, y, 0.7]; }, 8), 4);
  V.dipLoad = 1; S.tool('wash');

  log('the lemons: bismuth yellow into a warm shadow of PY110 and red oxide');
  V.brushRadius = 24; V.brushPigment = 0.35;
  for (const L of LEMONS) {
    h.setBrush('Bismuth Vanadate Yellow');
    await S.wash({ at: [L.c[0] - 10, L.c[1] - 5] }, { kind: 'variegated', into: [['Isoindolinone Yellow', 2], ['Transparent Red Oxide', 1]], direction: 'across' });
    // The turning-away side dropped in while wet, so it melts in.
    S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 12; V.brushPigment = 0.45;
    h.setBrush([['Isoindolinone Yellow', 1], ['Transparent Red Oxide', 1]]);
    await S.path(pts(s => { const a = 0.1 + s * 1.5; return [L.c[0] + Math.cos(a) * L.r[0] * 0.62, L.c[1] + Math.sin(a) * L.r[1] * 0.55, 0.6]; }, 8), 3);
    h.setBrushPreset('mop'); V.brushRadius = 24; V.brushPigment = 0.35; S.tool('wash');
  }
  log(`jug and lemons dry after ${(await M.waitDry([[JX, 400], [632, 478], [774, 494], [708, 420]])).toFixed(1)}s`);
  await S.look('2-objects');

  log('the wall: warm grey, around the jug and lemons, lighter toward the window');
  h.setBrushPreset('mop'); V.brushRadius = 60; V.brushPigment = 0.16;
  h.setBrush([['Raw Umber', 2], ['French Ultramarine', 1], ['Transparent Yellow Oxide', 1]]);
  await S.wash([[-10, -10], [1034, -10], [1034, TABLE], [-10, TABLE]], { kind: 'graded', fadeTo: 1.5, around: true });

  log('the table: ochre-brown, graded darker toward us, around the objects');
  V.brushPigment = 0.22;
  h.setBrush([['Transparent Yellow Oxide', 2], ['Raw Umber', 1], ['Transparent Red Oxide', 1]]);
  await S.wash([[-10, TABLE], [1034, TABLE], [1034, 778], [-10, 778]], { kind: 'graded', fadeTo: 1.8, around: true });
  log(`wall and table dry after ${(await M.waitDry([[100, 200], [900, 200], [300, 650], [800, 650]])).toFixed(1)}s`);
  await S.look('3-ground');

  log('cast shadows to the right, violet-grey, softened at their far edge while wet');
  h.setBrushPreset('round'); V.brushRadius = 16; V.brushPigment = 0.3;
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1], ['Transparent Red Oxide', 1]]);
  // Flattened ellipses on the table, reaching right, away from the light.
  const oval = (x0, x1, yTop, depth) => pts(t => { const a = t * 2 * Math.PI; return [(x0 + x1) / 2 + Math.cos(a) * (x1 - x0) / 2, yTop + depth / 2 + Math.sin(a) * depth / 2]; }, 24);
  const shadows = [oval(JX - 40, JX + 230, TABLE - 4, 40), oval(640, 820, TABLE + 4, 36), oval(760, 920, TABLE + 12, 34)];
  for (const sh of shadows) {
    await S.wash(sh, { kind: 'flat', dampen: false });
    V.dipLoad = 0.6;
    await S.softenEdge(sh.filter(([x]) => x > (sh[0][0] + sh[12][0]) / 2 + 30));
    V.dipLoad = 1;
  }
  log(`shadows dry after ${(await M.waitDry([[JX + 150, 530], [760, 540], [880, 550]])).toFixed(1)}s`);

  log("the rim's dark inside and the handle");
  S.tool('paint'); V.brushRadius = 5; V.brushPigment = 0.7;
  h.setBrush([['Perylene Violet', 1], ['French Ultramarine', 1], ['Raw Umber', 1]]);
  await S.path(pts(s => [JX - 40 + s * 80, 191 - 6 * Math.sin(s * Math.PI), 0.9], 8), 2);
  // The handle, a firm curve.
  V.brushRadius = 7; V.brushPigment = 0.45; h.setBrush([['French Ultramarine', 3], ['Perylene Violet', 1]]);
  await S.path(pts(s => [JX - halfW(215) - s * 70 + 10 * s * s, 215 + s * 150 - 40 * s * s, 0.9 - 0.4 * s], 10), 3);

  log('contact shadows under the lemons and the jug');
  await M.waitDry([[JX, 380]]);
  S.tool('paint'); h.setBrushPreset('round');
  V.brushRadius = 3; V.brushPigment = 0.8; h.setBrush([['Perylene Violet', 1], ['Raw Umber', 2]]);
  for (const L of LEMONS.slice(0, 2)) await S.path(pts(s => [L.c[0] - L.r[0] * 0.5 + s * L.r[0], L.c[1] + L.r[1] * 0.92 + 2 * Math.sin(s * Math.PI), 0.8], 6), 2);
  await S.path(pts(s => [JX - 60 + s * 130, 516 + 3 * Math.sin(s * Math.PI), 0.8], 8), 2);   // under the jug
  log(`all dry after ${(await M.waitDry([[JX, 380], [632, 478], [774, 494]])).toFixed(1)}s`);
  await S.look('4-finish');
  log('done');
})();
