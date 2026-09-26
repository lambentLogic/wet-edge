// Winter stream, second pass with the minds (after the binding fix).
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const line = (x0, y0, x1, y1, bend = 0, n = 10, p0 = 1, p1 = 0.08) =>
  Array.from({ length: n + 1 }, (_, k) => { const t = k / n; return [x0 + (x1 - x0) * t + bend * Math.sin(t * Math.PI), y0 + (y1 - y0) * t, p0 + (p1 - p0) * t]; });

window.__paintDone = (async () => {
  // Where the stream is: the heavy deposit below the trees.
  const a = await S.read(), W = 1024, banks = [];
  for (let x = 0; x < 1024; x += 16) {
    let top = -1, bottom = -1;
    for (let y = 360; y < 768; y++) {
      if (a[(y * W + x) * 4 + 2] > 0.05) { if (top < 0) top = y; if (y - top < 170) bottom = y; }
    }
    if (top > 0) banks.push([x, top, bottom]);
  }
  log(`stream found in ${banks.length} columns`);

  log('sky: one even glaze with the mop, soft at the horizon');
  h.setBrushPreset('mop'); h.setMode(0);
  h.setBrush([['Phthalo Blue (GS)', 3], ['French Ultramarine', 1]]); V.brushPigment = 0.04;
  const sky = [[-10, -10], [1034, -10], [1034, 250], [-10, 250]];
  await M.fill(sky, { grade: [1.3, 0.15], log });
  log(`sky dry after ${(await M.waitDry(sky)).toFixed(1)}s`);

  log('cast shadows: pale, from each tree toward the lower right');
  h.setBrushPreset('round'); V.brushRadius = 7;
  h.setBrush([['French Ultramarine', 2], ['Quinacridone Rose', 1]]); V.brushPigment = 0.2;
  for (const [x, y, len] of [[110, 472, 150], [174, 457, 160], [235, 442, 170], [907, 373, 120], [961, 368, 130]]) {
    await M.mark(line(x + 2, y + 2, x + len, y + len * 0.3, 6, 10, 0.9, 0.35), { target: 0.01, maxTries: 2, log });
  }
  log('foreground shadow: a pale veil, top edge softened');
  h.setBrushPreset('mop'); V.brushPigment = 0.06;
  const fg = [[-10, 640], [250, 628], [500, 612], [760, 630], [1034, 648], [1034, 778], [-10, 778]];
  await M.fill(fg, { grade: [0.05, 1.2], log });
  log(`shadows dry after ${(await M.waitDry([[110, 500], [300, 720], [800, 720]])).toFixed(1)}s`);

  log('trees: darker trunks, a few asymmetric branches');
  h.setBrushPreset('rigger'); h.setMode(0);
  h.setBrush([['Perylene Green', 1], ['Mars Black', 2], ['Raw Umber', 1]]); V.brushPigment = 0.6;
  for (const [x, y, ht, lean] of [[110, 472, 215, -4], [174, 457, 185, 3], [235, 442, 160, -2], [907, 373, 115, 2], [961, 368, 140, -3]]) {
    V.brushRadius = 5;
    await M.mark(line(x, y, x + lean, y - ht, lean, 12, 1, 0.12), { target: 0.05, maxTries: 3, framesPerSeg: 3, log });
    V.brushRadius = 2.6;
    const nb = 2 + Math.floor(rnd() * 2);
    for (let b = 0; b < nb; b++) {
      const t = 0.3 + 0.55 * (b + 0.3 + rnd() * 0.5) / nb, bx = x + lean * t, by = y - ht * t;
      const dir = rnd() < 0.5 ? -1 : 1, len = (1 - t) * ht * (0.4 + 0.4 * rnd()) + 14;
      const up = 0.3 + 0.5 * rnd();
      const pts = Array.from({ length: 6 }, (_, k) => { const s = k / 5; return [bx + dir * len * s, by - len * up * s * (0.4 + 0.6 * s), 0.8 - 0.72 * s]; });
      await M.mark(pts, { target: 0.02, maxTries: 2 });
    }
  }

  log('reeds: clumps of thin blades on both banks');
  h.setBrush([['Raw Umber', 2], ['Transparent Yellow Oxide', 1], ['Perylene Green', 1]]); V.brushPigment = 0.45;
  let blades = 0, redone = 0;
  for (let c = 0; c < 26; c++) {
    const [bx, top, bottom] = banks[Math.floor(rnd() * banks.length)];
    const onTop = rnd() < 0.6, x0 = bx + (rnd() - 0.5) * 14, y0 = onTop ? top + 3 : bottom + 2;
    const scale = 0.6 + 0.8 * (y0 / 768);          // nearer is bigger
    for (let k = 0, n = 2 + Math.floor(rnd() * 3); k < n; k++) {
      V.brushRadius = 1.6 + 1.2 * scale;
      const len = (22 + rnd() * 34) * scale, lean = (rnd() - 0.45) * len * 0.5;
      const r = await M.mark(line(x0 + (rnd() - 0.5) * 6, y0, x0 + lean, y0 - len, lean * 0.3, 6, 1, 0.05), { target: 0.015, maxTries: 2 });
      blades++; if (r.attempts > 1) redone++;
    }
  }
  log(`reeds: ${blades} blades, ${redone} went over again`);
  log(`details dry after ${(await M.waitDry([[110, 400], [500, 450], [900, 380]])).toFixed(1)}s`);
  log('done');
})();
'started'
