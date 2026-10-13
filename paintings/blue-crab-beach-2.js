// A female blue crab on wet sand, painted from a constructional drawing (Claude, Opus 5.5).
// Reference: "Blue crab on the beach. Louisiana", US EPA, public domain, in .local/refs/blue-crab.
// The first painting from this photo (blue-crab-beach.js, kept as it is) was drawn from a flat
// grid of shapes; the painter's critique: limbs read detached, legs were swipes, the front was
// simplified away; practise drawing. This one starts from drawings/crab-whole-3.js: the same
// 3D construction (shell slab with measured, constructed teeth; claws and legs segment by
// segment; the front's marks placed by what the mouthparts are), its geometry carried here.
// Stage 1: the underdrawing, light pencil, outlines and main joints only (no contour rings,
// gestures or construction marks, which would show through transparent washes). The two dark
// segments I couldn't assign to a leg are left out of it: they'll be part of the shadow.
const S = window.__sim, h = S.headless, D = window.__draw, { add, sub, mul, len, norm, cross, dot } = D.math;
const V = S.values;
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
const frontTeeth = [-39, -13, 13, 39].flatMap(u => [across(-27, u - 11), across(-21, u), across(-27, u + 11)]);
// a corner rounded off: the polyline from a, through corner c, to b, as a curve (the first
// drawing had the sockets' upper corners sharp)
const round = (a, c, b, k = 0.45, n = 6) => { const p = [c[0] + (a[0] - c[0]) * k, c[1] + (a[1] - c[1]) * k], q = [c[0] + (b[0] - c[0]) * k, c[1] + (b[1] - c[1]) * k]; return Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [(1 - t) ** 2 * p[0] + 2 * (1 - t) * t * c[0] + t * t * q[0], (1 - t) ** 2 * p[1] + 2 * (1 - t) * t * c[1] + t * t * q[1]]; }); };
// the sockets' corners (re-measured: both bigger than first drawn, and near the same size)
const sockL = { O: [453, 403], T: [474, 392], I: [493, 418], B: [470, 433] }, sockR = { I: [630, 450], T: [654, 429], O: [668, 446], B: [652, 467] };
const front = [
  [434, 414], sockL.O, ...round(sockL.O, sockL.T, sockL.I), ...round(sockL.T, sockL.I, frontTeeth[0], 0.3, 3),   // the left socket's upper sides: outer corner (where the eye attaches), top, inner corner, rounded
  ...frontTeeth,
  ...round(frontTeeth.at(-1), sockR.I, sockR.T, 0.3, 3), ...round(sockR.I, sockR.T, sockR.O), sockR.O, [690, 452], [700, 459], [718, 456],   // the right socket's upper sides: inner corner, top, outer corner (where the eye attaches), rounded
];
const outline = [
  [300, 250], [322, 266],
  ...teethL, ...front, ...teethR,
  [892, 366], [884, 346],
  // (re-measured on a flipped crop for this painting: on the left the rim runs nearly flat at
  // y ~246-250 from x 340 to 450, rising to the hump; the drawing's curve through five points
  // ran ~25 cells high there, over the root of the hind leg)
  ...smooth([[804, 298], [682, 215], [583, 196], [515, 200], [490, 228], [448, 245], [390, 249], [340, 254], [301, 256]]),
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
  { kind: 'edge', pts: [sockL.O, [457, 420], sockL.B, [484, 430], sockL.I] },
  { kind: 'edge', pts: [sockR.I, [638, 462], sockR.B, [663, 461], sockR.O] },
  // the shadow the rim casts into the top of each hollow (dark green on the photo, the floor lit below it):
  // what says hollow rather than bulge
  { kind: 'overlap', pts: [[459, 403], [472, 398], [484, 410]] }, { kind: 'overlap', pts: [[637, 447], [653, 435], [663, 443]] },
  // the little stripes down each concave floor, as the zooms show them (one bowed curve read convex)
  { kind: 'contour', pts: [[457, 409], [459, 419], [468, 428]] }, { kind: 'contour', pts: [[470, 404], [474, 414], [476, 426]] }, { kind: 'contour', pts: [[485, 411], [487, 421]] },
  { kind: 'contour', pts: [[660, 438], [654, 448], [650, 458]] }, { kind: 'contour', pts: [[666, 440], [663, 451], [662, 460]] }, { kind: 'contour', pts: [[642, 444], [639, 454]] },
  ...half, ...half.map(m => ({ ...m, pts: m.pts.map(mirror) })),
  // the seam between the plates, dark, along the midline
  { kind: 'overlap', pts: [onAxis(-6), onAxis(3), onAxis(11)] },   // (shorter: the full-length seam was the harshest line in the face)
].map(m => ({ ...m, pts: D.smoothPath(m.pts.map(([x, y]) => [x, y, 0]), 4).map(([x, y]) => [x, y]) }));
// the eyes, drawn light: round globes inside the sockets (first placed in the bottom of shallow
// notches, ~25 cells low; then the left one on the socket's pale tooth instead of the globe)
// (attached at the outer corner and sticking out past it: forms in front of the shell's edge, hiding it)
const eyes = [[447, 404, 9], [678, 450, 11]].map(([x, y, r]) => blobAt([x, y, RIM + 3], r, r * 0.9, r));
const underside = D.prism({ spine: [[480, 470], [590, 476], [690, 466]].map(([x, y]) => P([x, y, 30])), width: [[480, 470], [590, 476], [690, 466]].map(([x, y]) => mm(56, P([x, y, 30]))), thick: [8, 10, 8], rings: 0 });
underside.clip = [0, 0, 0, 0];


// which forms go into the underdrawing: everything but the unassigned dark segments
const unassigned = [legs[6], legs[7]].flatMap(l => l.segs);

const M = window.__minds;
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const SW = 1024, SH = 768;
// ---- regions on the sheet, from the construction ----
const forms = [shell, ...spines, ...eyes, underside, ...R.forms, ...L.forms, ...legForms, ...paddles];
const masks = D.regions(forms, cam);
const regionOf = f => masks[forms.indexOf(f)];
const union = ms => { const u = new Uint8Array(SW * SH); for (const m of ms) for (let c = 0; c < u.length; c++) if (m[c]) u[c] = 1; return u; };
// (only within the mask's bounding box: the joints take many of these)
const bbox = m => { let x0 = SW, y0 = SH, x1 = -1, y1 = -1; for (let c = 0; c < m.length; c++) if (m[c]) { const x = c % SW, y = (c / SW) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
const grow = (m, r) => { const o = new Uint8Array(m.length), [x0, y0, x1, y1] = bbox(m); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (!m[y * SW + x]) continue; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < SW && yy < SH) o[yy * SW + xx] = 1; } } return o; };
// a segment's region less a hair next to its neighbours: the paper left between them is the
// light at the joint (and keeps two wet washes from running together)
const apart = (m, neighbours, r = 1) => { const near = grow(union(neighbours), r), o = new Uint8Array(m.length); for (let c = 0; c < m.length; c++) o[c] = m[c] && !near[c] ? 1 : 0; return o; };
const and = (a, b) => { const o = new Uint8Array(a.length); for (let c = 0; c < a.length; c++) o[c] = a[c] && b[c] ? 1 : 0; return o; };
const minus = (a, b) => { const o = new Uint8Array(a.length); for (let c = 0; c < a.length; c++) o[c] = a[c] && !b[c] ? 1 : 0; return o; };
// a region split across its long axis: the lit (upper) and shaded (lower) halves, for forms
// with no spine to measure from (the claws' masses)
const halves = m => {
  let n = 0, sx = 0, sy = 0; for (let c = 0; c < m.length; c++) if (m[c]) { n++; sx += c % SW; sy += (c / SW) | 0; }
  const mx = sx / n, my = sy / n; let xx = 0, xy = 0, yy = 0;
  for (let c = 0; c < m.length; c++) if (m[c]) { const dx = c % SW - mx, dy = ((c / SW) | 0) - my; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
  const th = 0.5 * Math.atan2(2 * xy, xx - yy); let nx = -Math.sin(th), ny = Math.cos(th); if (ny < 0) { nx = -nx; ny = -ny; }
  const up = new Uint8Array(m.length), down = new Uint8Array(m.length);
  for (let c = 0; c < m.length; c++) if (m[c]) { const s = (c % SW - mx) * nx + (((c / SW) | 0) - my) * ny; (s > 0 ? down : up)[c] = 1; }
  return { up, down };
};
const count = m => { let n = 0; for (let c = 0; c < m.length; c++) n += m[c]; return n; };
// the part of a form's region past fraction t along its spine (a spine's tip)
const pastAlong = (f, t0) => { const a = toSheet(f.spine[0]), b = toSheet(f.spine.at(-1)), ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey, m = grow(regionOf(f), 1), o = new Uint8Array(m.length); for (let c = 0; c < m.length; c++) if (m[c] && ((c % SW - a[0]) * ex + (((c / SW) | 0) - a[1]) * ey) / L2 >= t0) o[c] = 1; return o; };
// a region split by a measured boundary (a polyline, extended at its ends): the side holding
// the reference point, and the rest
const splitBy = (m, line, ref) => {
  const sideAt = (x, y) => { let best = Infinity, sd = 0; for (let i = 0; i < line.length - 1; i++) { const [ax, ay] = line[i], [bx, by] = line[i + 1], ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey; let t = ((x - ax) * ex + (y - ay) * ey) / L2; if (i > 0) t = Math.max(0, t); if (i < line.length - 2) t = Math.min(1, t); const dx = x - ax - ex * t, dy = y - ay - ey * t, d = dx * dx + dy * dy; if (d < best) { best = d; sd = ex * (y - ay) - ey * (x - ax); } } return sd; };
  const want = Math.sign(sideAt(...ref)), a = new Uint8Array(m.length), b = new Uint8Array(m.length);
  for (let c = 0; c < m.length; c++) if (m[c]) (Math.sign(sideAt(c % SW, (c / SW) | 0)) === want ? a : b)[c] = 1;
  return [a, b];
};
const has = m => { for (let c = 0; c < m.length; c += 7) if (m[c]) return true; return false; };
// the front's cluster: from the shell's front edge down to its lower outline
const clusterPoly = [...front, ...clusterEdge];
const toSheet = p => cam.project(p).slice(0, 2);
// a stroke along a form's spine, nudged to one side (for the shaded side of a segment)
const sideOf = (f, frac) => { const C = f.spine.map(toSheet), out = []; for (let i = 0; i < C.length; i += 3) { const a = C[Math.max(0, i - 1)], b = C[Math.min(C.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1; let nx = -dy / d, ny = dx / d; if (ny < 0) { nx = -nx; ny = -ny; } out.push([C[i][0] + nx * frac, C[i][1] + ny * frac]); } return out; };
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dab = async (p, r, n = 3) => { S.tool('paint'); V.brushRadius = r; await S.path([[p[0], p[1], 0.9], [p[0], p[1], 0.9]], n); };
const dry = async () => { S.act('dry', true); try { await S.skipTo('dry'); } finally { S.act('dry', false); } };
const washIn = async (mask, opts = {}) => { if (!has(mask)) return; S.tool('wash'); await S.wash({ mask }, { kind: 'flat', paper: 'moist', ...opts }); };
// a form's region grown by a cell (out to the mask's edge), less the hair next to its neighbours
const own = (f, neighbours = []) => apart(grow(regionOf(f), 1), neighbours.map(regionOf));
// the half of a segment's region on its shaded side (lower, away from the light at upper left)
const shadedHalf = f => {
  const C = f.spine.map(toSheet), m = regionOf(f), o = new Uint8Array(m.length);
  for (let c = 0; c < m.length; c++) {
    if (!m[c]) continue; const x = c % SW, y = (c / SW) | 0; let best = Infinity, side = 0;
    for (let i = 0; i < C.length - 1; i++) { const [ax, ay] = C[i], [bx, by] = C[i + 1], ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1))), dx = x - ax - ex * t, dy = y - ay - ey * t, d = dx * dx + dy * dy; if (d < best) { best = d; let nx = -ey, ny = ex; if (ny < 0) { nx = -nx; ny = -ny; } side = dx * nx + dy * ny; } }
    if (side > 0) o[c] = 1;
  }
  return o;
};

window.__paintDone = (async () => {
  h.setPaper('coldPress', 64); h.setTone('natural'); S.clear();
  log('underdrawing: outlines and main joints, light');
  S.tool('pencil'); V.pencilRadius = 1.5; V.pencilDark = 0.11;   // (0.18 read as outlining every shape under the paint)
  const forms = [shell, ...spines, ...eyes, underside, ...R.forms, ...L.forms, ...legForms, ...paddles];
  const meets = [...spines.map(sp => D.meet(shell, sp)), ...R.meets, ...L.meets, ...legMeets];
  const skip = new Set(unassigned.map(f => forms.indexOf(f)));
  const lines = D.lines([...forms, ...meets], cam).filter(l => !skip.has(l.form) && !(l.form >= forms.length && meets[l.form - forms.length] && unassigned.some(u => meets[l.form - forms.length].owners?.includes(u))));
  const under = { overlap: 0.34, silhouette: 0.28, edge: 0.2, meet: 0.22 };   // no contours, no hidden, no gesture
  await D.pencil(lines.filter(l => l.kind in under), { weight: under });
  // the front: the outline of the cluster and its plate rims and sockets; no stripes or shading marks
  await D.pencil([{ kind: 'silhouette', pts: D.smoothPath(clusterEdge.map(([x, y]) => [x, y, 0]), 8).map(([x, y]) => [x, y]) }], { weight: under, every: 1 });
  await D.pencil(frontMarks.filter(m => m.kind === 'edge'), { weight: under, every: 1 });
  await S.look('underdrawing');

  log('masking fluid over the whole crab: every form\'s region, and the front\'s cluster');
  // (not the hidden slab under the front, which only hides things, nor the two unassigned dark
  // segments, which are shadow: pass 1 masked them and they stayed white; grown by 1, not 2: a
  // wider mask left a white halo round every limb)
  const crabMask = grow(union([...masks.filter((_, i) => forms[i] !== underside && !unassigned.includes(forms[i])), M.maskOf(clusterPoly)]), 1);
  S.tool('mask'); h.setBrushPreset('round'); V.brushRadius = 8;
  await M.washAround({ mask: crabMask }, { mist: false, avoidPaint: false, even: false });
  // the thin cones (arm spines, lateral spines) stroked along at their own width: the wash's
  // brush was too big for them and sand got in (pass 4)
  const cones = [...spines, ...R.forms.slice(7), ...L.forms.slice(6)];
  S.tool('mask');
  for (const sp of cones) { const a = toSheet(sp.spine[0]), b = toSheet(sp.spine.at(-1)), Lc = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; V.brushRadius = Math.max(2, 1.2 * count(regionOf(sp)) / Lc); await S.path([[...a, 1], [...lerp2(a, b, 0.7), 0.6], [...b, 0.15]], 3); }
  await S.look('mask');

  log('the sand: a neutral grey, laid wet over everything');
  h.setBrushPreset('mop'); V.brushRadius = 50; V.brushPigment = 0.2; V.dipLoad = 1;
  h.setBrush([['Raw Umber', 1.6], ['French Ultramarine', 0.8], ['Transparent Yellow Oxide', 0.3]]);
  S.tool('wash');
  await S.wash(null, { kind: 'flat', paper: 'wet', dampen: true });
  log('wet hollows, dropped in soft while it shines');
  S.tool('paint'); h.setBrushPreset('mop'); V.brushRadius = 40; V.brushPigment = 0.24; V.dipLoad = 0.3;
  h.setBrush([['Raw Umber', 1.4], ['French Ultramarine', 0.9]]);
  for (const st of [[[90, 60], [170, 170], [250, 300]], [[0, 220], [60, 330], [80, 450]], [[420, 740], [500, 640], [620, 610], [740, 700]], [[900, 680], [980, 560], [1020, 420]], [[600, 60], [720, 110], [800, 90]]])
    await S.path(st.map((p, k) => [...p, 0.25 + 0.5 * Math.sin(Math.PI * (k + 0.5) / st.length)]), 6);
  log('her shadows: soft pools of darker sand, running under the masked crab; lighter than the photo\'s near-black (the painter: too attached to dark shadows)');
  await S.skipTo('shiny', { points: [[600, 600]] });
  h.setBrushPreset('mop'); V.brushPigment = 0.36; V.dipLoad = 0.45;
  h.setBrush([['Raw Umber', 1.3], ['French Ultramarine', 1], ['Perylene Maroon', 0.2]]);
  const shade = async (pts, r) => { V.brushRadius = r; await S.path(pts, 6); };
  await shade([[430, 450, 0.5], [520, 490, 0.9], [640, 505, 1], [760, 500, 0.8], [820, 470, 0.4]], 30);
  await shade([[560, 668, 0.3], [660, 676, 0.8], [760, 672, 0.9], [840, 650, 0.6], [870, 610, 0.3]], 20);
  await shade([[262, 440, 0.4], [276, 520, 0.8], [296, 600, 0.6], [318, 690, 0.3]], 16);
  await shade([[945, 380, 0.3], [958, 470, 0.7], [945, 560, 0.6], [915, 612, 0.3]], 14);
  V.brushPigment = 0.26;
  await shade([[200, 238, 0.3], [300, 232, 0.5], [390, 220, 0.3]], 10);
  await shade([[118, 396, 0.3], [210, 372, 0.5], [300, 320, 0.3]], 10);
  // the pool right under her, at satin so it keeps its shape by the crab: dark, not black
  await S.skipTo('satin', { points: [[600, 600]] });
  h.setBrush([['Raw Umber', 1.4], ['French Ultramarine', 0.8], ['Perylene Green', 0.6]]); V.brushPigment = 0.6; V.dipLoad = 0.15;
  await shade([[466, 512, 0.4], [560, 528, 0.9], [660, 536, 1], [760, 532, 0.8], [836, 560, 0.4]], 24);
  V.brushPigment = 0.45;
  await shade([[590, 676, 0.3], [690, 682, 0.8], [790, 676, 0.7], [856, 650, 0.3]], 14);
  await shade([[280, 452, 0.3], [292, 540, 0.7], [312, 640, 0.4]], 11);
  await dry();
  await S.look('sand');
  log('peel the mask');
  await S.unmask();

  log('the shell: grey-olive, bluer through the middle, dark olive to the right');
  // (pass 2 came out pale and smooth beside the first painting's shell)
  h.setBrushPreset('mop'); V.brushRadius = 30; V.brushPigment = 0.38; V.dipLoad = 1;
  h.setBrush([['Transparent Yellow Oxide', 1], ['Perylene Green', 0.6], ['Raw Umber', 1], ['French Ultramarine', 0.6]]);
  S.tool('wash');
  await S.wash({ mask: own(shell) }, { kind: 'variegated', into: [['Perylene Green', 1.3], ['Raw Umber', 1.2], ['French Ultramarine', 0.5]], direction: 'across', paper: 'moist' });
  log('spines: purple-brown, from the shell out to their points');
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 6; V.brushPigment = 0.5; V.dipLoad = 0.4;
  h.setBrush([['Perylene Maroon', 1], ['Perylene Green', 1.5]]);
  for (const sp of spines) await washIn(regionOf(sp));
  log('at satin: darker along the toothed front edges and the right flank');
  await S.skipTo('satin', { points: [[600, 330]] });
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 22; V.brushPigment = 0.58; V.dipLoad = 0.2;
  h.setBrush([['Perylene Green', 1.5], ['Raw Umber', 1.2], ['French Ultramarine', 0.5]]);
  await S.path([[380, 330, 0.3], [430, 385, 0.7], [520, 425, 0.8], [620, 440, 0.8], [720, 428, 0.8], [820, 392, 0.7], [880, 360, 0.3]], 6);
  await S.path([[700, 290, 0.3], [780, 320, 0.8], [840, 345, 0.5]], 6);
  log('at damp: lift the back ridge and the pale lines across the shell');
  await S.skipTo('damp', { points: [[600, 330]] });
  S.tool('lift'); h.setBrushPreset('round'); V.brushRadius = 10;
  await S.path([[520, 210, 0.5], [580, 204, 0.8], [660, 214, 0.5]], 8);
  V.brushRadius = 4;
  await S.path([[520, 292, 0.3], [580, 296, 0.8], [640, 306, 0.6], [700, 322, 0.2]], 8);
  await S.path([[540, 334, 0.3], [600, 338, 0.7], [660, 350, 0.2]], 8);
  await dry();
  log('the teeth, each a stroke from its base out to its point: cream, red-brown at the tip (pass 1\'s shell wash smoothed past them and left the margins bare)');
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.35;
  const toothList = T => { const out = []; for (let i = 1; i < T.length - 1; i += 2) out.push({ base: [(T[i - 1][0] + T[i + 1][0]) / 2, (T[i - 1][1] + T[i + 1][1]) / 2], tip: T[i] }); return out; };
  const allTeeth = [...toothList(teethL), ...toothList(teethR)];
  for (const t of allTeeth) {
    h.setBrush([['Transparent Yellow Oxide', 1], ['White Gouache', 0.7], ['Raw Umber', 0.3]]); V.brushPigment = 0.5; V.brushRadius = 7;
    await S.path([[...t.base, 0.9], [...lerp2(t.base, t.tip, 0.6), 0.5], [...t.tip, 0.1]], 3);
  }
  h.setBrush([['Pyrrole Scarlet', 1], ['Perylene Maroon', 0.8]]); V.brushPigment = 0.6; V.brushRadius = 3;
  for (const t of allTeeth) await S.path([[...lerp2(t.base, t.tip, 0.65), 0.6], [...t.tip, 0.2]], 2);
  await dry();
  await S.look('shell');

  const legSets = [...legs.slice(0, 6), swimL, swimR];
  log('the joints first, as places of their own: the band where two segments meet, orange membrane (pass 2: a hairline of paper with an orange dot beside it)');
  const jointZones = [];
  for (const l of legSets) for (let k = 0; k < l.segs.length - 1; k++) {
    const A = regionOf(l.segs[k]), B = regionOf(l.segs[k + 1]);
    const z = union([and(grow(A, 4), B), and(grow(B, 4), A)]);
    if (has(z)) jointZones.push({ z, a: l.segs[k], b: l.segs[k + 1] });
  }
  h.setBrushPreset('round'); V.brushRadius = 4; V.dipLoad = 0.45;
  // (pass 4's flat orange read as tape: the photo's grade cream to bright orange to dark, like the finger tips)
  for (const j of jointZones) { if (!has(j.z)) continue; h.setBrush([['Pyrrole Scarlet', 1], ['Azo Condensation Yellow', 1]]); V.brushPigment = 0.45 + (rnd() - 0.5) * 0.12; S.tool('wash'); await S.wash({ mask: j.z }, { kind: 'variegated', into: [['Pyrrole Scarlet', 1.2], ['Perylene Maroon', 0.7]], direction: 'down', paper: 'moist' }); }
  await dry();
  const allJoints = union(jointZones.map(j => j.z));
  log('legs, segment by segment: each its own small wash, up to its joints');
  const teal = () => { h.setBrush([['Phthalo Blue (GS)', 1], ['Phthalo Turquoise', 1], ['Raw Umber', 0.15]]); V.brushPigment = 0.24 + (rnd() - 0.5) * 0.06; V.dipLoad = 0.5; };
  h.setBrushPreset('round'); V.brushRadius = 7;
  for (const parity of [0, 1]) {
    for (const l of legSets) for (let k = parity; k < l.segs.length; k += 2) {
      teal(); await washIn(minus(grow(regionOf(l.segs[k]), 1), allJoints));
    }
    await dry();
  }
  log('the shaded half of each segment glazed, its edge the ridge along the segment (pass 1\'s stroke down each read as a seam)');
  h.setBrushPreset('round'); V.brushRadius = 5; V.dipLoad = 0.5; V.brushPigment = 0.14;
  h.setBrush([['Phthalo Blue (GS)', 1], ['French Ultramarine', 0.8], ['Raw Umber', 0.3]]);
  for (const l of legSets) for (const sg of l.segs) await washIn(minus(shadedHalf(sg), allJoints));
  await dry();
  log('the paddles: a stronger blue with a darker rim');
  // (pass 2's were flat saturated blobs)
  h.setBrushPreset('round'); V.brushRadius = 10; V.brushPigment = 0.2; V.dipLoad = 0.7;
  h.setBrush([['Phthalo Blue (GS)', 1.5], ['French Ultramarine', 0.6], ['Raw Umber', 0.2]]);
  for (const pd of paddles) { S.tool('wash'); await S.wash({ mask: regionOf(pd) }, { kind: 'variegated', into: [['Phthalo Blue (GS)', 1], ['Phthalo Turquoise', 1]], direction: 'across', paper: 'moist' }); }
  await dry();
  log('the cream on the lit top of each joint, and a catch-light');
  S.tool('paint'); V.dipLoad = 0.3;
  for (const j of jointZones) {
    let best = null, bv = Infinity; for (let c = 0; c < j.z.length; c++) if (j.z[c]) { const x = c % SW, y = (c / SW) | 0, v = y + 0.4 * x; if (v < bv) { bv = v; best = [x, y]; } }
    if (!best) continue; const [x0, y0, x1, y1] = bbox(j.z), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, p = lerp2(best, [cx, cy], 0.35);
    h.setBrush([['Transparent Yellow Oxide', 1], ['White Gouache', 0.7]]); V.brushPigment = 0.45; await dab(p, Math.max(1.8, Math.min(x1 - x0, y1 - y0) * 0.22), 3);
    h.setBrush('White Gouache'); V.brushPigment = 0.7; await dab([p[0] - 0.5, p[1] - 0.5], 1.1, 2);
  }
  log('the shine along each segment\'s lit side (the photo\'s legs are glossy; without it they sat flat beside the claws)');
  h.setBrush('White Gouache'); V.brushPigment = 0.4; V.dipLoad = 0.25; V.brushRadius = 1.4;
  for (const l of legSets) for (const sg of l.segs) {
    const Lc = Math.hypot(...[0, 1].map(i => toSheet(sg.spine.at(-1))[i] - toSheet(sg.spine[0])[i])) || 1, w = count(regionOf(sg)) / Lc;
    const side = sideOf(sg, -w * 0.25), n = side.length; if (n < 3) continue;
    await S.path(side.slice(Math.floor(n * 0.2), Math.ceil(n * 0.75)).map((p, k, arr) => [...p, 0.3 + 0.5 * Math.sin(Math.PI * k / Math.max(1, arr.length - 1))]), 3);
  }

  log('claws, segment by segment: arms blue above and cream below, carpus and palm nearly white, blue membrane at the joints');
  for (const C of [R, L]) {
    const segs = C.forms.filter(f => f.kind === 'mass');   // arm, carpus, propodus (and the right's shoulder is a prism, first)
    const [armM, carpM, propM] = segs;
    // the arm: two fields, not a gradient (the painter): sky blue over its near part, cream over
    // the elbow end, meeting along a boundary measured on zooms; the cream laid against the blue
    // while it's wet, so a thin green forms where they meet, as on the photo. (Pass 5 split the arm
    // lengthwise, teal glazed over dry cream; a variegated wash was a gradient.)
    const arm = own(armM, [carpM]), [blueSide, creamSide] = splitBy(arm, C === R ? [[798, 506], [822, 494], [845, 484], [860, 465], [870, 455]] : [[312, 333], [321, 363], [327, 391], [332, 402]], C === R ? [760, 470] : [370, 380]);
    h.setBrushPreset('round'); V.brushRadius = 8; V.dipLoad = 0.7;
    h.setBrush([['Phthalo Blue (GS)', 1], ['Phthalo Turquoise', 0.5], ['French Ultramarine', 0.3]]); V.brushPigment = 0.24;
    await washIn(blueSide);
    // (laid into the blue while still very wet, pass 6's cream bled across ~40 cells: a gradient
    // again. Damp, it meets with a soft edge and a thin green)
    await S.skipTo('damp', { points: [C === R ? [780, 480] : [360, 375]] });
    h.setBrush([['Transparent Yellow Oxide', 1], ['Raw Umber', 0.3]]); V.brushPigment = 0.14;
    await washIn(creamSide);
    // the palm (with the fixed finger): warm cream (the painter: cream wants more presence)
    h.setBrush([['Transparent Yellow Oxide', 1], ['Raw Umber', 0.3]]); V.brushPigment = 0.14; V.dipLoad = 0.7;
    await washIn(own(propM, [carpM]));
  }
  await dry();
  for (const C of [R, L]) {
    const segs = C.forms.filter(f => f.kind === 'mass'), [armM, carpM, propM] = segs;
    h.setBrush([['Transparent Yellow Oxide', 1], ['Raw Umber', 0.35], ['Phthalo Turquoise', 0.1]]); V.brushPigment = 0.13; V.dipLoad = 0.7;
    await washIn(own(carpM, [armM, propM]));

    // the membrane collars at wrist and elbow: blue bands
    h.setBrush([['Phthalo Blue (GS)', 1], ['Phthalo Turquoise', 0.6]]); V.brushPigment = 0.32; V.dipLoad = 0.5;
    for (const f of C === R ? [C.forms[5], C.forms[6]] : [C.forms[4], C.forms[5]]) await washIn(regionOf(f));
  }
  // the right claw's shoulder, in shadow: dark blue-olive
  h.setBrush([['Phthalo Blue (GS)', 1], ['Perylene Green', 0.8], ['Raw Umber', 0.5]]); V.brushPigment = 0.4; V.dipLoad = 0.5;
  await washIn(regionOf(R.forms[0]));
  log('the movable fingers: hot orange, magenta into the wet tips');
  for (const C of [R, L]) {
    const dac = C === R ? C.forms[4] : C.forms[3];
    h.setBrush([['Pyrrole Scarlet', 1], ['Azo Condensation Yellow', 1.2]]); V.brushPigment = 0.42; V.dipLoad = 0.7;
    await washIn(regionOf(dac));
    const tip = toSheet(dac.spine.at(-1)), pre = toSheet(dac.spine[Math.floor(dac.spine.length * 0.75)]);
    S.tool('paint'); h.setBrush([['Quinacridone Magenta', 1.5], ['Perylene Maroon', 1]]); V.brushPigment = 0.5; V.dipLoad = 0.4; V.brushRadius = 4;
    await S.path([[...pre, 0.8], [...tip, 0.2]], 6);
  }
  log('the left palm\'s blue upper face along its right side');
  // (no stripe on the right palm: it was the first painting's palm-edge line, misplaced into the
  // middle of the palm, and the photo's right palm is cream throughout; the wrist blue is the collar)
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 7; V.brushPigment = 0.3; V.dipLoad = 0.45;
  h.setBrush([['Phthalo Blue (GS)', 1], ['Phthalo Turquoise', 0.6]]);
  await S.path([[262, 450, 0.3], [268, 500, 0.6], [264, 540, 0.25]], 6);
  // (a touch of blue meant for the right carpus's inner edge landed on the sand: a crop's
  // coordinates converted wrong; dropped)
  await dry();
  S.tool('paint'); h.setBrush('White Gouache'); V.brushPigment = 0.5; V.dipLoad = 0.25; V.brushRadius = 2;
  await S.path([[730, 626, 0.3], [790, 618, 0.7], [832, 616, 0.3]], 3);
  await S.path([[204, 458, 0.3], [208, 500, 0.7], [218, 532, 0.3]], 3);
  await S.look('limbs');

  log('the front, from its marks: dark in the gaps under the shell, cream on the lit rims');
  // (pass 1: a dark brown block; the photo's cluster is olive and cream with dark gaps)
  h.setBrushPreset('round'); V.brushRadius = 8; V.brushPigment = 0.26; V.dipLoad = 0.6;
  h.setBrush([['Transparent Yellow Oxide', 1], ['Perylene Green', 0.8], ['Raw Umber', 0.8]]);
  await washIn(apart(M.maskOf(clusterPoly), [regionOf(shell)], 0));
  log('the layers behind the plates, flaking: rows of thin plates stacked down the cluster and out to the sockets, each a cream lit edge with a dark gap under it (pass 2 had too few to flake)');
  // laid out in the body's own frame (the measured midline): rows below the plates, and beside
  // them out toward the sockets; jittered per side so the two halves don't mirror exactly
  const inside = (x, y) => { let c = false; for (let i = 0, j = clusterPoly.length - 1; i < clusterPoly.length; j = i++) { const [xi, yi] = clusterPoly[i], [xj, yj] = clusterPoly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const rows = [[-17, 52, 92], [-8, 50, 96], [2, 48, 92], [11, 46, 86], [19, 10, 72], [25, 6, 60], [30, 4, 40]];
  const flakes = [];
  for (const sgn of [-1, 1]) for (const [v0, u0, u1] of rows) {
    const v = v0 + (rnd() - 0.5) * 3, cut = u0 + (u1 - u0) * (0.35 + rnd() * 0.3), parts = rnd() < 0.6 ? [[u0, cut - 3], [cut + 2, u1]] : [[u0, u1]];
    for (const [a, b] of parts) {
      const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8, u = a + (b - a) * t; pts.push(across(v - 2.2 * Math.sin(Math.PI * t), sgn * u)); }
      const inn = pts.filter(p => inside(...p)); if (inn.length > 2) flakes.push(inn);
    }
  }
  // the darks dropped into the base while it's still moist, so they soften (pass 4's, on dry
  // paper, made hard linework the painter flagged)
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.3;
  h.setBrush([['Perylene Green', 1], ['Perylene Maroon', 0.8], ['Raw Umber', 0.5]]); V.brushPigment = 0.55; V.brushRadius = 2.6;
  for (const fl of flakes) await S.path(fl.map(([x, y], k) => [x, y + 3, 0.4 + 0.5 * Math.sin(Math.PI * k / (fl.length - 1))]), 2);
  for (const m of frontMarks.filter(m => m.kind === 'overlap')) await S.path(m.pts.map(p => [...p, 0.6]), 2);
  await dry();
  // the lit edges broken into pieces, pressure varied, as light catches an edge in places
  const broken = pts => { const runs = []; let run = []; for (const p of pts) { if (rnd() < 0.22) { if (run.length > 1) runs.push(run); run = []; } else run.push(p); } if (run.length > 1) runs.push(run); return runs; };
  h.setBrush([['Transparent Yellow Oxide', 1], ['White Gouache', 0.8]]); V.brushPigment = 0.45; V.brushRadius = 2;
  for (const fl of flakes) for (const r of broken(fl)) await S.path(r.map(([x, y]) => [x, y, 0.35 + 0.5 * rnd()]), 2);
  h.setBrush([['Transparent Yellow Oxide', 1], ['White Gouache', 0.6]]); V.brushPigment = 0.35; V.brushRadius = 1.6;
  for (const m of frontMarks.filter(m => m.kind === 'edge')) for (const r of broken(m.pts)) await S.path(r.map(p => [...p, 0.4 + 0.4 * rnd()]), 2);
  log('the eyes: dark globes with a catch-light, in their sockets');
  h.setBrush([['Perylene Green', 1], ['Perylene Maroon', 0.6], ['French Ultramarine', 0.4]]); V.brushPigment = 0.6; V.dipLoad = 0.3;
  for (const e of eyes) await washIn(regionOf(e));
  await dry();
  // (pass 2's were too small to register; pass 3's went nowhere: the wash tool was still in hand)
  S.tool('paint'); h.setBrush('White Gouache'); V.brushPigment = 0.55; V.dipLoad = 0.25;
  V.brushPigment = 0.9; await dab([443, 399], 2.6, 4); await dab([673, 445], 3, 4);

  log('details: orange joints, cream-tipped teeth and spines, white lines and speckles on the shell');
  S.tool('paint'); h.setBrushPreset('round');
  const tips = [...teethL, ...teethR].filter((_, i) => i % 2 === 1);
  h.setBrush([['Pyrrole Scarlet', 1], ['Azo Condensation Yellow', 1]]); V.brushPigment = 0.45;
  for (const t of tips) await dab(t, 3, 2);
  h.setBrush('White Gouache'); V.brushPigment = 0.55;
  for (const t of tips) await dab([t[0] + 1, t[1] - 1], 1.6, 2);
  // the spines on the claws' arms: stout cream cones, red at the tip
  const armSpines = [...R.forms.slice(7), ...L.forms.slice(6)];
  // (the photo's: cream cones, red at the tip; pass 3 had them backwards, red at the base,
  // after a fresh agent's 'red-based' over my own first reading: the painter caught it)
  // filling each cone's whole region (pass 4: two strokes down each read as lines in the triangle)
  h.setBrushPreset('round'); V.brushRadius = 2.5; V.dipLoad = 0.4;
  h.setBrush([['Transparent Yellow Oxide', 1], ['White Gouache', 0.8]]); V.brushPigment = 0.35;
  for (const sp of armSpines) await washIn(grow(regionOf(sp), 1));
  await dry();
  h.setBrush([['Pyrrole Scarlet', 1.3], ['Azo Condensation Yellow', 0.5]]); V.brushPigment = 0.6;
  for (const sp of armSpines) await washIn(pastAlong(sp, 0.55));
  S.tool('paint'); h.setBrushPreset('round');
  // the two pale lines across the shell, crisper (the painter: the white lines could have more definition)
  h.setBrush('White Gouache'); V.brushPigment = 0.7; V.dipLoad = 0.3; V.brushRadius = 1.8;
  await S.path([[520, 292, 0.3], [580, 296, 0.8], [640, 306, 0.6], [700, 322, 0.2]], 3);
  await S.path([[540, 334, 0.3], [600, 338, 0.7], [660, 350, 0.2]], 3);
  const inShell = (x, y) => regionOf(shell)[Math.round(y) * SW + Math.round(x)];
  // (pass 1's speckles at 0.45 for one frame didn't show)
  V.brushPigment = 0.75; let n = 0;
  while (n < 300) { const x = 370 + rnd() * 520, y = 205 + rnd() * 250; if (!inShell(x, y) || rnd() > 0.35 + 0.5 * (x - 370) / 520) continue; await dab([x, y], 1.2 + rnd() * 1.1, 2); n++; }
  await dry();
  await S.look('final');
  log('done');
})();
