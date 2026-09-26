const S = window.__sim, h = S.headless, V = S.values;
window.__paintDone = (async () => {
  h.begin(); h.setPaper('coldPress', 1); h.setTone('natural'); S.clear(); h.setBrushPreset('round'); V.brushCapacity = 0; V.brushRadius = 16; h.setMode(0);
  const pairs = [
    ['French Ultramarine', 'Bismuth Vanadate Yellow'], ['Phthalo Blue (GS)', 'Isoindolinone Yellow'], ['Phthalo Blue (GS)', 'Pyrrole Scarlet'],
    ['French Ultramarine', 'Quinacridone Rose'], ['Phthalo Green', 'Quinacridone Rose'], ['Phthalo Turquoise', 'Transparent Yellow Oxide'],
    ['French Ultramarine', 'Transparent Red Oxide'], ['Dioxazine Violet', 'Azo Condensation Yellow'],
  ];
  for (let r = 0; r < pairs.length; r++) {
    const [a, b] = pairs[r], y = 60 + r * 88;
    const cols = [[[a, 1]], [[a, 3], [b, 1]], [[a, 1], [b, 1]], [[a, 1], [b, 3]], [[b, 1]]];
    for (let c = 0; c < cols.length; c++) {
      h.setBrush(cols[c]);
      for (const [p, dy] of [[0.9, 0], [0.9, 22], [0.25, 44]]) { V.brushPigment = p; h.lift(); await h.paint(90 + c * 180, y + dy, 230 + c * 180, y + dy, 10); }
    }
  }
  await h.wait(20); await h.wait(20, { dry: true }); await h.wait(2);
  h.end();
  V.spectral = window.__spectral ?? 0;
})();
