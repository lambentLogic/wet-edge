// Stage 4: peel the mask; a thin cool glaze down each pear's shadow side
// for volume; stems with the rigger.
window.__paintDone = (async () => {
  S.unmask(); await new Promise(r => setTimeout(r, 300));
  for (const p of PEARS) {
    const at = (u, v) => { const c = Math.cos(p.tilt), s = Math.sin(p.tilt), x = u * p.r, y = v * p.r; return [p.x + x * c - y * s, p.y + x * s + y * c]; };
    // Shadow side: a broad, pale glaze inside the right edge, from shoulder
    // to base, its inner edge softened at once with a clean damp brush so
    // it turns rather than stripes.
    const side = s0 => pts(s => { const a = -1.1 + s * 2.0; return [...at(s0 * Math.cos(a), 0.88 * Math.sin(a) + (a < 0 ? 0.15 * a : 0)), 0.6 + 0.4 * Math.sin(s * Math.PI)]; }, 12);
    h.setBrushPreset('mop'); V.brushRadius = p.r * 0.3;
    h.setBrush([['Phthalo Green', 1], ['Perylene Violet', 1], ['Isoindolinone Yellow', 2]]); V.brushPigment = 0.1;
    await S.path(side(0.72), 2);
    h.setMode(1); V.brushRadius = p.r * 0.22;
    await S.path(side(0.4), 2);
    h.setMode(0);
    // Stem: from the top, a short curve, tapering.
    h.setBrushPreset('rigger'); V.brushRadius = 4;
    h.setBrush([['Raw Umber', 2], ['Perylene Maroon', 1]]); V.brushPigment = 0.8;
    const [tx, ty] = at(0, -1.7);
    await S.path(pts(s => [tx + s * p.r * 0.12 + Math.sin(s * 2) * 4, ty - s * p.r * 0.45, 1 - 0.8 * s], 6), 2);
  }
  log(`dry after ${(await M.waitDry(PEARS.map(p => [p.x, p.y]))).toFixed(1)}s`);
  await S.look('finished');
})();
