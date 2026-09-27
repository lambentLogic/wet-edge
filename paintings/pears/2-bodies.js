// Stage 2: each pear painted in its base yellow (the outline cut with the
// tip first, then filled), then green and a rose blush dropped into the
// wet yellow, well inside the edges.
window.__paintDone = (async () => {
  for (const p of PEARS) {
    const out = pearOutline(p);
    h.setBrushPreset('round'); h.setMode(0);
    h.setBrush([['Bismuth Vanadate Yellow', 2], ['Isoindolinone Yellow', 1]]); V.brushPigment = 0.35;
    V.brushRadius = 5;
    await S.path([...out, out[0]].map(([x, y]) => [x, y, 0.9]), 1);
    V.brushRadius = 12;
    await M.fill(out, { spacing: 1.0 });
    const at = (u, v) => { const c = Math.cos(p.tilt), s = Math.sin(p.tilt), x = u * p.r, y = v * p.r; return [p.x + x * c - y * s, p.y + x * s + y * c]; };
    const drop = async (mix, pig, rad, path) => { h.setBrush(mix); V.brushPigment = pig; V.brushRadius = rad; await S.path(path.map(([u, v, pr]) => [...at(u, v), pr]), 2); };
    await drop('Isoindolinone Yellow', 0.5, 16, [[-0.35, 0.15, 1], [0.05, 0.45, 1], [0.35, 0.25, 0.9]]);
    await drop([['Phthalo Green', 1], ['Isoindolinone Yellow', 2]], 0.45, 14, [[0.5, -0.9, 0.7], [0.62, -0.2, 1], [0.55, 0.45, 1], [0.15, 0.7, 0.8]]);
    await drop('Quinacridone Rose', 0.35, 12, [[-0.5, -0.15, 0.7], [-0.45, 0.25, 0.9]]);
  }
  await S.look('wet');
  log(`dry after ${(await M.waitDry(PEARS.map(p => [p.x, p.y]))).toFixed(1)}s`);
  await S.look('dry');
})();
