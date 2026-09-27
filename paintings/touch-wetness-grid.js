const S = window.__sim, h = S.headless, V = S.values;
const line = (x0, y0, x1, y1, n, p) => Array.from({ length: n + 1 }, (_, k) => { const t = k / n; return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, p]; });
window.__paintDone = (async () => {
  h.setPaper('rough', 1); h.setTone('natural'); S.clear(); h.setMode(0); h.setBrushPreset('round'); h.setBrush('French Ultramarine'); V.brushPigment = 0.6;
  let y = 80;
  for (const wet of [1, 0.4, 0.15]) {
    V.dipLoad = wet;
    for (const p of [1, 0.35, 0.15]) { await S.path(line(60, y, 960, y + 10, 16, p), 2); y += 40; }
    y += 40;
  }
  S.setDrying(true); await new Promise(r => setTimeout(r, 6000)); S.setDrying(false);
})();
