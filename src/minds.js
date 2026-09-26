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
//   soften(line)         run a clean damp brush along an edge while the
//                        paint is wet, so it fades out instead of stopping
//   waitDry(points)      wait until the paper there is bone dry
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

  async function fill(poly, { mode = 0, wetEdge = 0.05, framesPerSeg = 2, spacing = 1.4, log = () => {} } = {}) {
    // Effective width: a soft brush wets fully only near its core, so rows
    // overlap more (spacing is in core widths).
    const r = V.brushRadius, core = r * (1 - 0.5 * V.brushSoftness);
    const dy = Math.max(2, core * spacing);
    const ys = poly.map(p => p[1]), top = Math.min(...ys), bottom = Math.max(...ys);
    // Keep the brush's spread inside the outline, but never so far in that
    // a shape narrower than the brush gets skipped: then one row down the
    // middle (and a painter would reach for a smaller brush).
    const inset = Math.min(r * 0.5, (bottom - top) / 3);
    if (bottom - top < r) log(`fill: shape is ${Math.round(bottom - top)} cells tall, brush is ${Math.round(2 * r)} wide`);
    let dir = 1, prev = null, rewets = 0;
    const first = Math.min(top + inset, (top + bottom) / 2);
    for (let y = first; y <= Math.max(first, bottom - inset * 0.5); y += dy, dir = -dir) {
      for (const [x0, x1] of spans(poly, y)) {
        let a = x0 + inset * 0.6, b = x1 - inset * 0.6;
        if (b <= a) { a = b = (x0 + x1) / 2; }
        // Keep a wet edge: the last row's lower edge is oldest where that
        // row began (the far end of the row we're about to paint). If it's
        // drying there, run a damp brush along the edge first, from that
        // end, so it's wet again by the time this row arrives.
        if (prev) {
          const [p0, p1, py, pdir] = prev, start = pdir > 0 ? p0 : p1;
          const s = await sim.sense(start, py + core * 0.5, core * 0.5);
          if (s.water < wetEdge) {
            rewets++;
            h.setMode(1);
            const edge = [[start, py + core * 0.5], [pdir > 0 ? p1 : p0, py + core * 0.5]];
            await sim.path(edge, framesPerSeg);
            h.setMode(mode);
          }
        }
        const n = Math.max(2, Math.ceil((b - a) / 30));
        const row = Array.from({ length: n + 1 }, (_, k) => [a + (b - a) * k / n + (b === a ? k - n / 2 : 0), y]);
        await sim.path(dir > 0 ? row : row.reverse(), framesPerSeg);
        prev = [a, b, y, dir];
      }
    }
    log(`fill: done (${rewets} edge ${rewets === 1 ? 'rewet' : 'rewets'})`);
    return { rewets };
  }

  // Soften an edge while the paint is still wet: a clean, damp brush run
  // along it (just outside the paint) lets the colour creep out and fade
  // instead of stopping at a hard line. Uses the current brush size.
  async function soften(line, { framesPerSeg = 2, pressure = 0.7, log = () => {} } = {}) {
    const m = h.mode();
    h.setMode(1);
    try { await sim.path(line.map(([x, y, p = pressure]) => [x, y, p]), framesPerSeg); }
    finally { h.setMode(m); }
    log(`soften: ran a damp brush along ${line.length} points`);
  }

  // Wait until the paper at these points is bone dry (not just matt), then
  // a moment longer so the gum sets and the paint won't lift under the next
  // wash. A polygon (3+ points) is checked on a grid across it.
  async function waitDry(points, { maxS = 90, dryer = true, set = 1.5 } = {}) {
    const t0 = performance.now();
    const pts = points.length >= 3 ? gridIn(points, 6) : points;
    if (dryer) sim.setDrying(true);
    try {
      for (;;) {
        let wet = 0;
        for (const [x, y] of pts) { const s = await sim.sense(x, y, 10); wet = Math.max(wet, s.water, s.damp * 0.3); }
        const t = (performance.now() - t0) / 1000;
        if (wet < 0.003) { await sleep(set * 1000); return t; }
        if (t > maxS) return -1;
        await sleep(600);
      }
    } finally { if (dryer) sim.setDrying(false); }
  }

  // An n x n grid of points inside a polygon.
  const gridIn = (poly, n) => {
    const ys = poly.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), out = [];
    for (let r = 0; r < n; r++) {
      const y = y0 + (y1 - y0) * (r + 0.5) / n;
      for (const [a, b] of spans(poly, y)) for (let c = 0; c < n; c++) out.push([a + (b - a) * (c + 0.5) / n, y]);
    }
    return out;
  };

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

  return { mark, fill, soften, waitDry, waitDamp, spans };
}
