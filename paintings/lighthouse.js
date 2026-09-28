// A lighthouse on a headland at dusk, painted with the Wash tool the way a
// person would use it: masking fluid on the tower; a variegated sky (dusk
// blue into a rose-gold glow) with soft clouds dropped into it while damp;
// a sea graded darker toward the viewer with a few lifted glints; the
// headland as a lasso wash variegated in patches; the cliff's shadow as a
// scrubbed band along its edge; the mask peeled, the tower's shadow side
// laid and softened, the lantern lit. Run with tools/paint.mjs.
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pts = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
const HORIZON = 470, TX = 720, TOWER_TOP = 175, TOWER_BASE = 392;

// The headland's ridge: rises from the left, a shoulder, the lighthouse's
// knoll, then the cliff dropping to the sea.
const ridge = x => x < 560 ? 430 - 40 * Math.sin(x / 560 * Math.PI * 0.9) - 6 * Math.sin(x / 37)
  : x < 780 ? 396 + 4 * Math.sin(x / 23) : 396 + (x - 780) * 0.9;
const headland = [[-20, 800], [-20, ridge(0)], ...pts(s => [s * 900, Math.min(ridge(s * 900), 560)], 45), [900, 560], [860, 600], [700, 640], [400, 690], [-20, 700]];

window.__paintDone = (async () => {
  h.setPaper('coldPress', 1); h.setTone('natural'); S.clear();

  log('masking fluid on the tower and its lantern');
  h.setBrushPreset('round'); S.tool('mask'); V.brushRadius = 7;
  for (let k = -3; k <= 3; k++) {
    await S.path(pts(s => { const y = TOWER_TOP + s * (TOWER_BASE - TOWER_TOP), w = 15 + 6 * s; return [TX + k * w / 3.2, y, 1]; }, 8), 2);
  }
  V.brushRadius = 6;
  for (let y = TOWER_TOP - 26; y <= TOWER_TOP; y += 6) await S.path([[TX - 14, y, 1], [TX + 14, y, 1]], 2);
  await S.path([[TX, TOWER_TOP - 34, 1], [TX, TOWER_TOP - 24, 1]], 2);   // the cap's point

  log('sky: dusk blue blending down into a rose-gold glow, a variegated wash');
  h.setBrushPreset('mop'); V.brushRadius = 60; V.brushPigment = 0.2; V.dipLoad = 1;
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1]]);
  S.tool('wash');
  await S.wash([[-10, -10], [1034, -10], [1034, HORIZON], [-10, HORIZON]], {
    kind: 'variegated', into: [['Quinacridone Rose', 1], ['Isoindolinone Yellow', 2]], direction: 'down', dampen: true,
  });
  await S.look('1-sky');

  log('clouds dropped into the damp sky: long soft lenses of violet-grey');
  S.tool('paint'); V.brushRadius = 22; V.brushPigment = 0.35;
  h.setBrush([['Perylene Violet', 1], ['French Ultramarine', 1]]);
  for (const [y, x0, len] of [[110, 80, 380], [150, 520, 420], [205, 260, 300], [250, 640, 260], [300, 40, 240]]) {
    await S.path(pts(s => [x0 + s * len, y + 6 * Math.sin(s * 3 + y), 0.25 + 0.6 * Math.sin(s * Math.PI)], 8), 2);
  }
  log(`sky dry after ${(await M.waitDry([[300, 100], [800, 300], [500, 440]])).toFixed(1)}s`);

  log('sea: graded darker toward the viewer, off the page at both sides');
  h.setBrushPreset('mop'); V.brushRadius = 60; V.brushPigment = 0.18;
  h.setBrush([['French Ultramarine', 3], ['Phthalo Blue (GS)', 1], ['Perylene Violet', 1]]);
  S.tool('wash');
  await S.wash([[-10, HORIZON], [1034, HORIZON], [1034, 780], [-10, 780]], { kind: 'graded', fadeTo: 2.2, dampen: true });
  await S.look('2-sea');

  log('glints lifted from the damp sea under the glow');
  await M.waitDamp([[850, 520]], { below: 0.1 });
  h.setBrushPreset('round'); S.tool('lift'); V.dipLoad = 0.05; V.brushRadius = 5;
  for (let k = 0; k < 9; k++) {
    const y = HORIZON + 12 + k * 9 + rnd() * 5, x = 900 - k * 14 + rnd() * 30, len = 60 - k * 4 + rnd() * 20;
    await S.path([[x, y, 0.6], [x + len, y + 1, 0.3]], 2);
  }
  V.dipLoad = 1;
  log(`sea dry after ${(await M.waitDry([[200, 600], [800, 700], [900, 500]])).toFixed(1)}s`);

  log('headland: a lasso wash, greens and ochre in patches');
  h.setBrushPreset('mop'); V.brushRadius = 45; V.brushPigment = 0.35;
  h.setBrush([['Perylene Green', 2], ['Raw Umber', 1]]);
  S.tool('wash');
  await S.wash(headland, { kind: 'variegated', into: [['Transparent Yellow Oxide', 2], ['Perylene Green', 1]], direction: 'patches', dampen: true });
  await S.look('3-headland');
  log(`headland dry after ${(await M.waitDry([[300, 500], [700, 450]])).toFixed(1)}s`);

  log('the cliff in shadow: a scrubbed band down its face');
  h.setBrushPreset('mop'); V.brushRadius = 24; V.brushPigment = 0.5;
  h.setBrush([['Perylene Green', 1], ['Perylene Violet', 1], ['French Ultramarine', 1]]);
  const cliff = pts(s => [790 + s * 100, ridge(790 + s * 100) + 14 + 40 * s], 10);
  await S.wash({ scrub: cliff, radius: 26 }, { kind: 'graded', fadeTo: 1.6, dampen: false });
  // Rocks at its foot, dark and crisp.
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 7; V.brushPigment = 0.8;
  h.setBrush([['Perylene Green', 1], ['Mars Black', 1]]);
  for (let k = 0; k < 7; k++) {
    const x = 830 + k * 14 + rnd() * 8, y = 560 + k * 5 + rnd() * 6;
    await S.path([[x, y, 0.4], [x + 10 + rnd() * 8, y + 2, 0.9], [x + 18, y + 6, 0.2]], 2);
  }
  log(`dry after ${(await M.waitDry([[850, 520], [880, 570]])).toFixed(1)}s`);

  log('peel the mask');
  S.unmask(); await new Promise(r => setTimeout(r, 400));

  log("the tower's shadow side, softened toward the light");
  h.setBrushPreset('round'); S.tool('paint'); V.brushRadius = 9; V.brushPigment = 0.25;
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1]]);
  await S.path(pts(s => { const y = TOWER_TOP + 4 + s * (TOWER_BASE - TOWER_TOP - 6), w = 15 + 6 * s; return [TX - w * 0.55, y, 0.8 + 0.2 * s]; }, 10), 2);
  V.dipLoad = 0.6;
  await S.softenEdge(pts(s => { const y = TOWER_TOP + 8 + s * (TOWER_BASE - TOWER_TOP - 16); return [TX - 2, y]; }, 10));
  V.dipLoad = 1;
  await M.waitDry([[TX, 300]]);

  log('the lantern lit, the cap and gallery dark, a band on the tower');
  V.brushRadius = 5; V.brushPigment = 0.7; h.setBrush('Isoindolinone Yellow');
  await S.path([[TX - 8, TOWER_TOP - 14, 1], [TX + 8, TOWER_TOP - 14, 1]], 2);
  h.setBrushPreset('rigger'); V.brushRadius = 3; V.brushPigment = 0.8; h.setBrush([['Perylene Maroon', 1], ['Mars Black', 1]]);
  await S.path([[TX - 16, TOWER_TOP - 24, 0.6], [TX, TOWER_TOP - 36, 0.3], [TX + 16, TOWER_TOP - 24, 0.6]], 2);
  await S.path([[TX - 17, TOWER_TOP - 3, 1], [TX + 17, TOWER_TOP - 3, 1]], 2);
  V.brushRadius = 5; V.brushPigment = 0.5; h.setBrush('Pyrrole Scarlet');
  await S.path([[TX - 18, 290, 1], [TX + 18, 290, 1]], 2);
  await S.path([[TX - 19, 305, 1], [TX + 19, 305, 1]], 2);
  // A door, and a path up the knoll.
  V.brushRadius = 3; V.brushPigment = 0.7; h.setBrush([['Perylene Violet', 1], ['Raw Umber', 1]]);
  await S.path([[TX + 6, TOWER_BASE - 18, 1], [TX + 6, TOWER_BASE - 4, 1]], 2);
  h.setBrush('Titanium Buff'); V.brushRadius = 4; V.brushPigment = 0.6;
  await S.path(pts(s => [TX + 4 - s * 260 + 30 * Math.sin(s * 5), TOWER_BASE + 2 + s * 90, 1 - 0.7 * s], 12), 2);
  log(`all dry after ${(await M.waitDry([[TX, 300], [600, 440]])).toFixed(1)}s`);
  await S.look('4-finish');
  log('done');
})();
