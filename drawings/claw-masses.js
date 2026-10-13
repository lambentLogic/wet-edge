// Drawing practice 6 (Claude): the claw again, as masses. The painter, on claw-study:
// "you aren't quite getting to the arbitrary organic forms with loops; the empty
// spaces mostly are what structure's missing": the boxes met at seams, and the
// claw is in the masses between them (the arm swelling into the carpus, the
// knuckle, the wrist, the palm's bulge, the hinge). Here the measured boxes are
// only the core; masses wrap them and fill the spaces, all blended into one
// surface (D.mass), drawn with its outline, contour loops and creases.
//
// After practice 5: the beach crab's right claw, from a crop of
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

// masses that fill the spaces between the boxes, each measured off the photo's outline
const blobAt = (q, rx, ry, rz) => { const c = P(q); return D.ellipsoid({ at: c, radii: [mm(rx, c), mm(ry, c), mm(rz, c)] }); };
const knuckle = blobAt([890, 524, 30], 30, 26, 28);    // where the arm swells into the carpus (kept inside the turn: further in, it stuck out into the gap as a tongue)
const wrist = blobAt([858, 606, 22], 32, 26, 30);      // the knob where the carpus meets the palm
const palmSwell = (() => { const a = P([830, 612, 22]), b = P([735, 622, 20]), c = mul(add(a, b), 0.5), ax = mul(sub(b, a), 0.6); return D.ellipsoid({ at: c, axes: [ax, [0, mm(18, c), 0], mul(norm(D.math.cross(ax, [0, 1, 0])), mm(30, c))] }); })();   // the palm's upper bulge
const hinge = blobAt([706, 634, 16], 22, 18, 22);      // the hinge's knuckle at the palm's end
// Each segment its own mass, the masses within it blended, the joints between segments kept
// (blending the whole claw into one surface lost the segments: the painter, "you also lost
// the segments ;P"). Each segment runs a little into the next, so the joint is an overlap
// with a meeting line where one tucks into the next.
const seg = (parts, along, loops) => D.mass({ parts, blend: 4, cell: 0.6, along: along.map(P), loops, crease: 55 });
const armM = seg([arm, knuckle], [[700, 488, 28], [800, 502, 30], [880, 522, 30]], 4);
const carpM = seg([carpus], [[878, 524, 30], [886, 566, 28], [872, 612, 24]], 2);
const propM = seg([palm, wrist, palmSwell, hinge], [[852, 616, 22], [770, 630, 18], [705, 641, 15], [600, 666, 8]], 5);

window.__paintDone = (async () => {
  h.setPaper('hotPress', 5); h.setTone('white'); S.clear();
  const toView = ([x, y]) => [(x - X0) * k, (y - Y0) * k];
  log('gesture: the whole claw as one hook, then where it turns');
  await D.pencil([D.gesture([[690, 490], [800, 505], [884, 532], [882, 600], [800, 624], [700, 641], [600, 655], [530, 658]].map(toView))], { weight: { gesture: 0.2 } });
  log('masses: each segment its own blended surface, meeting the next at its joint');
  const forms = [armM, carpM, propM, dactyl, ...spines];
  const meets = [D.meet(armM, carpM), D.meet(propM, carpM), D.meet(propM, dactyl), ...spines.map(sp => D.meet(armM, sp))];
  await D.pencil(D.lines([...forms, ...meets], view));
  await S.look('claw');
})();
