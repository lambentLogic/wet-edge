// A Gala apple on a pale wooden floor, painted from the painter's photo
// (.local/refs/gala_apple.jpeg, their own). Light from the upper left; a long,
// cool shadow to the lower right with the stem's shadow at its tip; red
// streaked over yellow, a yellow-green stem cavity, two crisp glints.
// Coordinates are traced from the photo (scaled to 1024 wide) and mapped
// onto the sheet. Run with tools/paint.mjs.
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
const pts = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
const P = ([x, y]) => [118 + 0.77 * x, 0.77 * y];   // photo -> sheet
// Smooth a traced polygon (closed) with a few passes of corner cutting.
const smooth = (poly, n = 3) => { let p = poly; for (let k = 0; k < n; k++) p = p.flatMap((a, i) => { const b = p[(i + 1) % p.length]; return [[a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]]; }); return p; };

const APPLE = smooth([[320, 40], [450, 40], [560, 80], [640, 150], [690, 240], [708, 340], [705, 440], [690, 530], [650, 600], [600, 660], [520, 710], [420, 730], [320, 722], [220, 692], [140, 640], [80, 580], [40, 500], [20, 400], [25, 300], [55, 210], [110, 130], [190, 70], [260, 45]].map(P));
const CAVITY = smooth([[340, 120], [420, 100], [500, 130], [540, 200], [510, 265], [440, 285], [375, 262], [345, 200]].map(P));
const STEM = [[440, 272], [475, 225], [520, 185], [560, 162], [585, 160]].map(P);
const SHADOW = smooth([[190, 690], [260, 800], [360, 890], [480, 945], [610, 950], [740, 905], [840, 820], [888, 720], [870, 610], [810, 545], [700, 520], [660, 590], [560, 690], [420, 735], [300, 725]].map(P));
const GLINTS = [
  { c: P([185, 185]), rx: 14, ry: 22, a: -0.5 },
  { c: P([560, 244]), rx: 22, ry: 7, a: -0.3 },
  { c: P([235, 150]), rx: 6, ry: 5, a: 0 },
];
const oval = ({ c: [cx, cy], rx, ry, a }, n = 16) => pts(t => { const u = t * 2 * Math.PI, x = Math.cos(u) * rx, y = Math.sin(u) * ry; return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]; }, n);
const centroid = poly => [poly.reduce((t, p) => t + p[0], 0) / poly.length, poly.reduce((t, p) => t + p[1], 0) / poly.length];

window.__paintDone = (async () => {
  h.setPaper('coldPress', 5); h.setTone('natural'); S.clear();

  log('pencil: the apple, its stem cavity and stem, a hint of the shadow');
  S.tool('pencil'); V.pencilRadius = 2; V.pencilDark = 0.3;
  await S.path([...APPLE, APPLE[0]].map(([x, y]) => [x, y, 0.5]), 2);
  await S.path([...CAVITY, CAVITY[0]].map(([x, y]) => [x, y, 0.35]), 2);
  await S.path(STEM.map(([x, y]) => [x, y, 0.5]), 3);
  V.pencilDark = 0.15;
  await S.path([...SHADOW, SHADOW[0]].map(([x, y]) => [x, y, 0.3]), 2);
  await S.look('1-sketch');

  log('masking fluid on the glints');
  h.setBrushPreset('round'); S.tool('mask'); V.brushRadius = 4;
  for (const g of GLINTS) await M.washAround(oval(g), { mist: false, avoidPaint: false });

  // Clip a stroke to the apple (streaks and glazes must stay inside it).
  const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const clipTo = (poly, stroke) => stroke.filter(([x, y]) => inside(poly, x, y));

  log('the floor: pale yellow oxide greyed with raw umber and a touch of violet (ochre and white, in paper terms)');
  h.setBrushPreset('mop'); V.brushRadius = 60; V.brushPigment = 0.06;
  h.setBrush([['Transparent Yellow Oxide', 3], ['Raw Umber', 2], ['Perylene Violet', 1]]);
  S.tool('wash');
  await S.wash([[-10, -10], [1034, -10], [1034, 778], [-10, 778]], { kind: 'flat' });
  log(`floor dry after ${(await M.waitDry([[100, 100], [900, 100], [900, 700], [100, 700]], { maxS: 400 })).toFixed(1)}s`);

  log('layer 1: the apple underpainting, pale yellow, with warm blush patches dropped in');
  h.setBrushPreset('mop'); V.brushRadius = 34; V.brushPigment = 0.3;
  h.setBrush([['Isoindolinone Yellow', 2], ['Transparent Yellow Oxide', 1]]);
  await S.wash(APPLE, { kind: 'flat' });
  S.tool('paint'); V.brushRadius = 22; V.brushPigment = 0.45;
  h.setBrush([['Isoindolinone Yellow', 2], ['Pyrrole Scarlet', 1]]);
  for (const c of [[130, 420], [300, 330], [220, 560]]) await S.path(pts(t => { const [x, y] = P(c); return [x - 25 + 50 * t, y + 10 * Math.sin(t * 3), 0.8]; }, 4), 3);
  log(`underpainting dry after ${(await M.waitDry(APPLE.filter((_, i) => i % 10 === 0), { maxS: 300 })).toFixed(1)}s`);
  await S.look('2-underpainting');

  log('layer 2, wet-in-wet: the red, turning yellow toward the cavity and the blush patches, so they blend');
  const patchC = [P([140, 410]), P([290, 325]), centroid(CAVITY)], patchR = [55, 38, 70];
  const red = [['Pyrrole Rubine', 3], ['Pyrrole Scarlet', 2], ['Raw Umber', 1]];
  const yellowish = [['Isoindolinone Yellow', 2], ['Pyrrole Scarlet', 1]];
  S.tool('paint'); h.setBrushPreset('mop'); V.brushRadius = 30; V.brushPigment = 0.55;
  h.setBrush(red);
  await S.dampen(M.maskOf(APPLE));
  await M.washAround(APPLE, { mist: false, avoidPaint: false, even: true,
    brushAt: (x, y) => (patchC.some((c, i) => Math.hypot(x - c[0], y - c[1]) < patchR[i] * 0.77) ? yellowish : red) });
  log('the form and the streaks, dropped in while the red is damp');
  V.brushRadius = 26; V.brushPigment = 0.8;
  h.setBrush([['Pyrrole Rubine', 2], ['Perylene Maroon', 2], ['Raw Umber', 1]]);
  const [acx, acy] = P([380, 400]);
  for (const [a0, a1, rr] of [[-0.3, 1.9, 0.82], [0.0, 1.6, 0.68], [0.3, 1.3, 0.55]]) {
    const stroke = clipTo(APPLE, pts(t => { const a = a0 + (a1 - a0) * t; return [acx + Math.cos(a) * 265 * rr, acy + Math.sin(a) * 270 * rr, 0.9]; }, 12));
    if (stroke.length > 1) await S.path(stroke, 3);
  }
  h.setBrushPreset('rigger'); V.brushRadius = 3; V.brushPigment = 0.7;
  h.setBrush([['Pyrrole Rubine', 2], ['Perylene Maroon', 1]]);
  const [scx, scy] = centroid(CAVITY);
  for (let k = 0; k < 22; k++) {
    const a = -2.8 + k * 0.27 + 0.1 * Math.sin(k * 7);
    const stroke = clipTo(APPLE, pts(t => [scx + Math.cos(a) * (80 + 170 * t), scy + Math.sin(a) * (70 + 170 * t) + 30 * t * t, 0.6 - 0.4 * t], 10));
    if (stroke.length > 1) await S.path(stroke, 2);
  }
  log(`apple dry after ${(await M.waitDry(APPLE.filter((_, i) => i % 10 === 0), { maxS: 300 })).toFixed(1)}s`);
  await S.look('3-red');

  log('the core shadow: one glaze, low and right, into dampened paper so its edge melts');
  const core = smooth([[690, 470], [680, 540], [640, 610], [580, 670], [500, 712], [420, 725], [430, 690], [520, 650], [600, 580], [650, 500]].map(P));
  S.tool('wash');
  await S.wash(smooth([[708, 400], [700, 560], [640, 640], [520, 715], [380, 735], [420, 660], [560, 580], [640, 460]].map(P)), { dampenOnly: true });
  h.setBrushPreset('round'); V.brushRadius = 16; V.brushPigment = 0.55;
  h.setBrush([['Perylene Maroon', 2], ['Perylene Violet', 1]]);
  await S.wash(core, { kind: 'flat', dampen: false });
  log(`core dry after ${(await M.waitDry(core.filter((_, i) => i % 6 === 0), { maxS: 300 })).toFixed(1)}s`);

  log('the stem cavity: a yellow-green glaze over the yellowish red there, deeper at its inner lower edge; the stem');
  h.setBrushPreset('round'); V.brushRadius = 12; V.brushPigment = 0.2;
  h.setBrush([['Isoindolinone Yellow', 3], ['Perylene Green', 1]]);
  S.tool('wash');
  await S.wash(CAVITY, { kind: 'flat', dampen: true });
  S.tool('paint'); V.brushRadius = 8; V.brushPigment = 0.45;
  h.setBrush([['Perylene Green', 1], ['Raw Umber', 1], ['Isoindolinone Yellow', 1]]);
  await S.path(pts(t => { const [x, y] = CAVITY[Math.round(CAVITY.length * (0.55 + 0.3 * t))]; return [x + 6, y - 6, 0.7]; }, 8), 3);
  h.setBrushPreset('rigger'); V.brushRadius = 5; V.brushPigment = 0.7;
  h.setBrush([['Raw Umber', 2], ['Transparent Red Oxide', 1]]);
  await S.path(STEM.map(([x, y], i) => [x, y, 1 - i * 0.12]), 4);
  await M.waitDry([centroid(CAVITY)], { maxS: 200 });

  log('the cast shadow: a cool grey (ultramarine and red oxide) into damp paper, darkest at the apple');
  S.tool('wash');
  await S.wash(SHADOW.map(([x, y]) => [x + (x - 600) * 0.04, y + (y - 650) * 0.05]), { dampenOnly: true });
  h.setBrushPreset('mop'); V.brushRadius = 30; V.brushPigment = 0.4;
  h.setBrush([['French Ultramarine', 2], ['Transparent Red Oxide', 1], ['Raw Umber', 1]]);
  await S.wash(SHADOW, { kind: 'graded', fadeTo: 0.6, dampen: false });
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 12; V.brushPigment = 0.8;
  await S.path(pts(t => { const [x, y] = APPLE[Math.round(APPLE.length * (0.30 + 0.28 * t)) % APPLE.length]; return [x, y + 8, 0.7]; }, 12), 3);
  V.brushRadius = 4; V.brushPigment = 0.6;
  await S.path([P([835, 802]), P([895, 815])].map(([x, y]) => [x, y, 0.8]), 4);
  log(`shadow dry after ${(await M.waitDry([P([600, 850]), P([450, 800])], { maxS: 300 })).toFixed(1)}s`);

  log('the floor: the plank seam and a few long flowing grain lines');
  h.setBrushPreset('rigger'); V.brushRadius = 2.5; V.brushPigment = 0.3;
  h.setBrush([['Raw Umber', 2], ['Transparent Yellow Oxide', 1]]);
  for (const [y0, y1] of [[0, 95], [720, 997]]) await S.path([P([625, y0]), P([632, y1])].map(([x, y]) => [x, y, 0.9]), 20);
  V.brushPigment = 0.15; V.brushRadius = 1.8;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const x0 of [760, 860, 960, 20]) {
    const amp = 40 + rnd() * 50, f = 260 + rnd() * 200, ph = rnd() * 6;
    const stroke = pts(t => { const y = t * 997; return [...P([x0 + amp * Math.sin(y / f + ph) + 15 * Math.sin(y / 70 + ph)]).slice(0, 1).concat([0.77 * y]), 0.25 + 0.5 * Math.abs(Math.sin(t * 3 + ph))]; }, 40)
      .filter(([x, y]) => !inside(APPLE, x, y) && !inside(SHADOW, x, y));
    if (stroke.length > 1) await S.path(stroke, 2);
  }
  log(`all dry after ${(await M.waitDry([P([900, 400])])).toFixed(1)}s`);

  log('peel the glints, then soften their edges with a damp brush');
  S.unmask(); await new Promise(r => setTimeout(r, 400));
  S.tool('water'); h.setBrushPreset('round'); V.brushRadius = 4; V.dipLoad = 0.4;
  for (const g of GLINTS) await S.path(oval({ ...g, rx: g.rx + 2, ry: g.ry + 2 }, 20).map(([x, y]) => [x, y, 0.5]), 2);
  V.dipLoad = 1;
  await S.look('3-finish');
  log('done');
})();
