const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
const line = (x0, y0, x1, y1, n = 8, p = 1) => Array.from({ length: n + 1 }, (_, k) => { const t = k / n; return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, p]; });
window.__paintDone = (async () => {
  h.setPaper('coldPress', 1); h.setTone('natural'); S.clear(); h.setMode(1);
  V.brushPickup = +(window.__p ?? 0.4);
  h.setBrushPreset('mop'); await M.fill([[100, 150], [900, 150], [900, 600], [100, 600]]);   // clear water
  h.setMode(0); h.setBrushPreset('round'); h.setBrush('Pyrrole Rubine'); V.brushPigment = 0.9;
  await S.path(line(100, 300, 900, 300, 12), 2);
  h.setMode(1); V.brushRadius = 12;
  for (const [x, n] of [[250, 8], [450, 16], [650, 32]]) await S.path(line(x, 240, x, 560, n), 2);   // fast, medium, slow
  S.setDrying(true); await new Promise(r => setTimeout(r, 9000)); S.setDrying(false);
})();
