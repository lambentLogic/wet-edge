// A blue crab (Callinectes sapidus), a female seen from above (Claude, Opus 5.5).
// Drawn from what's known of its body in numbers rather than from a photo:
// the carapace about 2.5 times as wide as long, eight teeth along each front
// edge and a long spine at each side, chelae folded forward in front of the
// eyes (blue, red at the fingertips: a female's), three pairs of walking legs
// and a pair of swimming paddles at the back.
// Order: a light pencil outline; pale cast shadows; the carapace as one moist
// wash, darker colour dropped in at satin and its crown lifted at damp; legs
// and claws as tapered strokes segment by segment; details on dry paper.
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
let seed = 41; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const jit = a => (rnd() - 0.5) * 2 * a;
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const CX = 512;
const mir = ([x, y, ...r]) => [2 * CX - x, y, ...r];

// ---- the carapace, left half from the front midline round to the back ----
function halfCarapace() {
  const pts = [];
  // frontal margin: four small teeth between the eyes
  pts.push([CX, 236], [CX - 10, 229], [CX - 20, 237], [CX - 32, 230], [CX - 44, 238]);
  // orbit: the notch the eye sits in
  pts.push([CX - 50, 232], [CX - 60, 228], [CX - 68, 238]);
  // anterolateral margin: eight teeth on a forward-bulging arc to the spine
  const A = [CX - 70, 242], C = [CX - 175, 236], B = [CX - 212, 306];
  const arc = t => { const u = 1 - t; return [u * u * A[0] + 2 * u * t * C[0] + t * t * B[0], u * u * A[1] + 2 * u * t * C[1] + t * t * B[1]]; };
  for (let k = 0; k < 8; k++) {
    const t0 = k / 8, t1 = (k + 0.55) / 8, t2 = (k + 1) / 8;
    const p0 = arc(t0), p1 = arc(t1), p2 = arc(t2);
    // tooth tip pushed outward from the arc (normal), pointing a little forward
    const dx = p2[0] - p0[0], dy = p2[1] - p0[1], L = Math.hypot(dx, dy);
    const nx = dy / L, ny = -dx / L, hgt = 7 + 3 * Math.sin(Math.PI * t1);
    pts.push(p0, [p1[0] + nx * hgt - 3, p1[1] + ny * hgt - 2]);
  }
  // the lateral spine, long and sharp, angled slightly forward
  pts.push([CX - 214, 304], [CX - 288, 296], [CX - 214, 320]);
  // posterolateral margin, curving in to the narrow back edge
  pts.push([CX - 196, 342], [CX - 168, 372], [CX - 136, 404], [CX - 104, 432], [CX - 86, 446], [CX - 60, 452], [CX, 452]);
  return pts;
}
const half = halfCarapace();
const carapace = [...half, ...half.slice(1, -1).reverse().map(mir)];

// ---- limbs: joints from the body outward; left side, mirrored with jitter ----
// Each limb starts where it comes out from under the carapace's edge (pass 1
// started them inside it, and painted their ends over the shell). Walking
// legs are flattened and broad at the merus, then narrow to a pointed dactyl.
const legsL = [
  { j: [[306, 330], [214, 306], [174, 338], [148, 390], [138, 436]], w: [14, 12, 9, 6, 1.5] },
  { j: [[330, 360], [234, 368], [198, 410], [180, 462], [182, 508]], w: [14, 12, 9, 6, 1.5] },
  { j: [[360, 392], [280, 428], [256, 474], [250, 526], [262, 570]], w: [13, 11, 8, 5.5, 1.5] },
];
const paddleL = { j: [[398, 430], [342, 478], [322, 520], [330, 548]], w: [12, 10, 9, 10] };
// The chelipeds come out under the front edge near the eyes and fold
// forward; the palm is a long ridged prism, the fingers a third of its length.
const clawL = { merus: [[404, 248], [316, 212]], carpus: [[316, 212], [280, 172]],
  palm: [[280, 172], [356, 82]], palmW: 44, fixed: [[354, 84], [436, 68]], dactyl: [[338, 74], [428, 50]] };
const side = (L, flip) => flip ? L.map(p => mir(p)) : L;
const jitterLimb = (j, a) => j.map((p, k) => k === 0 ? p : [p[0] + jit(a), p[1] + jit(a)]);

// pressure for a wanted radius with the current brush
const pFor = r => Math.min(1, Math.max(0, (r / V.brushRadius - V.taperMin) / (1 - V.taperMin)));
async function limb(j, w, fps = 3) {
  // one stroke through every joint, the width easing from joint to joint
  const pts = [];
  for (let s = 0; s < j.length - 1; s++) {
    for (let k = 0; k < 6; k++) {
      const t = k / 6, p = lerp(j[s], j[s + 1], t);
      // a little narrower mid-segment, fuller at each joint
      const r = w[s] + (w[s + 1] - w[s]) * t - 1.2 * Math.sin(Math.PI * t);
      pts.push([p[0], p[1], pFor(Math.max(r, 1))]);
    }
  }
  const e = j[j.length - 1]; pts.push([e[0], e[1], pFor(w[w.length - 1])]);
  await S.path(pts, fps);
}

window.__paintDone = (async () => {
  h.setPaper('coldPress', 57); h.setTone('natural'); S.clear();
  const dry = async () => { S.act('dry', true); try { await S.skipTo('dry'); } finally { S.act('dry', false); } };

  // legs and claws for both sides, jittered so the two halves differ
  const legs = [], paddles = [], claws = [];
  for (const flip of [false, true]) {
    for (const L of legsL) legs.push({ j: jitterLimb(side(L.j, flip), 9), w: L.w.map(x => x * (flip ? 1.06 : 1)) });
    paddles.push({ j: jitterLimb(side(paddleL.j, flip), 6), w: paddleL.w });
    const c = Object.fromEntries(Object.entries(clawL).map(([k, v]) => [k, Array.isArray(v) ? side(v, flip) : v]));
    if (flip) {   // the right claw is the crusher: a broader palm, held a little higher
      c.palmW = 52;
      for (const k of ['palm', 'fixed', 'dactyl']) c[k] = c[k].map(([x, y]) => [x, y - 10]);
      c.carpus[1] = [c.carpus[1][0], c.carpus[1][1] - 6]; c.palm[0] = c.carpus[1];
    }
    claws.push(c);
  }

  log('a light pencil outline of the carapace and claws');
  S.tool('pencil'); V.pencilRadius = 2; V.pencilDark = 0.25;
  await S.path(carapace.filter((_, k) => k % 2 === 0).map(p => [...p, 0.35]), 1);
  for (const c of claws) await S.path([...c.merus, ...c.carpus.slice(1), ...c.palm.slice(1), c.fixed[1]].map(p => [...p, 0.3]), 6);

  log('pale cast shadows, offset down and right');
  const SH = [10, 13];
  const off = p => [p[0] + SH[0], p[1] + SH[1]];
  h.setBrushPreset('mop'); V.brushRadius = 30; V.brushPigment = 0.07; V.dipLoad = 1;
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1], ['Raw Umber', 0.5]]);
  S.tool('wash');
  await S.wash(carapace.map(off), { kind: 'flat', paper: 'moist' });
  S.tool('paint'); h.setBrushPreset('round'); V.brushPigment = 0.06; V.dipLoad = 0.45; V.brushRadius = 10;
  for (const L of [...legs, ...paddles]) await limb(L.j.map(off), L.w.map(x => x * 0.6), 2);
  for (const c of claws) await limb([c.merus[0], c.merus[1], c.carpus[1], c.palm[1], c.fixed[1]].map(off), [8, 7, c.palmW * 0.45, c.palmW * 0.35, 2], 2);
  await dry();
  await S.look('shadows');

  log('the carapace: one moist wash, olive with a cool cast');
  h.setBrushPreset('mop'); V.brushRadius = 34; V.brushPigment = 0.32; V.dipLoad = 1;
  h.setBrush([['Perylene Green', 1.2], ['Transparent Yellow Oxide', 2], ['Raw Umber', 1], ['Phthalo Turquoise', 0.4]]);
  S.tool('wash');
  await S.wash(carapace, { kind: 'variegated', into: [['Perylene Green', 2], ['Phthalo Turquoise', 1], ['Raw Umber', 1]], direction: 'across', paper: 'moist' });

  log('the lateral spines, stroked out from the wet shell to a point');
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 9; V.brushPigment = 0.34; V.dipLoad = 0.5;
  h.setBrush([['Perylene Green', 2], ['Phthalo Turquoise', 1], ['Raw Umber', 1]]);
  for (const s of [-1, 1]) await S.path([[CX + s * 196, 312, 1], [CX + s * 236, 307, 0.7], [CX + s * 270, 300, 0.3], [CX + s * 290, 296, 0]], 5);

  log('darker into it at satin: the flanks and the back, following the form');
  await S.skipTo('satin', { points: [[CX, 340]] });
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 16; V.brushPigment = 0.45; V.dipLoad = 0.2;
  h.setBrush([['Perylene Green', 2], ['Raw Umber', 1], ['French Ultramarine', 0.6]]);
  for (const s of [-1, 1]) {
    // along each flank, inside the margin, curving with it
    await S.path([[CX + s * 150, 262, 0.2], [CX + s * 178, 290, 0.7], [CX + s * 176, 330, 0.8], [CX + s * 140, 380, 0.6], [CX + s * 100, 418, 0.2]], 5);
    // the branchial groove behind the spine
    await S.path([[CX + s * 196, 322, 0.3], [CX + s * 160, 340, 0.6], [CX + s * 118, 350, 0.3]], 6);
  }
  await S.path([[CX - 70, 432, 0.3], [CX, 440, 0.7], [CX + 70, 432, 0.3]], 6);

  log('lift the crown of the shell at damp, where the light catches it');
  await S.skipTo('damp', { points: [[CX, 300]] });
  S.tool('lift'); h.setBrushPreset('mop'); V.brushRadius = 26;
  await S.path([[CX - 90, 282, 0.5], [CX - 30, 270, 0.8], [CX + 40, 274, 0.8], [CX + 95, 290, 0.4]], 8);
  await dry();
  await S.look('carapace');

  log('legs: blue above, paler toward the tips, each with its own strength');
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 12;
  for (const L of legs) {
    V.brushPigment = 0.28 + jit(0.05); V.dipLoad = 0.55 + jit(0.1);
    h.setBrush([['Phthalo Blue (GS)', 1.2], ['French Ultramarine', 1], ['Raw Umber', 0.25]]);
    await limb(L.j, L.w, 3);
  }
  log('swimming paddles: violet-blue, a broad flat last segment');
  for (const P of paddles) {
    V.brushPigment = 0.3; V.dipLoad = 0.55;
    h.setBrush([['French Ultramarine', 2], ['Phthalo Blue (GS)', 1], ['Perylene Violet', 0.4]]);
    await limb(P.j, P.w, 3);
    const a = P.j[P.j.length - 1], b = P.j[P.j.length - 2];
    const dx = a[0] - b[0], dy = a[1] - b[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    // the blade: an oval overlapping the last joint, as wide as a walking leg is long-ish
    // (pass 2's oval hung off the end like a lollipop: the blade starts at the
    // joint before, and is broad all along)
    const oval = Array.from({ length: 24 }, (_, k) => { const t = k / 24 * 2 * Math.PI; return [b[0] + ux * (38 + 40 * Math.cos(t)) - uy * 21 * Math.sin(t), b[1] + uy * (38 + 40 * Math.cos(t)) + ux * 21 * Math.sin(t)]; });
    h.setBrushPreset('mop'); V.brushRadius = 14; V.brushPigment = 0.26; V.dipLoad = 0.8;
    S.tool('wash'); await S.wash(oval, { kind: 'flat', paper: 'moist' });
    S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 12;
  }

  log('claws: merus and carpus olive-blue, the palms bright blue with a pale ridge');
  for (const c of claws) {
    V.brushRadius = 14; V.brushPigment = 0.32; V.dipLoad = 0.55;
    h.setBrush([['Phthalo Blue (GS)', 1], ['Perylene Green', 0.6], ['Transparent Yellow Oxide', 0.6]]);
    await limb([c.merus[0], c.merus[1], c.carpus[1]], [15, 14, 19], 4);
    // the palm: a ridged prism, narrow at the wrist, widest past the middle
    const [p0, p1] = c.palm, dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
    const halfW = t => c.palmW * 0.5 * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 0.8 + 0.2)));
    const at = (t, o) => { const p = lerp(p0, [p1[0] + dx / L * 6, p1[1] + dy / L * 6], t); return [p[0] + nx * o, p[1] + ny * o]; };
    const palm = [...Array.from({ length: 9 }, (_, k) => at(k / 8, halfW(k / 8))), ...Array.from({ length: 9 }, (_, k) => at(1 - k / 8, -halfW(1 - k / 8)))];
    h.setBrushPreset('mop'); V.brushRadius = 12; V.brushPigment = 0.34; V.dipLoad = 0.8;
    h.setBrush([['Phthalo Blue (GS)', 2], ['French Ultramarine', 1]]);
    S.tool('wash'); await S.wash(palm, { kind: 'variegated', into: [['French Ultramarine', 2], ['Perylene Violet', 0.5]], direction: 'across', paper: 'moist' });
    // the ridge along the palm's upper face, lifted while it's damp
    await S.skipTo('damp', { points: [at(0.5, 0)] });
    S.tool('lift'); V.brushRadius = 6;
    await S.path([[...at(0.1, c.palmW * 0.12), 0.4], [...at(0.5, c.palmW * 0.15), 0.8], [...at(0.9, c.palmW * 0.1), 0.3]], 8);
    // the fingers: blue running to red at the tips, the red dropped into the wet blue
    S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 12; V.brushPigment = 0.32; V.dipLoad = 0.55;
    for (const f of [c.fixed, c.dactyl]) {
      h.setBrush([['Phthalo Blue (GS)', 2], ['French Ultramarine', 1]]);
      await S.path([[...f[0], 0.9], [...lerp(f[0], f[1], 0.35), 0.7], [...lerp(f[0], f[1], 0.55), 0.5]], 6);
      h.setBrush([['Pyrrole Scarlet', 2], ['Perylene Maroon', 1]]); V.brushPigment = 0.42; V.dipLoad = 0.4;
      await S.path([[...lerp(f[0], f[1], 0.5), 0.5], [...lerp(f[0], f[1], 0.8), 0.3], [...f[1], 0]], 6);
      V.brushPigment = 0.32; V.dipLoad = 0.55;
    }
  }
  await dry();
  await S.look('limbs');

  log('details on dry paper: grooves, the margin teeth, spines, eyes, joints');
  S.tool('paint'); h.setBrushPreset('rigger'); V.brushRadius = 3; V.brushPigment = 0.22; V.dipLoad = 0.35;
  h.setBrush([['Perylene Green', 1], ['Raw Umber', 1.5]]);
  // the H-shaped grooves of the carapace, faint and broken
  for (const s of [-1, 1]) {
    await S.path([[CX + s * 30, 300, 0.1], [CX + s * 36, 336, 0.5], [CX + s * 26, 374, 0.4], [CX + s * 18, 404, 0.1]], 6);
    await S.path([[CX + s * 40, 336, 0.1], [CX + s * 90, 326, 0.4], [CX + s * 140, 316, 0.1]], 6);
  }
  await S.path([[CX - 26, 370, 0.1], [CX, 364, 0.35], [CX + 26, 370, 0.1]], 6);
  // a darker line under the front edge so the teeth read
  V.brushPigment = 0.3;
  for (const s of [-1, 1]) {
    const edge = half.slice(8, 26).map(p => s < 0 ? p : mir(p)).filter((_, k) => k % 2 === 0);
    await S.path(edge.map(([x, y]) => [x + s * 3, y + 5, 0.25]), 3);
  }
  // spine tips and tooth tips a warm rust
  h.setBrush([['Pyrrole Scarlet', 1], ['Transparent Red Oxide', 1]]); V.brushPigment = 0.3; V.dipLoad = 0.3;
  for (const s of [-1, 1]) {
    const t = s < 0 ? [CX - 290, 296] : [CX + 290, 296];
    await S.path([[t[0] - s * 30, t[1] + 4, 0.4], [t[0] - s * 4, t[1], 0.05]], 6);
  }
  // eyes: dark beads on short stalks
  h.setBrush([['Mars Black', 1], ['Perylene Green', 0.5]]); V.brushPigment = 0.5; V.dipLoad = 0.4; V.brushRadius = 8;
  for (const s of [-1, 1]) { const e = [CX + s * 58, 224]; await S.path([[e[0], e[1] + 8, 0.3], [e[0], e[1], 0.9], [e[0], e[1] - 1, 0.9]], 4); }
  // joints of the legs, a dark tick at each knee
  V.brushRadius = 4; V.brushPigment = 0.3; h.setBrush([['French Ultramarine', 1], ['Perylene Violet', 1]]);
  for (const L of [...legs, ...paddles]) for (const k of [1, 2]) { const p = L.j[k]; await S.path([[p[0] - 3, p[1] - 2, 0.6], [p[0] + 3, p[1] + 2, 0.2]], 3); }
  await dry();
  await S.look('final');
  log('done');
})();
