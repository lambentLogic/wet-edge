const S = window.__sim, h = S.headless, V = S.values;
const line = (x0, y0, x1, y1, n = 8, p = 1) => Array.from({ length: n + 1 }, (_, k) => { const t = k / n; return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, p]; });
window.__paintDone = (async () => {
  h.setPaper('rough', 1); h.setTone('natural'); S.clear(); h.setMode(0);
  h.setBrushPreset('round'); h.setBrush('French Ultramarine'); V.brushPigment = 0.6;
  let y = 90;
  for (const wet of [1, 0.4, 0.15]) {
    V.dipLoad = wet;
    await S.path(line(80, y, 480, y, 12), 3);       // slow
    await S.path(line(560, y, 960, y, 3), 1);       // fast
    y += 110;
  }
  V.dipLoad = 1;
  await S.path(line(80, y, 480, y, 12, 1), 3);       // full pressure
  await S.path(line(560, y, 960, y, 12, 0.25), 3);   // light pressure: thinner
  y += 110; await S.path(line(560, y, 960, y, 3, 0.25), 1);   // light and fast, full brush
  S.setDrying(true); await new Promise(r => setTimeout(r, 6000)); S.setDrying(false);
})();
