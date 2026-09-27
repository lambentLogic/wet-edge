// Stage 3: the wall (cool, darker at the top) and the table (warm) washed
// around the pears; then, dry, the cast shadows to the lower right, and a
// shadow under each pear where it sits.
window.__paintDone = (async () => {
  h.setBrushPreset('mop'); h.setMode(0);
  await M.washAround(null, {
    margin: 7, log,
    brushAt: (x, y) => (y < TABLE ? [['French Ultramarine', 1], ['Raw Umber', 1], ['Perylene Violet', 0.5]] : [['Transparent Yellow Oxide', 1], ['Raw Umber', 1]]),
    pigmentAt: (x, y) => (y < TABLE ? 0.1 + 0.18 * (1 - y / TABLE) : 0.14),
  });
  await S.look('ground-wet');
  // Cast shadows dropped into the table wash while it's damp, so they're
  // soft; light, with a darker contact line where each pear sits.
  await M.waitDamp([[500, 700], [200, 650]], { below: 0.1 });
  h.setBrushPreset('round');
  h.setBrush([['French Ultramarine', 2], ['Quinacridone Rose', 1], ['Raw Umber', 1]]);
  for (const p of PEARS) {
    const bx = p.x + p.r * 0.1, by = p.y + p.r * 1.0;
    V.brushRadius = p.r * 0.3; V.brushPigment = 0.2;
    await S.path(pts(s => [bx + s * p.r * 1.5, by + s * p.r * 0.2, 1 - 0.6 * s], 8), 2);
    V.brushRadius = p.r * 0.1; V.brushPigment = 0.35;
    await S.path(pts(s => [p.x - p.r * 0.5 + s * p.r * 1.1, p.y + p.r * 1.02, 0.6 + 0.3 * Math.sin(s * Math.PI)], 6), 2);
  }
  log(`shadows dry after ${(await M.waitDry(PEARS.map(p => [p.x + p.r, p.y + p.r]))).toFixed(1)}s`);
  await S.look('shadows');
})();
