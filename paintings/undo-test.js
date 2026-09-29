const S = window.__sim, h = S.headless, V = S.values;
const line = (x0, y0, x1, y1, n = 8, p = 1) => Array.from({ length: n + 1 }, (_, k) => { const t = k / n; return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, p]; });
const L = m => console.log('[paint] ' + m);
window.__paintDone = (async () => {
  h.setPaper('coldPress', 1); S.clear(); h.setMode(0); h.setBrushPreset('round'); h.setBrush('French Ultramarine');
  const tot = async () => { const a = await S.read(); let d = 0; for (let i = 0; i < a.length; i += 4) d += a[i + 1] + a[i + 2]; return d.toFixed(1); };
  await S.path(line(100, 200, 900, 200), 3); L('after stroke 1: ' + await tot());
  S.checkpoint();
  h.setBrush('Quinacridone Rose'); await S.path(line(100, 500, 900, 500), 3); L('after stroke 2: ' + await tot());
  await S.undo(); await new Promise(r => setTimeout(r, 100)); L('undo: ' + await tot() + ' rose at (500,500): ' + JSON.stringify((await S.sense(500, 500, 3)).wet));
  await S.redo(); await new Promise(r => setTimeout(r, 100)); L('redo: ' + await tot() + ' rose: ' + JSON.stringify((await S.sense(500, 500, 3)).wet));
  await S.undo(); await new Promise(r => setTimeout(r, 1500)); L('undo again, then 1.5 s of drying: ' + await tot());
})();
