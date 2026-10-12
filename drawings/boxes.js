// Drawing practice 1 (Claude): boxes in perspective, after drawabox's box
// exercises. One camera, a scatter of boxes turned every which way; edges
// facing the eye firm, outline edges firmest, hidden edges faint (drawn
// through, as the exercise asks, to check the box is a box).
const S = window.__sim, h = S.headless, D = window.__draw;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
window.__paintDone = (async () => {
  h.setPaper('hotPress', 5); h.setTone('white'); S.clear();
  const cam = D.camera({ eye: [0, 260, 1400], target: [0, 0, 0], focal: 1100 });
  const forms = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const at = [-480 + c * 320 + (rnd() - 0.5) * 60, 230 - r * 230 + (rnd() - 0.5) * 40, (rnd() - 0.5) * 300];
    forms.push(D.box({ at, size: [80 + rnd() * 120, 60 + rnd() * 100, 80 + rnd() * 120], turn: [rnd() * 360, rnd() * 360, rnd() * 360] }));
  }
  log(`${forms.length} boxes`);
  // each box drawn on its own, so overlaps don't hide one box's hidden edges behind another
  for (const f of forms) await D.pencil(D.lines([f], cam, { hidden: true }));
  await S.look('boxes');
})();
