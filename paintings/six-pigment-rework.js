const S = window.__sim, h = S.headless, V = S.values;
const names = ['Bismuth Vanadate Yellow', 'Isoindolinone Yellow', 'Benzimidazolone Blue', 'Mars Black', 'Pyrrole Scarlet', 'Phthalo Turquoise'];
window.__paintDone = (async () => {
  h.begin(); h.setPaper('coldPress', 1); h.setTone('natural'); S.clear();
  h.setBrushPreset('mop'); h.setMode(0); V.brushCapacity = 0; V.brushPigment = 0.6;
  for (let r = 0; r < 2; r++) for (let k = 0; k < names.length; k++) {
    h.setBrush(names[k]); h.lift(); await h.paint(260 + k * 40, 200, 460 + k * 40, 560, 14);
    h.lift(); await h.paint(700 - k * 40, 200, 420 - k * 40, 560, 14);
  }
  await h.wait(5);
  h.setBrushPreset('water'); h.setMode(1); V.brushCapacity = 0;
  for (let r = 0; r < 4; r++) { for (let y = 240; y <= 520; y += 25) { h.lift(); await h.paint(300 + r * 15, y, 700 - r * 15, y + 10, 10); } await h.wait(4); }
  await h.wait(20); await h.wait(20, { dry: true }); await h.wait(2);
  const a = await S.read(); let dsum = 0; const d = [];
  for (let y = 150; y < 620; y++) for (let x = 200; x < 820; x++) { const v = a[(y * 1024 + x) * 4 + 2]; dsum += v; d.push(v); }
  let ident = 0; for (const n of names) { const p = await S.readPigment(n); for (let y = 150; y < 620; y++) for (let x = 200; x < 820; x++) ident += p[y * 1024 + x]; }
  d.sort((p, q) => p - q);
  console.log(`[paint] stain share ${((dsum - ident) / dsum * 100).toFixed(1)}%  median ${d[d.length >> 1].toFixed(3)} p99.9 ${d[Math.floor(d.length * 0.999)].toFixed(3)} max ${d[d.length - 1].toFixed(3)}`);
  h.end();
})();
