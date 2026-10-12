// Drawing practice 2 (Claude): organic forms with contour lines, after
// drawabox's lesson 2. Sausages bending through space: the silhouette from
// the eye, and contour rings whose shape tells which way each part turns
// (a ring seen nearly edge-on runs across the view; nearly face-on, it's
// toward or away from us). Overlapping forms hide each other.
const S = window.__sim, h = S.headless, D = window.__draw;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
window.__paintDone = (async () => {
  h.setPaper('hotPress', 5); h.setTone('white'); S.clear();
  const cam = D.camera({ eye: [0, 200, 1300], target: [0, 0, 0], focal: 1000 });
  const forms = [
    // lying across the view, gently bowed: rings narrow, nearly edge-on
    D.sausage({ spine: [[-460, 260, 0], [-300, 300, 40], [-140, 250, 0]], radius: [36, 44, 30], contours: 6 }),
    // coming toward us: rings open up as it nears
    D.sausage({ spine: [[60, 300, -300], [140, 260, 0], [200, 200, 260]], radius: [26, 40, 52], contours: 6 }),
    // an S through depth
    D.sausage({ spine: [[300, 280, 0], [380, 200, 200], [460, 120, 0], [420, 40, -200]], radius: [30, 36, 36, 26], contours: 8 }),
    // swollen in the middle, tapering both ends, turned down
    D.sausage({ spine: [[-420, 40, -100], [-320, -40, 80], [-200, -140, 0]], radius: [16, 58, 14], contours: 6 }),
    // two forms overlapping: a near one crossing in front of a far one
    D.sausage({ spine: [[-80, -40, -200], [60, -80, -200], [200, -60, -200]], radius: 34, contours: 5 }),
    D.sausage({ spine: [[20, 40, 150], [80, -100, 120], [120, -240, 80]], radius: [28, 32, 24], contours: 5 }),
    // an egg and a turned ellipsoid, for comparison
    D.ellipsoid({ at: [330, -160, 0], radii: [110, 70, 60], turn: [20, 35, 15], contours: 4, around: 0 }),
  ];
  await D.pencil(D.lines(forms, cam));
  log('done');
})();
