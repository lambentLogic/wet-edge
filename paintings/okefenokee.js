// Sunrise at Okefenokee NWR, from a public-domain photo (Steve Brooks/USFWS,
// fws.gov/media/sunrise-okefenokee-refuge; .local/refs/okefenokee_sunrise.jpg).
// Worked by the paper's stage (notes/journal.md): the sky wet and let dry so
// the treetops stay crisp, the treeline's base softened into mist while
// wet, reflections dropped into the channel at satin, the bank's darks at
// satin and its grass at moist, flowers reserved with masking fluid.
// Coordinates are traced from the photo (1024 x 682) and stretched to the
// sheet (1024 x 768).
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
const pts = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
const P = ([x, y]) => [x, y * 768 / 682];
const poly = a => a.map(P);
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const inside = (pl, x, y) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const [xi, yi] = pl[i], [xj, yj] = pl[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const runsIn = (ok, s) => { const out = []; let cur = []; for (const p of s) { if (ok(p[0], p[1])) cur.push(p); else { if (cur.length > 1) out.push(cur); cur = []; } } if (cur.length > 1) out.push(cur); return out; };
const skip = async (stage, points) => log(`skipped ${await S.skipTo(stage, { points })}s to ${stage}`);

const SKY = poly([[-10, -10], [1034, -10], [1034, 330], [-10, 330]]);
// The right treeline: a jagged top of cypress crowns and bare snags.
const treeTop = []; for (let x = 330; x <= 1034; x += 9) { const base = x < 440 ? 270 - (x - 330) * 0.35 : 225 - 20 * Math.sin(x / 90); treeTop.push([x, base - (rnd() < 0.25 ? 18 + rnd() * 22 : rnd() * 10)]); }
const TREES = poly([...treeTop, [1034, 315], [330, 312]]);
const MIST_TREES = poly([[140, 300], [160, 282], [200, 276], [250, 270], [300, 268], [340, 272], [340, 312], [140, 310]]);
const MARSH = poly([[330, 305], [1034, 300], [1034, 510], [960, 505], [840, 475], [700, 455], [560, 430], [450, 395], [380, 360], [330, 325]]);
const CHANNEL = poly([[255, 318], [330, 325], [380, 360], [450, 395], [560, 430], [700, 455], [840, 475], [960, 505], [1034, 510], [1034, 600], [930, 575], [860, 560], [760, 540], [680, 510], [600, 480], [520, 455], [440, 420], [370, 380], [310, 350], [270, 330]]);
const BANK = poly([[-10, 300], [150, 305], [250, 318], [270, 330], [310, 350], [370, 380], [440, 420], [520, 455], [600, 480], [680, 510], [760, 540], [860, 560], [930, 575], [1034, 600], [1034, 778], [-10, 778]]);
const LEFT_TREES = poly([[-10, 150], [20, 160], [45, 175], [70, 165], [95, 185], [110, 230], [120, 270], [150, 300], [110, 330], [40, 360], [-10, 380]]);

window.__paintDone = (async () => {
  h.setPaper('coldPress', 3); h.setTone('natural'); S.clear();

  log('pencil: the treeline base, the channel banks');
  S.tool('pencil'); V.pencilRadius = 2; V.pencilDark = 0.2;
  await S.path(poly([[140, 305], [330, 310], [1024, 305]]).map(([x, y]) => [x, y, 0.4]), 3);
  await S.path(CHANNEL.slice(0, 9).map(([x, y]) => [x, y, 0.4]), 3);
  await S.path(CHANNEL.slice(9).map(([x, y]) => [x, y, 0.4]), 3);

  log('masking fluid dots for the yellow flowers in the foreground');
  const flowers = [];
  for (let k = 0; k < 90; k++) { const x = rnd() * 1000 + 10, y = 560 + rnd() * 200; const [px, py] = [x, y]; if (inside(BANK, px, py) && py > 520 + (px / 1024) * 60) flowers.push([px, py]); }
  h.setBrushPreset('round'); S.tool('mask'); V.brushRadius = 2.5;
  for (const [x, y] of flowers) { h.lift(); await S.path([[x, y, 0.8], [x, y, 0.8]], 2); }

  log('the sky: lavender down into pink, laid wet, then dry (crisp treetops)');
  h.setBrushPreset('mop'); V.brushRadius = 60; V.brushPigment = 0.05;
  h.setBrush([['French Ultramarine', 1], ['Quinacridone Rose', 1]]);
  S.tool('wash');
  await S.wash(SKY, { kind: 'variegated', into: [['Quinacridone Rose', 2], ['Transparent Yellow Oxide', 1]], direction: 'down', paper: 'wet' });
  await skip('dry');
  await S.look('1-sky');

  log('distant trees on the left, pale and cool in the mist');
  h.setBrushPreset('round'); V.brushRadius = 10; V.brushPigment = 0.1;
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1], ['Raw Umber', 1]]);
  S.tool('wash'); await S.wash(MIST_TREES, { kind: 'flat', paper: 'moist' });

  log('the treeline: dark greens and a few rusty crowns, then crisp snags up into the dry sky');
  h.setBrushPreset('round'); V.brushRadius = 12; V.brushPigment = 0.45;
  h.setBrush([['Perylene Green', 2], ['Perylene Violet', 1], ['Raw Umber', 1]]);
  await S.wash(TREES, { kind: 'variegated', into: [['Perylene Green', 1], ['Transparent Red Oxide', 1], ['Raw Umber', 1]], direction: 'patches', paper: 'moist' });
  S.tool('paint'); h.setBrushPreset('rigger'); V.brushRadius = 2; V.brushPigment = 0.55; V.dipLoad = 0.5;
  for (const [x, y] of treeTop.filter((_, i) => i % 2 === 0)) { const [px, py] = P([x, y]); h.lift(); await S.path([[px, py + 25, 1], [px + (rnd() - 0.5) * 3, py - 4 - rnd() * 10, 0.2]], 3); }
  V.dipLoad = 1;
  log('mist: the treeline base softened with a damp clean brush while wet');
  S.tool('water'); h.setBrushPreset('mop'); V.brushRadius = 18; V.dipLoad = 0.4;
  for (let pass = 0; pass < 2; pass++) { h.lift(); await S.path(pts(t => { const [x, y] = P([140 + 890 * t, 306]); return [x, y + 4 * Math.sin(t * 17), 0.9]; }, 30), 3); }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('2-trees');

  log('the marsh: rusty red-brown, darker toward the channel, laid moist');
  h.setBrushPreset('mop'); V.brushRadius = 35; V.brushPigment = 0.18;
  h.setBrush([['Transparent Red Oxide', 2], ['Raw Umber', 2], ['Perylene Violet', 1]]);
  S.tool('wash'); await S.wash(MARSH, { kind: 'graded', fadeTo: 1.8, paper: 'moist' });
  log('at satin: darker drifts across the marsh');
  await skip('satin', [P([700, 380]), P([500, 340])]);
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.2; V.brushPigment = 0.3; h.setBrush([['Transparent Red Oxide', 1], ['Raw Umber', 2], ['Perylene Violet', 1]]);
  for (let k = 0; k < 7; k++) { const y = 360 + k * 18 + rnd() * 10, x0 = 450 + rnd() * 250; V.brushRadius = 8 + rnd() * 6; for (const r of runsIn((x, yy) => inside(MARSH, x, yy), pts(t => [x0 + t * (250 + rnd() * 150), y + t * 25, 0.3 + 0.6 * Math.sin(Math.PI * t)], 10))) { h.lift(); await S.path(r, 3); } }
  log('at moist: reed tips, short upward strokes along the far bank');
  await skip('moist', [P([700, 380])]);
  h.setBrushPreset('rigger'); V.brushRadius = 1.8; V.brushPigment = 0.35; V.dipLoad = 0.3;
  for (let k = 0; k < 40; k++) { const x = 460 + rnd() * 560, [px, py] = P([x, 440 + (x - 460) * 0.12 + rnd() * 20]); if (!inside(MARSH, px, py)) continue; h.lift(); await S.path([[px, py, 1], [px + (rnd() - 0.5) * 6, py - 20 - rnd() * 25, 0.1]], 3); }
  V.dipLoad = 1;
  await skip('dry');

  log('the channel: the sky reflected, pale, darker at the far right');
  h.setBrushPreset('mop'); V.brushRadius = 25; V.brushPigment = 0.06;
  h.setBrush([['Quinacridone Rose', 1], ['French Ultramarine', 1]]);
  S.tool('wash'); await S.wash(CHANNEL, { kind: 'variegated', into: [['French Ultramarine', 1], ['Perylene Violet', 1], ['Raw Umber', 1]], direction: 'across', paper: 'moist' });
  log('at satin: reflections of the treeline and reeds, straight down, a thirsty brush');
  await skip('satin', [P([700, 480]), P([900, 540])]);
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.15; h.setBrush([['Perylene Green', 1], ['Perylene Violet', 1], ['Raw Umber', 1]]);
  for (let k = 0; k < 18; k++) { const x = 560 + k * 26 + rnd() * 10, [px, py] = P([x, 450 + (x - 560) * 0.12]); V.brushRadius = 4 + rnd() * 5; V.brushPigment = 0.2 + (x - 560) / 1600; for (const r of runsIn((xx, yy) => inside(CHANNEL, xx, yy), pts(t => [px + (rnd() - 0.5) * 2, py + t * (40 + rnd() * 40), 0.9 - 0.6 * t], 6))) { h.lift(); await S.path(r, 3); } }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('3-marsh-water');

  log('the bank: dark olive and rust, laid wet');
  h.setBrushPreset('mop'); V.brushRadius = 45; V.brushPigment = 0.3;
  h.setBrush([['Perylene Green', 2], ['Raw Umber', 2], ['Transparent Red Oxide', 1]]);
  S.tool('wash'); await S.wash(BANK, { kind: 'variegated', into: [['Transparent Red Oxide', 2], ['Raw Umber', 1], ['Perylene Green', 1]], direction: 'patches', paper: 'wet' });
  log('at satin: deeper masses dropped in, low and along the water');
  await skip('satin', [P([300, 550]), P([600, 600])]);
  S.tool('paint'); h.setBrushPreset('mop'); V.dipLoad = 0.25; V.brushPigment = 0.45; h.setBrush([['Perylene Green', 2], ['Perylene Violet', 1], ['Raw Umber', 1]]);
  for (const [cx, cy] of [[80, 450], [200, 520], [380, 600], [120, 640], [560, 650], [760, 640]]) { V.brushRadius = 25 + rnd() * 15; const [px, py] = P([cx, cy]); for (const r of runsIn((x, y) => inside(BANK, x, y), pts(t => [px - 50 + 100 * t, py + 15 * Math.sin(t * 3), 0.9], 6))) { h.lift(); await S.path(r, 3); } }
  log('at moist: grass, upward tapering strokes, a nearly dry brush');
  await skip('moist', [P([300, 550]), P([600, 600])]);
  h.setBrushPreset('rigger'); V.dipLoad = 0.25; h.setBrush([['Perylene Green', 1], ['Raw Umber', 2], ['Transparent Red Oxide', 1]]);
  for (let k = 0; k < 70; k++) { const x = rnd() * 1024, y = 420 + rnd() * 340; if (!inside(BANK, x, y)) continue; V.brushRadius = 1.5 + rnd() * 1.5; V.brushPigment = 0.3 + rnd() * 0.3; const lean = (rnd() - 0.5) * 20; h.lift(); await S.path([[x, y, 1], [x + lean * 0.5, y - 25, 0.6], [x + lean, y - 45 - rnd() * 30, 0.1]], 3); }
  V.dipLoad = 1;
  await skip('dry');

  log('the tall trees at the left edge: dark masses, soft-edged crowns');
  S.tool('wash'); h.setBrushPreset('round'); V.brushRadius = 14; V.brushPigment = 0.5;
  h.setBrush([['Perylene Green', 2], ['Perylene Violet', 1], ['Raw Umber', 1]]);
  await S.wash(LEFT_TREES, { kind: 'variegated', into: [['Perylene Green', 1], ['Transparent Red Oxide', 1], ['Raw Umber', 1]], direction: 'patches', paper: 'moist' });
  await skip('dry');
  await S.look('4-bank');

  log('peel the mask; yellow flowers in the holes');
  S.unmask(); await new Promise(r => setTimeout(r, 400));
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 2.2; V.brushPigment = 0.6; V.dipLoad = 0.4; h.setBrush('Bismuth Vanadate Yellow');
  for (const [x, y] of flowers) { h.lift(); await S.path([[x, y, 0.8], [x, y, 0.8]], 2); }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('5-finish');
  log('done');
})();
