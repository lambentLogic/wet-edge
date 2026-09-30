// A Gala apple, sixth pass, in the painter's own order and pigments from
// their paper attempt (.local/refs/apple process photos irl): cool shadows
// first (quinacridone rose + a touch of phthalo turquoise), streaky on the
// apple; the cavity in bismuth yellow, stem and seam in raw umber; floor
// grain in quinacridone rose under an ochre wash (transparent yellow oxide,
// titanium buff, a touch of perylene violet); yellow blush; the red last
// (pyrrole rubine + a touch of perylene violet) in strokes following the
// form, gaps left as the pale streaks. Painted from the painter's photo
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
  const edgeDist = (poly, x, y) => { let d = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1))); d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return d; };
  const runsIn = (ok, stroke) => { const out = []; let cur = []; for (const p of stroke) { if (ok(p[0], p[1])) cur.push(p); else { if (cur.length > 1) out.push(cur); cur = []; } } if (cur.length > 1) out.push(cur); return out; };
  const inBody = (x, y) => inside(APPLE, x, y) && !inside(CAVITY, x, y) && edgeDist(APPLE, x, y) > V.brushRadius * 0.6;
  const stroke = async (s, f = 3) => { for (const r of runsIn(inBody, s)) { h.lift(); await S.path(r, f); } };
  const skip = async (stage, points) => log(`skipped ${await S.skipTo(stage, { points })}s to ${stage}`);
  const [acx, acy] = centroid(APPLE), [ccx, ccy] = centroid(CAVITY);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Meridians: strokes from the cavity down over the form to the lower
  // outline, bowed outward like lines of longitude.
  const lower = APPLE.filter(([x, y]) => y > ccy + 40);
  const meridian = (u, bow = 0.35) => { const [ex, ey] = lower[Math.round(u * (lower.length - 1))]; const sx = ccx + (ex - ccx) * 0.25, sy = ccy + 60, cx = ex + (ex - acx) * bow, cy = (sy + ey) / 2; return pts(t => [(1 - t) ** 2 * sx + 2 * t * (1 - t) * cx + t * t * ex, (1 - t) ** 2 * sy + 2 * t * (1 - t) * cy + t * t * ey, 0.9 - 0.3 * t], 14); };

  log('pencil: the apple, cavity, stem, the shadow, the plank seam');
  S.tool('pencil'); V.pencilRadius = 2; V.pencilDark = 0.3;
  await S.path([...APPLE, APPLE[0]].map(([x, y]) => [x, y, 0.5]), 2);
  await S.path([...CAVITY, CAVITY[0]].map(([x, y]) => [x, y, 0.35]), 2);
  await S.path(STEM.map(([x, y]) => [x, y, 0.5]), 3);
  V.pencilDark = 0.15;
  await S.path([...SHADOW, SHADOW[0]].map(([x, y]) => [x, y, 0.3]), 2);

  log('masking fluid on the glints');
  h.setBrushPreset('round'); S.tool('mask'); V.brushRadius = 4;
  for (const g of GLINTS) await M.washAround(oval(g), { mist: false, avoidPaint: false });

  const violet = [['Quinacridone Rose', 3], ['Phthalo Turquoise', 2]];
  log('shadows first: the cast shadow, wet, in rose + a touch of turquoise');
  h.setBrushPreset('mop'); V.brushRadius = 30; V.brushPigment = 0.1; h.setBrush(violet);
  S.tool('wash');
  await S.wash(SHADOW, { kind: 'flat', paper: 'wet' });
  log('the apple shadow side: dampened to satin, then streaky strokes down the form, lower and right, so they soften into a streaky wash');
  const L = P([200, 190]);
  const shade = M.maskOf(APPLE);
  for (let c = 0; c < shade.length; c++) { const x = c % 1024, y = (c / 1024) | 0; if (Math.hypot(x - L[0], y - L[1]) < 200) shade[c] = 0; }
  await S.dampen(shade, 1, 0.03);
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.4; h.setBrush(violet);
  for (let k = 0; k < 14; k++) {
    const u = 0.42 + 0.53 * k / 13 + (rnd() - 0.5) * 0.03;
    V.brushRadius = 14 + rnd() * 6; V.brushPigment = 0.08 + 0.14 * u;
    const m = meridian(u); await stroke(m.slice(5), 3);
  }
  V.dipLoad = 1;
  await skip('dry');

  log('the cavity in bismuth yellow; stem and plank seam in raw umber');
  h.setBrushPreset('round'); V.brushRadius = 12; V.brushPigment = 0.2; h.setBrush('Bismuth Vanadate Yellow');
  S.tool('wash'); await S.wash(CAVITY, { kind: 'flat', paper: 'moist' });
  S.tool('paint'); h.setBrushPreset('rigger'); V.brushRadius = 5; V.brushPigment = 0.7; h.setBrush('Raw Umber');
  await S.path(STEM.map(([x, y], i) => [x, y, 1 - i * 0.12]), 4);
  V.brushRadius = 3; V.brushPigment = 0.45;
  for (const [y0, y1] of [[0, 95], [720, 997]]) { h.lift(); await S.path([P([625, y0]), P([632, y1])].map(([x, y]) => [x, y, 0.9]), 20); }
  await S.look('1-shadows');

  log('floor grain in pale quinacridone rose, wavy');
  h.setBrushPreset('rigger'); V.brushRadius = 2.5; V.brushPigment = 0.18; h.setBrush('Quinacridone Rose');
  for (const x0 of [30, 90, 690, 760, 830, 900, 970]) {
    const amp = 20 + rnd() * 30, f = 120 + rnd() * 120, ph = rnd() * 6;
    for (const r of runsIn((x, y) => !inside(APPLE, x, y) && !inside(SHADOW, x, y), pts(t => { const y = t * 768; return [x0 + amp * Math.sin(y / f + ph) + 8 * Math.sin(y / 37 + ph), y, 0.4 + 0.5 * Math.abs(Math.sin(t * 4 + ph))]; }, 60))) { h.lift(); await S.path(r, 2); }
  }
  await skip('dry');
  log('the ochre floor wash over it all but the apple, laid wet');
  const floor = new Uint8Array(1024 * 768).fill(1), am = M.maskOf(APPLE);
  for (let c = 0; c < floor.length; c++) if (am[c]) floor[c] = 0;
  h.setBrushPreset('mop'); V.brushRadius = 60; V.brushPigment = 0.035;
  h.setBrush([['Transparent Yellow Oxide', 3], ['Titanium Buff', 2], ['Perylene Violet', 0.6]]);
  S.tool('wash'); await S.wash({ mask: floor }, { kind: 'flat', paper: 'wet' });
  await skip('dry');
  await S.look('2-floor');

  log('yellow blush: bismuth patches into satin-dampened paper, left and middle');
  const body = M.maskOf(APPLE), cav = M.maskOf(CAVITY);
  for (let c = 0; c < body.length; c++) if (cav[c]) body[c] = 0;
  await S.dampen(body, 1, 0.03);
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 22; V.brushPigment = 0.3; V.dipLoad = 0.3; h.setBrush('Bismuth Vanadate Yellow');
  for (const c of [[120, 400], [180, 250], [320, 520], [440, 330]]) { const [x, y] = P(c); await stroke(pts(t => [x - 25 + 50 * t, y - 15 + 30 * t, 0.9], 4)); }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('3-yellow');

  log('the red last: rubine + a touch of perylene violet, broad overlapping strokes radiating from the cavity like lines of longitude; a few left out, and their gaps are the pale streaks');
  h.setBrush([['Pyrrole Rubine', 5], ['Perylene Violet', 1]]);
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.5;
  log('cut in along the outline with the tip first, so the edge is clean');
  V.brushRadius = 9; V.brushPigment = 0.3;
  { const out = [...APPLE, APPLE[0]].map(([x, y]) => { const d = Math.hypot(x - acx, y - acy); return [x - (x - acx) / d * 8, y - (y - acy) / d * 8, 0.9]; });
    for (let k = 0; k + 1 < out.length; k += 8) { const seg = out.slice(k, k + 9).filter(([x, y]) => !inside(CAVITY, x, y)); if (seg.length > 1) { h.lift(); await S.path(seg, 3); } } }
  const ring = APPLE.filter((_, i) => i % 6 === 0);
  for (let k = 0; k < ring.length; k++) {
    if (rnd() < 0.18) continue;   // a gap: a pale streak
    const [ex, ey] = ring[k];
    const sx = ccx + (ex - ccx) * 0.3, sy = ccy + (ey - ccy) * 0.3;
    const mx = (sx + ex) / 2, my = (sy + ey) / 2, bx = mx + (mx - acx) * 0.2, by = my + (my - acy) * 0.2;
    V.brushRadius = 16 + rnd() * 6; V.brushPigment = 0.2 + 0.08 * rnd() + 0.1 * Math.min(1, Math.hypot(ex - P([200, 190])[0], ey - P([200, 190])[1]) / 400);
    await stroke(pts(t => [(1 - t) ** 2 * sx + 2 * t * (1 - t) * bx + t * t * ex, (1 - t) ** 2 * sy + 2 * t * (1 - t) * by + t * t * ey, 0.9], 10), 3);
  }
  V.dipLoad = 1;
  await skip('dry');
  await S.look('4-red');

  log('a second, lighter red over the shadow side only, where it goes dusky over the violet');
  h.setBrushPreset('round'); V.dipLoad = 0.55;
  for (let k = 0; k < 10; k++) {
    const u = 0.45 + 0.5 * k / 9; V.brushRadius = 12 + rnd() * 4; V.brushPigment = 0.3;
    const m = meridian(u, 0.3); await stroke(m.slice(6), 3);
  }
  V.dipLoad = 1;
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
