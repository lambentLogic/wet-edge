// Drawing practice 3 (Claude): form intersections, after drawabox's lesson 2.
// Forms pushed into each other, with the line where each meets the next drawn
// (D.meet): a sausage into an ellipsoid, as a leg into a body; two sausages
// joined at a joint; a sausage through a box; an egg sunk into a block.
const S = window.__sim, h = S.headless, D = window.__draw;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
window.__paintDone = (async () => {
  h.setPaper('hotPress', 5); h.setTone('white'); S.clear();
  const cam = D.camera({ eye: [120, 320, 1300], target: [0, 0, 0], focal: 1000 });
  // a body and a leg going into it
  const body = D.ellipsoid({ at: [-300, 160, 0], radii: [150, 70, 100], turn: [0, -20, 8], contours: 3, around: 0 });
  const leg1 = D.sausage({ spine: [[-260, 140, 60], [-150, 110, 160], [-60, 30, 220]], radius: [34, 28, 22], contours: 3 });
  // a jointed limb: two segments overlapping at the knee
  const seg1 = D.sausage({ spine: [[120, 280, 0], [230, 220, 60]], radius: [30, 26], contours: 2 });
  const seg2 = D.sausage({ spine: [[215, 230, 52], [260, 90, 120]], radius: [24, 18], contours: 3 });
  // a sausage through a box
  const block = D.box({ at: [280, -160, 0], size: [200, 120, 160], turn: [10, 30, 0] });
  const rod = D.sausage({ spine: [[120, -110, 80], [300, -150, 60], [470, -220, 40]], radius: 30, contours: 0 });
  // an egg sunk into a block
  const slab = D.box({ at: [-300, -180, 0], size: [260, 80, 200], turn: [0, -15, 0] });
  const egg = D.ellipsoid({ at: [-300, -130, 20], radii: [80, 60, 60], turn: [0, 0, 20], contours: 2, around: 0 });
  const forms = [body, leg1, seg1, seg2, block, rod, slab, egg];
  const meets = [D.meet(body, leg1), D.meet(seg1, seg2), D.meet(rod, block), D.meet(egg, slab)];
  await D.pencil(D.lines([...forms, ...meets], cam));
  log('done');
})();
