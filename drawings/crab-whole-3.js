// Drawing practice 12 (Claude): crab-whole-2.js with the front's marks placed by what the
// mouthparts are rather than traced as flakes. After practice 11: crab-whole.js with the shell drawn from measurement instead of
// traced (the painter: measuring reference points isn't tracing; following the lines is). After
// practice 10: the whole beach crab again
// (.local/refs/blue-crab/epa-louisiana-beach.jpg), with what the claw and front studies taught:
// segments as masses of their own with real joints (not rods between balls, not one blended
// lump), outlines measured from edges (not colour regions), limbs coming out from under the
// shell's toothed edge, and the front's flaky underside drawn as traced marks, not built.
// Identified before building (self-check): my own reading of every limb off zoomed grids,
// a fresh agent's reading with no hypothesis, and the FDA specimen for what goes where.
const S = window.__sim, h = S.headless, D = window.__draw, { add, sub, mul, len, norm, cross, dot } = D.math;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };

const fit = { eye: [29.5, 333.3, 28.9], target: [-19.5, 35, 26], focal: 1021, up: [Math.sin(0.161), Math.cos(0.161), 0] };
const cam = D.camera(fit);
const P = ([x, y, hh]) => cam.unproject(x, y, hh);
const mm = (cells, p) => cells * cam.project(p)[2] / cam.focal;
const along = (pts, cells) => pts.map((q, i) => mm(cells[i], P(q)));

// ---- the shell ----
// The carapace is a wide, thin-edged slab, not an oval: its outline traced off the photo
// (zoomed grids), the toothed front-side margins as a zigzag of tips and notches, the front
// edge between the eyes, the back edge over the swimming legs; domed in the middle and
// thinning to a sharp rim. The lateral spines are cones of their own, meeting it.
const RIM = 40, DOME = 14, ROUND = 26;   // rim height above the sand, dome rise, how far in the dome reaches full height (mm)
// The outline drawn from measurement, not traced (crab-whole.js followed it at every tooth tip):
// a few landmarks measured on upside-down crops (seen unfamiliar, the margin is a saw edge on a
// curve, not 'crab teeth'), the teeth constructed from what's known of them. Measured: spine
// roots; three points on each margin's base line (where the teeth meet the body); two teeth a
// side, for length and lean (they lean toward the spine end, ~40 degrees near it and ~15 near
// the front: I'd have guessed they pointed forward); the back edge at five points; the eye
// corners. Known: eight teeth a side and the lateral spine (the FDA specimen), four small teeth
// on the front between the eyes.
const smooth = pts => D.smoothPath(pts.map(([x, y]) => [x, y, 0]), 24).map(([x, y]) => [x, y]);
const toothRow = (base, n, len, lean0, lean1) => {
  // base runs from the spine root to the front; n teeth evenly along it
  const B = smooth(base), cum = [0];
  for (let i = 1; i < B.length; i++) cum.push(cum[i - 1] + Math.hypot(B[i][0] - B[i - 1][0], B[i][1] - B[i - 1][1]));
  const at = s => { let i = 1; while (i < B.length - 1 && cum[i] < s) i++; const f = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [B[i - 1][0] + (B[i][0] - B[i - 1][0]) * f, B[i - 1][1] + (B[i][1] - B[i - 1][1]) * f]; };
  const L = cum[cum.length - 1], gap = L / n, out = [];
  for (let k = 0; k < n; k++) {
    const a = at(k * gap), b = at((k + 1) * gap), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const t = [(b[0] - a[0]) / gap, (b[1] - a[1]) / gap];
    let nrm = [-t[1], t[0]]; if (nrm[0] * (m[0] - mid[0]) + nrm[1] * (m[1] - mid[1]) < 0) nrm = [-nrm[0], -nrm[1]];   // outward
    const th = (lean0 + (lean1 - lean0) * (k + 0.5) / n) * Math.PI / 180, d = [Math.cos(th) * nrm[0] - Math.sin(th) * t[0], Math.cos(th) * nrm[1] - Math.sin(th) * t[1]];
    if (k === 0) out.push(a);
    out.push([m[0] + d[0] * len, m[1] + d[1] * len], b);
  }
  return out;
};
const mid = [612, 318];
const teethL = toothRow([[322, 272], [362, 335], [440, 418]], 8, 16, 40, 15);
const teethR = toothRow([[896, 370], [826, 404], [741, 447]], 8, 17, 40, 15).reverse();   // front to spine, the way the outline runs
// the front: an eye notch at each measured corner, four small teeth between
// The front, from close zooms. Each eye socket is a recess like a swollen, concave rhomboid,
// with the eye a small ball attached at its outermost corner and sticking out past it (the
// painter, after I'd drawn notches with the eye inside, then taken the socket's lit floor for
// the eye, then tucked the eyes inside the corners). Measured: left socket outer corner (450,403),
// top (470,394), inner (487,419), bottom (468,432), the eye at (446,401); right mirrored, inner
// (642,449), top (658,435), outer (672,446), bottom (658,462), the eye at (679,449). The pale
// triangle in each is the lit lower part of its concave floor. The shell's edge runs along each
// socket's upper sides; the lower sides are marks. Four small frontal teeth between, spaced about
// the midline (measured below, at the mouth).
const MID = [565.5, 465], MLEAN = -0.2, mL = Math.hypot(MLEAN, 1);
const across = (v, u) => [MID[0] + MLEAN / mL * v + u / mL, MID[1] + v / mL - MLEAN / mL * u];
const frontTeeth = [-45, -15, 15, 45].flatMap(u => [across(-27, u - 13), across(-21, u), across(-27, u + 13)]);
const front = [
  [434, 414], [450, 403], [470, 394], [487, 419],   // the left socket's upper sides: outer corner (where the eye attaches), top, inner corner
  ...frontTeeth,
  [642, 449], [658, 435], [672, 446], [690, 452], [700, 459], [718, 456],   // the right socket's upper sides: inner corner, top, outer corner (where the eye attaches)
];
const outline = [
  [300, 250], [322, 266],
  ...teethL, ...front, ...teethR,
  [892, 366], [884, 346],
  ...smooth([[804, 298], [682, 215], [583, 196], [477, 199], [301, 256]]),
].map(([x, y]) => P([x, y, RIM]));
const shellPart = (() => {
  const Q = outline.map(p => [p[0], p[2]]);
  // signed distance to the outline in plan (negative inside)
  const sd = (x, z) => {
    let d = Infinity, inside = false;
    for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) {
      const [ax, az] = Q[j], [bx, bz] = Q[i], ex = bx - ax, ez = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
      d = Math.min(d, Math.hypot(x - ax - ex * t, z - az - ez * t));
      if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) inside = !inside;
    }
    return inside ? -d : d;
  };
  const top = s => RIM + 1.2 + DOME * Math.sin(Math.min(1, s / ROUND) * Math.PI / 2);
  return {
    field(p) { const s = sd(p[0], p[2]); return Math.max(s, p[1] - top(Math.max(0, -s)), RIM - 1.2 - p[1]); },
    sample() { return outline.flatMap(p => [p, add(p, [0, DOME + 2, 0])]); },
  };
})();
const shell = D.mass({ parts: [shellPart], blend: 1, cell: 0.6, along: [[579, 198, RIM], [600, 320, RIM + DOME], [600, 446, RIM]].map(P), loops: 0, crease: 50, ridges: false });
const spineAt = (root, tip) => D.sausage({ spine: [P(root), P(tip)], radius: [mm(11, P(root)), 0.4], contours: 1 });
const spines = [spineAt([330, 258, RIM], [255, 236, RIM]), spineAt([880, 358, RIM], [976, 352, RIM])];

// ---- the claws ----
// Each segment its own mass, joints kept (claw-joints.js); the fixed finger runs on from the
// palm's lower edge and the movable finger is hinged at the palm's end. Which finger is which,
// matched by features rather than assumed by symmetry: on both claws the orange finger with the
// purple tip starts at a dark hinge spot, and a pale blade runs on from the palm beside it.
const seg = (parts, line, loops) => D.mass({ parts, blend: 4, cell: 0.6, along: line.map(P), loops, crease: 55 });
const blobAt = (q, rx, ry, rz) => { const c = P(q); return D.ellipsoid({ at: c, radii: [mm(rx, c), mm(ry, c), mm(rz, c)] }); };
const cone = ([a, b, r]) => D.sausage({ spine: [P(a), P(b)], radius: [mm(r, P(a)), 0.4], contours: 0 });
const collar = (a, b, r) => D.sausage({ spine: [P(a), P(b)], radius: mm(r, P(a)), contours: 1 });
const TRI = [[1, -0.5], [0.5, 0.6], [0, 1], [-0.5, 0.6], [-1, -0.5], [0, -1]];               // the arm's rounded-triangular section
const RIDGED = [[1, 0], [0.55, 0.62], [0.08, 1], [-0.5, 0.66], [-1, 0], [-0.5, -0.9], [0.5, -0.9]];   // the palm's, ridged along its top

// the right claw (the photo's): measurements from claw-joints.js
const R = (() => {
  const armPts = [[748, 479, 28], [800, 490, 30], [860, 506, 30], [880, 515, 30]];
  const arm = D.prism({ spine: armPts.map(P), width: along(armPts, [44, 70, 83, 86]), thick: along(armPts, [34, 50, 58, 60]), section: TRI, rings: 2 });
  // the shoulder segment, in shadow with cream edges, running on up under the shell's toothed edge
  const ischPts = [[756, 479, 27], [722, 474, 28], [684, 466, 30], [640, 452, 33], [612, 444, 34]];
  const ischium = D.prism({ spine: ischPts.map(P), width: along(ischPts, [44, 34, 28, 24, 22]), thick: along(ischPts, [30, 24, 20, 18, 16]), section: [[1, 0], [0.4, 0.8], [-0.5, 0.8], [-1, 0], [-0.4, -0.9], [0.4, -0.9]], rings: 0 });
  ischium.clip = [680, 0, 1024, 768];   // seen only where the photo shows it, by the arm (further in, the underside hides it; drawn, it read as a wedge)
  const carpPts = [[878, 524, 30], [886, 566, 28], [872, 612, 24]];
  const carpus = D.prism({ spine: carpPts.map(P), width: along(carpPts, [48, 60, 54]), thick: along(carpPts, [40, 44, 40]), rings: 1 });
  const palmPts = [[846, 622, 20], [810, 626, 19], [760, 632, 17], [705, 642, 14], [660, 656, 10], [620, 664, 7], [590, 668, 5]];
  const palm = D.prism({ spine: palmPts.map(P), width: along(palmPts, [44, 72, 72, 53, 30, 14, 3]), thick: along(palmPts, [32, 46, 44, 34, 18, 9, 2]), section: RIDGED, rings: 0 });
  const dacPts = [[706, 630, 17], [640, 641, 13], [565, 652, 8], [530, 658, 5]];
  const dactyl = D.prism({ spine: dacPts.map(P), width: along(dacPts, [36, 28, 14, 3]), thick: along(dacPts, [24, 18, 10, 2]), rings: 1 });
  const armM = seg([arm, blobAt([890, 524, 30], 30, 26, 28)], [[750, 479, 28], [800, 490, 30], [880, 518, 30]], 3);
  const carpM = seg([carpus], carpPts, 2);
  const propM = seg([palm, blobAt([848, 602, 22], 22, 18, 22), blobAt([706, 634, 16], 22, 18, 22)], [[852, 616, 22], [770, 630, 18], [705, 641, 15], [600, 666, 8]], 5);
  const wristC = collar([874, 606, 23], [842, 620, 20], 17), elbowC = collar([878, 516, 30], [884, 540, 29], 20);
  const sp = [[[768, 500, 24], [763, 522, 20], 7], [[792, 512, 24], [787, 540, 20], 9], [[814, 532, 26], [812, 564, 22], 9], [[902, 548, 30], [924, 544, 30], 6], [[862, 552, 28], [872, 574, 24], 5]].map(cone);
  return {
    forms: [ischium, armM, carpM, propM, dactyl, wristC, elbowC, ...sp],
    meets: [D.meet(armM, carpM), D.meet(propM, carpM), D.meet(propM, dactyl), D.meet(carpM, wristC), D.meet(propM, wristC), D.meet(armM, elbowC), D.meet(carpM, elbowC),
      ...sp.slice(0, 3).map(s => D.meet(armM, s)), D.meet(carpM, sp[3]), D.meet(armM, sp[4]), D.meet(armM, ischium)],
  };
})();

// the left claw, measured off zoomed grids (lc1, lc2): the arm comes out from under the left
// front teeth and runs out to a swollen end; the carpus is a big cream block that turns the limb
// down; the palm hangs from it, its cream outer face toward us and its blue upper face turned
// away along its right side; the orange movable finger hinged at a dark spot (235,535), the pale
// fixed finger running on from the palm's right edge beside it
const L = (() => {
  // (top edge 260,334 / 331,345 / 386,369; lower edge through the spine bases 271,399 / 331,402 / 372,405)
  const armPts = [[446, 404, 32], [410, 394, 31], [372, 387, 31], [320, 374, 31], [272, 366, 30]];
  const arm = D.prism({ spine: armPts.map(P), width: along(armPts, [36, 40, 46, 58, 58]), thick: along(armPts, [30, 32, 38, 46, 46]), section: TRI, rings: 2 });
  const carpPts = [[230, 362, 30], [212, 400, 28], [196, 436, 24]];
  const carpus = D.prism({ spine: carpPts.map(P), width: along(carpPts, [46, 58, 46]), thick: along(carpPts, [38, 46, 38]), rings: 1 });
  // (left edge 180,440 / 178,480 / 185,520 / 212,562; right edge, past the blue face, 262,440 / 270,490 / 266,535)
  const palmPts = [[222, 446, 22], [224, 480, 20], [230, 515, 17], [242, 545, 14], [262, 585, 9], [278, 612, 6], [290, 624, 4]];
  const palm = D.prism({ spine: palmPts.map(P), width: along(palmPts, [70, 88, 84, 60, 28, 14, 3]), thick: along(palmPts, [40, 50, 46, 36, 16, 9, 2]), section: RIDGED, rings: 0 });
  // (orange: 210-262 across at y 562, 229-273 at 600, 254-279 at 633; a pale ring at 278,648, then the purple tip to 316,688)
  const dacPts = [[232, 550, 15], [251, 600, 12], [266, 633, 9], [279, 650, 7], [316, 688, 3]];
  const dactyl = D.prism({ spine: dacPts.map(P), width: along(dacPts, [46, 42, 26, 18, 3]), thick: along(dacPts, [30, 26, 16, 12, 2]), rings: 1 });
  const armM = seg([arm, blobAt([262, 366, 30], 26, 24, 26)], [[446, 404, 32], [372, 387, 31], [262, 366, 30]], 3);
  const carpM = seg([carpus], carpPts, 2);
  const propM = seg([palm, blobAt([234, 540, 15], 22, 18, 22)], [[222, 446, 22], [228, 500, 18], [242, 545, 14], [290, 624, 4]], 5);
  const wristC = collar([200, 432, 24], [214, 452, 22], 18), elbowC = collar([250, 362, 30], [232, 372, 30], 20);
  // stout cones, cream with red tips, along the arm's lower edge; one on the carpus's lower corner
  const sp = [[[290, 400, 26], [279, 416, 22], 8], [[340, 399, 27], [331, 411, 23], 8], [[370, 403, 28], [364, 411, 24], 6], [[188, 440, 24], [180, 452, 22], 6]].map(cone);
  return {
    forms: [armM, carpM, propM, dactyl, wristC, elbowC, ...sp],
    meets: [D.meet(armM, carpM), D.meet(propM, carpM), D.meet(propM, dactyl), D.meet(carpM, wristC), D.meet(propM, wristC), D.meet(armM, elbowC), D.meet(carpM, elbowC),
      ...sp.slice(0, 3).map(s => D.meet(armM, s)), D.meet(carpM, sp[3])],
  };
})();

// ---- the legs ----
// Each segment its own volume (the painter: legs were swipes, the joints floating balls):
// flattened, as a swimming crab's legs are, meeting the next at a joint, the next tucked a
// little into it. ~30 cells wide (measured across; the first construction's 18 were rods).
// Heights: rising from under the shell's edge to the knee, down to the tip on the sand.
// Identified by my reading and a fresh agent's, checked on gridless zooms where they
// differed. Where a leg goes under another and doesn't clearly come out, it's drawn going
// under, not joined up to a piece I can't trace to it.
// a flattened oval section, rounded, with a ridge only along its two side margins (corners 0 and 6)
const LENS = Array.from({ length: 12 }, (_, i) => { const t = i * Math.PI / 6; return [Math.cos(t), Math.sin(t) * (0.75 + 0.25 * Math.abs(Math.sin(t)))]; });
const leg = (J, W, { flat = 0.55 } = {}) => {
  const Q = J.map(P), segs = [];
  for (let k = 0; k < Q.length - 1; k++) {
    const a = Q[k], b = Q[k + 1], ab = sub(b, a), b2 = k === Q.length - 2 ? b : add(b, mul(ab, 0.06));
    // swelling through its middle and pinched at the joints (uniform tubes didn't read as jointed)
    const m = mul(add(a, b2), 0.5), w = [mm(W[k][0], a) * 0.82, mm(Math.max(...W[k]), m) * 1.08, mm(W[k][1], b) * 0.82];
    segs.push(D.prism({ spine: [a, m, b2], width: w, thick: w.map(x => x * flat), section: LENS, ridges: [0, 6], rings: 1 }));
  }
  return { segs, meets: segs.slice(1).map((s, k) => D.meet(segs[k], s)) };
};
// a swimming leg's paddle: a flat oval lying on the sand, from its joint to its tip
const paddle = (base, tip, wide, hh) => {
  const a = P([...base, hh]), b = P([...tip, hh]), c = mul(add(a, b), 0.5), ax = mul(sub(b, a), 0.5);
  return D.ellipsoid({ at: c, axes: [ax, [0, 1.6, 0], mul(norm(cross(ax, [0, 1, 0])), mm(wide / 2, c))], contours: 1, around: 0 });
};
const legs = [
  // image-left (the animal's right). The hindmost walking leg: a pale merus from under the back
  // edge up to a red knee, a blue carpus down over the start of the pale propodus, which runs
  // out to a red joint and a short dactyl into the sand
  leg([[440, 250, 30], [348, 201, 42], [300, 226, 32], [203, 225, 12], [186, 234, 0]], [[36, 32], [32, 30], [24, 20], [12, 2]]),
  // the middle one: a blue segment out from under the spine, its end going under the front leg
  leg([[345, 252, 32], [254, 306, 22]], [[34, 32]]),
  // the front one: out between the teeth, a red joint, then long segments out to a tip on the sand
  leg([[352, 298, 32], [296, 313, 30], [218, 340, 16], [127, 383, 8], [115, 410, 0]], [[30, 28], [28, 28], [26, 22], [16, 2]]),
  // image-right (the animal's left). The hindmost: a pale merus from under the back edge to a red
  // knee, its carpus going down under the spine
  leg([[790, 302, 30], [925, 318, 40], [942, 356, 34]], [[32, 30], [28, 26]]),
  // a short merus out from under a tooth to a knee, its next segment going down behind the front leg
  leg([[878, 392, 32], [935, 372, 38], [951, 426, 30]], [[24, 26], [30, 28]]),
  // the front one: merus out from under the teeth to a red knee, then down the column to the sand
  leg([[820, 430, 32], [920, 415, 38], [940, 497, 24], [930, 597, 8], [925, 612, 0]], [[34, 30], [34, 30], [30, 18], [12, 2]]),
  // a dark leg in the shadow under the left claw's arm (the fresh check's catch; whose, I can't tell)
  leg([[410, 426, 18], [300, 416, 12], [246, 421, 6]], [[18, 16], [16, 10]]),
  // a dark segment in the shadow under the front leg's merus (whose, I can't tell)
  leg([[884, 438, 26], [912, 494, 18]], [[26, 24]]),
];
// the swimming legs: a merus from the back corner, a red joint, the broad flat propodus, and
// the paddle lying on the sand
const swimL = leg([[510, 200, 32], [482, 203, 30], [414, 188, 16], [343, 149, 6]], [[22, 22], [24, 24], [44, 40]], { flat: 0.3 });
const swimR = leg([[778, 262, 32], [815, 257, 28], [881, 247, 16], [915, 202, 6]], [[30, 26], [26, 24], [50, 44]], { flat: 0.3 });
const paddles = [paddle([343, 156], [378, 95], 64, 5), paddle([928, 222], [810, 148], 80, 5)];
const legForms = [...legs, swimL, swimR].flatMap(l => l.segs);
const legMeets = [...legs, swimL, swimR].flatMap(l => l.meets).concat(D.meet(paddles[0], swimL.segs[2]), D.meet(paddles[1], swimR.segs[2]));

// ---- the front ----
// The underside, drawn as marks but placed by what it is (the painter: marks, not 3D modelling,
// but that's no reason to drop constructive reasoning). It reads as a flaky pastry because it's
// a stack of flat appendages seen edge-on: on top, the two third maxillipeds, broad plates side
// by side closing over the mouth, meeting at the midline, each jointed across (ischium, then
// merus), with a slender exopod along its outer side and a palp folded at its tip; behind them
// the second and first maxillipeds and the maxillae, more flat plates, each showing a thin lit
// edge. Above, under the front edge between the eyes, the antennules folded in their sockets.
// Measured on the zoom (mp.png) with that in mind: grey plates with cream rims at x 526-557 and
// 572-613, a dark seam between them at x ~565; lit strips outside each; small cream knobs at the
// bottom by the midline; dark notches under the front edge either side of it.
// The midline, measured: the cluster's mirror axis, found by mirroring the photo across candidate
// lines and keeping the best match (.local/sym.py): it crosses y 465 at x 565.5 and leans
// -0.20 (down and to the left, with the body). First drawn by eye, the seam leaned the other way
// and the marks read tilted (the painter: the shell's centre line didn't line up with the mouth).
// Marks are measured on the right half and mirrored across it.
const AX = [565.5, 465], LEAN = -0.2, aL = Math.hypot(LEAN, 1), aD = [LEAN / aL, 1 / aL], aU = [1 / aL, -LEAN / aL];
const mirror = ([x, y]) => { const dx = x - AX[0], dy = y - AX[1], u = dx * aU[0] + dy * aU[1], v = dx * aD[0] + dy * aD[1]; return [AX[0] - u * aU[0] + v * aD[0], AX[1] - u * aU[1] + v * aD[1]]; };
const onAxis = v => [AX[0] + aD[0] * v, AX[1] + aD[1] * v];
const half = [
  // the plate: open at the top, where it goes under the layer above (drawn closed, the pair read
  // as glasses); the lit rim broken into strokes down the outer side and across the bottom, a dark
  // mark under it (a lit edge with dark under it is what makes layers read as layers); the inner
  // side light along the seam
  { kind: 'edge', pts: [[613, 458], [614, 470]] }, { kind: 'edge', pts: [[611, 477], [600, 481], [586, 482], [576, 479]] },
  { kind: 'overlap', pts: [[607, 485], [594, 486], [582, 485]] }, { kind: 'contour', pts: [[572, 458], [571, 472]] },
  // the joint across it (where ischium meets merus: from anatomy, so light and partial)
  { kind: 'contour', pts: [[600, 470], [611, 471]] },
  // the exopod, a strip along the plate's outer side, shadowed beneath
  { kind: 'edge', pts: [[614, 455], [632, 459], [652, 466]] }, { kind: 'overlap', pts: [[618, 465], [636, 469]] },
  // the palp folded at the plate's tip, by the midline: a lit top, dark under
  { kind: 'edge', pts: [[570, 492], [574, 488], [579, 491]] }, { kind: 'overlap', pts: [[571, 498], [577, 498]] },
  // the layers behind, their lit edges showing below and beside
  { kind: 'edge', pts: [[584, 490], [600, 487], [616, 484]] }, { kind: 'edge', pts: [[623, 482], [636, 485], [648, 491]] },
  // the antennule's socket under the front edge, dark
  { kind: 'overlap', pts: [[590, 444], [599, 448], [608, 446]] },
];
// the cluster's lower outline, mirrored too: low on the midline, rising to each side
const clusterHalf = [[701, 467], [633, 492], onAxis(33)];
const clusterEdge = [...clusterHalf, ...clusterHalf.slice(0, -1).reverse().map(mirror)];
const frontMarks = [
  // the sockets' lower sides, a little swollen, and a light curve down each concave floor
  { kind: 'edge', pts: [[450, 403], [455, 418], [468, 432], [480, 428], [487, 419]] }, { kind: 'contour', pts: [[468, 397], [462, 412], [466, 428]] },
  { kind: 'edge', pts: [[642, 449], [647, 458], [658, 462], [668, 456], [672, 446]] }, { kind: 'contour', pts: [[657, 438], [653, 448], [657, 459]] },
  ...half, ...half.map(m => ({ ...m, pts: m.pts.map(mirror) })),
  // the seam between the plates, dark, along the midline
  { kind: 'overlap', pts: [onAxis(-15), onAxis(0), onAxis(14)] },
].map(m => ({ ...m, pts: D.smoothPath(m.pts.map(([x, y]) => [x, y, 0]), 4).map(([x, y]) => [x, y]) }));
// the eyes, drawn light: round globes inside the sockets (first placed in the bottom of shallow
// notches, ~25 cells low; then the left one on the socket's pale tooth instead of the globe)
// (attached at the outer corner and sticking out past it: forms in front of the shell's edge, hiding it)
const eyes = [[446, 401, 6], [679, 449, 7]].map(([x, y, r]) => blobAt([x, y, RIM + 3], r, r * 0.9, r));
const underside = D.prism({ spine: [[480, 470], [590, 476], [690, 466]].map(([x, y]) => P([x, y, 30])), width: [[480, 470], [590, 476], [690, 466]].map(([x, y]) => mm(56, P([x, y, 30]))), thick: [8, 10, 8], rings: 0 });
underside.clip = [0, 0, 0, 0];

window.__paintDone = (async () => {
  h.setPaper('hotPress', 5); h.setTone('white'); S.clear();
  log('gesture: the body\'s width spine to spine, its depth back to front, and each limb\'s sweep');
  const sweeps = [[[255, 236], [612, 300], [976, 352]], [[619, 198], [594.5, 320], [562.5, 480]]   /* the midline, along the mouth's measured axis */,
    ...[...legs, swimL, swimR].map(l => l.segs.map(sg => cam.project(sg.spine[0]).slice(0, 2)).concat([cam.project(l.segs[l.segs.length - 1].spine.at(-1)).slice(0, 2)])),
    [[420, 400], [262, 366], [212, 400], [222, 480], [242, 545], [316, 688]], [[700, 470], [880, 515], [882, 600], [800, 626], [700, 641], [530, 658]],
    [[343, 149], [362, 112], [380, 85]], [[915, 205], [865, 175], [815, 145]]];
  await D.pencil(sweeps.map(D.gesture), { weight: { gesture: 0.16 } });
  log('the shell: traced outline, toothed margins, dome, spines; claws and legs segment by segment');
  const forms = [shell, ...spines, ...eyes, underside, ...R.forms, ...L.forms, ...legForms, ...paddles];
  await D.pencil(D.lines([...forms, ...spines.map(sp => D.meet(shell, sp)), ...R.meets, ...L.meets, ...legMeets], cam));
  log('the front as marks placed by structure: maxilliped plates, seam, exopods, palps, sockets');
  await D.pencil([{ kind: 'silhouette', pts: D.smoothPath(clusterEdge.map(([x, y]) => [x, y, 0]), 8).map(([x, y]) => [x, y]) }], { every: 1 });
  await D.pencil(frontMarks, { weight: { edge: 0.5, contour: 0.22, overlap: 0.8 }, every: 1 });
  await S.look('whole');
})();
