// Streak swatches: six ways to put the Gala apple's streaks into its red
// (notes/journal.md, the fourth apple). Each panel is the apple body's red
// laid into satin-dampened paper, then streaks by one method:
//   A  at the very end of the shine (surface water under 0.03), a thirsty brush (Wetness 0.1)
//   B  at satin, a nearly dry brush of thick paint (Wetness 0.05)
//   C  at moist (Wetness 0.5)
//   D  pale streaks lifted at damp (Lift tool)
//   E  dry-brushed over the dried red (light, fast, low wetness)
//   F  glazed on the dried red, one side softened with a damp brush
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
const pts = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
const red = [['Pyrrole Rubine', 3], ['Pyrrole Scarlet', 1], ['Raw Umber', 1]];
const dusk = [['Pyrrole Rubine', 2], ['Perylene Maroon', 2], ['Raw Umber', 1]];
const panel = (col, row) => { const x0 = 30 + col * 335, y0 = 40 + row * 370; return { x0, y0, x1: x0 + 300, y1: y0 + 320, rect: [[x0, y0], [x0 + 300, y0], [x0 + 300, y0 + 320], [x0, y0 + 320]], mid: [[x0 + 80, y0 + 100], [x0 + 150, y0 + 160], [x0 + 220, y0 + 220]] }; };
const P = { A: panel(0, 0), B: panel(1, 0), C: panel(2, 0), D: panel(0, 1), E: panel(1, 1), F: panel(2, 1) };
// Streaks down a panel: slightly curved, from near its top.
const streaks = (p, n, off = 0) => Array.from({ length: n }, (_, k) => { const x = p.x0 + 40 + (k + off) * (220 / (n - 1 || 1)); return pts(t => [x + 18 * Math.sin(t * 2.5 + k), p.y0 + 30 + 260 * t, 0.9 - 0.5 * t], 10); });

async function base(p) {
  await S.dampen(M.maskOf(p.rect), 1, 0.05);
  S.tool('paint'); h.setBrushPreset('mop'); V.brushRadius = 30; V.dipLoad = 0.5; V.brushPigment = 0.5; h.setBrush(red);
  for (let y = p.y0 + 25; y <= p.y1 - 20; y += 40) { h.lift(); await S.path([[p.x0 + 25, y, 1], [p.x1 - 25, y, 1]], 4); }
  V.dipLoad = 1;
}
async function darkStreaks(p, { load = 0.5, pig = 0.45, r = 8 } = {}) {
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = load; V.brushPigment = pig; V.brushRadius = r; h.setBrush(dusk);
  for (const s of streaks(p, 5)) { h.lift(); await S.path(s, 2); }
  V.dipLoad = 1;
}
async function untilWater(points, below) {
  h.begin(); let t = 0;
  try { for (;;) { let w = 0; for (const [x, y] of points) w = Math.max(w, (await S.sense(x, y, 8)).water); if (w < below || t > 300) return t; await h.wait(1); t++; } } finally { h.end(); }
}

window.__paintDone = (async () => {
  h.setPaper('coldPress', 5); h.setTone('natural'); S.clear();

  log('D: base, then pale streaks lifted at damp');
  await base(P.D);
  log(`D skipped ${await S.skipTo('damp', { points: P.D.mid })}s to damp`);
  S.tool('lift'); h.setBrushPreset('round'); V.dipLoad = 0.2; V.brushRadius = 6;
  for (const s of streaks(P.D, 4, 0.5)) for (let pass = 0; pass < 2; pass++) { h.lift(); await S.path(s, 3); }
  V.dipLoad = 1;

  log('E, F: bases, dried');
  await base(P.E); await base(P.F);
  log(`skipped ${await S.skipTo('dry')}s to dry`);

  log('E: dry-brush over the dried red: low wetness, light touch, fast');
  S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.15; V.brushPigment = 0.6; V.brushRadius = 10; h.setBrush(dusk);
  for (const s of streaks(P.E, 5)) { h.lift(); await S.path(s.map(([x, y]) => [x, y, 0.3]), 1); }
  V.dipLoad = 1;

  log('F: glazed streaks on the dried red, each softened on one side with a damp brush');
  for (const s of streaks(P.F, 5)) {
    S.tool('paint'); h.setBrushPreset('round'); V.dipLoad = 0.5; V.brushPigment = 0.45; V.brushRadius = 7; h.setBrush(dusk);
    h.lift(); await S.path(s, 2);
    S.tool('water'); V.dipLoad = 0.35; V.brushRadius = 7;
    h.lift(); await S.path(s.map(([x, y, p]) => [x + 9, y, p]), 2);
  }
  V.dipLoad = 1;

  log('B: base, streaks at satin');
  await base(P.B);
  log(`B skipped ${await S.skipTo('satin', { points: P.B.mid })}s to satin`);
  await darkStreaks(P.B, { load: 0.05, pig: 0.35 });

  log('A: base, streaks at the very end of the shine');
  await base(P.A);
  log(`A waited ${await untilWater(P.A.mid, 0.03)}s for the shine to thin`);
  await darkStreaks(P.A, { load: 0.1, pig: 0.35 });

  log('C: base, streaks at moist');
  await base(P.C);
  log(`C skipped ${await S.skipTo('moist', { points: P.C.mid })}s to moist`);
  await darkStreaks(P.C);

  log(`skipped ${await S.skipTo('dry')}s to dry`);
  await S.look('swatches');
  log('done');
})();
