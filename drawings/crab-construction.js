// Drawing practice 4 (Claude): a constructional drawing of the beach crab
// (.local/refs/blue-crab/epa-louisiana-beach.jpg), pencil only, after
// drawabox's insects and arachnids: the big masses first, legs as chains of
// sausage segments overlapping at the joints, the lines where forms meet.
// (The painter, on the painting from this photo: limbs read detached, legs
// were swipes rather than segments, the front was simplified away. Draw how
// it all connects first.)
//
// The camera was fitted to landmarks on the photo (.local/fitcam.mjs, ~30
// cells rms): nearly overhead, a little in front. Every form is placed by
// taking points measured off the photo (canvas cells) back into 3D at a
// height above the sand (mm) that says how the animal stands: the shell
// ~35 mm up, each leg rising from under its edge to the knee and down to a
// tip on the sand, the claws' palms resting low.
const S = window.__sim, h = S.headless, D = window.__draw, { add, sub, mul, len, norm, cross } = D.math;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };

const cam = D.camera({ eye: [29.5, 333.3, 28.9], target: [-19.5, 35, 26], focal: 1021, up: [Math.sin(0.161), Math.cos(0.161), 0] });
const P = (x, y, hgt) => cam.unproject(x, y, hgt);
// a size measured on the sheet (cells) as a size in the world at that point
const mm = (cells, p) => cells * cam.project(p)[2] / cam.focal;

// ---- the shell: an ellipsoid built from its measured ends and sides ----
const spineL = P(255, 236, 32), spineR = P(975, 352, 32), front = P(548, 452, 30), back = P(575, 200, 34);
const shellC = add(mul(add(front, back), 0.5), [0, 4, 0]);
const across = mul(sub(spineR, spineL), 0.5 * 0.74), along = mul(sub(front, back), 0.5), up = mul(norm(cross(along, across)), 15);
// contours as level slices (around its up axis): seen from nearly overhead they show the dome
const shell = D.ellipsoid({ at: shellC, axes: [across, up[1] < 0 ? mul(up, -1) : up, along], contours: 3, around: 1 });
// the spines: from inside the shell's side out to the measured tips
const spine = (tip, sgn) => D.sausage({ spine: [add(shellC, mul(across, sgn * 0.8)), tip], radius: [mm(9, tip), 0.4], contours: 1 });
const spines = [spine(spineL, -1), spine(spineR, 1)];
// eyes on short stalks in their sockets at the front, and the mouthparts under it
const eyeAt = s => add(add(front, mul(norm(across), s * len(across) * 0.13)), [0, 3, 0]);
const eyes = [-1, 1].flatMap(s => { const a = eyeAt(s), b = add(a, add(mul(norm(along), 7), [0, 3, 0])); return [D.sausage({ spine: [a, b], radius: [1.6, 1.4], contours: 0 }), D.ellipsoid({ at: b, radii: [3.2, 3.2, 3.6], contours: 1, around: 2 })]; });
// the third maxillipeds: two flat plates side by side closing over the mouth
const mouth = [-1, 1].map(s => D.ellipsoid({ at: add(add(front, mul(norm(across), s * 7)), [0, -8, -2]), axes: [mul(norm(across), 6.5), [0, 2.5, 0], add(mul(norm(along), 9), [0, -6, 0])], contours: 1, around: 2 }));

// ---- limbs: joints measured on the sheet [x, y, height above the sand] ----
// (widths measured on the photo: a walking leg's merus ~24 cells across)
const limbOf = (joints, widths, { meetShell = true, contours = 1 } = {}) => {
  const J = joints.map(([x, y, hh]) => P(x, y, hh)), segs = [];
  for (let k = 0; k < J.length - 1; k++) {
    // each segment runs a little into the next, so the joint is an overlap, not a gap
    const a = J[k], b = J[k + 1], ab = sub(b, a), a2 = k === 0 ? a : sub(a, mul(ab, 0.08)), b2 = k === J.length - 2 ? b : add(b, mul(ab, 0.06));
    segs.push(D.sausage({ spine: [a2, b2], radius: [mm(widths[k] * 0.65, a), mm(widths[k + 1] * 0.65, b)], contours }));
  }
  const meets = segs.slice(1).map((sg, k) => D.meet(segs[k], sg));
  if (meetShell) meets.push(D.meet(shell, segs[0]));
  return { segs, meets, J };
};
// walking legs: base under the shell's edge, merus up to the knee, carpus, propodus, the pointed dactyl on the sand
const legs = [
  limbOf([[470, 232, 28], [398, 203, 40], [330, 214, 36], [212, 226, 14], [186, 236, 0]], [18, 17, 16, 12, 3]),
  limbOf([[402, 256, 28], [300, 305, 42], [236, 346, 34], [124, 381, 12], [108, 408, 0]], [21, 20, 18, 13, 3]),
  limbOf([[432, 300, 28], [372, 318, 34], [312, 330, 24]], [17, 16, 12]),
  limbOf([[790, 318, 28], [880, 322, 30], [896, 342, 4]], [19, 17, 4]),
  limbOf([[868, 384, 28], [916, 392, 34], [940, 470, 26], [926, 548, 12], [906, 590, 0]], [18, 18, 17, 13, 3]),
  limbOf([[838, 420, 26], [876, 438, 30], [900, 518, 18], [888, 562, 0]], [17, 17, 13, 3]),
];
// swimming legs: up and back to a flat oval paddle
const paddle = (joints, widths, blade) => {
  const L = limbOf(joints, widths), end = L.J[L.J.length - 1], dir = norm(sub(end, L.J[L.J.length - 2]));
  const c = add(end, mul(dir, mm(blade[0], end) * 0.8));
  const oval = D.ellipsoid({ at: c, axes: [mul(dir, mm(blade[0], end)), [0, 2, 0], mul(norm(cross(dir, [0, 1, 0])), mm(blade[1], end))], contours: 1, around: 0 });
  L.segs.push(oval); L.meets.push(D.meet(oval, L.segs[L.segs.length - 2]));
  return L;
};
const paddles = [paddle([[440, 215, 28], [395, 191, 34], [372, 160, 26]], [16, 14, 12], [44, 30]), paddle([[760, 262, 28], [835, 274, 32], [890, 230, 26]], [18, 16, 13], [48, 36])];
// the chelipeds: the arm (merus) from under the front edge, the carpus a knob, the palm a long
// flattened mass resting low, the fingers tapering to points
const claw = ({ arm, carpus, palm, palmW, finger }) => {
  const A = limbOf([...arm, carpus.at], [32, 30, 26], { contours: 1 });   // the arm runs on into the carpus knob
  const C = P(...carpus.at), carp = D.ellipsoid({ at: C, radii: [mm(carpus.r, C), mm(carpus.r * 0.8, C), mm(carpus.r, C)], contours: 1, around: 1 });
  const p0 = P(...palm[0]), p1 = P(...palm[1]), pc = mul(add(p0, p1), 0.5), ax = mul(sub(p1, p0), 0.55);
  const palmF = D.ellipsoid({ at: pc, axes: [ax, [0, mm(palmW * 0.32, pc), 0], mul(norm(cross(ax, [0, 1, 0])), mm(palmW / 2, pc))], contours: 3, around: 0 });
  const F = finger.map(([x, y, hh]) => P(x, y, hh));
  const fing = D.sausage({ spine: [sub(F[0], mul(sub(F[1], F[0]), 0.15)), ...F.slice(1)], radius: [mm(16, F[0]), mm(6, F[1]), 0.4], contours: 2 });
  return { segs: [...A.segs, carp, palmF, fing], meets: [...A.meets, D.meet(A.segs[A.segs.length - 1], carp), D.meet(palmF, carp), D.meet(palmF, fing)] };
};
const claws = [
  claw({ arm: [[470, 418, 24], [252, 362, 30]], carpus: { at: [228, 392, 28], r: 24 }, palm: [[200, 425, 20], [252, 560, 14]], palmW: 70, finger: [[238, 552, 12], [296, 646, 5], [318, 692, 1]] }),
  claw({ arm: [[520, 470, 22], [790, 482, 30]], carpus: { at: [826, 512, 28], r: 26 }, palm: [[848, 600, 20], [688, 646, 14]], palmW: 80, finger: [[694, 642, 11], [566, 656, 4], [528, 661, 1]] }),
];

window.__paintDone = (async () => {
  h.setPaper('hotPress', 5); h.setTone('white'); S.clear();
  log('gesture: the body\'s axis and each limb\'s sweep, quick and light');
  const sweeps = [[[575, 200], [612, 318], [548, 452]], [[255, 236], [612, 318], [975, 352]],
    ...[...legs, ...paddles].map(L => L.J.map(p => cam.project(p).slice(0, 2))),
    [[470, 418], [252, 362], [228, 400], [226, 490], [296, 646], [318, 692]], [[520, 470], [790, 482], [826, 512], [768, 623], [566, 656], [528, 661]]];
  await D.pencil(sweeps.map(D.gesture), { weight: { gesture: 0.18 } });
  log('construction: masses, segments, contours, and where each form meets the next');
  const forms = [shell, ...spines, ...eyes, ...mouth, ...[...legs, ...paddles, ...claws].flatMap(L => L.segs)];
  const meets = [...legs, ...paddles, ...claws].flatMap(L => L.meets);
  for (const sp of spines) meets.push(D.meet(shell, sp));
  await D.pencil(D.lines([...forms, ...meets], cam));
  log(`${forms.length} forms, ${meets.length} meetings`);
  await S.look('construction');
})();
