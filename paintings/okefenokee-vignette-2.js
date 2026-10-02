// Sunrise at Okefenokee NWR as a vignette, second pass, from a public-domain photo (Steve Brooks/USFWS,
// fws.gov/media/sunrise-okefenokee-refuge; .local/refs/okefenokee_sunrise.jpg).
// Worked by the paper's stage (notes/journal.md): the sky wet and let dry so
// the treetops stay crisp, the treeline's base softened into mist while
// wet, reflections dropped into the channel at satin, the bank's darks at
// satin and its grass at moist. As a vignette (after Sol's and Sonnet's
// studies): everything inside an irregular oval that fades to white paper,
// each area's strokes laid into damp paper wider than they travel, so they
// fade instead of pinning in a line. Crowns from crown-swatches.js: short
// drooping strokes with a few dry-brush tiers. Mist scumbled in tinted
// titanium buff.
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
  // The vignette: an irregular oval; vr(x, y) is 0 at its centre, 1 at its edge.
  const VX = 512, VY = 400, VRX = 430, VRY = 315;
  const wob = a => 1 + 0.07 * Math.sin(a * 3 + 0.5) + 0.05 * Math.sin(a * 5 + 2) + 0.03 * Math.sin(a * 9);
  const vr = (x, y) => { const dx = (x - VX) / VRX, dy = (y - VY) / VRY; return Math.hypot(dx, dy) / wob(Math.atan2(dy, dx)); };
  const within = (lim, pl) => (x, y) => vr(x, y) < lim && (!pl || inside(pl, x, y));
  const maskWhere = ok => { const m = new Uint8Array(1024 * 768); for (let y = 0; y < 768; y++) for (let x = 0; x < 1024; x++) if (ok(x, y)) m[y * 1024 + x] = 1; return m; };
  // A stroke clipped to a region, its pressure easing off toward the
  // vignette's edge so it tapers out instead of stopping.
  const fadeStroke = async (s, ok, f = 3, lim = 0.9) => { for (const r of runsIn(ok, s)) { h.lift(); await S.path(r.map(([x, y, p]) => [x, y, p * Math.min(1, Math.max(0.15, (lim - vr(x, y)) / 0.25))]), f); } };
  const dark = [['Perylene Green', 2], ['Perylene Violet', 1], ['Raw Umber', 1]];
  const rust = [['Perylene Green', 1], ['Transparent Red Oxide', 1], ['Raw Umber', 1]];

  log('pencil, light: the treeline base and the channel banks, inside the oval');
  S.tool('pencil'); V.pencilRadius = 2; V.pencilDark = 0.12;
  for (const line of [poly([[140, 305], [330, 310], [1024, 305]]), CHANNEL.slice(0, 9), CHANNEL.slice(9)]) for (const r of runsIn(within(0.85), line.flatMap((p, i, a) => i ? Array.from({ length: 8 }, (_, k) => [a[i - 1][0] + (p[0] - a[i - 1][0]) * (k + 1) / 8, a[i - 1][1] + (p[1] - a[i - 1][1]) * (k + 1) / 8]) : [p]))) { h.lift(); await S.path(r.map(([x, y]) => [x, y, 0.3]), 2); }

  log('the sky: the oval above the trees dampened, then loose horizontal mop strokes, lavender above into pink, fading out short of the damp edge');
  await S.dampen(maskWhere((x, y) => vr(x, y) < 1.0 && y < P([0, 330])[1]), 1, 0.05);
  S.tool('paint'); h.setBrushPreset('mop'); V.brushRadius = 45; V.dipLoad = 0.55;
  for (let k = 0; k < 7; k++) {
    const y = 110 + k * 38, f = k / 6; V.brushPigment = 0.06;
    h.setBrush(f < 0.5 ? [['French Ultramarine', 1], ['Quinacridone Rose', 1]] : [['Quinacridone Rose', 2], ['Transparent Yellow Oxide', 1]]);
    await fadeStroke(pts(t => [VX - 420 + 840 * t, y + 6 * Math.sin(t * 4 + k), 1], 16), within(0.82), 3, 0.82);
  }
  log('the distant trees on the left: their corner rewet to shiny, then a thirsty brush (soft, no edge)');
  await skip('satin', [P([200, 285]), P([280, 280])]);
  await S.dampen(maskWhere((x, y) => vr(x, y) < 0.95 && x < P([380, 0])[0] && y > P([0, 230])[1] && y < P([0, 320])[1]), 1, 0.1);
  h.setBrushPreset('round'); V.dipLoad = 0.1; V.brushPigment = 0.12; h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1], ['Raw Umber', 1]]);
  for (let x = 160; x <= 340; x += 10) { const top = 285 - 15 * Math.sin((x - 150) / 60) - rnd() * 12, [px, py] = P([x, top]); if (vr(px, py) > 0.78) continue; V.brushRadius = 6 + rnd() * 5; h.lift(); await S.path([[px, py, 0.6], [px + (rnd() - 0.5) * 4, P([x, 310])[1], 1]], 3); }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('1-sky');

  log('the marsh: dampened inside the oval, loose rusty strokes, darker toward the channel');
  await S.dampen(maskWhere((x, y) => vr(x, y) < 0.98 && inside(MARSH, x, y)), 1, 0.04);
  h.setBrushPreset('mop'); V.brushRadius = 30; V.dipLoad = 0.5;
  h.setBrush([['Transparent Red Oxide', 2], ['Raw Umber', 2], ['Perylene Violet', 1]]);
  for (let k = 0; k < 7; k++) { const y = P([0, 318 + k * 26])[1]; V.brushPigment = 0.14 + 0.03 * k; await fadeStroke(pts(t => [330 + 700 * t, y + (t * 30) * (k / 6), 1], 16), within(0.9, MARSH), 3); }
  await skip('moist', [P([700, 380])]);
  h.setBrushPreset('rigger'); V.brushRadius = 1.6; V.brushPigment = 0.3; V.dipLoad = 0.3;
  for (let k = 0; k < 45; k++) { const x = 460 + rnd() * 560, [px, py] = P([x, 440 + (x - 460) * 0.12 + rnd() * 20]); if (!within(0.85, MARSH)(px, py)) continue; h.lift(); await S.path([[px, py, 1], [px + (rnd() - 0.5) * 6, py - 18 - rnd() * 25, 0.1]], 3); }
  V.dipLoad = 1;
  await skip('dry');

  log('the treeline: the mass, low and dark, its base into a dampened strip; shorter toward the sides of the oval');
  await S.dampen(maskWhere((x, y) => vr(x, y) < 0.95 && y > P([0, 285])[1] && y < P([0, 330])[1] && x > 320), 1, 0.03);
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.5;
  for (let x = 335; x <= 1000; x += 13) {
    const top = (x < 440 ? 268 - (x - 335) * 0.3 : 240 - 15 * Math.sin(x / 90)) + rnd() * 8, [px, py] = P([x, top]), [, by] = P([x, 302]);
    if (vr(px, by) > 0.88) continue;
    const short = Math.max(0, (vr(px, py) - 0.55) / 0.33);   // lower toward the oval's edge
    const endFade = Math.min(1, Math.max(0.15, (0.86 - vr(px, by)) / 0.25));   // thinner toward the oval's edge: no hard end
    h.setBrush(rnd() < 0.25 ? rust : dark); V.brushRadius = 9 + rnd() * 4; V.brushPigment = (0.42 + rnd() * 0.12) * endFade;
    h.lift(); await S.path([[px, py + short * (by - py) * 0.6, 0.8], [px + (rnd() - 0.5) * 6, by, 1]], 3);
  }
  log('trunks with drooping crowns (and a few dry-brush tiers), lower toward the sides');
  for (let x = 445; x <= 990; x += 14 + rnd() * 16) {
    const [bx, by] = P([x, 300]); if (vr(bx, by) > 0.82) continue;
    const short = Math.max(0, (vr(bx, P([x, 200])[1]) - 0.5) / 0.35), top = 190 + rnd() * 45 - 15 * Math.sin(x / 70) + short * 50;
    const [tx, ty] = P([x + (rnd() - 0.5) * 6, top]), sc = 0.55 + rnd() * 0.25;
    h.setBrushPreset('rigger'); h.setBrush(dark); V.brushRadius = 1.3 + rnd() * 0.8; V.brushPigment = 0.5; V.dipLoad = 0.4;
    h.lift(); await S.path([[bx, by, 1], [tx, ty, 0.3]], 4);
    if (rnd() < 0.15) continue;   // a bare snag
    h.setBrushPreset('round'); h.setBrush(rnd() < 0.25 ? rust : dark); V.dipLoad = 0.3;
    for (let k = 0; k < 10; k++) { const x0 = tx + (rnd() - 0.5) * 50 * sc, y0 = ty - 6 * sc + rnd() * 40 * sc, s = x0 > tx ? 1 : -1; V.brushRadius = (2.5 + rnd() * 2.5) * sc * 1.4; V.brushPigment = 0.4 + rnd() * 0.2; h.lift(); await S.path([[x0 - s * 5 * sc, y0 - 3 * sc, 0.9], [x0, y0, 0.8], [x0 + s * 3 * sc, y0 + (8 + rnd() * 12) * sc, 0.1]], 2); }
    if (rnd() < 0.4) { V.dipLoad = 0.1; V.brushRadius = 5 * sc; h.lift(); await S.path([[tx - 20 * sc, ty + 8 * sc, 0.8], [tx + 20 * sc, ty + 5 * sc, 0.8]], 1); }
  }
  V.dipLoad = 1;
  await skip('dry');
  log("mist scumbled the painter's way: titanium buff tinted with the sky on the squirrel mop, no water, soft, a loose horizontal scribble at a steady pace");
  S.tool('paint'); h.setBrushPreset('mop'); h.setBrush([['Titanium Buff', 6], ['Quinacridone Rose', 1], ['French Ultramarine', 1]]);
  V.dipLoad = 0; V.brushFirmness = 0.08;
  for (let k = 0; k < 4; k++) {
    V.brushRadius = 50 + rnd() * 8; V.brushPigment = 0.17;
    const yb = 292 + k * 8, x0 = 330 + rnd() * 60, x1 = 940 - rnd() * 60;
    await fadeStroke(pts(t => { const [x, y] = P([x0 + (x1 - x0) * t, yb + 12 * Math.sin(t * 9 + k * 2)]); return [x, y, 0.5]; }, 24), within(0.85), 5);
  }
  V.dipLoad = 1;
  await S.look('2-trees');

  log('the channel: the sky reflected, inside the oval; reflections at satin; shimmer lifted at damp');
  await S.dampen(maskWhere((x, y) => vr(x, y) < 0.95 && inside(CHANNEL, x, y)), 1, 0.03);
  h.setBrushPreset('mop'); V.brushRadius = 18; V.brushPigment = 0.07;
  h.setBrush([['Quinacridone Rose', 1], ['French Ultramarine', 1]]);
  S.tool('wash'); await S.wash({ mask: maskWhere((x, y) => vr(x, y) < 0.88 && inside(CHANNEL, x, y)) }, { kind: 'variegated', into: [['French Ultramarine', 1], ['Perylene Violet', 1], ['Raw Umber', 1]], direction: 'across', paper: 'moist', dampen: false });
  S.tool('paint');
  await skip('satin', [P([700, 480]), P([850, 520])]);
  h.setBrushPreset('round'); V.dipLoad = 0.1; h.setBrush(dark);
  for (let k = 0; k < 24; k++) { const x = 540 + k * 18 + rnd() * 8, [px, py] = P([x, 448 + (x - 540) * 0.12]); V.brushRadius = 2.5 + rnd() * 3; V.brushPigment = 0.18 + (x - 540) / 1800; await fadeStroke(pts(t => [px + Math.sin(t * 9 + k) * 1.5, py + t * (50 + rnd() * 60), 1 - 0.8 * t], 10), within(0.88, CHANNEL), 2); }
  await skip('damp', [P([700, 480]), P([850, 520])]);
  S.tool('lift'); h.setBrushPreset('round'); V.brushRadius = 2.5;
  for (let k = 0; k < 7; k++) { const x0 = 520 + rnd() * 380, [px, py] = P([x0, 455 + (x0 - 520) * 0.12 + rnd() * 30]); await fadeStroke(pts(t => [px + t * (40 + rnd() * 60), py + t * 4, 0.8], 6), within(0.88, CHANNEL), 3); }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('3-marsh-water');

  log('the bank: dampened inside the oval, loose olive strokes laid wet, fading toward the edge');
  await S.dampen(maskWhere((x, y) => vr(x, y) < 1.0 && inside(BANK, x, y)), 1, 0.05);
  S.tool('paint'); h.setBrushPreset('mop'); V.brushRadius = 40; V.dipLoad = 0.6;
  for (let k = 0; k < 9; k++) { const y = 380 + k * 40; h.setBrush(k % 3 === 1 ? [['Raw Umber', 2], ['Transparent Red Oxide', 1], ['Perylene Green', 1]] : [['Perylene Green', 3], ['Raw Umber', 3], ['Transparent Yellow Oxide', 1]]); V.brushPigment = 0.34 + 0.02 * k; await fadeStroke(pts(t => [VX - 440 + 880 * t, y + (t - 0.5) * 50 + 8 * Math.sin(t * 5 + k), 1], 16), within(0.85, BANK), 3, 0.85); }
  log('at satin: deeper masses dropped in');
  await skip('satin', [P([300, 550]), P([550, 600])]);
  h.setBrushPreset('mop'); V.dipLoad = 0.2; V.brushPigment = 0.4; h.setBrush(dark);
  for (const [cx, cy] of [[220, 520], [380, 600], [560, 640], [760, 625], [300, 690]]) { V.brushRadius = 14 + rnd() * 8; const [px, py] = P([cx, cy]); await fadeStroke(pts(t => [px - 120 + 240 * t, py + 10 * Math.sin(t * 4), 0.4 + 0.5 * Math.sin(Math.PI * t)], 10), within(0.8, BANK), 3); }
  log('at moist: dark spatter flicked upward, and grass strokes');
  await skip('moist', [P([300, 550]), P([550, 600])]);
  S.tool('spatter'); h.setBrushPreset('round'); h.setBrush(dark); V.brushPigment = 0.5; V.spatterReach = 45; V.spatterDensity = 0.15; V.spatterSize = 0.3;
  for (let k = 0; k < 22; k++) { const x = 120 + rnd() * 800, y = 460 + rnd() * 240; if (!within(0.75, BANK)(x, y)) continue; h.lift(); await S.path([[x, y + 20, 1], [x + (rnd() - 0.5) * 20, y - 30, 1]], 2); }
  S.tool('paint'); h.setBrushPreset('rigger'); V.dipLoad = 0.25; h.setBrush(dark);
  for (let k = 0; k < 120; k++) { const x = 100 + rnd() * 840, y = 420 + rnd() * 300; if (!within(0.8, BANK)(x, y)) continue; V.brushRadius = 1.2 + rnd() * 1.3; V.brushPigment = 0.3 + rnd() * 0.3; const lean = (rnd() - 0.5) * 24; h.lift(); await S.path([[x, y, 1], [x + lean * 0.4, y - 22, 0.6], [x + lean, y - 40 - rnd() * 35, 0.05]], 2); }
  V.dipLoad = 1;
  await skip('dry');
  log('golden grass flicks, then yellow flowers spattered');
  h.setBrushPreset('rigger'); V.dipLoad = 0.15; h.setBrush([['Transparent Yellow Oxide', 2], ['Raw Umber', 1]]);
  for (let k = 0; k < 70; k++) { const x = 100 + rnd() * 840, y = 440 + rnd() * 280; if (!within(0.8, BANK)(x, y)) continue; V.brushRadius = 1 + rnd(); V.brushPigment = 0.35; const lean = (rnd() - 0.5) * 20; h.lift(); await S.path([[x, y, 0.6], [x + lean, y - 30 - rnd() * 30, 0.05]], 1 + Math.round(rnd())); }
  S.tool('spatter'); h.setBrushPreset('round'); h.setBrush('Bismuth Vanadate Yellow'); V.brushPigment = 0.9; V.spatterReach = 60; V.spatterDensity = 0.1; V.spatterSize = 0.2;
  for (let k = 0; k < 12; k++) { const x = 160 + rnd() * 700, y = 560 + rnd() * 120; if (!within(0.75, BANK)(x, y)) continue; h.lift(); await S.path([[x - 30, y, 1], [x + 30, y - 10, 1]], 2); }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('5-finish');
  log('done');
})();
