const S = window.__sim, h = S.headless, V = S.values;
const zig = (y, x0 = 120) => Array.from({ length: 9 }, (_, k) => [x0 + k * 100, y + (k % 2) * 20]);
async function line(pts, frames) { h.lift(); for (let k = 1; k < pts.length; k++) await h.paint(...pts[k - 1], ...pts[k], frames); }
window.__paintDone = (async () => {
  h.begin(); h.setPaper('coldPress', 1); h.setTone('natural'); S.clear();
  const out = [];
  for (const [y, wait] of [[120, 1], [300, 2], [480, 4], [660, 8]]) {
    h.setBrushPreset('rigger'); h.setMode(0); h.setBrush('Phthalo Turquoise'); V.brushCapacity = 0;
    await line(zig(y), 6); await line(zig(y + 60), 6);          // brushed, control
    await h.wait(wait);
    h.setBrushPreset('water'); h.setMode(1); V.brushCapacity = 0; V.brushRadius = 8;
    await line(zig(y), 20);
  }
  await h.wait(15); await h.wait(20, { dry: true }); await h.wait(2);
  const a = await S.readPigment('Phthalo Turquoise'), W = 1024;
  // Per segment: pigment still on the line (within 4 cells of its centre),
  // brushed line vs its untouched control. 1 = nothing moved.
  const cy = (y0, x) => { const k = Math.floor((x - 120) / 100), t = (x - 120 - k * 100) / 100, a0 = y0 + (k % 2) * 20, a1 = y0 + ((k + 1) % 2) * 20; return a0 + (a1 - a0) * t; };
  const seg = (y0, x0) => { let v = 0; for (let x = x0; x < x0 + 100; x++) { const c = Math.round(cy(y0, x)); for (let y = c - 4; y <= c + 4; y++) v += a[y * W + x]; } return v; };
  for (const [y, wait] of [[120, 1], [300, 2], [480, 4], [660, 8]]) {
    const r = []; for (let k = 0; k < 8; k++) r.push((seg(y, 120 + k * 100) / seg(y + 60, 120 + k * 100)).toFixed(2));
    console.log(`[paint] wait ${wait}s: kept on the line per segment ${r.join(' ')}`);
  }
  h.end();
})();
