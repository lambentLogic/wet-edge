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
//   soften(line, out)    find where the wet paint ends along a line and run
//                        a clean damp brush half over that edge, so it fades
//                        out instead of stopping hard
//   washAround(area)     a wash that goes around whatever is already painted:
//                        senses the sheet, cuts in along each shape with a
//                        small brush a sliver away from it, and fills the
//                        open areas with the big brush, top to bottom
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

  // An area to paint: a polygon [[x, y], ...], or { mask } (a Uint8Array
  // over the sheet, 1 inside, from areaAt or scrubArea). Its scanline spans
  // and vertical extent.
  const SW = 1024, SH = 768;
  function region(area) {
    if (!area.mask) {
      const ys = area.map(p => p[1]);
      return { spans: y => spans(area, y), top: Math.min(...ys), bottom: Math.max(...ys) };
    }
    const m = area.mask;
    let top = SH, bottom = -1;
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (m[y * SW + x]) { top = Math.min(top, y); bottom = y; break; }
    return {
      top, bottom,
      spans: y => {
        const yi = Math.round(y), out = [];
        if (yi < 0 || yi >= SH) return out;
        for (let x = 0; x < SW; x++) {
          if (!m[yi * SW + x]) continue;
          const x0 = x;
          while (x + 1 < SW && m[yi * SW + x + 1]) x++;
          if (x - x0 >= 2) out.push([x0, x]);
        }
        return out;
      },
    };
  }

  // Distance (cells, chamfer) from every cell to the nearest seed cell.
  function chamfer(seed) {
    const N = SW * SH, INF = 1e9, dist = new Float32Array(N), D2 = Math.SQRT2;
    for (let c = 0; c < N; c++) dist[c] = seed[c] ? 0 : INF;
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const c = y * SW + x; let d = dist[c];
      if (x > 0) d = Math.min(d, dist[c - 1] + 1);
      if (y > 0) { d = Math.min(d, dist[c - SW] + 1); if (x > 0) d = Math.min(d, dist[c - SW - 1] + D2); if (x < SW - 1) d = Math.min(d, dist[c - SW + 1] + D2); }
      dist[c] = d;
    }
    for (let y = SH - 1; y >= 0; y--) for (let x = SW - 1; x >= 0; x--) {
      const c = y * SW + x; let d = dist[c];
      if (x < SW - 1) d = Math.min(d, dist[c + 1] + 1);
      if (y < SH - 1) { d = Math.min(d, dist[c + SW] + 1); if (x < SW - 1) d = Math.min(d, dist[c + SW + 1] + D2); if (x > 0) d = Math.min(d, dist[c + SW - 1] + D2); }
      dist[c] = d;
    }
    return dist;
  }

  // "Click inside a shape": the unpainted region around (x, y), bounded by
  // paint and masking fluid already on the sheet (and the sheet's edge).
  // Gaps in the boundary up to `gap` cells wide are bridged, so a loosely
  // painted outline still holds. Returns { mask, cells } or null when the
  // point is on paint.
  async function areaAt(x, y, { threshold = 0.004, gap = 3 } = {}) {
    const a = await sim.read(), masked = await sim.maskField(), N = SW * SH;
    const blocked = new Uint8Array(N);
    for (let c = 0; c < N; c++) blocked[c] = a[c * 4 + 1] + a[c * 4 + 2] > threshold || masked[c] > 0.5 ? 1 : 0;
    const d = chamfer(blocked), open = c => d[c] > gap;
    let start = Math.round(y) * SW + Math.round(x);
    if (!(start >= 0 && start < N) || !open(start)) {
      // Nudge off a thin line or out of a narrow gap, if clicked close by.
      let best = -1;
      for (let dy = -gap * 2; dy <= gap * 2; dy++) for (let dx = -gap * 2; dx <= gap * 2; dx++) {
        const cx = Math.round(x) + dx, cy = Math.round(y) + dy, c = cy * SW + cx;
        if (cx >= 0 && cy >= 0 && cx < SW && cy < SH && open(c) && (best < 0 || d[c] > d[best])) best = c;
      }
      if (best < 0) return null;
      start = best;
    }
    const core = new Uint8Array(N), stack = [start];
    core[start] = 1;
    while (stack.length) {
      const c = stack.pop(), cx = c % SW;
      for (const n of [cx > 0 ? c - 1 : -1, cx < SW - 1 ? c + 1 : -1, c - SW, c + SW]) {
        if (n >= 0 && n < N && !core[n] && open(n)) { core[n] = 1; stack.push(n); }
      }
    }
    // Grow back out to the boundary the gap-closing kept it from.
    const back = chamfer(core), mask = new Uint8Array(N);
    let cells = 0;
    for (let c = 0; c < N; c++) if (!blocked[c] && back[c] <= gap + 1) { mask[c] = 1; cells++; }
    return { mask, cells };
  }

  // "Scrub over the area": everything within r of a rough scribble.
  function scrubArea(points, r) {
    const mask = new Uint8Array(SW * SH);
    const disc = (cx, cy) => {
      for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(SH - 1, Math.ceil(cy + r)); y++) {
        const w = Math.sqrt(Math.max(0, r * r - (y - cy) ** 2));
        for (let x = Math.max(0, Math.floor(cx - w)); x <= Math.min(SW - 1, Math.ceil(cx + w)); x++) mask[y * SW + x] = 1;
      }
    };
    for (let k = 0; k < points.length; k++) {
      const [ax, ay] = points[k], [bx, by] = points[Math.min(k + 1, points.length - 1)];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(1, r / 3)));
      for (let i = 0; i <= n; i++) disc(ax + (bx - ax) * i / n, ay + (by - ay) * i / n);
    }
    return { mask };
  }

  // Cells inside a region (from region()).
  function insideOf(reg) {
    if (reg.mask) return reg.mask;
    const m = new Uint8Array(SW * SH);
    for (let y = Math.max(0, Math.floor(reg.top)); y <= Math.min(SH - 1, Math.ceil(reg.bottom)); y++) {
      for (const [x0, x1] of reg.spans(y + 0.5)) for (let x = Math.max(0, Math.ceil(x0)); x <= Math.min(SW - 1, Math.floor(x1)); x++) m[y * SW + x] = 1;
    }
    return m;
  }

  // Keep a wash about as strong as one stroke of the same brush and mix.
  // Overlapping rows each add their own dose, so left alone a wash comes
  // out 1-3x heavier than a stroke (more for big, soft brushes; a painter's
  // wash pushes one bead of paint down the sheet instead). The first full
  // row sets the target (its own density along its middle); after each row
  // the wash senses the finished part behind the brush and scales the paint
  // strength of the rows to come. targetAt(y): relative strength wanted at
  // height y (a graded wash), 1 by default.
  async function makeDoser(inside, targetAt = () => 1) {
    const a0 = await sim.read();
    const laid = (a, c) => a[c * 4 + 1] + a[c * 4 + 2] - a0[c * 4 + 1] - a0[c * 4 + 2];
    let T = null, y0 = 0, k = 1;
    return {
      get k() { return k; },
      // After a full row centred at y, of half-width hw.
      async row(y, hw) {
        const a = await sim.read();
        if (T === null) {
          let sum = 0, n = 0;
          for (let yy = Math.max(0, Math.round(y - hw * 0.4)); yy <= Math.min(SH - 1, Math.round(y + hw * 0.4)); yy++) {
            for (let x = 0; x < SW; x++) { const c = yy * SW + x; if (inside[c]) { sum += laid(a, c); n++; } }
          }
          if (n > 50 && sum > 0) { T = sum / n; y0 = y; k = 0.75; }   // the next rows overlap it
          return;
        }
        // The band finished most recently: well behind the brush, but recent
        // enough to answer for the last rows' strength.
        let sum = 0, want = 0, n = 0;
        for (let yy = Math.max(0, Math.round(y - hw * 3.5)); yy < Math.min(SH, Math.round(y - hw * 1.5)); yy++) {
          for (let x = 0; x < SW; x++) { const c = yy * SW + x; if (inside[c]) { sum += laid(a, c); want += targetAt(yy) / targetAt(y0); n++; } }
        }
        if (n > 200 && sum > 0) k = Math.min(1.5, Math.max(0.1, k * Math.sqrt(Math.min(1.5, Math.max(0.5, T * want / sum)))));
      },
    };
  }

  // Dampen an area with one sweep of the spray bottle, kept a spray's reach
  // in from its edge so the paper outside stays dry.
  async function mistOver(inside, reach = 40) {
    const fromEdge = chamfer(inside.map(v => 1 - v));
    const mode0 = h.mode(), r0 = V.brushRadius, m0 = V.mistRadius;
    h.setMode(4); V.brushRadius = reach; V.mistRadius = reach;
    for (let y = reach * 0.6, d = 1; y < SH; y += reach * 1.1, d = -d) {
      let run = [];
      const flush = async () => { if (run.length > 1) { h.lift(); await sim.path(run, 1); } run = []; };
      for (let k = 0; k <= Math.ceil(SW / 16); k++) {
        const x = d > 0 ? k * 16 : SW - k * 16, c = Math.round(y) * SW + Math.min(SW - 1, x);
        if (fromEdge[c] > reach * 0.9) run.push([x, y, 0.9]); else await flush();
      }
      await flush();
    }
    h.setMode(mode0); V.brushRadius = r0; V.mistRadius = m0;
  }

  // Lay a stroke; with brushAt (a variegated wash), in pieces about two
  // brush-widths long, each loaded for where it lands and overlapping the
  // last a little, so the colour changes along the stroke too.
  async function layStroke(pts, framesPerSeg, brushAt) {
    if (!brushAt) { await sim.path(pts, framesPerSeg); return; }
    const piece = Math.max(4 * V.brushRadius, 60);
    let cur = [pts[0]], len = 0;
    const flush = async () => {
      if (cur.length < 2) return;
      const [mx, my] = cur[Math.floor(cur.length / 2)];
      h.setBrush(brushAt(mx, my));
      h.lift(); await sim.path(cur, framesPerSeg);
    };
    // Resample finely so pieces can end anywhere.
    const fine = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay, ap = 1] = pts[k - 1], [bx, by, bp = 1] = pts[k];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 10));
      for (let i = 1; i <= n; i++) fine.push([ax + (bx - ax) * i / n, ay + (by - ay) * i / n, ap + (bp - ap) * i / n]);
    }
    for (let k = 1; k < fine.length; k++) {
      cur.push(fine[k]);
      len += Math.hypot(fine[k][0] - fine[k - 1][0], fine[k][1] - fine[k - 1][1]);
      if (len >= piece && k < fine.length - 2) { await flush(); cur = cur.slice(-2); len = 0; }
    }
    await flush();
  }

  // A flat brush lays its rows broadside (its width across the stroke).
  const broadside = () => { const a = V.flatAngle; if (V.brushShape > 0.5) V.flatAngle = 90; return () => { V.flatAngle = a; }; };

  //   even     match one stroke's strength (makeDoser)
  //   dampen   a quick pass of clean water over the area first, so the
  //            rows land on damp paper and melt together
  //   brushAt  optional (x, y) => brush load, for a variegated wash (rows
  //            are laid in pieces, each loaded for where it goes)
  async function fill(poly, { mode = null, wetEdge = 0.05, framesPerSeg = 2, spacing = 2, grade = null, even = false, dampen = false, brushAt = null, log = () => {} } = {}) {
    // Paint in the mode it was called in (a water fill stays water after a
    // rewet; restoring a fixed paint mode laid the brush's pigment instead).
    if (mode === null) mode = h.mode();
    h.setMode(mode);
    // Effective width: a soft brush wets fully only near its core, so rows
    // overlap more (spacing is in core widths).
    const r = V.brushRadius, core = r * (1 - 0.5 * V.brushSoftness);
    // Rows spaced by the core, but never closer than 0.75 of the brush's
    // width: a big brush lays wide bands in few passes.
    // (A graded wash overlaps more, so its steps in strength blend.)
    const dy = Math.max(2, core * spacing, r * (grade ? 0.9 : 1.5));
    const reg = region(poly), top = reg.top, bottom = reg.bottom;
    // Keep the brush's spread inside the outline, but never so far in that
    // a shape narrower than the brush gets skipped: then one row down the
    // middle (and a painter would reach for a smaller brush).
    const inset = Math.min(r * 0.5, (bottom - top) / 3);
    if (bottom - top < r) log(`fill: shape is ${Math.round(bottom - top)} cells tall, brush is ${Math.round(2 * r)} wide`);
    let dir = 1, prev = null, rewets = 0;
    const basePigment = V.brushPigment;
    // The first and last rows run close to the top and bottom edges: a soft
    // brush covers fully only near its middle, and half a radius in left a
    // pale band along the edge.
    const first = Math.min(top + inset * 0.5, (top + bottom) / 2);
    const unturn = broadside();
    const rowAt = (y, a, b) => { const n = Math.max(2, Math.ceil((b - a) / 30)); return Array.from({ length: n + 1 }, (_, k) => [a + (b - a) * k / n + (b === a ? k - n / 2 : 0), y]); };
    if (dampen) await mistOver(insideOf(reg));
    const gradeAt = y => (grade ? grade[0] + (grade[1] - grade[0]) * Math.min(1, Math.max(0, (y - first) / Math.max(1, bottom - (first - top) - first))) : 1);
    const doser = even && mode !== 1 ? await makeDoser(insideOf(reg), gradeAt) : null;
    // Rows spread evenly from the first to the last, the last as far in
    // from the bottom as the first is from the top (stepping by dy from
    // the top left up to a whole gap unpainted at the bottom).
    const last = Math.max(first, bottom - (first - top));
    const nRows = Math.max(1, Math.ceil((last - first) / dy - 1e-6)), step = (last - first) / nRows || dy;
    for (let y = first, k = 0; k <= nRows; k++, y = first + k * step, dir = -dir) {
      for (const [x0, x1] of reg.spans(y)) {
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
            // Recharge the drying edge: a painter goes back with the same
            // brush (clean water there left a pale frame round the wash).
            rewets++;
            const edge = [[start, py + core * 0.5], [pdir > 0 ? p1 : p0, py + core * 0.5]];
            await layStroke(edge, framesPerSeg, brushAt);
          }
        }
        // A graded wash: the brush's paint strength goes from grade[0] at
        // the top row to grade[1] at the bottom (multiples of brushPigment).
        V.brushPigment = basePigment * gradeAt(y) * (doser?.k ?? 1);
        const row = rowAt(y, a, b);
        if (dir < 0) row.reverse();
        await layStroke(row, framesPerSeg, brushAt);
        prev = [a, b, y, dir];
      }
      if (doser && prev?.[2] === y) await doser.row(y, core);
    }
    V.brushPigment = basePigment;
    unturn();
    log(`fill: done (${rewets} edge ${rewets === 1 ? 'rewet' : 'rewets'})`);
    return { rewets };
  }

  // Soften an edge while the paint is still wet: a clean, damp brush run
  // just outside the paint lets the colour creep out and fade instead of
  // stopping at a hard line. line runs roughly along the edge; out = [dx, dy]
  // points away from the paint. For each point it looks (along out) for
  // where the wet paint actually ends, and puts the brush half over it.
  // Limited for now: the sim's brush lays water but doesn't drag wet paint
  // along with it, which is most of how a real damp brush softens an edge.
  // A graded fill that fades to almost nothing (fill's grade) reads softer.
  // out: [dx, dy] away from the paint, or null to work it out: for each
  // point, whichever side of the line holds less water (decided once for
  // the whole line, so a wobbly trace doesn't flip sides).
  async function soften(line, out = null, { framesPerSeg = 2, pressure = 0.7, reach = 80, log = () => {} } = {}) {
    const a = await sim.read(), W = 1024, H = a.length / 4 / W, r = V.brushRadius;
    const wetAt = (x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < W && yi < H ? a[(yi * W + xi) * 4] : 0; };
    const normalAt = k => {
      if (out) { const l = Math.hypot(out[0], out[1]); return [out[0] / l, out[1] / l]; }
      const [ax, ay] = line[Math.max(0, k - 1)], [bx, by] = line[Math.min(line.length - 1, k + 1)];
      const l = Math.hypot(bx - ax, by - ay) || 1;
      return [-(by - ay) / l, (bx - ax) / l];
    };
    let side = 1;
    if (!out) {
      let bias = 0;
      line.forEach(([x, y], k) => {
        const [nx, ny] = normalAt(k);
        for (let d = 4; d <= reach; d += 4) bias += wetAt(x + nx * d, y + ny * d) - wetAt(x - nx * d, y - ny * d);
      });
      side = bias > 0 ? -1 : 1;   // out = away from the wetter side
    }
    let found = 0;
    const pts = line.map(([x, y, p = pressure], k) => {
      const [nx, ny] = normalAt(k), ox = nx * side, oy = ny * side;
      // From inside (reach back) walk outward to the last wet cell.
      let edge = null;
      for (let d = -reach; d <= reach; d += 2) if (wetAt(x + ox * d, y + oy * d) > 0.02) edge = d;
      if (edge === null) return null;
      found++;
      const d = edge + r * 0.4;
      return [x + ox * d, y + oy * d, p];
    }).filter(Boolean);
    if (pts.length < 2) { log('soften: no wet edge found'); return; }
    const m = h.mode();
    h.setMode(1);
    try { await sim.path(pts, framesPerSeg); }
    finally { h.setMode(m); }
    log(`soften: found the wet edge at ${found}/${line.length} points and ran a damp brush along it`);
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

  // A wash that goes around what's already on the sheet, as a painter
  // cuts in around a flower while laying the background. The sheet is
  // sensed once: every cell holding paint (above threshold) is a shape to
  // keep clear of, by margin cells of white paper. From a distance map to
  // those shapes: the brush's tip runs along a contour just outside each
  // one (marching squares), and rows fill the rest with pressure set so the
  // brush just fits the room it has. Top to bottom, each contour just
  // before the rows reach it, so everything merges wet. Mists first.
  //   area       polygon to wash (default: the whole sheet)
  //   pigmentAt  optional (x, y) => brushPigment, for a graded wash
  //   brushAt    optional (x, y) => brush load, for a variegated wash
  async function washAround(area = null, { margin = 3, threshold = 0.004, pigmentAt = null, brushAt = null, mist = true, framesPerSeg = 2, fine = 0.5, even = false, log = () => {} } = {}) {
    const W = 1024, a = await sim.read(), H = a.length / 4 / W, N = W * H;
    const bigR = V.brushRadius, pig0 = V.brushPigment;
    // Inside the area?
    const inside = new Uint8Array(N);
    if (area?.mask) inside.set(area.mask);
    else if (area) {
      for (let y = 0; y < H; y++) for (const [x0, x1] of spans(area, y + 0.5)) {
        for (let x = Math.max(0, Math.ceil(x0)); x <= Math.min(W - 1, Math.floor(x1)); x++) inside[y * W + x] = 1;
      }
    } else inside.fill(1);
    // Distance (cells) to the nearest painted cell: two-pass chamfer.
    const INF = 1e9, dist = new Float32Array(N);
    // The area's own edge counts like a shape's: the tip traces it and the
    // rows narrow toward it (rows had run full width up to it and stopped
    // in steps along a slanted edge).
    for (let c = 0; c < N; c++) dist[c] = a[c * 4 + 1] + a[c * 4 + 2] > threshold || !inside[c] ? 0 : INF;
    const D1 = 1, D2 = Math.SQRT2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = y * W + x; let d = dist[c];
      if (x > 0) d = Math.min(d, dist[c - 1] + D1);
      if (y > 0) { d = Math.min(d, dist[c - W] + D1); if (x > 0) d = Math.min(d, dist[c - W - 1] + D2); if (x < W - 1) d = Math.min(d, dist[c - W + 1] + D2); }
      dist[c] = d;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const c = y * W + x; let d = dist[c];
      if (x < W - 1) d = Math.min(d, dist[c + 1] + D1);
      if (y < H - 1) { d = Math.min(d, dist[c + W] + D1); if (x < W - 1) d = Math.min(d, dist[c + W + 1] + D2); if (x > 0) d = Math.min(d, dist[c + W - 1] + D2); }
      dist[c] = d;
    }
    // Distance in from the area's own edge: the spray is kept that far in,
    // so it doesn't dampen paper outside the wash.
    const fromEdge = area ? chamfer(inside.map(v => 1 - v)) : null;
    const inFrom = (x, y) => { if (!fromEdge) return Infinity; const xi = Math.min(W - 1, Math.max(0, Math.round(x))), yi = Math.min(H - 1, Math.max(0, Math.round(y))); return fromEdge[yi * W + xi]; };
    const at = (x, y) => { const xi = Math.min(W - 1, Math.max(0, Math.round(x))), yi = Math.min(H - 1, Math.max(0, Math.round(y))); return inside[yi * W + xi] ? dist[yi * W + xi] : -1; };
    // One brush does it all, as a painter would: its tip along the edges,
    // its belly in the open. Pressure sets the width (radius = R * (taperMin
    // + (1 - taperMin) * pressure)), so each point of a stroke is pressed
    // just hard enough for the brush to fit the room it has, and lifts to
    // the tip near a shape. A tapered brush (the mop) has a fine tip.
    // Separate small-brush rings dried apart into bands.
    const taper = Math.max(V.taperMin, 0.02), tipR = bigR * taper;
    const pressFor = room => Math.min(1, Math.max(0, (room / bigR - taper) / (1 - taper)));
    const rowStep = Math.max(3, bigR * 0.7), cutL = margin + tipR * 1.2;
    const clearOf = cutL;   // rows run wherever the tip fits
    const lines = contours(cutL).map(l => ({ l, L: cutL }));

    function contours(L) {
    const g = 3, segs = [];
    const f = (x, y) => { const d = at(x, y); return d < 0 ? null : d - L; };
    for (let y = 0; y + g < H; y += g) for (let x = 0; x + g < W; x += g) {
      const v = [f(x, y), f(x + g, y), f(x + g, y + g), f(x, y + g)];
      if (v.some(q => q === null)) continue;
      const P = [[x, y], [x + g, y], [x + g, y + g], [x, y + g]], pts = [];
      for (let e = 0; e < 4; e++) {
        const p0 = v[e], p1 = v[(e + 1) % 4];
        if ((p0 < 0) !== (p1 < 0)) { const t = p0 / (p0 - p1), A = P[e], B = P[(e + 1) % 4]; pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
      }
      if (pts.length >= 2) segs.push([pts[0], pts[1]]);
      if (pts.length === 4) segs.push([pts[2], pts[3]]);
    }
    // Chain segments into polylines.
    const key = p => `${Math.round(p[0] * 4)},${Math.round(p[1] * 4)}`, ends = new Map(), used = new Uint8Array(segs.length);
    segs.forEach((sg, i) => { for (const p of sg) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); } });
    const out = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1; const poly = [segs[i][0], segs[i][1]];
      for (const dir of [1, 0]) {
        for (;;) {
          const tip = dir ? poly[poly.length - 1] : poly[0], cand = (ends.get(key(tip)) ?? []).find(j => !used[j]);
          if (cand === undefined) break;
          used[cand] = 1;
          const [p, q] = segs[cand], next = key(p) === key(tip) ? q : p;
          if (dir) poly.push(next); else poly.unshift(next);
        }
      }
      if (poly.length >= 3) out.push(poly.filter((_, k) => k % 3 === 0 || k === poly.length - 1));
    }
    return out;
    }
    const doser = even && h.mode() !== 1 ? await makeDoser(inside, pigmentAt ? y => pigmentAt(W / 2, y) : () => 1) : null;
    const unturn = broadside();
    const setLoad = (x, y) => { if (brushAt) h.setBrush(brushAt(x, y)); V.brushPigment = (pigmentAt ? pigmentAt(x, y) : pig0) * (doser?.k ?? 1); };
    // Sweep top to bottom: rows of the big brush where it stays clear, and
    // each contour cut in just before the rows reach it.
    // Mist the open area first, so the cut-in rings and the fill strokes
    // land on damp paper and melt together instead of each drying with its
    // own edge (a painter's spray bottle). Kept a little off the shapes.
    // A wide spray over the open area, then a fine one close in around the
    // shapes (where the cut-in rings go), each kept its own reach off them.
    if (mist) {
      const mode0 = h.mode();
      h.setMode(4);
      const reach0 = V.mistRadius;
      // A wide spray; then a fine one close in around shapes inside the area
      // (not for a found or scrubbed shape, whose edge is the shape).
      const passes = [[40, 16]];
      if (!area?.mask) passes.push([Math.max(tipR * 3, 8), 6]);
      for (const [mistR, step] of passes) {
        V.brushRadius = mistR; V.mistRadius = mistR;   // the spray has its own reach; keep it this size
        for (let y = mistR * 0.6, dirx = 1; y < H; y += mistR * 1.1, dirx = -dirx) {
          let run = [];
          const flush = async () => { if (run.length > 1) { h.lift(); await sim.path(run, 1); } run = []; };
          for (let k = 0; k <= Math.ceil(W / step); k++) {
            const x = dirx > 0 ? k * step : W - k * step;
            const d = at(x, y);
            if (d > margin + mistR * 0.9 && inFrom(x, y) > mistR * 0.9 && (mistR >= 40 || d < bigR + mistR)) run.push([x, y, 0.9]); else await flush();
          }
          await flush();
        }
      }
      h.setMode(mode0); V.brushRadius = bigR; V.mistRadius = reach0;
    }
    // Inner rings first where they start at the same height (a painter
    // cuts in, then works outward).
    const todo = lines.map(({ l, L }) => ({ l, L, top: Math.min(...l.map(p => p[1])) })).sort((p, q) => p.top - q.top || p.L - q.L);
    // Rows: in the open (where the whole brush fits) at full width every
    // rowStep; in the band near a shape, where the brush narrows to fit,
    // rows closer together (fineStep), so the narrowed strokes still meet
    // (at one spacing they left gaps: stripes beside each shape).
    const openAt = margin + bigR, fineStep = Math.max(2, tipR * 2.5, bigR * fine);
    let cut = 0, rows = 0, nextCoarse = rowStep / 2, dirx = 1;
    const row = async (y, near) => {
      const before0 = rows;
      V.brushRadius = bigR;
      let run = [];
      const flush = async () => { if (run.length > 1) { setLoad(run[0][0], y); h.lift(); await layStroke(run, framesPerSeg, brushAt); rows++; } run = []; };
      for (let k = 0; k <= Math.ceil(W / 10); k++) {
        const x = dirx > 0 ? k * 10 : W - k * 10;
        const d = at(x, y);
        const ok = near ? d > clearOf && d <= openAt : d > openAt;
        if (ok) run.push([x, y, near ? pressFor(d - margin) : 1]); else await flush();
      }
      await flush();
      dirx = -dirx;
      if (doser && !near && rows > before0) await doser.row(y, bigR);
    };
    for (let y = fineStep / 2; y < H + rowStep; y += fineStep) {
      while (todo.length && todo[0].top < y + rowStep) {
        const { l } = todo.shift();
        V.brushRadius = bigR; setLoad(l[0][0], l[0][1]);
        h.lift(); await layStroke(l.map(([x, yy]) => [x, yy, 0]), framesPerSeg, brushAt); cut++;
      }
      if (y >= H) continue;
      await row(y, true);
      while (y >= nextCoarse) { await row(nextCoarse, false); nextCoarse += rowStep; }
    }
    V.brushRadius = bigR; V.brushPigment = pig0;
    unturn();
    log(`washAround: ${cut} cut-in ${cut === 1 ? 'contour' : 'contours'}, ${rows} fill strokes`);
    return { cut, rows };
  }

  // Cells of an area (polygon or { mask }), as a mask over the sheet.
  const maskOf = area => (area.mask ? area.mask : insideOf(region(area)));

  return { mark, fill, soften, washAround, waitDry, waitDamp, spans, areaAt, scrubArea, maskOf };
}
