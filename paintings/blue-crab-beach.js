// A female blue crab on wet sand, from a reference photo (Claude, Opus 5.5).
// Reference: "Blue crab on the beach. Louisiana", US EPA, public domain
// (commons.wikimedia.org/wiki/File:Blue_crab_on_the_beach._Louisiana_(5984944542).jpg),
// kept in .local/refs/blue-crab. Shapes measured off the photo fitted to the
// canvas with a grid (.local/grid.mjs), colours sampled (.local/sample.mjs):
// a neutral grey sand, a grey-olive shell (bluish mid, dark olive right),
// sky-teal legs, claws nearly white with blue only along their upper edges,
// hot orange fingers with magenta tips, a near-black warm shadow under the shell.
// Order: the whole crab masked; the sand washed freely over the sheet, wet
// hollows and the crab's cast shadows dropped in while it's damp; peel; the
// crab on clean paper; darks; details. (Pass 1 washed the sand 'around' the
// painted crab: a wet wash laid against dry paint flows over it, and greyed
// the whole crab.)
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// ---- measured shapes (canvas cells) ----
// The carapace, seen tilted: its back edge at the top, the toothed front
// edges running down to the face at the bottom, a spine at each side.
const carapace = [
  [352, 252], [400, 232], [450, 207], [520, 193], [600, 196], [680, 213], [740, 242], [800, 290], [860, 330], [905, 349],
  [975, 352],   // right spine tip
  [900, 364], [870, 380], [840, 396], [810, 411], [780, 426], [745, 440], [705, 450], [660, 458], [620, 462],
  [560, 456], [500, 440], [470, 421], [440, 403], [410, 384], [388, 360], [370, 336], [357, 311], [348, 288], [344, 272],
  [330, 262], [255, 236],   // left spine tip
  [345, 252],
];
// tooth tips along the two front edges
const teethL = [[344, 272], [348, 288], [357, 311], [370, 336], [388, 360], [410, 384], [440, 403], [470, 421]];
const teethR = [[900, 364], [870, 380], [840, 396], [810, 411], [780, 426], [745, 440], [705, 450]];
// legs: joints and widths; orange at the joints listed in `o`
const legs = [
  { j: [[470, 232], [398, 203], [330, 214], [212, 226], [186, 236]], w: [16, 15, 17, 16, 3], o: [1, 3] },
  { j: [[402, 256], [300, 305], [236, 346], [124, 381], [108, 408]], w: [20, 19, 18, 17, 3], o: [1, 3] },
  { j: [[432, 300], [372, 318], [312, 330]], w: [15, 14, 12], o: [1] },
  { j: [[790, 318], [880, 322], [896, 342]], w: [18, 17, 4], o: [1] },
  { j: [[868, 384], [916, 392], [940, 470], [926, 548], [906, 590]], w: [16, 17, 17, 15, 4], o: [1, 3] },
  { j: [[838, 420], [876, 438], [900, 518], [888, 562]], w: [16, 17, 16, 4], o: [1, 3] },
];
const paddles = [
  { j: [[440, 215], [395, 191], [372, 160]], w: [14, 12, 12], o: [1],
    blade: [[350, 92], [385, 89], [405, 112], [402, 150], [382, 178], [352, 172], [335, 145], [337, 112]] },
  { j: [[760, 262], [835, 274], [890, 230]], w: [16, 14, 12], o: [0, 1],
    blade: [[815, 150], [860, 140], [905, 165], [930, 205], [915, 245], [880, 250], [845, 225], [822, 190]] },
];
// the chelipeds: arm (merus) with a row of spines, a knobbed carpus, the palm, the fingers
const claws = [
  { arm: [[470, 418], [250, 360]], armW: 40, spines: [[292, 404], [345, 409], [372, 405]],
    carpus: [[255, 362], [205, 412]], carpusW: 44,
    palm: [[190, 425], [240, 430], [262, 470], [268, 530], [255, 560], [225, 560], [195, 520], [178, 470]],
    edge: [[256, 440], [266, 500], [262, 552]],
    finger: [[230, 548], [300, 650]], fingerW: [34, 10], tip: [[300, 650], [318, 692]] },
  { arm: [[520, 470], [790, 482]], armW: 46, spines: [[565, 506], [605, 520], [640, 534], [668, 556]],
    carpus: [[790, 474], [858, 540]], carpusW: 50,
    palm: [[700, 580], [800, 570], [842, 590], [852, 630], [822, 656], [740, 666], [690, 660], [675, 636]],
    edge: [[705, 582], [780, 572], [835, 588]],
    finger: [[696, 640], [562, 656]], fingerW: [30, 10], tip: [[562, 656], [528, 661]] },
];
// the dark hollow under the shell's front, and the shadows on the sand
const underShell = [[430, 428], [480, 452], [560, 470], [640, 470], [700, 460], [780, 440], [800, 470], [760, 520], [700, 560], [620, 566], [540, 560], [470, 530], [430, 480]];

// ---- shaping helpers ----
const CEN = [620, 330];
// Chaikin: rounds a polygon's corners (the paddles and palms read as octagons)
const smooth = (poly, n = 2) => { let p = poly; for (let k = 0; k < n; k++) p = p.flatMap((a, i) => { const b = p[(i + 1) % p.length]; return [lerp(a, b, 0.25), lerp(a, b, 0.75)]; }); return p; };
const inPoly = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
// the shell with notches between the teeth (pass 1 listed only the tips, and
// the wash smoothed the edge into an oval)
const notched = (() => {
  const out = [];
  carapace.forEach((p, i) => {
    out.push(p);
    const q = carapace[(i + 1) % carapace.length];
    const tooth = t => [...teethL, ...teethR].some(([x, y]) => x === t[0] && y === t[1]);
    if (tooth(p) && tooth(q)) { const m = lerp(p, q, 0.5), d = Math.hypot(CEN[0] - m[0], CEN[1] - m[1]); out.push([m[0] + (CEN[0] - m[0]) / d * 9, m[1] + (CEN[1] - m[1]) / d * 9]); }
  });
  return out;
})();
// a limb starts where it comes out from under the shell's edge
const fromEdge = j => { const [a, b] = j; let t = 0; while (t < 1 && inPoly(carapace, ...lerp(a, b, t))) t += 0.02; return [lerp(a, b, Math.max(0, t - 0.04)), ...j.slice(1)]; };
// a tapered finger as a shape: base width w0 to a point, bowed a little
const fingerShape = ([a, b], w0) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, side = [];
  for (let k = 0; k <= 10; k++) { const t = k / 10, p = lerp(a, b, t), hw = w0 / 2 * (1 - t) ** 0.8, bow = 4 * Math.sin(Math.PI * t); side.push([p[0] + nx * (hw + bow), p[1] + ny * (hw + bow)], [p[0] - nx * (hw - bow), p[1] - ny * (hw - bow)]); }
  return [...side.filter((_, i) => i % 2 === 0), ...side.filter((_, i) => i % 2 === 1).reverse()];
};
for (const L of [...legs, ...paddles]) { L.j = fromEdge(L.j); L.w = L.w.map(x => x * 1.35); }
for (const P of paddles) P.blade = smooth(P.blade, 3);
for (const c of claws) {
  c.palm = smooth(c.palm, 2); c.arm = fromEdge(c.arm);
  // spines along the arm's lower edge (pass 3 placed them by eye, and they fell on the sand)
  const [a0, a1] = c.arm, dx = a1[0] - a0[0], dy = a1[1] - a0[1], L = Math.hypot(dx, dy);
  let nx = -dy / L, ny = dx / L; if (ny < 0) { nx = -nx; ny = -ny; }
  c.spines = [0.3, 0.5, 0.68, 0.84].map(t => { const p = lerp(a0, a1, t); return [p[0] + nx * c.armW * 0.42, p[1] + ny * c.armW * 0.42]; });
}
const gap = [[468, 424], [520, 446], [600, 460], [680, 456], [745, 442], [790, 458], [780, 470], [700, 468], [600, 470], [530, 466], [480, 446]];

const pFor = r => Math.min(1, Math.max(0, (r / V.brushRadius - V.taperMin) / (1 - V.taperMin)));
async function limb(j, w, fps = 3) {
  // the brush sized to the widest point (pressure only narrows it: limbs
  // wider than the brush came out capped at its size)
  const R0 = V.brushRadius; V.brushRadius = Math.max(...w) * 1.05;
  const pts = [];
  for (let s = 0; s < j.length - 1; s++) for (let k = 0; k < 6; k++) {
    const t = k / 6, p = lerp(j[s], j[s + 1], t);
    pts.push([p[0], p[1], pFor(Math.max(1, w[s] + (w[s + 1] - w[s]) * t - 1.5 * Math.sin(Math.PI * t)))]);
  }
  const e = j[j.length - 1]; pts.push([e[0], e[1], pFor(w[w.length - 1])]);
  try { await S.path(pts, fps); } finally { V.brushRadius = R0; }
}
const dab = async (p, r, n = 3) => { V.brushRadius = r; await S.path([[p[0], p[1], 0.9], [p[0], p[1], 0.9]], n); };

window.__paintDone = (async () => {
  h.setPaper('coldPress', 64); h.setTone('natural'); S.clear();
  const dry = async () => { S.act('dry', true); try { await S.skipTo('dry'); } finally { S.act('dry', false); } };

  log('pencil: the carapace and the claws, lightly');
  S.tool('pencil'); V.pencilRadius = 2; V.pencilDark = 0.2;
  await S.path(notched.map(p => [...p, 0.3]), 1);
  for (const c of claws) await S.path([...c.palm, c.palm[0]].map(p => [...p, 0.3]), 1);

  log('masking fluid over the whole crab');
  S.tool('mask'); h.setBrushPreset('round');
  const fill = area => M.washAround(area, { mist: false, avoidPaint: false, even: false });
  V.brushRadius = 10;
  await fill(notched);
  for (const c of claws) { await fill(c.palm); await limb(c.finger, [c.fingerW[0] / 2, c.fingerW[1] / 2], 2); }
  for (const P of paddles) await fill(P.blade);
  V.brushRadius = 14;
  for (const L of [...legs, ...paddles]) await limb(L.j, L.w.map(x => x / 2), 2);
  for (const c of claws) { await limb(c.arm, [c.armW / 2, c.armW / 2], 2); await limb(c.carpus, [c.carpusW * 0.5, c.carpusW * 0.55], 2); await limb(c.tip, [c.fingerW[1] * 0.5, 0.5], 2); }
  V.brushRadius = 6;
  for (const sp of [[[345, 256], [256, 236]], [[895, 356], [975, 352]]]) await limb(sp, [10, 1], 2);
  await S.look('mask');

  log('the sand: a neutral grey, laid wet over everything');
  h.setBrushPreset('mop'); V.brushRadius = 50; V.brushPigment = 0.2; V.dipLoad = 1;
  h.setBrush([['Raw Umber', 1.6], ['French Ultramarine', 0.8], ['Transparent Yellow Oxide', 0.3]]);
  S.tool('wash');
  await S.wash(null, { kind: 'flat', paper: 'wet', dampen: true });
  log('wet hollows, dropped in soft while it shines');
  S.tool('paint'); h.setBrushPreset('mop'); V.brushRadius = 40; V.brushPigment = 0.26; V.dipLoad = 0.3;
  h.setBrush([['Raw Umber', 1.4], ['French Ultramarine', 0.9]]);
  for (const st of [[[90, 60], [170, 170], [250, 300]], [[0, 220], [60, 330], [80, 450]], [[420, 740], [500, 640], [620, 610], [740, 700]], [[900, 680], [980, 560], [1020, 420]], [[600, 60], [720, 110], [800, 90]]]) {
    await S.path(st.map((p, k) => [...p, 0.25 + 0.5 * Math.sin(Math.PI * (k + 0.5) / st.length)]), 6);
  }
  log('the crab\'s shadows: soft pools of darker sand, dropped in while it shines, running under the masked crab');
  // (pass 2 laid them at moist with a round: hard brown sticks floating beside the crab, read as twigs)
  await S.skipTo('shiny', { points: [[600, 600]] });
  h.setBrushPreset('mop'); V.brushPigment = 0.42; V.dipLoad = 0.45;
  h.setBrush([['Raw Umber', 1.3], ['French Ultramarine', 1], ['Perylene Maroon', 0.25]]);
  const shade = async (pts, r) => { V.brushRadius = r; await S.path(pts, 6); };
  // the pool under the shell's front and the right claw's arm
  await shade([[430, 450, 0.5], [520, 490, 0.9], [640, 505, 1], [760, 500, 0.8], [820, 470, 0.4]], 30);
  // under the right claw's palm and fingers, along its lower edge
  await shade([[560, 668, 0.3], [660, 676, 0.8], [760, 672, 0.9], [840, 650, 0.6], [870, 610, 0.3]], 20);
  // the left claw's shaded right side, down to the finger tips
  await shade([[262, 440, 0.4], [276, 520, 0.8], [296, 600, 0.6], [318, 690, 0.3]], 16);
  // under the legs on the right, where they stand
  await shade([[945, 380, 0.3], [958, 470, 0.7], [945, 560, 0.6], [915, 612, 0.3]], 14);
  // the legs on the left, faint
  V.brushPigment = 0.3;
  await shade([[200, 238, 0.3], [300, 232, 0.5], [390, 220, 0.3]], 10);
  await shade([[118, 396, 0.3], [210, 372, 0.5], [300, 320, 0.3]], 10);
  // the near-black pool right under her, at satin so it keeps its shape by the crab
  // (pass 3's soft shadows alone left her floating)
  await S.skipTo('satin', { points: [[600, 600]] });
  // thick paint on a nearly dry brush (pass 4's 0.8 at Wetness 0.35 thinned out in the wet
  // sand, and the perylene maroon gave it a rusty halo): a cool dark of the sand's own colours
  h.setBrush([['Raw Umber', 1.4], ['French Ultramarine', 0.8], ['Perylene Green', 0.8]]); V.brushPigment = 1; V.dipLoad = 0.12;
  // (pass 5 laid these on the masking fluid over the claw's arm and palms, and they peeled off
  // with it: they go just outside the silhouette, overlapping the mask's edge)
  await shade([[466, 512, 0.4], [560, 528, 0.9], [660, 536, 1], [760, 532, 0.8], [836, 560, 0.4]], 24);
  V.brushPigment = 0.75;
  await shade([[590, 676, 0.3], [690, 682, 0.8], [790, 676, 0.7], [856, 650, 0.3]], 14);
  await shade([[280, 452, 0.3], [292, 540, 0.7], [312, 640, 0.4]], 11);
  await dry();
  await S.look('sand');
  log('peel the mask');
  await S.unmask();

  log('the shell: grey-olive, bluer through the middle, dark olive to the right');
  h.setBrushPreset('mop'); V.brushRadius = 30; V.brushPigment = 0.28; V.dipLoad = 1;
  h.setBrush([['Transparent Yellow Oxide', 1], ['Perylene Green', 0.6], ['Raw Umber', 1], ['French Ultramarine', 0.6]]);
  S.tool('wash');
  await S.wash(notched, { kind: 'variegated', into: [['Perylene Green', 1.3], ['Raw Umber', 1.2], ['French Ultramarine', 0.5]], direction: 'across', paper: 'moist' });
  log('spines stroked out from the wet shell, darkening to purple-brown points');
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 8; V.brushPigment = 0.5; V.dipLoad = 0.4;
  h.setBrush([['Perylene Maroon', 1], ['Perylene Green', 1.5]]);
  await S.path([[345, 256, 0.9], [300, 246, 0.5], [256, 236, 0]], 6);
  await S.path([[895, 356, 0.9], [940, 354, 0.5], [975, 352, 0]], 6);
  log('at satin: darker along the toothed front edges and the right flank');
  await S.skipTo('satin', { points: [[600, 330]] });
  V.brushRadius = 18; V.brushPigment = 0.45; V.dipLoad = 0.2;
  h.setBrush([['Perylene Green', 1.5], ['Raw Umber', 1.2], ['French Ultramarine', 0.5]]);
  await S.path([[380, 330, 0.3], [430, 385, 0.7], [520, 425, 0.8], [620, 440, 0.8], [720, 428, 0.8], [820, 392, 0.7], [880, 360, 0.3]], 6);
  await S.path([[700, 290, 0.3], [780, 320, 0.8], [840, 345, 0.5]], 6);
  log('at damp: lift the back ridge and the two pale lines across the shell');
  await S.skipTo('damp', { points: [[600, 330]] });
  S.tool('lift'); h.setBrushPreset('round'); V.brushRadius = 10;
  await S.path([[420, 232, 0.5], [500, 208, 0.8], [600, 206, 0.8], [690, 222, 0.5]], 8);
  V.brushRadius = 4;
  await S.path([[520, 292, 0.3], [580, 296, 0.8], [640, 306, 0.6], [700, 322, 0.2]], 8);
  await S.path([[540, 334, 0.3], [600, 338, 0.7], [660, 350, 0.2]], 8);
  await dry();

  log('claws: palms nearly white (a whisper of warm cream), blue along the top edge');
  for (const c of claws) {
    h.setBrushPreset('mop'); V.brushRadius = 14; V.brushPigment = 0.05; V.dipLoad = 0.8;
    h.setBrush([['Transparent Yellow Oxide', 1], ['Raw Umber', 0.3]]);
    S.tool('wash'); await S.wash(c.palm, { kind: 'flat', paper: 'moist' });
    S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 9; V.brushPigment = 0.3; V.dipLoad = 0.45;
    h.setBrush([['Phthalo Blue (GS)', 1], ['Phthalo Turquoise', 0.6]]);
    await S.path(c.edge.map((p, k) => [...p, k === 1 ? 0.6 : 0.25]), 6);
  }
  log('the claws\' arms and carpus: blue above, cream below');
  for (const c of claws) {
    h.setBrush([['Phthalo Blue (GS)', 1], ['Phthalo Turquoise', 1]]); V.brushRadius = c.armW / 2; V.brushPigment = 0.26; V.dipLoad = 0.5;
    const [a0, a1] = c.arm, dx = a1[0] - a0[0], dy = a1[1] - a0[1], L = Math.hypot(dx, dy), nx = dy / L, ny = -dx / L;
    const up = sh => p => [p[0] + nx * sh, p[1] + ny * sh];
    await S.path([[...up(c.armW * 0.18)(a0), 0.6], [...up(c.armW * 0.18)(lerp(a0, a1, 0.5)), 0.7], [...up(c.armW * 0.15)(a1), 0.5]], 8);
    h.setBrush([['Transparent Yellow Oxide', 1], ['Raw Umber', 0.4]]); V.brushPigment = 0.07;
    await S.path([[...up(-c.armW * 0.3)(a0), 0.4], [...up(-c.armW * 0.3)(a1), 0.4]], 8);
    h.setBrush([['Phthalo Blue (GS)', 1], ['Phthalo Turquoise', 1]]); V.brushPigment = 0.24;
    await limb(c.carpus, [c.carpusW * 0.5, c.carpusW * 0.55], 6);
  }
  log('fingers: hot orange shapes, magenta dropped into the wet tips');
  for (const c of claws) {
    S.tool('paint'); h.setBrushPreset('round'); V.brushPigment = 0.42; V.dipLoad = 0.7;
    h.setBrush([['Pyrrole Scarlet', 1], ['Azo Condensation Yellow', 1.2]]);
    await limb(c.finger, [c.fingerW[0] / 2, c.fingerW[1] / 2], 8);
    h.setBrush([['Quinacridone Magenta', 1.5], ['Perylene Maroon', 1]]); V.brushPigment = 0.5; V.dipLoad = 0.4;
    await limb([lerp(c.finger[0], c.finger[1], 0.8), ...c.tip], [c.fingerW[1] * 0.6, c.fingerW[1] * 0.5, 0.5], 6);
  }
  log('legs: sky-teal; paddles a stronger blue with a dark rim');
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 14;
  for (const L of legs) {
    V.brushPigment = 0.24 + (rnd() - 0.5) * 0.06; V.dipLoad = 0.5;
    h.setBrush([['Phthalo Blue (GS)', 1], ['Phthalo Turquoise', 1], ['Raw Umber', 0.15]]);
    await limb(L.j, L.w.map(x => x / 2), 3);
  }
  log('a darker side along each leg, so it reads round');
  await S.wait(3);
  h.setBrush([['Phthalo Blue (GS)', 1], ['French Ultramarine', 0.8], ['Raw Umber', 0.2]]); V.brushPigment = 0.32; V.dipLoad = 0.3;
  for (const L of legs) {
    const sideJ = L.j.map((p, k) => { const q = L.j[Math.min(k + 1, L.j.length - 1)], r = L.j[Math.max(k - 1, 0)], dx = q[0] - r[0], dy = q[1] - r[1], d = Math.hypot(dx, dy) || 1; let nx = -dy / d, ny = dx / d; if (ny < 0) { nx = -nx; ny = -ny; } return [p[0] + nx * L.w[k] * 0.3, p[1] + ny * L.w[k] * 0.3]; });
    await limb(sideJ.slice(0, -1), L.w.slice(0, -1).map(x => x * 0.2), 3);
  }
  for (const P of paddles) {
    h.setBrush([['Phthalo Blue (GS)', 1], ['Phthalo Turquoise', 1], ['Raw Umber', 0.15]]); V.brushPigment = 0.24; V.dipLoad = 0.5;
    await limb(P.j, P.w.map(x => x / 2), 3);
    h.setBrushPreset('mop'); V.brushRadius = 14; V.brushPigment = 0.3; V.dipLoad = 0.8;
    h.setBrush([['Phthalo Blue (GS)', 2], ['French Ultramarine', 1]]);
    S.tool('wash'); await S.wash(P.blade, { kind: 'variegated', into: [['Phthalo Blue (GS)', 1], ['Phthalo Turquoise', 1]], direction: 'across', paper: 'moist' });
    S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 3; V.brushPigment = 0.35; V.dipLoad = 0.35;
    h.setBrush([['French Ultramarine', 1], ['Perylene Violet', 1]]);
    await S.path([...P.blade, P.blade[0]].map(p => [...p, 0.6]), 1);
    V.brushRadius = 14;
  }
  await dry();
  await S.look('crab');

  log('darks on the crab: under the toothed front edge, and the mouthparts\' hollow');
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 12; V.brushPigment = 0.65; V.dipLoad = 0.35;
  h.setBrush([['Perylene Maroon', 1], ['Perylene Green', 1.5], ['Raw Umber', 1]]);
  // filled as the gap between the shell's front edge and the right claw's arm (pass 2's stroke was a stick)
  h.setBrushPreset('mop'); V.brushRadius = 10; V.brushPigment = 0.6; V.dipLoad = 0.7;
  S.tool('wash'); await S.wash(gap, { kind: 'flat', paper: 'moist' });
  S.tool('paint'); h.setBrushPreset('round');

  log('mouthparts: busy cream and olive bits over the dark');
  h.setBrush([['Transparent Yellow Oxide', 1], ['Raw Umber', 0.5]]); V.brushPigment = 0.25; V.dipLoad = 0.3;
  for (let k = 0; k < 40 && k < 400; ) {
    const x = 480 + rnd() * 300, y = 424 + rnd() * 48;
    if (!inPoly(gap, x, y)) continue;
    k++; V.brushRadius = 2 + rnd() * 3; await S.path([[x, y, 0.8], [x + (rnd() - 0.5) * 10, y + rnd() * 4, 0.3]], 3);
  }
  await dry();

  log('details: orange joints, cream-tipped teeth and spines, white speckles');
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.35;
  // knobs at the joints: small, bright orange-red, each a little different, a white catch-light
  // (pass 2: identical brown discs, like rivets)
  h.setBrush([['Pyrrole Scarlet', 1.5], ['Azo Condensation Yellow', 0.5]]); V.brushPigment = 1; V.dipLoad = 0.25;
  const knobs = [...[...legs, ...paddles].flatMap(L => L.o.map(k => L.j[k])), ...claws.map(c => c.carpus[0])];
  for (const k of knobs) await dab([k[0] + (rnd() - 0.5) * 4, k[1] + (rnd() - 0.5) * 4], 6 + rnd() * 3, 5);
  h.setBrush('White Gouache'); V.brushPigment = 0.5;
  for (const k of knobs) await dab([k[0] - 1.5, k[1] - 1.5], 1.3, 1);
  h.setBrush([['Pyrrole Scarlet', 1.5], ['Perylene Maroon', 0.5]]); V.brushPigment = 0.55;
  h.setBrush([['Pyrrole Scarlet', 1], ['Azo Condensation Yellow', 1]]); V.brushPigment = 0.45;
  for (const t of [...teethL, ...teethR]) await dab(t, 3.5, 2);
  for (const c of claws) for (const sp of c.spines) await dab(sp, 5, 3);
  h.setBrush('White Gouache'); V.brushPigment = 0.55; V.dipLoad = 0.25;
  for (const c of claws) for (const sp of c.spines) await dab([sp[0], sp[1] + 3], 3, 2);
  for (const t of [...teethL, ...teethR]) await dab([t[0] + 1, t[1] - 1], 1.8, 2);
  // speckles over the shell, densest through the middle and right
  const inShell = (x, y) => inPoly(carapace, x, y);
  V.brushPigment = 0.45;
  let n = 0;
  while (n < 320) {
    const x = 370 + rnd() * 520, y = 205 + rnd() * 250;
    if (!inShell(x, y) || rnd() > 0.35 + 0.5 * (x - 370) / 520) continue;
    await dab([x, y], 1.2 + rnd() * 1.2, 1); n++;
  }
  await dry();
  await S.look('final');
  log('done');
})();
