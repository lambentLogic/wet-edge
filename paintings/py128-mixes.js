const S = window.__sim, h = S.headless, V = S.values;
window.__paintDone = (async () => {
  h.begin(); h.setPaper('coldPress', 1); h.setTone('natural'); S.clear(); h.setBrushPreset('round'); V.brushCapacity = 0; V.brushRadius = 16; h.setMode(0);
  const Y = 'Azo Condensation Yellow';
  const partners = ['Phthalo Blue (GS)', 'Phthalo Green', 'French Ultramarine', 'Phthalo Turquoise', 'Quinacridone Rose', 'Pyrrole Rubine', 'Transparent Red Oxide', 'Benzimidazolone Blue'];
  for (let r = 0; r < partners.length; r++) {
    const cols = [[[partners[r], 1]], [[partners[r], 1], [Y, 1]], [[partners[r], 1], [Y, 3]], [[Y, 1]]];
    for (let c = 0; c < cols.length; c++) {
      h.setBrush(cols[c]);
      for (const [p, dy] of [[0.9, 0], [0.9, 22], [0.35, 44]]) { V.brushPigment = p; h.lift(); await h.paint(120 + c * 210, 60 + r * 88 + dy, 280 + c * 210, 60 + r * 88 + dy, 10); }
    }
  }
  await h.wait(20); await h.wait(20, { dry: true }); await h.wait(2);
  h.end(); V.spectral = window.__spectral ?? 0;
})();
