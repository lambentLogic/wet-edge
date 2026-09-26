const S = window.__sim, h = S.headless, V = S.values;
window.__paintDone = (async () => {
  h.begin(); h.setPaper('coldPress', 1); h.setTone('natural'); S.clear();
  h.setBrushPreset('mop'); h.setMode(0); V.brushCapacity = 0;
  for (const [name, y0] of [['Isoindolinone Yellow', 200], ['Transparent Red Oxide', 260]]) { h.setBrush(name); V.brushPigment = 0.4; for (let y = y0; y <= 560; y += 45) { h.lift(); await h.paint(260, y, 760, y, 12); } }
  h.setBrush([['Benzimidazolone Blue', 1], ['Phthalo Turquoise', 1]]); V.brushPigment = 1.0;
  for (let y = 300; y <= 480; y += 30) { h.lift(); await h.paint(380, y, 640, y, 10); }
  await h.wait(6);
  // Rework: water brush passes into the half-dry middle, several times.
  h.setBrushPreset('water'); h.setMode(1); V.brushCapacity = 0;
  for (let r = 0; r < 5; r++) {
    for (let y = 320 + r * 8; y <= 460 - r * 8; y += 22) { h.lift(); await h.paint(420 + r * 10, y, 600 - r * 10, y, 10); }
    await h.wait(5);
  }
  await h.wait(20); await h.wait(20, { dry: true }); await h.wait(2);
  const a = await S.read(); const d = []; for (let y = 180; y < 600; y++) for (let x = 240; x < 780; x++) d.push(a[(y * 1024 + x) * 4 + 2]);
  d.sort((p, q) => p - q);
  console.log(`[paint] dSum median ${d[d.length >> 1].toFixed(3)} p99 ${d[Math.floor(d.length * 0.99)].toFixed(3)} p99.9 ${d[Math.floor(d.length * 0.999)].toFixed(3)} max ${d[d.length - 1].toFixed(3)}`);
  const top = []; for (let y = 180; y < 600; y++) for (let x = 240; x < 780; x++) { const v = a[(y * 1024 + x) * 4 + 2]; if (v > 1.0) top.push([v, x, y]); }
  top.sort((p, q) => q[0] - p[0]);
  console.log(`[paint] cells over 1.0: ${top.length}; worst ${top.slice(0, 5).map(([v, x, y]) => `(${x},${y}) ${v.toFixed(2)}`).join(' ')}`);
  for (const [, x, y] of top.slice(0, 2)) { const c = await S.cell(x, y); console.log('[paint]  ' + x + ',' + y + ' A=' + c.A.map(v => v.toFixed(3)).join(',') + ' dep=' + c.dep.map(d => `${d.pig.split(' ')[0]}:${d.amt.toFixed(3)}@${d.stamp.toFixed(1)}`).join(' ')); }
  h.end();
})();
