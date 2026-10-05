// A bare tree against a dusk sky with a thin moon (Fable, imagined).
// Built on what the journal says works: masking fluid for the moon, a
// variegated sky laid wet and left to dry before anything crisp goes on
// it, a pale far ridge as a lasso wash, a dark graded foreground, then the
// tree: round-brush trunk and limbs, rigger twigs tapered by pressure.
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
let seed = 23; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pts = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
const GROUND = 600, MX = 705, MY = 205, MR = 25;
const far = x => 520 - 26 * Math.sin(x / 1024 * Math.PI * 1.3 + 0.4) - 7 * Math.sin(x / 61) - 3 * Math.sin(x / 17);
const near = x => GROUND - 16 * Math.sin(x / 1024 * Math.PI + 0.3) - 5 * Math.sin(x / 83 + 1);
const dark = [['Perylene Green', 2], ['Perylene Violet', 2], ['Raw Umber', 0.5]];

window.__paintDone = (async () => {
  h.setPaper('coldPress', 23); h.setTone('natural'); S.clear();
  const dry = async () => { S.act('dry', true); try { await S.skipTo('dry'); } finally { S.act('dry', false); } };

  log('masking fluid: a thin crescent moon');
  h.setBrushPreset('round'); S.tool('mask'); V.brushRadius = 4;
  for (const [r, a0, a1] of [[MR, -1.9, 1.2], [MR - 3, -1.5, 0.8], [MR - 5, -1.0, 0.3]]) {
    await S.path(pts(t => { const a = a0 + (a1 - a0) * t; return [MX + r * Math.cos(a), MY + r * Math.sin(a), 0.2 + 0.8 * Math.sin(Math.PI * t)]; }, 14), 2);
  }

  log('sky: ultramarine-violet above into a rose-ochre glow');
  h.setBrushPreset('mop'); V.brushRadius = 60; V.brushPigment = 0.22; V.dipLoad = 1;
  h.setBrush([['French Ultramarine', 3], ['Perylene Violet', 1]]);
  S.tool('wash');
  await S.wash(null, {
    kind: 'variegated', into: [['Quinacridone Rose', 2], ['Transparent Yellow Oxide', 3]], direction: 'down', dampen: true,
  });

  log('a few thin cloud bars low in the glow, dropped in wet');
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 14; V.brushPigment = 0.3; V.dipLoad = 0.4;
  h.setBrush([['Perylene Violet', 2], ['French Ultramarine', 1]]);
  for (const [y, x0, len] of [[392, 520, 420], [432, 80, 330], [458, 610, 300]]) {
    await S.path(pts(s => [x0 + s * len, y + 4 * Math.sin(s * 3 + y), 0.2 + 0.6 * Math.sin(s * Math.PI)], 10), 2);
  }
  log(`sky dry after ${(await M.waitDry([[300, 100], [800, 300], [500, 520], [500, 720]], { maxS: 300 })).toFixed(0)}s`);
  S.unmask(); await new Promise(r => setTimeout(r, 400));
  await S.look('sky');

  log('the far ridge: a pale violet lasso wash over the dry glow');
  h.setBrushPreset('mop'); V.brushRadius = 30; V.brushPigment = 0.14; V.dipLoad = 1;
  h.setBrush([['French Ultramarine', 2], ['Quinacridone Rose', 1], ['Raw Umber', 0.5]]);
  S.tool('wash');
  await S.wash([...pts(s => [-10 + s * 1044, far(-10 + s * 1044)], 60), [1034, GROUND + 20], [-10, GROUND + 20]], { kind: 'flat', paper: 'moist' });
  await dry();

  log('the near ground: dark, graded darker toward the viewer');
  V.brushRadius = 45; V.brushPigment = 0.95; h.setBrush(dark);
  S.tool('wash');
  await S.wash([...pts(s => [-10 + s * 1044, near(-10 + s * 1044)], 50), [1034, 780], [-10, 780]], { kind: 'graded', fadeTo: 1.3, paper: 'wet' });

  log('grass flicked up from the wet edge with the rigger');
  S.tool('paint'); h.setBrushPreset('rigger'); V.brushRadius = 2.5; V.brushPigment = 0.95; V.dipLoad = 0.8; h.setBrush(dark);
  for (let k = 0; k < 150; k++) {
    const x = 10 + rnd() * 1004, y = near(x) + 4, len = 10 + rnd() * 26, lean = (rnd() - 0.5) * 14;
    await S.path([[x, y, 0.8], [x + lean * 0.4, y - len * 0.6, 0.5], [x + lean, y - len, 0.1]], 2);
  }
  await dry();
  await S.look('ground');

  log('the tree: trunk and limbs with the round, twigs with the rigger');
  S.tool('paint'); h.setBrush(dark);
  const limb = async (x, y, ang, len, w, depth) => {
    const bend = (rnd() - 0.5) * 0.5, n = 6;
    const p = [[x, y]]; let a = ang;
    for (let i = 1; i <= n; i++) { a += bend / n + (rnd() - 0.5) * 0.12; a -= 0.03 * Math.sin(a) * (depth > 2 ? 1 : 0); p.push([p[i - 1][0] + Math.sin(a) * len / n, p[i - 1][1] - Math.cos(a) * len / n]); }
    if (w >= 3) { h.setBrushPreset('round'); V.brushRadius = w; } else { h.setBrushPreset('rigger'); V.brushRadius = Math.max(1.3, w); }
    h.setBrush(dark); V.brushPigment = 0.95; V.dipLoad = 0.85;
    const thin = depth >= 4 ? 0.08 : 0.6;
    await S.path(p.map(([px, py], i) => [px, py, 1 - (1 - thin) * i / n]), 3);
    if (depth >= 6 || len < 14) return;
    const kids = depth < 2 ? 2 : (rnd() < 0.35 ? 3 : 2);
    for (let k = 0; k < kids; k++) {
      const side = kids === 2 ? (k ? 1 : -1) : k - 1;
      const at = k === kids - 1 || rnd() < 0.5 ? n : n - 1 - Math.floor(rnd() * 2);
      const da = side * (0.3 + rnd() * 0.4) + (rnd() - 0.5) * 0.2;
      await limb(p[at][0], p[at][1], a + da, len * (0.66 + rnd() * 0.16), w * 0.62, depth + 1);
    }
  };
  // the trunk's foot, flared into the ground, then the tree itself
  h.setBrushPreset('round'); V.brushRadius = 13; V.brushPigment = 0.95; V.dipLoad = 0.85; h.setBrush(dark);
  const TX = 340, TY = near(340) + 30;
  await S.path([[TX - 20, TY, 1], [TX - 8, TY - 34, 0.9], [TX - 2, TY - 80, 0.5]], 3);
  await S.path([[TX + 22, TY, 1], [TX + 9, TY - 34, 0.9], [TX + 3, TY - 80, 0.5]], 3);
  await limb(TX, TY - 10, 0.06, 160, 15, 0);
  await dry();

  log('a breath of warmth in the moon');
  h.setBrushPreset('round'); V.brushRadius = 5; V.brushPigment = 0.03; V.dipLoad = 0.5; h.setBrush('Transparent Yellow Oxide');
  await S.path(pts(t => { const a = -1.7 + 2.7 * t; return [MX + (MR - 2) * Math.cos(a), MY + (MR - 2) * Math.sin(a), 0.3 + 0.5 * Math.sin(Math.PI * t)]; }, 10), 2);
  await dry();
  await S.look('finished');
  log('done');
})();
