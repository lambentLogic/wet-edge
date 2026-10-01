// Sunrise at Okefenokee NWR, second pass, from a public-domain photo (Steve Brooks/USFWS,
// fws.gov/media/sunrise-okefenokee-refuge; .local/refs/okefenokee_sunrise.jpg).
// Worked by the paper's stage (notes/journal.md): the sky wet and let dry so
// the treetops stay crisp, the treeline's base softened into mist while
// wet, reflections dropped into the channel at satin, the bank's darks at
// satin and its grass at moist, flowers reserved with masking fluid.
// Second pass: distant trees dropped into the satin sky; the treeline as
// trees (a mass bled down into damp paper, trunks and crowns, mist lifted
// across its base at damp); thin reflections and lifted shimmer; spatter
// and dry-brush grass on an olive bank; spattered flowers.
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
  const dab = async (x, y, f = 2) => { h.lift(); await S.path([[x, y, 0.9], [x, y, 0.9]], f); };

  log('pencil: the treeline base, the channel banks');
  S.tool('pencil'); V.pencilRadius = 2; V.pencilDark = 0.15;
  await S.path(poly([[140, 305], [330, 310], [1024, 305]]).map(([x, y]) => [x, y, 0.3]), 3);
  await S.path(CHANNEL.slice(0, 9).map(([x, y]) => [x, y, 0.3]), 3);
  await S.path(CHANNEL.slice(9).map(([x, y]) => [x, y, 0.3]), 3);

  log('masking fluid dots for the larger yellow flowers');
  const flowers = [];
  for (let k = 0; k < 70; k++) { const x = rnd() * 1000 + 10, y = 560 + rnd() * 200; if (inside(BANK, x, y) && y > 520 + (x / 1024) * 60) flowers.push([x, y]); }
  h.setBrushPreset('round'); S.tool('mask'); V.brushRadius = 3;
  for (const [x, y] of flowers) await dab(x, y);

  log('the sky: lavender down into pink, laid wet');
  h.setBrushPreset('mop'); V.brushRadius = 60; V.brushPigment = 0.05;
  h.setBrush([['French Ultramarine', 1], ['Quinacridone Rose', 1]]);
  S.tool('wash');
  await S.wash(SKY, { kind: 'variegated', into: [['Quinacridone Rose', 2], ['Transparent Yellow Oxide', 1]], direction: 'down', paper: 'wet' });
  log('at satin: the distant trees on the left, pale and cool, a thirsty brush (soft, held: mist)');
  await skip('satin', [P([200, 285]), P([280, 280])]);
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.1; V.brushPigment = 0.12;
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1], ['Raw Umber', 1]]);
  for (let x = 150; x <= 340; x += 10) { const top = 285 - 15 * Math.sin((x - 150) / 60) - rnd() * 12; const [px, py] = P([x, top]); V.brushRadius = 6 + rnd() * 5; h.lift(); await S.path([[px, py, 0.6], [px + (rnd() - 0.5) * 4, P([x, 310])[1], 1]], 3); }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('1-sky');

  log('the marsh first (the treeline will overlap it): rusty red-brown, darker toward the channel');
  h.setBrushPreset('mop'); V.brushRadius = 35; V.brushPigment = 0.16;
  h.setBrush([['Transparent Red Oxide', 2], ['Raw Umber', 2], ['Perylene Violet', 1]]);
  S.tool('wash'); await S.wash(MARSH, { kind: 'graded', fadeTo: 1.8, paper: 'moist' });
  await skip('satin', [P([700, 380]), P([500, 340])]);
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.15; V.brushPigment = 0.28; h.setBrush([['Transparent Red Oxide', 1], ['Raw Umber', 2], ['Perylene Violet', 1]]);
  for (let k = 0; k < 7; k++) { const y = 360 + k * 18 + rnd() * 10, x0 = 450 + rnd() * 250; V.brushRadius = 8 + rnd() * 6; for (const r of runsIn((x, yy) => inside(MARSH, x, yy), pts(t => [x0 + t * (250 + rnd() * 150), y + t * 25, 0.3 + 0.6 * Math.sin(Math.PI * t)], 10))) { h.lift(); await S.path(r, 3); } }
  await skip('moist', [P([700, 380])]);
  h.setBrushPreset('rigger'); V.brushRadius = 1.6; V.brushPigment = 0.3; V.dipLoad = 0.3;
  for (let k = 0; k < 50; k++) { const x = 460 + rnd() * 560, [px, py] = P([x, 440 + (x - 460) * 0.12 + rnd() * 20]); if (!inside(MARSH, px, py)) continue; h.lift(); await S.path([[px, py, 1], [px + (rnd() - 0.5) * 6, py - 18 - rnd() * 25, 0.1]], 3); }
  V.dipLoad = 1;
  await skip('dry');

  log('the treeline: its base dampened so the mass bleeds down and fades');
  const baseStrip = M.maskOf(poly([[320, 285], [1034, 285], [1034, 330], [320, 330]]));
  await S.dampen(baseStrip, 1, 0.03);
  const dark = [['Perylene Green', 2], ['Perylene Violet', 1], ['Raw Umber', 1]];
  const rust = [['Perylene Green', 1], ['Transparent Red Oxide', 1], ['Raw Umber', 1]];
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.5;
  log('the mass of the forest, low');
  for (let x = 335; x <= 1030; x += 14) { const top = (x < 440 ? 268 - (x - 335) * 0.3 : 240 - 15 * Math.sin(x / 90)) + rnd() * 8; const [px, py] = P([x, top]); h.setBrush(rnd() < 0.25 ? rust : dark); V.brushRadius = 9 + rnd() * 4; V.brushPigment = 0.4 + rnd() * 0.15; h.lift(); await S.path([[px, py, 0.8], [px + (rnd() - 0.5) * 6, P([x, 300])[1], 1]], 3); }
  log('trunks and crowns above it, irregular; a few bare snags');
  for (let x = 445; x <= 1030; x += 12 + rnd() * 14) {
    const h0 = 300, top = 190 + rnd() * 45 - 15 * Math.sin(x / 70), [bx, by] = P([x, h0]), [tx, ty] = P([x + (rnd() - 0.5) * 6, top]);
    h.setBrushPreset('rigger'); h.setBrush(dark); V.brushRadius = 1.4 + rnd(); V.brushPigment = 0.5; V.dipLoad = 0.4;
    h.lift(); await S.path([[bx, by, 1], [tx, ty, 0.3]], 4);
    if (rnd() < 0.75) { h.setBrushPreset('round'); h.setBrush(rnd() < 0.3 ? rust : dark); V.dipLoad = 0.15; V.brushPigment = 0.45; for (let c = 0; c < 3 + rnd() * 3; c++) { V.brushRadius = 4 + rnd() * 6; await dab(tx + (rnd() - 0.5) * 22, ty + rnd() * 30); } }
  }
  V.dipLoad = 1;
  log('at damp: mist lifted across the forest base with a thirsty clean brush');
  await skip('damp', [P([600, 300]), P([850, 300])]);
  S.tool('lift'); h.setBrushPreset('mop'); V.brushRadius = 16;
  for (let pass = 0; pass < 3; pass++) { h.lift(); await S.path(pts(t => { const [x, y] = P([330 + 700 * t, 298 + 6 * Math.sin(t * 9 + pass)]); return [x, y, 0.9]; }, 30), 4); }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('2-trees');

  log('the channel: the sky reflected, darker at the far right');
  h.setBrushPreset('mop'); V.brushRadius = 25; V.brushPigment = 0.06;
  h.setBrush([['Quinacridone Rose', 1], ['French Ultramarine', 1]]);
  S.tool('wash'); await S.wash(CHANNEL, { kind: 'variegated', into: [['French Ultramarine', 1], ['Perylene Violet', 1], ['Raw Umber', 1]], direction: 'across', paper: 'moist' });
  log('at satin: reflections, thin, straight down and tapering, a thirsty brush');
  await skip('satin', [P([700, 480]), P([900, 540])]);
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.1; h.setBrush(dark);
  for (let k = 0; k < 26; k++) { const x = 540 + k * 18 + rnd() * 8, [px, py] = P([x, 448 + (x - 540) * 0.12]); V.brushRadius = 2.5 + rnd() * 3; V.brushPigment = 0.15 + (x - 540) / 1800; for (const r of runsIn((xx, yy) => inside(CHANNEL, xx, yy), pts(t => [px + Math.sin(t * 9 + k) * 1.5, py + t * (50 + rnd() * 60), 1 - 0.8 * t], 10))) { h.lift(); await S.path(r, 2); } }
  log('at damp: a few horizontal shimmer lines lifted');
  await skip('damp', [P([700, 480]), P([900, 540])]);
  S.tool('lift'); h.setBrushPreset('round'); V.brushRadius = 2.5;
  for (let k = 0; k < 8; k++) { const x0 = 520 + rnd() * 380, [px, py] = P([x0, 455 + (x0 - 520) * 0.12 + rnd() * 30]); for (const r of runsIn((xx, yy) => inside(CHANNEL, xx, yy), pts(t => [px + t * (40 + rnd() * 60), py + t * 4, 0.8], 6))) { h.lift(); await S.path(r, 3); } }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('3-marsh-water');

  log('the tall trees at the left edge: crowns of dabs, trunks; before the bank, so it runs over their base');
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.25;
  for (let k = 0; k < 60; k++) { const x = rnd() * 130 - 10, y = 160 + rnd() * 200; if (!inside(LEFT_TREES, x, P([x, y])[1])) continue; h.setBrush(rnd() < 0.3 ? rust : dark); V.brushRadius = 6 + rnd() * 10; V.brushPigment = 0.45 + rnd() * 0.15; await dab(x, P([x, y])[1]); }
  h.setBrushPreset('rigger'); h.setBrush(dark); V.brushPigment = 0.55;
  for (const x of [25, 60, 95]) { V.brushRadius = 2 + rnd() * 1.5; h.lift(); await S.path([P([x, 400]), P([x + 3, 190])].map(([a, b]) => [a, b, 0.9]), 4); }
  V.dipLoad = 1;
  await skip('dry');

  log('the bank: olive, darker low, laid wet');
  h.setBrushPreset('mop'); V.brushRadius = 45; V.brushPigment = 0.28;
  h.setBrush([['Perylene Green', 3], ['Raw Umber', 2], ['Transparent Yellow Oxide', 1]]);
  S.tool('wash'); await S.wash(BANK, { kind: 'variegated', into: [['Raw Umber', 2], ['Transparent Red Oxide', 1], ['Perylene Green', 1]], direction: 'patches', paper: 'wet' });
  log('at satin: deeper masses dropped in');
  await skip('satin', [P([300, 550]), P([600, 600])]);
  S.tool('paint'); h.setBrushPreset('mop'); V.dipLoad = 0.2; V.brushPigment = 0.45; h.setBrush(dark);
  for (const [cx, cy] of [[80, 450], [200, 520], [380, 600], [120, 640], [560, 650], [760, 640], [920, 650]]) { V.brushRadius = 25 + rnd() * 15; const [px, py] = P([cx, cy]); for (const r of runsIn((x, y) => inside(BANK, x, y), pts(t => [px - 50 + 100 * t, py + 15 * Math.sin(t * 3), 0.9], 6))) { h.lift(); await S.path(r, 3); } }
  log('at moist: dark spatter flicked upward for texture, and grass strokes');
  await skip('moist', [P([300, 550]), P([600, 600])]);
  S.tool('spatter'); h.setBrushPreset('round'); h.setBrush(dark); V.brushPigment = 0.5; V.spatterReach = 50; V.spatterDensity = 0.15; V.spatterSize = 0.3;
  for (let k = 0; k < 24; k++) { const x = rnd() * 1024, y = 460 + rnd() * 300; if (!inside(BANK, x, y)) continue; h.lift(); await S.path([[x, y + 20, 1], [x + (rnd() - 0.5) * 20, y - 30, 1]], 2); }
  S.tool('paint'); h.setBrushPreset('rigger'); V.dipLoad = 0.25; h.setBrush(dark);
  for (let k = 0; k < 140; k++) { const x = rnd() * 1024, y = 420 + rnd() * 340; if (!inside(BANK, x, y)) continue; V.brushRadius = 1.2 + rnd() * 1.3; V.brushPigment = 0.3 + rnd() * 0.3; const lean = (rnd() - 0.5) * 24; h.lift(); await S.path([[x, y, 1], [x + lean * 0.4, y - 22, 0.6], [x + lean, y - 40 - rnd() * 35, 0.05]], 2); }
  V.dipLoad = 1;
  await skip('dry');
  log('golden grass: dry-brush flicks up in a light ochre');
  h.setBrushPreset('rigger'); V.dipLoad = 0.15; h.setBrush([['Transparent Yellow Oxide', 2], ['Raw Umber', 1]]);
  for (let k = 0; k < 90; k++) { const x = rnd() * 1024, y = 440 + rnd() * 320; if (!inside(BANK, x, y)) continue; V.brushRadius = 1 + rnd(); V.brushPigment = 0.35; const lean = (rnd() - 0.5) * 20; h.lift(); await S.path([[x, y, 0.6], [x + lean, y - 30 - rnd() * 30, 0.05]], 1); }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('4-bank');

  log('peel the mask; yellow flowers in the holes; finer ones spattered');
  S.unmask(); await new Promise(r => setTimeout(r, 400));
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 2.6; V.brushPigment = 0.6; V.dipLoad = 0.4; h.setBrush('Bismuth Vanadate Yellow');
  for (const [x, y] of flowers) await dab(x, y);
  S.tool('spatter'); V.brushPigment = 0.9; V.spatterReach = 70; V.spatterDensity = 0.08; V.spatterSize = 0.15;
  for (let k = 0; k < 10; k++) { const x = 60 + rnd() * 900, y = 600 + rnd() * 140; if (!inside(BANK, x, y)) continue; h.lift(); await S.path([[x - 30, y, 1], [x + 30, y - 10, 1]], 2); }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('5-finish');
  log('done');
})();
