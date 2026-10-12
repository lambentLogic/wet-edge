// Drawing practice 5 (Claude): the beach crab's right claw, from a crop of
// the photo (canvas region x 490-910, y 420-735), pencil only.
// The painter, on the crab construction: "looks like you deconstructed a
// foreclaw and attached it to a rod": I had measured a skeleton (joints and
// widths) and filled each gap with a primitive (a rod, a ball, an egg, a
// cone). Looked at as one shape first, the cheliped is a hook: the arm runs
// out from under the shell, turns down through a compact knobbed carpus, and
// the hand reaches back: a long faceted palm whose lower edge runs straight
// on into the fixed finger (palm and fixed finger are one rigid piece), with
// the movable finger hinged at the palm's end, lying along the fixed one.
// Hard and faceted: prisms (D.prism), not sausages; the arm as massive as
// the palm; spines hanging from the arm's lower edge.
const S = window.__sim, h = S.headless, D = window.__draw, { add, sub, mul, norm } = D.math;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };

// the camera fitted to the whole photo (crab-construction.js), and the same view zoomed onto the crop
const fit = { eye: [29.5, 333.3, 28.9], target: [-19.5, 35, 26], focal: 1021, up: [Math.sin(0.161), Math.cos(0.161), 0] };
const cam = D.camera(fit);
const X0 = 490, Y0 = 420, k = 1024 / 420;
const view = D.camera({ ...fit, focal: fit.focal * k, center: [(512 - X0) * k, (384 - Y0) * k] });
// a point measured on the photo [x, y] at a height above the sand (mm); a size in cells as mm there
const P = ([x, y, hh]) => cam.unproject(x, y, hh);
const mm = (cells, p) => cells * cam.project(p)[2] / cam.focal;
const along = (pts, cells) => pts.map((q, i) => mm(cells[i], P(q)));

// Measured from the outer edges, top outline and bottom outline (the first try measured
// only the blue top of the arm: its cream underside is the same mass, and the spines hang
// from the bottom of that; it came out a thin bar floating above them).
// the arm (merus): a heavy rounded-triangular bar, from under the shell to the carpus
// (top edge 690,455 to 880,470; bottom edge through the spine bases 705,512 / 790,540 / 870,560)
const armPts = [[690, 484, 26], [790, 499, 30], [870, 515, 30]];
const arm = D.prism({ spine: armPts.map(P), width: along(armPts, [56, 82, 90]), thick: along(armPts, [40, 56, 60]), section: [[1, -0.5], [0.5, 0.6], [0, 1], [-0.5, 0.6], [-1, -0.5], [0, -1]], rings: 2 });
// spines along its lower edge, pointing down and forward
const spines = [[[706, 512, 24], [718, 540, 20]], [[740, 522, 26], [748, 548, 22]], [[790, 540, 26], [802, 562, 22]]]
  .map(([a, b]) => D.sausage({ spine: [P(a), P(b)], radius: [mm(5, P(a)), 0.3], contours: 0 }));
// the carpus: a compact knobbed block where the limb turns down
const carpPts = [[878, 524, 30], [886, 566, 28], [872, 612, 24]];
const carpus = D.prism({ spine: carpPts.map(P), width: along(carpPts, [48, 60, 54]), thick: along(carpPts, [40, 44, 40]), rings: 1 });
// the palm and fixed finger: one rigid faceted piece, wide at the wrist, narrowing to the hinge, then the
// fixed finger's blade running on along the palm's lower edge to a point
// (top edge 840,598 / 800,592 / 760,596 / 705,615; bottom edge 850,650 / 800,665 / 750,668 / 700,668:
// widest past the wrist, where the top edge bulges)
const palmPts = [[850, 624, 20], [800, 628, 19], [760, 632, 17], [705, 641, 15], [650, 660, 10], [590, 668, 6]];
const palm = D.prism({ spine: palmPts.map(P), width: along(palmPts, [56, 74, 72, 53, 20, 4]), thick: along(palmPts, [38, 46, 44, 34, 12, 3]), rings: 3 });
// the movable finger, hinged at the end of the palm, lying along the fixed one, curving to its tip
const dacPts = [[708, 628, 17], [640, 640, 13], [565, 652, 8], [530, 658, 5]];
const dactyl = D.prism({ spine: dacPts.map(P), width: along(dacPts, [36, 28, 14, 3]), thick: along(dacPts, [24, 18, 10, 2]), rings: 1 });

window.__paintDone = (async () => {
  h.setPaper('hotPress', 5); h.setTone('white'); S.clear();
  const toView = ([x, y]) => [(x - X0) * k, (y - Y0) * k];
  log('gesture: the whole claw as one hook, then where it turns');
  await D.pencil([D.gesture([[690, 490], [800, 505], [884, 532], [882, 600], [800, 624], [700, 641], [600, 655], [530, 658]].map(toView))], { weight: { gesture: 0.2 } });
  log('construction: arm, carpus, palm with its fixed finger, the hinged finger, and where each meets the next');
  const forms = [arm, carpus, palm, dactyl, ...spines];
  const meets = [D.meet(arm, carpus), D.meet(palm, carpus), D.meet(palm, dactyl), ...spines.map(sp => D.meet(arm, sp))];
  await D.pencil(D.lines([...forms, ...meets], view));
  await S.look('claw');
})();
