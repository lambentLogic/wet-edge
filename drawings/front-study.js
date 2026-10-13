// Drawing practice 8 (Claude): the front of the beach crab, from a crop (canvas x 400-720,
// y 360-600), pencil only. The front was what I'd simplified away (the painter's first
// critique). Identified before building, with checks that don't route through the painter:
// my own reading, a fresh agent's reading with no hypothesis, and the FDA specimen
// (.local/refs/blue-crab/fda-254-1-dorsal.jpg, straight down) as a second view.
//   - the shell's speckled top comes down to y ~430-450; its front edge is a ragged cream rim
//     from about (416,420) to (705,452), the shell turning under there (both readings)
//   - the eyes: on the specimen, dark stalked knobs in notches at the shell's two front
//     corners, where the side tooth rows begin, ~0.44 of the spine-to-spine width apart. So
//     here at the corners, about (474,428) and (702,452). (The fresh agent's candidates were
//     88 apart, a third of that; one of my two guesses was off too. Their look is unconfirmed.)
//   - under the rim, a block of underside parts (x 480-700, y 440-500), overlapped by it: the
//     two flat plates that cover the mouth, side by side (from anatomy: neither photo resolves
//     them; the specimen's straight-down view hides them)
//   - the claw arms come out from under the shell's sides; the dark sand below is her shadow
const S = window.__sim, h = S.headless, D = window.__draw, { add, sub, mul, norm, cross } = D.math;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };

const fit = { eye: [29.5, 333.3, 28.9], target: [-19.5, 35, 26], focal: 1021, up: [Math.sin(0.161), Math.cos(0.161), 0] };
const cam = D.camera(fit);
const X0 = 400, Y0 = 360, k = 1024 / 320;
const view = D.camera({ ...fit, focal: fit.focal * k, center: [(512 - X0) * k, (384 - Y0) * k] });
const toView = ([x, y]) => [(x - X0) * k, (y - Y0) * k];
const P = ([x, y, hh]) => cam.unproject(x, y, hh);
const mm = (cells, p) => cells * cam.project(p)[2] / cam.focal;

// the shell's front: a plate whose upper face is the speckled top, its front edge on the rim,
// thick enough to turn under; built along the rim, running back into the shell
const rim = [[404, 414], [440, 424], [474, 430], [520, 442], [580, 448], [640, 450], [702, 454], [740, 446]];
const shellFront = D.prism({ spine: rim.map(([x, y]) => P([x, y - 34, 46])), width: rim.map(([x, y]) => mm(70, P([x, y, 46]))), thick: rim.map(([x, y]) => mm(16, P([x, y, 46]))),
  section: [[1, -0.2], [0.6, 1], [-1, 1], [-1, -1], [0.6, -1]], rings: 0 });
// the front teeth along the rim: small, low, blunt (the specimen's), pointing forward
const teeth = [[488, 436], [512, 441], [600, 450], [626, 451], [430, 422], [452, 427], [722, 451]].map(([x, y]) => D.sausage({ spine: [P([x, y - 4, 44]), P([x, y + 6, 42])], radius: [mm(5, P([x, y, 44])), 0.5], contours: 0 }));
// the eyes: in notches at the two front corners, short stalks, dark round tips
const eyes = [[474, 430], [702, 454]].flatMap(([x, y]) => { const a = P([x, y - 6, 44]), b = P([x, y + 8, 46]); return [D.sausage({ spine: [a, b], radius: [mm(5, a), mm(4.5, b)], contours: 0 }), D.ellipsoid({ at: b, radii: [mm(8, b), mm(7, b), mm(8, b)], contours: 1, around: 1 })]; });
// the mouth-cover plates under the rim, side by side, overlapped by it
const plate = (c, w, hgt) => { const p = P(c); return D.prism({ spine: [P([c[0], c[1] - hgt / 2, 34]), P([c[0], c[1] + hgt / 2, 30])], width: [mm(w, p), mm(w * 0.85, p)], thick: [mm(8, p), mm(8, p)], section: [[1, 0], [0.7, 1], [-0.7, 1], [-1, 0], [-0.7, -1], [0.7, -1]], rings: 1 }); };
const plates = [plate([548, 470, 0], 52, 44), plate([606, 472, 0], 52, 44)];
// the claw arms' roots at the sides, coming out from under the shell (context, clipped)
const armL = D.prism({ spine: [P([470, 418, 26]), P([380, 392, 30])], width: [mm(30, P([470, 418, 26])), mm(36, P([380, 392, 30]))], thick: [mm(24, P([470, 418, 26])), mm(28, P([380, 392, 30]))], rings: 0 });

window.__paintDone = (async () => {
  h.setPaper('hotPress', 5); h.setTone('white'); S.clear();
  log('gesture: the rim\'s line, and where the eyes and plates sit on it');
  await D.pencil([D.gesture(rim.map(toView)), D.gesture([[474, 430], [548, 470], [606, 472], [702, 454]].map(toView))], { weight: { gesture: 0.18 } });
  log('construction: the shell turning under at its rim, teeth, eyes in their corners, the mouth plates beneath, an arm root');
  const forms = [shellFront, ...teeth, ...eyes, ...plates, armL];
  const meets = [...teeth.map(t => D.meet(shellFront, t)), D.meet(shellFront, eyes[0]), D.meet(shellFront, eyes[2])];
  await D.pencil(D.lines([...forms, ...meets], view));
  await S.look('front');
})();
