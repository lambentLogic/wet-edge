const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
const line = (x0, y0, x1, y1, n = 8, p = 1) => Array.from({ length: n + 1 }, (_, k) => { const t = k / n; return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, p]; });
window.__paintDone = (async () => {
  h.setPaper('coldPress', 1); h.setTone('natural'); S.clear();
  // A: mist on dry paper
  h.setBrushPreset('mop'); h.setMode(4); for (let y = 120; y <= 300; y += 40) await S.path(line(40, y, 320, y, 6), 2);
  // B: a wash, let it go damp, then mist it
  h.setMode(0); h.setBrush('French Ultramarine'); V.brushPigment = 0.5;
  await M.fill([[370, 100], [650, 100], [650, 320], [370, 320]]);
  await M.waitDamp([[510, 210]], { below: 0.06 });
  h.setMode(4); for (let y = 120; y <= 300; y += 40) await S.path(line(380, y, 640, y, 6), 2);
  // C: mist dry paper, then drop paint in
  h.setMode(4); for (let y = 120; y <= 300; y += 40) await S.path(line(700, y, 980, y, 6), 2);
  h.setMode(0); h.setBrush('Quinacridone Rose'); V.brushPigment = 0.6; h.setBrushPreset('round');
  for (let y = 150; y <= 280; y += 45) await S.path(line(720, y, 960, y, 8), 2);
  window.__snapWet = true;
  await new Promise(r => setTimeout(r, 400));
})();
