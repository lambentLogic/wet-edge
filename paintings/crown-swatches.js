// Tree-crown swatches: five ways to paint a ragged cypress crown on a tall
// trunk (the Okefenokee passes gave lollipops: round dabs on sticks).
// Each column one method; top row near (big), bottom row far (small).
//   A  short drooping strokes, a thirsty brush
//   B  dark spatter flicked into damp paper
//   C  dry-brush dragged across (skims the tooth: ragged)
//   D  dabs into damp paper (they bleed soft)
//   E  stipple: many small dabs, varied, densest at the core
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const dab = async (x, y, f = 2) => { h.lift(); await S.path([[x, y, 0.9], [x, y, 0.9]], f); };
const dark = [['Perylene Green', 2], ['Perylene Violet', 1], ['Raw Umber', 1]];
const oval = (cx, cy, rx, ry) => Array.from({ length: 33 }, (_, k) => [cx + rx * Math.cos(k / 32 * 2 * Math.PI), cy + ry * Math.sin(k / 32 * 2 * Math.PI)]);
window.__paintDone = (async () => {
  h.setPaper('coldPress', 4); h.setTone('natural'); S.clear();
  h.setBrushPreset('mop'); V.brushRadius = 60; V.brushPigment = 0.05; h.setBrush([['French Ultramarine', 1], ['Quinacridone Rose', 1]]);
  S.tool('wash'); await S.wash(null, { kind: 'variegated', into: [['Quinacridone Rose', 2], ['Transparent Yellow Oxide', 1]], direction: 'down', paper: 'wet' });
  await S.skipTo('dry');
  for (const [row, sc, cy0] of [[0, 1, 200], [1, 0.4, 590]]) {
    for (let i = 0; i < 5; i++) {
      const cx = 110 + i * 200, cy = cy0, R = 60 * sc, base = cy0 + (row ? 110 : 260);
      // the trunk, tapering up into the crown
      S.tool('paint'); h.setBrushPreset('rigger'); h.setBrush(dark); V.brushPigment = 0.55; V.dipLoad = 0.4; V.brushRadius = Math.max(1, 3 * sc);
      h.lift(); await S.path([[cx, base, 1], [cx + 3 * sc, cy + R * 0.3, 0.6], [cx + 6 * sc, cy - R * 0.6, 0.2]], 5);
      // a few limbs
      for (let b = 0; b < 3; b++) { const y = cy + R * (0.2 - 0.3 * b), s = b % 2 ? 1 : -1; h.lift(); await S.path([[cx + 3 * sc, y, 0.6], [cx + s * R * 0.7, y - R * 0.25, 0.1]], 3); }
      const C = (k) => [cx + (rnd() - 0.5) * 2 * R, cy - R * 0.5 + rnd() * R * 0.9];
      if (i === 0) {
        h.setBrushPreset('round'); V.dipLoad = 0.3;
        for (let k = 0; k < 28; k++) { const [x, y] = C(k); V.brushRadius = (3 + rnd() * 3) * sc; V.brushPigment = 0.4 + rnd() * 0.2; const s = x > cx ? 1 : -1; h.lift(); await S.path([[x - s * 6 * sc, y - 4 * sc, 0.9], [x, y, 0.8], [x + s * 4 * sc, y + (10 + rnd() * 14) * sc, 0.1]], 2); }
      } else if (i === 1) {
        await S.dampen(M.maskOf(oval(cx, cy - R * 0.1, R * 1.05, R * 0.6)), 1, 0.03);
        S.tool('spatter'); h.setBrushPreset('round'); V.brushPigment = 0.7; V.spatterReach = 30 * sc; V.spatterDensity = 0.25; V.spatterSize = 0.4;
        for (let k = 0; k < 8; k++) { const [x, y] = C(k); h.lift(); await S.path([[x - 15 * sc, y + 10 * sc, 1], [x + 15 * sc, y - 10 * sc, 1]], 2); }
      } else if (i === 2) {
        h.setBrushPreset('round'); V.dipLoad = 0.1; V.brushPigment = 0.5;
        for (let k = 0; k < 10; k++) { const [x, y] = C(k); V.brushRadius = (7 + rnd() * 4) * sc; h.lift(); await S.path([[x - 25 * sc, y + 3 * sc, 0.8], [x + 25 * sc, y - 3 * sc, 0.8]], 1); }
      } else if (i === 3) {
        await S.dampen(M.maskOf(oval(cx, cy - R * 0.1, R * 1.05, R * 0.6)), 1, 0.03);
        h.setBrushPreset('round'); V.dipLoad = 0.25; V.brushPigment = 0.55;
        for (let k = 0; k < 10; k++) { const [x, y] = C(k); V.brushRadius = (6 + rnd() * 6) * sc; await dab(x, y); }
      } else {
        h.setBrushPreset('round'); V.dipLoad = 0.2;
        for (let k = 0; k < 60; k++) { const a = rnd() * 2 * Math.PI, d = Math.sqrt(rnd()); const x = cx + Math.cos(a) * d * R, y = cy - R * 0.1 + Math.sin(a) * d * R * 0.6; V.brushRadius = (1.5 + rnd() * 4 * (1 - d * 0.6)) * sc; V.brushPigment = 0.35 + 0.3 * (1 - d); await dab(x, y); }
      }
      V.dipLoad = 1;
    }
  }
  await S.skipTo('dry');
  await S.look('crowns');
  log('done');
})();
