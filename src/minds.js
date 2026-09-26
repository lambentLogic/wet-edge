// Brushes with little minds: painting routines that sense the paper and
// correct themselves, the way a painter does by eye. Built on the real-time
// painting API (sim.path, sim.sense), so you can watch them work.
//
//   mark(points, opts)   paint a stroke, sense what landed along it, and go
//                        over it again (reloaded, pressing harder) if it came
//                        out fainter than intended
//   fill(outline, opts)  fill a polygon with back-and-forth rows spaced by the
//                        brush's effective width, following the outline, and
//                        keep a wet edge: before each row, check the last one
//                        is still wet and rewet its edge if it's drying
//   waitDry(points)      wait until the paper there is dry
//   waitDamp(points)     wait until it has lost its shine (for soft drop-ins)

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function makeMinds(sim) {
  const V = sim.values, h = sim.headless;

  // Pigment the current brush load would put down, as sensed at a spot.
  const brushPigmentAt = async (x, y, r) => {
    const s = await sim.sense(x, y, r);
    const names = h.brushPigmentNames();
    let v = 0;
    for (const n of names) v += (s.wet[n] ?? 0) + (s.settled[n] ?? 0);
    return v;
  };

  const along = (points, every) => points.filter((_, k) => k % every === 0 || k === points.length - 1);

  async function mark(points, { target = 0.02, maxTries = 3, framesPerSeg = 2, log = () => {} } = {}) {
    let pts = points.map(p => [...p]);
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      await sim.path(pts, framesPerSeg);
      await sleep(150);
      const samples = along(pts, Math.max(1, Math.floor(pts.length / 6)));
      let sum = 0;
      for (const [x, y] of samples) sum += await brushPigmentAt(x, y, Math.max(2, V.brushRadius * 0.6));
      const got = sum / samples.length;
      if (got >= target || attempt === maxTries) {
        log(`mark: ${got.toFixed(3)} after ${attempt} ${attempt > 1 ? 'passes' : 'pass'}`);
        return { got, attempts: attempt };
      }
      // Too faint: reload and press harder along the same line.
      pts = pts.map(([x, y, p = 1, s = 0]) => [x, y, Math.min(1, p + 0.35), s]);
    }
  }

  // Horizontal extent(s) of a polygon at height y (scanline; handles
  // concave outlines by pairing crossings).
  const spans = (poly, y) => {
    const xs = [];
    for (let k = 0; k < poly.length; k++) {
      const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % poly.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    const out = [];
    for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], xs[k + 1]]);
    return out;
  };

  async function fill(poly, { mode = 0, wetEdge = 0.05, framesPerSeg = 2, log = () => {} } = {}) {
    // Effective width: a soft brush wets fully only near its core, so rows
    // overlap more.
    const r = V.brushRadius, core = r * (1 - 0.5 * V.brushSoftness);
    const dy = Math.max(2, core * 1.4);
    const ys = poly.map(p => p[1]);
    const inset = r * 0.5;
    let dir = 1, prev = null, rewets = 0;
    for (let y = Math.min(...ys) + inset; y <= Math.max(...ys) - inset * 0.5; y += dy, dir = -dir) {
      for (const [x0, x1] of spans(poly, y)) {
        const a = x0 + inset * 0.6, b = x1 - inset * 0.6;
        if (b <= a) continue;
        // Keep a wet edge: if the last row is drying, rewet its edge first.
        if (prev) {
          const mid = [(prev[0] + prev[1]) / 2, prev[2]];
          const s = await sim.sense(mid[0], mid[1], core);
          if (s.water < wetEdge) {
            rewets++;
            h.setMode(1);
            await sim.path([[prev[0], prev[2]], [prev[1], prev[2]]], framesPerSeg);
            h.setMode(mode);
          }
        }
        const n = Math.max(2, Math.ceil((b - a) / 30));
        const row = Array.from({ length: n + 1 }, (_, k) => [a + (b - a) * k / n, y]);
        await sim.path(dir > 0 ? row : row.reverse(), framesPerSeg);
        prev = [a, b, y];
      }
    }
    log(`fill: done (${rewets} edge ${rewets === 1 ? 'rewet' : 'rewets'})`);
    return { rewets };
  }

  async function waitDry(points, { maxS = 90, dryer = true } = {}) {
    const t0 = performance.now();
    if (dryer) sim.setDrying(true);
    try {
      for (;;) {
        let wet = 0;
        for (const [x, y] of points) { const s = await sim.sense(x, y, 10); wet = Math.max(wet, s.water, s.damp * 0.3); }
        const t = (performance.now() - t0) / 1000;
        if (wet < 0.004) return t;
        if (t > maxS) return -1;
        await sleep(600);
      }
    } finally { if (dryer) sim.setDrying(false); }
  }

  async function waitDamp(points, { below = 0.12, maxS = 60 } = {}) {
    const t0 = performance.now();
    for (;;) {
      let w = 0;
      for (const [x, y] of points) w = Math.max(w, (await sim.sense(x, y, 10)).water);
      const t = (performance.now() - t0) / 1000;
      if (w < below) return t;
      if (t > maxS) return -1;
      await sleep(400);
    }
  }

  return { mark, fill, waitDry, waitDamp, spans };
}
