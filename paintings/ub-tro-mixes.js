const S = window.__sim, h = S.headless, V = S.values;
window.__paintDone = (async () => {
  h.begin(); h.setPaper('coldPress', 1); h.setTone('natural'); S.clear(); h.setBrushPreset('round'); V.brushCapacity = 0; V.brushRadius = 16; h.setMode(0);
  const A = 'French Ultramarine', B = 'Transparent Red Oxide';
  const cols = [[[A, 1]], [[A, 3], [B, 1]], [[A, 2], [B, 1]], [[A, 1], [B, 1]], [[A, 1], [B, 2]], [[A, 1], [B, 3]], [[B, 1]]];
  for (let c = 0; c < cols.length; c++) {
    h.setBrush(cols[c]);
    for (const [p, y] of [[1.2, 150], [1.2, 172], [0.5, 300], [0.5, 322], [0.2, 450], [0.2, 472]]) { V.brushPigment = p; h.lift(); await h.paint(70 + c * 130, y, 170 + c * 130, y, 10); }
  }
  await h.wait(20); await h.wait(20, { dry: true }); await h.wait(2);
  h.end(); V.spectral = window.__spectral ?? 0;
})();
