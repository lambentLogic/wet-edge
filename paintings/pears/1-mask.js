// Stage 1: masking fluid on each pear's highlight (upper left, where the
// window light falls).
window.__paintDone = (async () => {
  h.setPaper('coldPress', 1); h.setTone('natural'); S.clear();
  h.setBrushPreset('round'); h.setMode(5);
  for (const p of PEARS) {
    const hx = p.x - p.r * 0.35, hy = p.y - p.r * 0.35;
    V.brushRadius = p.r * 0.1;
    await S.path(pts(s => [hx + Math.cos(2.2 + s * 1.6) * p.r * 0.22, hy + Math.sin(2.2 + s * 1.6) * p.r * 0.3, 1 - 0.6 * s], 8), 2);
    V.brushRadius = p.r * 0.05;
    await S.path([[hx + p.r * 0.05, hy + p.r * 0.1, 1], [hx + p.r * 0.05, hy + p.r * 0.1, 1]], 8);
  }
  h.setMode(0);
  await S.look('mask');
})();
