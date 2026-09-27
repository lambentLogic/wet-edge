const S = window.__sim, h = S.headless, V = S.values;
window.__paintDone = (async () => {
  h.setPaper('coldPress', 1); h.setTone('natural'); S.clear();
  h.setBrushPreset('flat'); h.setMode(4);
  await S.path([[150, 380, 1], [450, 380, 1]], 20);           // a sweep
  await S.path(Array.from({ length: 30 }, () => [750, 380, 1]), 1);  // held in one place
  await new Promise(r => setTimeout(r, 150));
})();
