// A Gala apple, fifth pass: the fourth (worked by the paper's stage) with
// the streaks from paintings/streak-swatches.js: dark ones from a thirsty
// brush at satin, pale ones lifted at damp, a few dry-brush flecks on the
// dried red. See notes/journal.md. Painted from the painter's photo
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
  const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const clipTo = (poly, stroke) => stroke.filter(([x, y]) => inside(poly, x, y));
  const inApple = APPLE.filter((_, i) => i % 12 === 0).map(([x, y]) => { const [cx, cy] = centroid(APPLE); return [cx + (x - cx) * 0.7, cy + (y - cy) * 0.7]; });
  const skip = async (stage, points) => log(`skipped ${await S.skipTo(stage, { points })}s to ${stage}`);
  const stageAt = async p => (await S.sense(p[0], p[1], 8)).stage;

  log('pencil: the apple, its stem cavity and stem, a hint of the shadow');
  S.tool('pencil'); V.pencilRadius = 2; V.pencilDark = 0.3;
  await S.path([...APPLE, APPLE[0]].map(([x, y]) => [x, y, 0.5]), 2);
  await S.path([...CAVITY, CAVITY[0]].map(([x, y]) => [x, y, 0.35]), 2);
  await S.path(STEM.map(([x, y]) => [x, y, 0.5]), 3);
  V.pencilDark = 0.15;
  await S.path([...SHADOW, SHADOW[0]].map(([x, y]) => [x, y, 0.3]), 2);

  log('masking fluid on the glints');
  h.setBrushPreset('round'); S.tool('mask'); V.brushRadius = 4;
  for (const g of GLINTS) await M.washAround(oval(g), { mist: false, avoidPaint: false });

  log('the floor: a pale moist wash, then skipped to dry');
  h.setBrushPreset('mop'); V.brushRadius = 60; V.brushPigment = 0.06;
  h.setBrush([['Transparent Yellow Oxide', 3], ['Raw Umber', 2], ['Perylene Violet', 1]]);
  S.tool('wash');
  await S.wash(null, { kind: 'flat', paper: 'moist' });
  await skip('dry');
  await S.look('1-floor');

  // A stroke clipped to a region, split into its runs inside (joining
  // them drew lines across the gaps).
  const runsIn = (ok, stroke) => { const out = []; let cur = []; for (const p of stroke) { if (ok(p[0], p[1])) cur.push(p); else { if (cur.length > 1) out.push(cur); cur = []; } } if (cur.length > 1) out.push(cur); return out; };
  // Distance from a point to a polygon's outline.
  const edgeDist = (poly, x, y) => { let d = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1))); d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return d; };
  // The brush's belly stays a brush-width inside the outline; the tip cuts
  // the edge (centres clipped to the outline spilled the mop past it).
  const inBody = (x, y) => inside(APPLE, x, y) && !inside(CAVITY, x, y) && edgeDist(APPLE, x, y) > V.brushRadius * 0.7 && edgeDist(CAVITY, x, y) > V.brushRadius * 0.6;
  const stroke = async (s, f = 3) => { for (const r of runsIn(inBody, s)) { h.lift(); await S.path(r, f); } };
  const inStreak = (x, y) => inside(APPLE, x, y) && !inside(CAVITY, x, y) && edgeDist(APPLE, x, y) > V.brushRadius * 0.9;
  const streak = async (s, f = 2) => { for (const r of runsIn(inStreak, s)) { h.lift(); await S.path(r, f); } };

  log('the cavity first, a pale yellow-green, and let it reach damp so the red can meet it without running in');
  h.setBrushPreset('round'); V.brushRadius = 14; V.brushPigment = 0.12;
  h.setBrush([['Isoindolinone Yellow', 5], ['Perylene Green', 1]]);
  await S.wash(CAVITY, { kind: 'flat', paper: 'moist' });
  await skip('damp', [centroid(CAVITY)]);

  log('the body: dampened to satin, then mop strokes curving around the light (upper left), blush to red to maroon, all melting together');
  const body = M.maskOf(APPLE), cav = M.maskOf(CAVITY);
  for (let c = 0; c < body.length; c++) if (cav[c]) body[c] = 0;
  await S.dampen(body, 1, 0.05);
  const L = P([200, 190]);
  const blush = [['Pyrrole Scarlet', 2], ['Isoindolinone Yellow', 2], ['Pyrrole Rubine', 1]];
  const red = [['Pyrrole Rubine', 3], ['Pyrrole Scarlet', 1], ['Raw Umber', 1]];
  const dusk = [['Pyrrole Rubine', 2], ['Perylene Maroon', 2], ['Raw Umber', 1]];
  S.tool('paint');
  const mixAt = (x, y) => { const R = Math.hypot(x - L[0], y - L[1]); return R < 110 ? red : R < 330 ? red : dusk; };
  log('cut in along the outline with the tip, inside it');
  h.setBrushPreset('round'); V.brushRadius = 14; V.dipLoad = 0.5;
  const ring = [...APPLE, APPLE[0]];
  for (let k = 0; k + 1 < ring.length; k += 6) {
    const seg = ring.slice(k, k + 7).map(([x, y]) => { const [cx, cy] = centroid(APPLE), d = Math.hypot(x - cx, y - cy); return [x - (x - cx) / d * 12, y - (y - cy) / d * 12, 0.9]; }).filter(([x, y]) => !inside(CAVITY, x, y));
    if (seg.length < 2) continue;
    const [mx, my] = seg[0], R = Math.hypot(mx - L[0], my - L[1]);
    h.setBrush(mixAt(mx, my)); V.brushPigment = R < 110 ? 0.25 : R < 330 ? 0.4 + 0.25 * (R - 110) / 220 : 0.7;
    h.lift(); await S.path(seg, 3);
  }
  log('and around the cavity, the tip right against its edge (damp: the red cannot run in)');
  h.setBrush(red); V.brushPigment = 0.35;
  { const [cx, cy] = centroid(CAVITY), ringC = [...CAVITY, CAVITY[0]].map(([x, y]) => { const d = Math.hypot(x - cx, y - cy); return [x + (x - cx) / d * 7, y + (y - cy) / d * 7, 0.8]; }).filter(([x, y]) => inside(APPLE, x, y));
    for (let k = 0; k + 1 < ringC.length; k += 8) { h.lift(); await S.path(ringC.slice(k, k + 9), 3); } }
  h.setBrushPreset('mop'); V.brushRadius = 30; V.dipLoad = 0.5;
  for (let R = 40; R <= 520; R += 42) {
    h.setBrush(R < 330 ? red : dusk);
    V.brushPigment = R < 110 ? 0.25 : R < 330 ? 0.4 + 0.3 * (R - 110) / 220 : 0.75;
    await stroke(pts(t => { const a = -Math.PI + 2 * Math.PI * t; return [L[0] + Math.cos(a) * R, L[1] + Math.sin(a) * R, 1]; }, Math.max(8, Math.round(R / 8))));
  }
  log('blush patches on the left and middle, dropped in while it shines');
  h.setBrush(blush); V.brushRadius = 20; V.brushPigment = 0.4;
  for (const c of [[140, 420], [300, 330], [420, 480]]) { const [x, y] = P(c); await stroke(pts(t => [x - 22 + 44 * t, y + 8 * Math.sin(t * 3), 0.9], 4)); }
  V.dipLoad = 1;
  log(`body laid; centre is ${await stageAt(centroid(APPLE))}`);
  await S.look('2-red');

  // (At moist they held as crisp spokes; at satin they melt to a soft
  // mottle, which is closer to the photo.)
  log('at satin: uneven streaks from the cavity down the sides and front, a thirsty brush (they hold, soft-edged)');
  await skip('satin', inApple);
  const [ccx, ccy] = centroid(CAVITY);
  h.setBrushPreset('round'); V.dipLoad = 0.5;
  h.setBrush(dusk);
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 11; k++) {
    const a = -0.4 + k * 0.36 + (rnd() - 0.5) * 0.15, len = 130 + rnd() * 120;
    V.brushRadius = 6 + rnd() * 5; V.brushPigment = 0.3 + rnd() * 0.15; V.dipLoad = 0.1;   // a thirsty brush: drier than the paper, so it holds, softly
    await streak(pts(t => [ccx + Math.cos(a) * (80 + len * t) + 12 * Math.sin(t * 5 + k), ccy + Math.sin(a) * (70 + len * t), 0.8 - 0.5 * t], 10));
  }
  log('at moist: the cavity funnel, a darker green-brown along its lower inside wall (holds a soft edge)');
  await skip('moist', inApple);
  h.setBrushPreset('round'); V.brushRadius = 7; V.brushPigment = 0.25; V.dipLoad = 0.5;
  h.setBrush([['Perylene Green', 1], ['Raw Umber', 1], ['Isoindolinone Yellow', 2]]);
  h.lift(); await S.path(pts(t => { const [x, y] = CAVITY[Math.round((CAVITY.length - 1) * (0.4 + 0.45 * t))]; const [cx, cy] = centroid(CAVITY); return [x + (cx - x) * 0.1, y + (cy - y) * 0.1, 0.8]; }, 10), 3);
  V.dipLoad = 1;
  await S.look('3-streaks');

  log('at damp: a thirsty brush (Lift) takes out pale streaks and the lit dome (the dry Water brush only drinks surface water, and damp paper has none)');
  await skip('damp', inApple);
  log(`centre is ${await stageAt(centroid(APPLE))}`);
  S.tool('lift'); h.setBrushPreset('round'); V.dipLoad = 0.2;
  for (let k = 0; k < 9; k++) {
    const a = -0.22 + k * 0.4 + (rnd() - 0.5) * 0.1, len = 110 + rnd() * 100;
    V.brushRadius = 4 + rnd() * 3;
    for (let pass = 0; pass < 2; pass++) await streak(pts(t => [ccx + Math.cos(a) * (90 + len * t), ccy + Math.sin(a) * (80 + len * t), 0.9 - 0.4 * t], 8), 3);
  }
  V.brushRadius = 22;
  for (let pass = 0; pass < 3; pass++) await stroke(pts(t => { const a = -2.6 + 1.6 * t; return [L[0] + 25 + Math.cos(a) * 35, L[1] + 25 + Math.sin(a) * 35, 0.8]; }, 8), 3);
  V.dipLoad = 1;
  await skip('dry');
  log('dry: a few broken dry-brush flecks along the streaks (light, fast, a nearly dry brush)');
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.15; V.brushPigment = 0.3; V.brushRadius = 7; h.setBrush(dusk);
  for (let k = 0; k < 5; k++) {
    const a = -0.2 + k * 0.7 + (rnd() - 0.5) * 0.2, len = 90 + rnd() * 80;
    await streak(pts(t => [ccx + Math.cos(a) * (150 + len * t), ccy + Math.sin(a) * (140 + len * t), 0.3], 8), 1);
  }
  V.dipLoad = 1;
  await S.look('4-apple');

  log('the cast shadow: crisp in the photo (strong light), so on dry floor: a moist graded wash, darkest at the apple');
  h.setBrushPreset('mop'); V.brushRadius = 30; V.brushPigment = 0.22;
  h.setBrush([['French Ultramarine', 2], ['Transparent Red Oxide', 1], ['Raw Umber', 2]]);
  S.tool('wash');
  await S.wash(SHADOW, { kind: 'graded', fadeTo: 0.6, paper: 'moist' });
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 12; V.brushPigment = 0.45;
  await S.path(pts(t => { const [x, y] = APPLE[Math.round(APPLE.length * (0.30 + 0.28 * t)) % APPLE.length]; return [x, y + 8, 0.7]; }, 12), 3);
  V.brushRadius = 4; V.brushPigment = 0.6;
  await S.path([P([835, 802]), P([895, 815])].map(([x, y]) => [x, y, 0.8]), 4);

  log('the stem');
  h.setBrushPreset('rigger'); V.brushRadius = 5; V.brushPigment = 0.7;
  h.setBrush([['Raw Umber', 2], ['Transparent Red Oxide', 1]]);
  await S.path(STEM.map(([x, y], i) => [x, y, 1 - i * 0.12]), 4);
  await skip('dry');

  log('the floor: the plank seam and a few long grain lines');
  h.setBrushPreset('rigger'); V.brushRadius = 2.5; V.brushPigment = 0.3;
  h.setBrush([['Raw Umber', 2], ['Transparent Yellow Oxide', 1]]);
  for (const [y0, y1] of [[0, 95], [720, 997]]) await S.path([P([625, y0]), P([632, y1])].map(([x, y]) => [x, y, 0.9]), 20);
  V.brushPigment = 0.15; V.brushRadius = 1.8;
  seed = 7;
  for (const x0 of [760, 860, 960, 20]) {
    const amp = 40 + rnd() * 50, f = 260 + rnd() * 200, ph = rnd() * 6;
    const stroke = pts(t => { const y = t * 997; return [P([x0 + amp * Math.sin(y / f + ph) + 15 * Math.sin(y / 70 + ph), 0])[0], 0.77 * y, 0.25 + 0.5 * Math.abs(Math.sin(t * 3 + ph))]; }, 40)
      .filter(([x, y]) => !inside(APPLE, x, y) && !inside(SHADOW, x, y));
    if (stroke.length > 1) await S.path(stroke, 2);
  }
  await skip('dry');

  log('peel the glints, soften their edges with a barely damp brush');
  S.unmask(); await new Promise(r => setTimeout(r, 400));
  S.tool('water'); h.setBrushPreset('round'); V.brushRadius = 4; V.dipLoad = 0.3;
  for (const g of GLINTS) await S.path(oval({ ...g, rx: g.rx + 2, ry: g.ry + 2 }, 20).map(([x, y]) => [x, y, 0.5]), 2);
  V.dipLoad = 1;
  await skip('dry');
  await S.look('5-finish');
  log('done');
})();
