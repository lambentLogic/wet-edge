const S = window.__sim, h = S.headless, V = S.values;
const line = (x0, y0, x1, y1, n = 8, p0 = 1, p1 = 1) => Array.from({ length: n + 1 }, (_, k) => { const t = k / n; return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, p0 + (p1 - p0) * t]; });
window.__paintDone = (async () => {
  h.setPaper('coldPress', 1); h.setTone('natural'); S.clear(); h.setMode(0);
  h.setBrushPreset('round'); V.brushCapacity = 0; h.setBrush('French Ultramarine'); V.brushPigment = 0.5; V.brushRadius = 16;
  for (const [x0, y0, x1, y1] of [[80, 80, 380, 80], [380, 150, 80, 150]]) await S.path(line(x0, y0, x1, y1), 2);
  for (let k = 0; k < 4; k++) await S.path([[120 + k * 70, 230, 1], [120 + k * 70, 230, 1]], 6);
  for (let k = 0; k < 6; k++) await S.path(line(100 + k * 50, 340, 130 + k * 50, 280, 4, 1, 0.3), 2);
  h.setBrushPreset('flat'); V.brushCapacity = 0; h.setBrush('Quinacridone Rose'); V.brushPigment = 0.5;
  V.flatAngle = 0; await S.path(line(480, 80, 480, 260), 2);      // broadside, down
  V.flatAngle = 0; await S.path(line(560, 80, 900, 80), 2);       // along the edge: thin
  V.flatAngle = 45; await S.path(line(600, 160, 900, 260), 2);    // angled
  // hills with the flat: strokes down from a ridge
  h.setBrush([['Perylene Green', 2], ['Raw Umber', 1]]); V.flatAngle = 0;
  const ridge = x => 440 - 40 * Math.sin(x * 0.012) - 15 * Math.sin(x * 0.037);
  for (let x = 100; x < 900; x += 40) {
    const slope = (ridge(x + 5) - ridge(x - 5)) / 10;
    V.flatAngle = Math.atan(slope) * 180 / Math.PI;   // tilt the flat to follow the ridge
    await S.path(line(x, ridge(x) + 6, x, 600, 4), 2);
  }
  S.setDrying(true); await new Promise(r => setTimeout(r, 7000)); S.setDrying(false);
})();
