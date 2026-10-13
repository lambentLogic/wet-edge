// Drawing practice 7 (Claude): the claw with its planes and joints. After claw-masses I
// listed what was still missing, by my own eyes on the crop: (1) the planes: the palm's
// ridge between a lit top face and a darker side, the arm's ridges (blending had smoothed
// them away); (2) how joints are built: a rim on one segment, the next tucked into it, a
// soft collar of membrane between (the blue band at the wrist); (3) the arm's root going
// under the shell; (4) the fingers: the fixed one is a full lower jaw, both toothed along
// their cutting edges; (5) the spines on the carpus and the arm's end; (6) line weight
// (now heavier where a form passes in front of another, in src/drawing.js).
//
// After practice 6: the claw again, as masses. The painter, on claw-study:
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
const X0 = 516, Y0 = 424, k = 1024 / 420;   // shifted right of the earlier crop, to show the whole carpus
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
// (zoomed in: the blue arm's near end is rounded at x ~745; beyond it is the shoulder segment,
// in shadow so its colour reads dark, with cream edges, partly covered by the shell: the
// painter, after I'd first drawn it as a fade into shadow)
const armPts = [[748, 479, 28], [800, 490, 30], [860, 506, 30], [880, 515, 30]];
const arm = D.prism({ spine: armPts.map(P), width: along(armPts, [44, 70, 83, 86]), thick: along(armPts, [34, 50, 58, 60]), section: [[1, -0.5], [0.5, 0.6], [0, 1], [-0.5, 0.6], [-1, -0.5], [0, -1]], rings: 2 });
// the shoulder segment: from the arm's end (745, 458-500) narrowing toward the body, a ridge
// where its top face meets the edge (where the cream edge shows), running on under the shell
// (running on up under the shell's edge, so the edge cuts it off rather than it ending short with a flat end)
const ischPts = [[756, 479, 27], [722, 474, 28], [684, 466, 30], [640, 452, 33], [612, 444, 34]];
const ischium = D.prism({ spine: ischPts.map(P), width: along(ischPts, [44, 34, 28, 24, 22]), thick: along(ischPts, [30, 24, 20, 18, 16]),
  section: [[1, 0], [0.4, 0.8], [-0.5, 0.8], [-1, 0], [-0.4, -0.9], [0.4, -0.9]], rings: 0 });
// the shell's front edge (its toothed margin), which the shoulder comes out from under: a
// thin plate at the shell's height, its edge along the photo's front teeth (620,462 / 660,458 /
// 705,450 / 745,440), the plate running back into the shell from there. (Not mouthparts, and
// not an oval: an ellipsoid stand-in read as a ring round the shoulder's tip.)
const edgePts = [[600, 463], [660, 458], [705, 450], [745, 440], [790, 424]];
// (at the shell's height, above the shoulder: lower, the shoulder's top poked up through it)
const front = D.prism({ spine: edgePts.map(([x, y]) => P([x, y - 30, 48])), width: edgePts.map(([x, y]) => mm(60, P([x, y, 48]))), thick: edgePts.map(([x, y]) => mm(8, P([x, y, 48]))), section: [[1, 0], [0, 1], [-1, 0], [0, -1]], rings: 0 });
// spines along its lower edge, pointing down and forward
// stout white cones with red tips along the arm's lower edge (measured zoomed: the first
// placing was 50 cells too far left, and needles where they're cones)
const spines = [[[768, 500, 24], [763, 522, 20], 7], [[792, 512, 24], [787, 540, 20], 9], [[814, 532, 26], [812, 564, 22], 9]]
  .map(([a, b, r]) => D.sausage({ spine: [P(a), P(b)], radius: [mm(r, P(a)), 0.4], contours: 0 }));
// the carpus: a compact knobbed block where the limb turns down
const carpPts = [[878, 524, 30], [886, 566, 28], [872, 612, 24]];
const carpus = D.prism({ spine: carpPts.map(P), width: along(carpPts, [48, 60, 54]), thick: along(carpPts, [40, 44, 40]), rings: 1 });
// the palm and fixed finger: one rigid faceted piece, wide at the wrist, narrowing to the hinge, then the
// fixed finger's blade running on along the palm's lower edge to a point
// (top edge 840,598 / 800,592 / 760,596 / 705,615; bottom edge 850,650 / 800,665 / 750,668 / 700,668:
// widest past the wrist, where the top edge bulges)
// a ridge along its top (where the photo's crease runs, dividing the lit top face from the side),
// narrow at the wrist where it tucks into the carpus; the fixed finger a full lower jaw to its point
const palmPts = [[846, 622, 20], [810, 626, 19], [760, 632, 17], [705, 642, 14], [660, 656, 10], [620, 664, 7], [590, 668, 5]];
const palm = D.prism({ spine: palmPts.map(P), width: along(palmPts, [44, 72, 72, 53, 30, 14, 3]), thick: along(palmPts, [32, 46, 44, 34, 18, 9, 2]),
  section: [[1, 0], [0.55, 0.62], [0.08, 1], [-0.5, 0.66], [-1, 0], [-0.5, -0.9], [0.5, -0.9]], rings: 0 });
// the movable finger, hinged at the end of the palm, lying along the fixed one, curving to its tip
const dacPts = [[706, 630, 17], [640, 641, 13], [565, 652, 8], [530, 658, 5]];
const dactyl = D.prism({ spine: dacPts.map(P), width: along(dacPts, [36, 28, 14, 3]), thick: along(dacPts, [24, 18, 10, 2]), rings: 1 });

// masses that fill the spaces between the boxes, each measured off the photo's outline
const blobAt = (q, rx, ry, rz) => { const c = P(q); return D.ellipsoid({ at: c, radii: [mm(rx, c), mm(ry, c), mm(rz, c)] }); };
const knuckle = blobAt([890, 524, 30], 30, 26, 28);    // where the arm swells into the carpus (kept inside the turn: further in, it stuck out into the gap as a tongue)
const wrist = blobAt([848, 602, 22], 22, 18, 22);      // the knob where the carpus meets the palm (smaller and higher: at 32 cells it bulged into the sand below the wrist)
const palmSwell = (() => { const a = P([830, 612, 22]), b = P([735, 622, 20]), c = mul(add(a, b), 0.5), ax = mul(sub(b, a), 0.6); return D.ellipsoid({ at: c, axes: [ax, [0, mm(18, c), 0], mul(norm(D.math.cross(ax, [0, 1, 0])), mm(30, c))] }); })();   // the palm's upper bulge
const hinge = blobAt([706, 634, 16], 22, 18, 22);      // the hinge's knuckle at the palm's end
// the joints: a soft collar of membrane between the carpus's rim and the palm's neck (the blue
// band at the wrist), and between the arm's rim and the carpus
const collar = (a, b, r) => D.sausage({ spine: [P(a), P(b)], radius: mm(r, P(a)), contours: 1 });
const wristCollar = collar([874, 606, 23], [842, 620, 20], 17);
const elbowCollar = collar([878, 516, 30], [884, 540, 29], 20);
// teeth along the fingers' cutting edges, pointing across the gap at each other
const teeth = [];
for (let i = 0; i < 6; i++) { const x = 692 - i * 18, y = 648 + i * 2.4; teeth.push(D.sausage({ spine: [P([x, y - 3, 12 - i]), P([x - 2, y + 2, 11 - i])], radius: [mm(3, P([x, y, 10])), 0.2], contours: 0, ends: true })); }
for (let i = 0; i < 5; i++) { const x = 684 - i * 18, y = 657 + i * 2.2; teeth.push(D.sausage({ spine: [P([x, y + 3, 9 - i]), P([x - 2, y - 2, 9 - i])], radius: [mm(3, P([x, y, 9])), 0.2], contours: 0, ends: true })); }
// more spines: one on the carpus, one at the arm's end
spines.push(D.sausage({ spine: [P([902, 548, 30]), P([924, 544, 30])], radius: [mm(6, P([902, 548, 30])), 0.3], contours: 0 }));
spines.push(D.sausage({ spine: [P([862, 552, 28]), P([872, 574, 24])], radius: [mm(5, P([862, 552, 28])), 0.3], contours: 0 }));
// the shell's front edge, where the arm goes under it
// (the shell edge I drew here as a big oval isn't in the photo: removed)
const shellEdge0 = (() => { const c = P([600, 405, 36]); return D.ellipsoid({ at: c, axes: [mul(norm(sub(P([900, 470, 36]), P([490, 430, 36]))), mm(260, c)), [0, mm(16, c), 0], mul(norm(sub(P([600, 470, 36]), P([600, 300, 36]))), mm(70, c))], contours: 0 }); })();

// Each segment its own mass, the masses within it blended, the joints between segments kept
// (blending the whole claw into one surface lost the segments: the painter, "you also lost
// the segments ;P"). Each segment runs a little into the next, so the joint is an overlap
// with a meeting line where one tucks into the next.
const seg = (parts, along, loops) => D.mass({ parts, blend: 4, cell: 0.6, along: along.map(P), loops, crease: 55 });
const armM = seg([arm, knuckle], [[750, 479, 28], [800, 490, 30], [880, 518, 30]], 3);
const carpM = seg([carpus], [[878, 524, 30], [886, 566, 28], [872, 612, 24]], 2);
// (no separate palm bulge: it covered the palm's ridge, and the palm's own section already swells)
const propM = seg([palm, wrist, hinge], [[852, 616, 22], [770, 630, 18], [705, 641, 15], [600, 666, 8]], 5);

window.__paintDone = (async () => {
  h.setPaper('hotPress', 5); h.setTone('white'); S.clear();
  const toView = ([x, y]) => [(x - X0) * k, (y - Y0) * k];
  log('gesture: the whole claw as one hook, then where it turns');
  await D.pencil([D.gesture([[700, 476], [800, 492], [884, 532], [882, 600], [800, 624], [700, 641], [600, 655], [530, 658]].map(toView))], { weight: { gesture: 0.2 } });
  log('segments with their planes, joints with rims and collars, toothed fingers, spines, the arm under the shell');
  // (teeth left out: from above, the cutting edges face each other and don't show; drawn, they were scratches)
  // only the margin's edge where it crosses the shoulder is drawn (drawn whole, it was an oval)
  front.clip = toView([640, 436]).concat(toView([770, 470]));
  const forms = [front, ischium, armM, carpM, propM, dactyl, wristCollar, elbowCollar, ...spines];
  const meets = [D.meet(armM, carpM), D.meet(propM, carpM), D.meet(propM, dactyl), D.meet(carpM, wristCollar), D.meet(propM, wristCollar), D.meet(armM, elbowCollar), D.meet(carpM, elbowCollar),
    ...spines.slice(0, 3).map(sp => D.meet(armM, sp)), D.meet(carpM, spines[3]), D.meet(armM, spines[4]), D.meet(armM, ischium)];
  await D.pencil(D.lines([...forms, ...meets], view));
  await S.look('claw');
})();
