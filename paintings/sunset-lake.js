// Sunset over a lake: wet-in-wet sky, two ranges of hills, reflections,
// a lifted shimmer, trees and reeds. Run with tools/paint.mjs.
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const line = (x0, y0, x1, y1, bend = 0, n = 10, p0 = 1, p1 = 0.08) =>
  Array.from({ length: n + 1 }, (_, k) => { const t = k / n; return [x0 + (x1 - x0) * t + bend * Math.sin(t * Math.PI), y0 + (y1 - y0) * t, p0 + (p1 - p0) * t]; });
const HORIZON = 380;
// Ridge lines as polylines across the sheet.
const ridge = (base, amp, freq, phase) => Array.from({ length: 27 }, (_, k) => {
  const x = -10 + k * 40;
  return [x, base - amp * (0.55 + 0.45 * Math.sin(x * freq + phase)) - amp * 0.3 * Math.sin(x * freq * 2.7 + phase * 1.3)];
});

// Fill the land below a ridge line with strokes running down from the
// ridge, as a painter fills a hillside (horizontal rows leave the rounded
// ends of each row stacked into bumps near the peaks).
const ridgeY = (r, x) => {
  for (let k = 1; k < r.length; k++) if (x <= r[k][0]) { const [x0, y0] = r[k - 1], [x1, y1] = r[k]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return r[r.length - 1][1];
};
// With a flat brush, tilted to follow the ridge, so each stroke's square
// top lies along it (a round brush's round tops made scallops).
async function fillBelow(r, base, { dx = 22 } = {}) {
  for (let x = -10; x <= 1034; x += dx) {
    const top = ridgeY(r, x);
    V.flatAngle = Math.atan((ridgeY(r, x + 6) - ridgeY(r, x - 6)) / 12) * 180 / Math.PI;
    h.lift(); await S.path([[x, top + 2, 0.9], [x + (rnd() - 0.5) * 4, (top + base) / 2, 0.9], [x, base - 20, 0.9]], 2);
  }
  // Square off the slanted bottoms with one pass of the flat along the
  // base, turned so it lays a band with straight edges.
  V.flatAngle = 90;
  h.lift(); await S.path([[-40, base - 14, 0.9], [512, base - 14, 0.9], [1064, base - 14, 0.9]], 6);
}

window.__paintDone = (async () => {
  h.setPaper('coldPress', 1); h.setTone('natural'); S.clear();

  log('sky: wet the paper, then drop colour in while it shines');
  h.setBrushPreset('mop'); h.setMode(1); V.brushCapacity = 0;
  await M.fill([[-10, -10], [1034, -10], [1034, HORIZON], [-10, HORIZON]], { log });
  h.setMode(0);
  // Colour dropped in loose, overlapping, slightly tilted strokes so the
  // bands melt into each other; a warm glow low, near where the sun sets.
  const sky = async (names, pig, y0, y1, step, jitter) => {
    h.setBrush(names); V.brushPigment = pig;
    for (let y = y0; y >= y1; y -= step) {
      const dy = (rnd() - 0.5) * jitter;
      h.lift(); await S.path(line(-10, y + dy, 1034, y - dy, (rnd() - 0.5) * 30, 8, 0.9, 0.9), 2);
    }
  };
  await sky('Azo Condensation Yellow', 0.6, HORIZON - 20, HORIZON - 140, 24, 20);
  await sky([['Isoindolinone Yellow', 1], ['Quinacridone Rose', 1]], 0.45, HORIZON - 130, HORIZON - 200, 26, 30);
  await sky('Quinacridone Rose', 0.45, HORIZON - 190, 90, 28, 40);
  await sky([['French Ultramarine', 3], ['Quinacridone Rose', 1]], 0.7, 110, -10, 26, 30);
  // A few darker cloud streaks, dropped into the still-wet sky.
  h.setBrush([['French Ultramarine', 2], ['Quinacridone Rose', 2], ['Raw Umber', 1]]); V.brushPigment = 0.5; V.brushRadius = 20;
  for (let k = 0; k < 6; k++) {
    const y = 60 + rnd() * 200, x0 = rnd() * 700;
    h.lift(); await S.path(line(x0, y, x0 + 200 + rnd() * 250, y - 10 + rnd() * 20, (rnd() - 0.5) * 20, 6, 0.4, 0.9), 2);
  }
  log(`sky dry after ${(await M.waitDry([[-10, -10], [1034, -10], [1034, HORIZON], [-10, HORIZON]])).toFixed(1)}s`);

  log('far hills: a cool violet, pale');
  const far = ridge(HORIZON - 10, 70, 0.006, 1.2);
  h.setBrushPreset('mop'); h.setMode(0);
  h.setBrush([['French Ultramarine', 2], ['Quinacridone Rose', 1], ['Raw Umber', 0.5]]); V.brushPigment = 0.18;
  h.setBrushPreset('flat'); V.brushCapacity = 0;
  await fillBelow(far, HORIZON + 16, { dx: 26 });
  log(`far hills dry after ${(await M.waitDry([[200, HORIZON - 40], [800, HORIZON - 40]])).toFixed(1)}s`);

  log('near hills: perylene green and raw umber, darker, rising at the left');
  const near = ridge(HORIZON + 4, 55, 0.009, 4.0).map(([x, y]) => [x, y - Math.max(0, 300 - x) * 0.25]);
  h.setBrush([['Perylene Green', 2], ['Raw Umber', 1], ['French Ultramarine', 0.5]]); V.brushPigment = 0.35;
  await fillBelow(near, HORIZON + 16, { dx: 26 });
  h.setBrushPreset('round'); V.brushCapacity = 0; V.brushRadius = 14;
  // A little warmth dropped into the near hills while wet: the last light.
  h.setBrush([['Transparent Red Oxide', 1], ['Raw Umber', 1]]); V.brushPigment = 0.3;
  for (let k = 0; k < 7; k++) { const x = 60 + rnd() * 900, y = ridgeY(near, x) + 14; h.lift(); await S.path(line(x - 40, y, x + 40, y + 6, 0, 3, 0.6, 0.6), 2); }
  log(`near hills dry after ${(await M.waitDry([[150, HORIZON - 40], [700, HORIZON - 10]])).toFixed(1)}s`);

  log('lake: the sky mirrored in horizontal strokes, darker toward the viewer');
  h.setBrushPreset('mop'); h.setMode(1); V.brushCapacity = 0;
  const lake = [[-10, HORIZON + 2], [1034, HORIZON + 2], [1034, 695], [-10, 695]];
  await M.fill(lake, { log });
  h.setMode(0);
  h.setBrush('Azo Condensation Yellow'); V.brushPigment = 0.3;
  for (let y = HORIZON + 30; y <= HORIZON + 90; y += 26) { h.lift(); await S.path(line(-10, y, 1034, y, 0, 8, 0.8, 0.8), 2); }
  h.setBrush('Quinacridone Rose'); V.brushPigment = 0.22;
  for (let y = HORIZON + 110; y <= 560; y += 28) { h.lift(); await S.path(line(-10, y, 1034, y, 0, 8, 0.8, 0.8), 2); }
  h.setBrush([['French Ultramarine', 3], ['Quinacridone Rose', 1]]); V.brushPigment = 0.4;
  for (let y = 590; y <= 690; y += 28) { h.lift(); await S.path(line(-10, y, 1034, y, 0, 8, 0.9, 0.9), 2); }
  await M.waitDamp([[300, 420], [700, 440]], { below: 0.18 });
  log('reflections of the hills, dropped into the damp lake so they blur');
  h.setBrushPreset('round'); V.brushRadius = 12;
  h.setBrush([['Perylene Green', 2], ['Raw Umber', 1], ['French Ultramarine', 0.5]]); V.brushPigment = 0.8;
  for (let x = 10; x < 1024; x += 20) {
    const top = near.reduce((b, [px, py]) => (Math.abs(px - x) < Math.abs(b[0] - x) ? [px, py] : b))[1];
    const depth = (HORIZON + 6 - top) * 1.1;
    h.lift(); await S.path(line(x + (rnd() - 0.5) * 6, HORIZON + 10, x + (rnd() - 0.5) * 10, HORIZON + 10 + depth, 0, 4, 0.8, 0.3), 2);
  }
  log(`lake dry after ${(await M.waitDry(lake)).toFixed(1)}s`);

  log('shimmer: a few lifted horizontal lines across the reflections');
  h.setBrushPreset('round'); S.tool('lift'); V.brushRadius = 3;   // the clean brush, thirsty
  for (let k = 0; k < 9; k++) {
    const y = HORIZON + 20 + rnd() * 130, x0 = 80 + rnd() * 600;
    h.lift(); await S.path(line(x0, y, x0 + 90 + rnd() * 200, y + (rnd() - 0.5) * 3, 0, 4, 0.9, 0.9), 3);
  }
  h.setMode(0);

  log('trees on the near shore: dark, with the rigger');
  h.setBrushPreset('rigger'); h.setMode(0);
  h.setBrush([['Perylene Green', 2], ['Mars Black', 1]]); V.brushPigment = 0.7;
  for (const [x, ht] of [[70, 210], [110, 160], [150, 240], [880, 150], [930, 190]]) {
    const y = 700 + rnd() * 12;
    V.brushRadius = 4.5;
    await M.mark(line(x, y, x + (rnd() - 0.5) * 10, y - ht, (rnd() - 0.5) * 8, 10, 1, 0.1), { target: 0.04, maxTries: 2 });
    // A conifer's branches: many short strokes from the trunk, drooping
    // and flicking up at the tips, longer toward the bottom, uneven.
    V.brushRadius = 2.6;
    for (let t = 0.12; t < 0.97; t += 0.035 + rnd() * 0.02) {
      const cy = y - ht * t, len = (1 - t) * 44 + 6 + rnd() * 10;
      for (const side of [-1, 1]) {
        if (rnd() < 0.15) continue;
        const l = len * (0.7 + rnd() * 0.5);
        const pts = [[x, cy, 0.9], [x + side * l * 0.5, cy + l * 0.22, 0.7], [x + side * l, cy + l * 0.18 - 3, 0.2]];
        h.lift(); await S.path(pts, 2);
      }
    }
  }
  log('foreground bank and reeds');
  h.setBrushPreset('mop'); V.brushRadius = 30;
  h.setBrush([['Raw Umber', 2], ['Perylene Green', 1], ['Transparent Red Oxide', 0.5]]); V.brushPigment = 0.35;
  const bank = Array.from({ length: 27 }, (_, k) => { const x = -10 + k * 40; return [x, 692 - 10 * Math.sin(x * 0.011 + 1) - 6 * Math.sin(x * 0.031)]; });
  h.setBrushPreset('flat'); V.brushCapacity = 0;
  await fillBelow(bank, 790, { dx: 26 });
  h.setBrushPreset('round'); V.brushCapacity = 0; V.brushRadius = 14;
  // Variety dropped in wet: greener and redder patches.
  for (const [mix, n] of [[[['Perylene Green', 2], ['Transparent Yellow Oxide', 1]], 6], [[['Transparent Red Oxide', 1], ['Raw Umber', 1]], 5]]) {
    h.setBrush(mix); V.brushPigment = 0.4;
    for (let k = 0; k < n; k++) { const x = rnd() * 1024, y = 715 + rnd() * 50; h.lift(); await S.path(line(x - 50, y, x + 50, y + (rnd() - 0.5) * 10, 0, 3, 0.7, 0.7), 2); }
  }
  h.setBrushPreset('rigger'); V.brushRadius = 2.2;
  h.setBrush([['Raw Umber', 2], ['Transparent Yellow Oxide', 1], ['Perylene Green', 1]]); V.brushPigment = 0.5;
  for (let c = 0; c < 30; c++) {
    const x0 = rnd() * 1024, y0 = 700 + rnd() * 30;
    for (let k = 0, n = 2 + Math.floor(rnd() * 3); k < n; k++) {
      const len = 30 + rnd() * 50, lean = (rnd() - 0.4) * len * 0.5;
      await M.mark(line(x0 + (rnd() - 0.5) * 8, y0, x0 + lean, y0 - len, lean * 0.3, 6, 1, 0.05), { target: 0.015, maxTries: 2 });
    }
  }
  log(`all dry after ${(await M.waitDry([[100, 740], [500, 740], [900, 740]])).toFixed(1)}s`);
  log('done');
})();
