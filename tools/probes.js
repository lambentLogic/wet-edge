// Calibration probes. Evaluated inside the app page (needs window.__sim);
// each probe paints a scripted scene headlessly and returns numbers.
// Coordinates are grid cells (1 cell = 0.2 mm).

(() => {
  const W = 1024;
  const S = window.__sim, h = S.headless;

  // Run fn with some knobs overridden, restoring them afterwards.
  // Overrides are re-applied after a paper preset loads (see fresh), so
  // paper knobs can be overridden too.
  let active = {};
  async function withValues(over, fn) {
    const saved = {}, outer = active;
    for (const k of Object.keys(over)) saved[k] = S.values[k];
    active = { ...outer, ...over };
    Object.assign(S.values, over);
    try { return await fn(); } finally { Object.assign(S.values, saved); active = outer; }
  }

  async function fresh(paper) {
    h.begin();
    h.setPaper(paper);
    h.setTone('natural');
    h.setBrushPreset('round');    // don't inherit another probe's brush
    h.setBrush('French Ultramarine');
    S.values.brushCapacity = 0;   // probes use an endless reservoir unless they say otherwise
    Object.assign(S.values, active);
    S.clear();
    h.setMode(0);
  }

  // Total pigment (suspended + deposited) in a rectangle.
  async function region(x0, x1, y0, y1) {
    const a = await S.read();
    let p = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; p += a[i + 1] + a[i + 2]; }
    return +p.toFixed(1);
  }

  // Radii (mm) around (cx, cy) containing 50% and 90% of the pigment.
  async function radius(cx, cy) {
    const a = await S.read();
    const pts = []; let tot = 0;
    for (let y = cy - 200; y < cy + 200; y++) for (let x = cx - 200; x < cx + 200; x++) {
      const i = (y * W + x) * 4, v = a[i + 1] + a[i + 2];
      if (v > 0) { pts.push([Math.hypot(x - cx, y - cy), v]); tot += v; }
    }
    pts.sort((p, q) => p[0] - q[0]);
    let acc = 0, r50 = 0;
    for (const [r, v] of pts) {
      acc += v;
      if (!r50 && acc > 0.5 * tot) r50 = r;
      if (acc > 0.9 * tot) return [+(r50 * 0.2).toFixed(1), +(r * 0.2).toFixed(1)];
    }
    return [0, 0];
  }

  const probes = {
    // The fill mind: a full-width mop glaze (phthalo blue + ultramarine)
    // across fresh paper and over a dried base wash of the same pigments.
    // For each region: seam = strongest thin line (1-2 cells) across the
    // rows, as a fraction of the mean (paper texture alone gives ~0.05);
    // banding = spread of row averages. Seams used to appear at every row
    // when a glaze unbound the old paint under it.
    async fill(paper = 'coldPress') {
      await fresh(paper);
      h.end();
      h.setBrushPreset('mop');
      S.values.brushCapacity = 0;
      const mix = [['Phthalo Blue (GS)', 1], ['French Ultramarine', 1]];
      h.setBrush(mix);
      S.values.brushPigment = 0.1;
      const base = [[250, 150], [774, 150], [774, 450], [250, 450]];
      await window.__minds.fill(base);
      await window.__minds.waitDry(base, { maxS: 60 });
      S.values.brushCapacity = 30000;
      h.setBrush([['Phthalo Blue (GS)', 3], ['French Ultramarine', 1]]);
      S.values.brushPigment = 0.045;
      const glaze = [[-10, 150], [1034, 150], [1034, 400], [-10, 400]];
      const r = await window.__minds.fill(glaze);
      await window.__minds.waitDry(glaze, { maxS: 60 });
      h.begin();
      const a = await S.read();
      const region = (x0, x1) => {
        const rows = [];
        for (let y = 200; y < 380; y++) { let v = 0; for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; v += a[i + 1] + a[i + 2]; } rows.push(v / (x1 - x0)); }
        const mean = rows.reduce((s, v) => s + v, 0) / rows.length;
        const sd = Math.sqrt(rows.reduce((s, v) => s + (v - mean) ** 2, 0) / rows.length);
        let seam = 0;
        for (let k = 3; k < rows.length - 3; k++) seam = Math.max(seam, Math.abs(rows[k] - (rows[k - 3] + rows[k + 3]) / 2) / mean);
        return { seam: +seam.toFixed(2), banding: +(sd / mean).toFixed(3) };
      };
      return { fresh: region(20, 220), overBase: region(400, 624), rewets: r.rewets };
    },

    // Workable fixative: an ultramarine wash and a Mars black stroke, dried;
    // half the sheet is fixed (the whole sheet is sprayed, then the right
    // half painted fresh after). Then a clean wet brush scrubs across both,
    // and the lift brush works over both. How much came up, fixed vs not,
    // and how long a new wash takes to soak in on each.
    async fixative(paper = 'coldPress') {
      const band = async (name, x0, x1) => { const a = await S.readPigment(name); let v = 0; for (let y = 300; y < 460; y++) for (let x = x0; x < x1; x++) v += a[y * W + x]; return v; };
      await fresh(paper);
      const paintLeftRight = async x0 => {
        h.setBrush('French Ultramarine');
        for (let y = 300; y <= 460; y += 20) { h.lift(); await h.paint(x0, y, x0 + 300, y, 20); }
        h.setBrush('Mars Black');
        h.lift(); await h.paint(x0, 380, x0 + 300, 380, 20);
      };
      await paintLeftRight(100);
      await h.wait(20); await h.wait(20, { dry: true }); await h.wait(3);
      S.fix(); await h.wait(0.1);
      await paintLeftRight(600);
      await h.wait(20); await h.wait(20, { dry: true }); await h.wait(3);
      const before = { fixed: await band('Mars Black', 100, 400), free: await band('Mars Black', 600, 900) };
      // Scrub with clean water, then lift.
      h.setMode(1);
      for (let y = 330; y <= 430; y += 25) { h.lift(); await h.paint(80, y, 920, y, 60); }
      await h.wait(15); await h.wait(20, { dry: true }); await h.wait(3);
      h.setMode(2);
      for (let y = 360; y <= 400; y += 10) { h.lift(); await h.paint(80, y, 920, y, 60); }
      await h.wait(3);
      h.setMode(0);
      const after = { fixed: await band('Mars Black', 100, 400), free: await band('Mars Black', 600, 900) };
      return { blackLeft: { fixed: +(after.fixed / before.fixed).toFixed(2), free: +(after.free / before.free).toFixed(2) } };
    },

    // Water brush: one dab of pigment, five strokes without reloading, a
    // squeeze before the fourth. Mean paint in each stroke and the brush's
    // stores after it: strokes should pale as pigment runs out, the squeeze
    // should refill water and dilute.
    async waterbrush(paper = 'coldPress') {
      await fresh(paper);
      h.setBrushPreset('water');
      h.setBrush('French Ultramarine');
      const out = [];
      await withValues({ brushPigment: 0.5 }, async () => {
        for (let k = 0; k < 5; k++) {
          if (k === 3) h.squeeze(1.5);
          const y = 150 + k * 110;
          h.lift(); await h.paint(150, y, 870, y, 40);
          await h.wait(0.2);
          const a = await S.read(); let sum = 0, n = 0;
          for (let yy = y - 8; yy < y + 8; yy++) for (let x = 200; x < 820; x++) { sum += a[(yy * W + x) * 4 + 1] + a[(yy * W + x) * 4 + 2]; n++; }
          out.push({ paint: +(sum / n).toFixed(4), ...h.brushStores() });
        }
      });
      h.setBrushType('dip');
      h.end();
      return out;
    },

    // Dry-brush and an emptying brush, on rough paper. Coverage of each
    // stroke's footprint (fraction of cells with paint) and the mean paint
    // where it landed:
    //  - loaded: a long, firm stroke from one load (start vs end fifths).
    //    It should stay solid and get more intense as it empties.
    //  - skim: a light, fast stroke on dry paper. It should break up.
    //  - damp: the same light, fast stroke over damp paper. Full contact.
    async drybrush(paper = 'rough') {
      await fresh(paper);
      h.end();   // path() paints through the real-time loop
      h.setBrush('French Ultramarine');
      const stats = async (x0, x1, y) => {
        const a = await S.read(); let n = 0, hit = 0, sum = 0;
        for (let yy = y - 6; yy < y + 6; yy++) for (let x = x0; x < x1; x++) { n++; const v = a[(yy * W + x) * 4 + 1] + a[(yy * W + x) * 4 + 2]; if (v > 0.01) { hit++; sum += v; } }
        return { cover: +(hit / n).toFixed(2), paint: +(sum / Math.max(hit, 1)).toFixed(3) };
      };
      const out = {};
      await withValues({ brushRadius: 14, brushPigment: 0.5, brushCapacity: 4000 }, async () => {
        await S.path([[80, 200, 1], [950, 200, 1]].flatMap((p, k, arr) => k ? Array.from({ length: 30 }, (_, j) => [arr[0][0] + (p[0] - arr[0][0]) * (j + 1) / 30, 200, 1]) : [p]), 4);
        await new Promise(r => setTimeout(r, 300));
        out.loadedStart = await stats(100, 270, 200); out.loadedEnd = await stats(760, 930, 200);
        await S.path([[80, 400, 0.25], [950, 400, 0.25]], 30);
        await new Promise(r => setTimeout(r, 300));
        out.skim = await stats(200, 800, 400);
        h.setMode(1);
        await S.path([[60, 600, 1], [980, 600, 1]], 40);
        await new Promise(r => setTimeout(r, 1500));
        h.setMode(0);
        await S.path([[80, 600, 0.25], [950, 600, 0.25]], 30);
        await new Promise(r => setTimeout(r, 300));
        out.damp = await stats(200, 800, 600);
      });
      return out;
    },

    // Taper: pressure falls from 1 to 0.1 along a stroke. Painted width
    // (rows with paint) near the start and near the end.
    async taper(paper = 'hotPress') {
      await fresh(paper);
      h.end();   // path() paints through the real-time loop
      await withValues({ brushRadius: 20, brushPigment: 0.5, brushCapacity: 0 }, async () => {
        const n = 30;
        const pts = Array.from({ length: n + 1 }, (_, k) => [150 + k * 24, 380, 1 - 0.9 * k / n]);
        await S.path(pts, 3);
        await new Promise(r => setTimeout(r, 300));
      });
      const a = await S.read();
      const width = x => { let rows = 0; for (let y = 330; y < 430; y++) if (a[(y * W + x) * 4 + 1] + a[(y * W + x) * 4 + 2] > 0.005) rows++; return rows; };
      const out = { start: width(190), end: width(820), sense: await S.sense(300, 380, 8) };
      h.end();
      return out;
    },

    // Leak: the live sky wash. One continuous back-and-forth stroke of clean
    // water over y 30-400 with a big brush, then a few seconds. Fraction of
    // wet cells below y 470 (brush radius past the band). Should be ~0.
    async leak(paper = 'coldPress') {
      await fresh(paper);
      h.setMode(1);
      await withValues({ brushRadius: 46, brushWater: 0.3 }, async () => {
        h.lift();
        let dir = 1;
        for (let y = 30; y <= 400; y += 40, dir = -dir) {
          const xs = dir > 0 ? [-30, 1060] : [1060, -30];
          await h.paint(xs[0], y, xs[1], y, 36);
          await h.paint(xs[1], y, xs[1], y + 40, 2);
        }
        for (const t of [2, 4, 8]) { await h.wait(t === 2 ? 2 : t / 2); }
      });
      h.setMode(0);
      h.end();
      const a = await S.read();
      let wet = 0, out = 0;
      for (let y = 0; y < 768; y++) for (let x = 0; x < W; x++) {
        if (a[(y * W + x) * 4] > 0.004) { wet++; if (y > 470) out++; }
      }
      return { outside: +(out / Math.max(wet, 1)).toFixed(3), wetCells: wet };
    },

    // Overflow lift: four pigments dried in layers, then Mars black across
    // them (a fifth pigment in those cells), then the Lift brush. Fraction of
    // the Mars black band's extra pigment removed where the lift passed,
    // compared with Mars black alone on clean paper.
    async overflowLift(paper = 'coldPress') {
      const run = async (under) => {
        await fresh(paper);
        await withValues({ brushRadius: 30, brushPigment: 0.3 }, async () => {
          for (const name of under) {
            h.setBrush(name);
            for (let y = 250; y <= 520; y += 25) { h.lift(); await h.paint(300, y, 720, y, 20); }
            await h.wait(15); await h.wait(8, { dry: true }); await h.wait(2);
          }
        });
        // Identifiable Mars black in the lifted band (not the stain layer).
        const band = async () => { const a = await S.readPigment('Mars Black'); let v = 0; for (let y = 360; y < 410; y++) for (let x = 480; x < 540; x++) v += a[y * W + x]; return v; };
        await withValues({ brushRadius: 22, brushPigment: 0.5 }, async () => {
          h.setBrush('Mars Black');
          for (let y = 360; y <= 410; y += 20) { h.lift(); await h.paint(250, y, 770, y, 20); }
          await h.wait(15); await h.wait(8, { dry: true }); await h.wait(2);
        });
        const withBlack = await band();
        // Reference: Mars black laid on clean paper the same way (deposited
        // amount), to see how much ended up fixed in the stain layer.
        const identifiable = withBlack;
        h.setMode(2);
        await withValues({ brushRadius: 25 }, async () => {
          for (let pass = 0; pass < 3; pass++) { h.lift(); await h.paint(510, 300, 510, 470, 30); }
          await h.wait(5);
        });
        h.setMode(0);
        const after = await band();
        return { identifiable: +identifiable.toFixed(1), lifted: +((withBlack - after) / Math.max(withBlack, 1e-6)).toFixed(2) };
      };
      const out = {
        onClean: await run([]),
        overFour: await run(['Transparent Yellow Oxide', 'Perylene Green', 'Transparent Red Oxide', 'Quinacridone Rose']),
      };
      h.end();
      return out;
    },

    // Lift: dried stripes of a non-staining and a staining pigment, then the
    // Lift brush scrubbed across both. Fraction of each stripe's pigment
    // removed where the lift passed.
    async lift(paper = 'coldPress') {
      await fresh(paper);
      const names = ['Mars Black', 'French Ultramarine', 'Phthalo Blue (GS)', 'Quinacridone Rose'];
      await withValues({ brushRadius: 22, brushPigment: 0.5 }, async () => {
        for (const [k, name] of names.entries()) {
          h.setBrush(name);
          for (let y = 120 + k * 150; y <= 160 + k * 150; y += 20) { h.lift(); await h.paint(200, y, 800, y, 20); }
        }
        await h.wait(25); await h.wait(10, { dry: true }); await h.wait(2);
      });
      const band = async (y0) => { const a = await S.read(); let v = 0; for (let y = y0; y < y0 + 40; y++) for (let x = 470; x < 530; x++) v += a[(y * W + x) * 4 + 2]; return v; };
      const before = []; for (let k = 0; k < 4; k++) before.push(await band(120 + k * 150));
      h.setMode(2);
      await withValues({ brushRadius: 25 }, async () => {
        for (let pass = 0; pass < 3; pass++) { h.lift(); await h.paint(500, 80, 500, 700, 40); }
        await h.wait(5);
      });
      h.setMode(0);
      const out = {};
      for (let k = 0; k < 4; k++) out[names[k]] = +(1 - (await band(120 + k * 150)) / before[k]).toFixed(2);
      h.end();
      return out;
    },

    // Flood: a dozen overlapping wet passes, each a fresh touchdown on wet
    // paper, over a band 150-450. Fraction of wet cells outside the band
    // (plus a brush-radius margin) after a few seconds. Should be ~0.
    async flood(paper = 'coldPress') {
      await fresh(paper);
      h.setMode(1);
      await withValues({ brushRadius: 40, brushWater: 0.32 }, async () => {
        for (let y = 150; y <= 450; y += 30) { h.lift(); await h.paint(100, y, 920, y, 20); }
        await h.wait(6);
      });
      h.setMode(0);
      h.end();
      const a = await S.read();
      let wet = 0, out = 0;
      for (let y = 0; y < 768; y++) for (let x = 0; x < W; x++) {
        if (a[(y * W + x) * 4] > 0.004) { wet++; if (y < 100 || y > 500 || x < 50 || x > 970) out++; }
      }
      return +(out / Math.max(wet, 1)).toFixed(3);
    },

    // Magnet shapes: one of each under a pale Mars black wash. Screenshot.
    async shapes(paper = 'hotPress') {
      await fresh(paper);
      h.setMagnets([]);
      h.setBrush('Mars Black');
      await withValues({ brushRadius: 26, brushPigment: 0.1 }, async () => {
        for (let y = 70; y <= 700; y += 26) { h.lift(); await h.paint(50, y, 975, y, 30); }
        h.setMagnets([
          { shape: 'disc', x: 180, y: 210 },
          { shape: 'bar', x: 480, y: 210, angle: 0.3 },
          { shape: 'horseshoe', x: 810, y: 210 },
          { shape: 'ring', x: 190, y: 540 },
          { shape: 'strip', x: 500, y: 540, angle: -0.5 },
          { shape: 'sheet', x: 820, y: 540 },
        ]);
        await h.wait(35); await h.wait(10, { dry: true }); await h.wait(2);
      });
      h.end();
      return 'painted';
    },

    // Magnet: a Mars black wash with a magnet under its centre. Fraction of
    // the wash's pigment within 3 mm of the magnet, with the magnet vs a
    // control without one. Also leaves the magnet in place for screenshots.
    async magnet(paper = 'coldPress') {
      const run = async (mags) => {
        await fresh(paper);
        h.setMagnets([]);
        h.setBrush('Mars Black');
        await withValues({ brushRadius: 20, brushPigment: 0.12 }, async () => {
          for (let y = 280; y <= 490; y += 18) { h.lift(); await h.paint(360, y, 660, y, 16); }
          h.setMagnets(mags);
          await h.wait(30); await h.wait(10, { dry: true }); await h.wait(2);
        });
        const a = await S.read();
        let near = 0, total = 0;
        for (let y = 250; y < 520; y++) for (let x = 330; x < 700; x++) {
          const v = a[(y * W + x) * 4 + 2];
          total += v;
          if (Math.hypot(x - 510, y - 385) < 15) near += v;
        }
        return +(near / total * 100).toFixed(2);
      };
      const out = { none: await run([]), magnet: await run([{ x: 510, y: 385, moment: 1 }]) };
      // Leave two opposite poles in place for a screenshot.
      out.pair = await run([{ x: 450, y: 385, moment: 1 }, { x: 570, y: 385, moment: -1 }]);
      h.end();
      return out;
    },

    // Flocculation: mm-scale mottling of a pale wash on hot press with paper
    // granulation off. Coefficient of variation of 1 mm block averages of
    // deposited pigment in the interior, for a flocculating pigment
    // (ultramarine) and a non-flocculating control (quinacridone rose).
    async floc(paper = 'hotPress') {
      const cv = async (name) => {
        await fresh(paper);
        h.setBrush(name);
        await withValues({ granulation: 0, brushRadius: 20, brushPigment: 0.3 }, async () => {
          for (let y = 250; y <= 520; y += 18) { h.lift(); await h.paint(250, y, 780, y, 24); }
          await h.wait(30); await h.wait(10, { dry: true }); await h.wait(2);
        });
        const a = await S.read();
        const blocks = [];
        for (let by = 300; by < 470; by += 5) for (let bx = 320; bx < 700; bx += 5) {
          let acc = 0;
          for (let y = by; y < by + 5; y++) for (let x = bx; x < bx + 5; x++) acc += a[(y * W + x) * 4 + 2];
          blocks.push(acc / 25);
        }
        const m = blocks.reduce((s, v) => s + v, 0) / blocks.length;
        const sd = Math.sqrt(blocks.reduce((s, v) => s + (v - m) ** 2, 0) / blocks.length);
        return +(sd / m).toFixed(3);
      };
      const out = { ultramarine: await cv('French Ultramarine'), rose: await cv('Quinacridone Rose') };
      h.end();
      return out;
    },

    // Debug: water depth (w) and deposited pigment (d) along x at the wash's
    // middle row, sampled every 1 mm from outside the right edge inward,
    // at several times while it dries.
    async tideTime(paper = 'coldPress') {
      await fresh(paper);
      const out = {};
      await withValues({ granulation: 0, brushRadius: 18 }, async () => {
        for (let y = 250; y <= 520; y += 18) { h.lift(); await h.paint(250, y, 780, y, 24); }
        let t = 0;
        for (const tt of [1, 8, 16, 24, 32, 40]) {
          await h.wait(tt - t); t = tt;
          const a = await S.read();
          const row = x => { let w = 0, d = 0; for (let y = 370; y < 400; y++) { const i = (y * W + x) * 4; w += a[i]; d += a[i + 2]; } return [w / 30, d / 30]; };
          const ws = [], ds = [];
          for (let x = 805; x >= 700; x -= 5) { const [w, d] = row(x); ws.push(+(w * 100).toFixed(1)); ds.push(+(d * 100).toFixed(1)); }
          out['t' + tt] = { w: ws.join(' '), d: ds.join(' ') };
        }
      });
      h.end();
      return out;
    },

    // Tide line: deposited-pigment profile across a plain wash, from its
    // edge inward (mm steps). A real wash rises to a dark rim at the edge and
    // is flat inside; the artifact is a pale band a couple of mm in.
    async tide(paper = 'coldPress') {
      await fresh(paper);
      await withValues({ granulation: 0, brushRadius: 18 }, async () => {
        for (let y = 250; y <= 520; y += 18) { h.lift(); await h.paint(250, y, 780, y, 24); }
        await h.wait(30); await h.wait(10, { dry: true }); await h.wait(2);
      });
      h.end();
      const a = await S.read();
      let edgeX = 0;
      for (let x = 900; x > 600; x--) {
        let acc = 0;
        for (let y = 340; y < 440; y++) acc += a[(y * W + x) * 4 + 2];
        if (acc / 100 > 1e-3) { edgeX = x; break; }
      }
      const prof = [];
      for (let mm = 0; mm <= 8; mm++) {
        let acc = 0;
        for (let dx = 0; dx < 5; dx++) for (let y = 340; y < 440; y++) acc += a[(y * W + edgeX - mm * 5 - dx) * 4 + 2];
        prof.push(+(acc / 500 * 100).toFixed(2));
      }
      return prof;
    },

    // Mixed purple: a 1:1 ultramarine + quinacridone rose mix as a dense
    // square and a pale wash, like a real test card. For screenshots.
    async purple(paper = 'coldPress') {
      await fresh(paper);
      h.setBrush([['French Ultramarine', 1], ['Quinacridone Rose', 1]]);
      await withValues({ brushRadius: 20 }, async () => {
        S.values.brushPigment = 1.2;
        for (let y = 200; y <= 320; y += 16) { h.lift(); await h.paint(250, y, 400, y, 12); }
        S.values.brushPigment = 0.25;
        for (let y = 200; y <= 320; y += 16) { h.lift(); await h.paint(480, y, 800, y, 16); }
        await h.wait(25); await h.wait(10, { dry: true }); await h.wait(2);
      });
      h.end();
      return 'painted';
    },

    // Pigment chart: every pan as a heavy and a light stroke, on the current
    // paper tone. For screenshots (run with --set and h.setTone via 'tone').
    async chart(paper = 'coldPress', tone = 'natural') {
      await fresh(paper);
      h.setTone(tone);
      const names = h.pigmentNames();
      await withValues({ brushRadius: 12 }, async () => {
        for (let k = 0; k < names.length; k++) {
          const col = k % 6, row = Math.floor(k / 6);
          const x = 90 + col * 150, y = 90 + row * 170;
          h.setBrush(names[k]);
          S.values.brushPigment = 1.2;
          h.lift(); await h.paint(x, y, x + 110, y, 8);
          h.lift(); await h.paint(x, y + 22, x + 110, y + 22, 8);
          S.values.brushPigment = 0.2;
          h.lift(); await h.paint(x, y + 60, x + 110, y + 60, 8);
        }
        await h.wait(20); await h.wait(10, { dry: true }); await h.wait(2);
      });
      h.end();
      return names.length;
    },

    async chartBlack(paper = 'coldPress') { return probes.chart(paper, 'black'); },

    // Gouache over dry paint: dark stripes dried first, then white gouache
    // and titanium buff crossing them; plus white dropped into wet dark
    // paint for comparison. For screenshots.
    async cover(paper = 'coldPress') {
      await fresh(paper);
      await withValues({ brushRadius: 22, brushPigment: 1 }, async () => {
        for (const [k, name] of ['Perylene Green', 'Quinacridone Magenta', 'Phthalo Blue (GS)'].entries()) {
          h.setBrush(name);
          for (let y = 120 + k * 150; y <= 170 + k * 150; y += 20) { h.lift(); await h.paint(120, y, 600, y, 20); }
        }
        await h.wait(20); await h.wait(10, { dry: true }); await h.wait(2);
        h.setBrush('White Gouache');
        for (let x = 200; x <= 240; x += 20) { h.lift(); await h.paint(x, 90, x, 560, 25); }
        h.setBrush('Titanium Buff');
        for (let x = 420; x <= 460; x += 20) { h.lift(); await h.paint(x, 90, x, 560, 25); }
        await h.wait(20); await h.wait(10, { dry: true }); await h.wait(2);
        // Wet-in-wet: white into wet perylene green.
        h.setBrush('Perylene Green');
        for (let y = 200; y <= 400; y += 20) { h.lift(); await h.paint(700, y, 900, y, 20); }
        h.setBrush('White Gouache');
        h.lift(); await h.paint(800, 300, 802, 302, 20);
        await h.wait(20); await h.wait(10, { dry: true }); await h.wait(2);
      });
      h.end();
      return 'painted';
    },

    // Dark ground: a scattering pigment and a transparent one on black
    // paper, alone and mixed. For screenshots.
    async dark(paper = 'coldPress', opaque = 'White Gouache', clear = 'French Ultramarine') {
      await fresh(paper);
      h.setTone('black');
      await withValues({ brushRadius: 30, brushPigment: 0.8 }, async () => {
        h.setBrush(opaque);
        for (let y = 200; y <= 300; y += 25) { h.lift(); await h.paint(150, y, 870, y, 30); }
        h.setBrush(clear);
        for (let x = 250; x <= 350; x += 25) { h.lift(); await h.paint(x, 150, x, 600, 30); }
        await h.wait(25); await h.wait(10, { dry: true }); await h.wait(2);
      });
      h.setTone('natural');
      h.setBrush(clear);
      h.end();
      return 'painted';
    },

    // Multi-pigment test card: four pigments in adjacent wet bands, then
    // drops of three of them into a wet wash of the first. For screenshots.
    async palette(paper = 'coldPress', names = ['French Ultramarine', 'Quinacridone Rose', 'Transparent Red Oxide', 'Azo Condensation Yellow']) {
      await fresh(paper);
      await withValues({ brushRadius: 22 }, async () => {
        for (let k = 0; k < 4; k++) {
          h.setBrush(names[k]);
          for (let y = 120 + k * 60; y <= 150 + k * 60; y += 15) { h.lift(); await h.paint(120, y, 900, y, 30); }
        }
        await h.wait(25); await h.wait(10, { dry: true }); await h.wait(2);
        h.setBrush(names[0]);
        for (let y = 420; y <= 640; y += 18) { h.lift(); await h.paint(150, y, 870, y, 30); }
        await h.wait(1);
        for (let k = 1; k < 4; k++) { h.setBrush(names[k]); h.lift(); await h.paint(150 + k * 180, 530, 170 + k * 180, 535, 12); }
        await h.wait(25); await h.wait(10, { dry: true }); await h.wait(2);
      });
      h.setBrush(names[0]);
      h.end();
      return 'painted';
    },

    // Creep at hand-drawing speed (~1 mm per frame rather than ~2.5).
    async creepSlow(paper = 'coldPress') { return probes.creep(paper, 20); },

    // Gap: two parallel strokes with a narrow strip of dry paper between
    // them (gapMm wide). Fraction of the gap's centre line that ends up with
    // pigment, i.e. whether the water bridged. Should be 0 on sized paper
    // at ordinary wetness.
    async gap(paper = 'coldPress', gapMm = 1.5) {
      await fresh(paper);
      const r = 14, gap = Math.round(gapMm / 0.2);
      const y1 = 350, y2 = y1 + 2 * r + gap;
      await withValues({ brushRadius: r }, async () => {
        h.lift(); await h.paint(300, y1, 720, y1, 24);
        h.lift(); await h.paint(300, y2, 720, y2, 24);
        await h.wait(20); await h.wait(10, { dry: true }); await h.wait(2);
      });
      h.end();
      const a = await S.read();
      const yc = Math.round((y1 + y2) / 2);
      let bridged = 0, n = 0;
      for (let x = 320; x < 700; x++, n++) if (a[(yc * W + x) * 4 + 2] > 1e-3) bridged++;
      return +(bridged / n).toFixed(3);
    },

    // Throughput with only part of the sheet wet (a single wash), the
    // common case once dry-tile skipping is on.
    async speedPartial(paper = 'coldPress') {
      await fresh(paper);
      await withValues({ brushRadius: 20 }, async () => {
        for (let y = 300; y <= 420; y += 20) { h.lift(); await h.paint(350, y, 650, y, 10); }
      });
      const t0 = performance.now();
      await h.wait(5);
      const wall = (performance.now() - t0) / 1000;
      h.end();
      return +(5 / wall).toFixed(2);
    },

    async speed(paper = 'coldPress') {
      await fresh(paper);
      await withValues({ brushRadius: 30 }, async () => {
        for (let y = 100; y <= 660; y += 40) { h.lift(); await h.paint(100, y, 920, y, 10); }
      });
      const t0 = performance.now();
      await h.wait(5);
      const wall = (performance.now() - t0) / 1000;
      h.end();
      return +(5 / wall).toFixed(2);
    },

    // Creep: a U-shaped stroke that curves back to join itself. Fraction of
    // final pigment lying more than 1 mm outside anywhere the brush touched.
    // Should be ~0 on sized paper.
    async creep(paper = 'coldPress', framesPerSegment = 3) {
      await fresh(paper);
      const r = 14, path = [];
      for (let t = 0; t <= 1.0001; t += 1 / 60) {
        const ang = Math.PI * 0.2 + t * Math.PI * 1.8;   // most of a circle
        path.push([512 + 120 * Math.cos(ang), 384 + 120 * Math.sin(ang)]);
      }
      path.push([512 + 120 * Math.cos(Math.PI * 0.25), 384 + 120 * Math.sin(Math.PI * 0.25)]); // close it
      await withValues({ brushRadius: r }, async () => {
        for (let i = 1; i < path.length; i++) await h.paint(...path[i - 1], ...path[i], framesPerSegment);
        await h.wait(20); await h.wait(10, { dry: true }); await h.wait(2);
      });
      h.end();
      const a = await S.read();
      const near = (x, y) => {
        for (let i = 1; i < path.length; i++) {
          const [ax, ay] = path[i - 1], [bx, by] = path[i];
          const dx = bx - ax, dy = by - ay;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
          if (Math.hypot(x - ax - dx * t, y - ay - dy * t) <= r + 5) return true;
        }
        return false;
      };
      let inside = 0, outside = 0;
      for (let y = 200; y < 570; y++) for (let x = 330; x < 700; x++) {
        const v = a[(y * W + x) * 4 + 2];
        if (v <= 0) continue;
        if (near(x + 0.5, y + 0.5)) inside += v; else outside += v;
      }
      return +(outside / (inside + outside)).toFixed(3);
    },

    // Graded swatch in the style of a pigment test card: pale at the top,
    // dense at the bottom. For screenshots rather than numbers.
    async swatch(paper = 'coldPress') {
      await fresh(paper);
      await withValues({ brushRadius: 16 }, async () => {
        let i = 0;
        for (let y = 200; y <= 560; y += 16, i++) {
          S.values.brushPigment = 0.05 + 0.9 * Math.pow(i / 22, 2);
          h.lift(); await h.paint(300, y, 720, y, 24);
        }
        await h.wait(20); await h.wait(10, { dry: true }); await h.wait(2);
      });
      h.end();
      return 'painted';
    },

    // Conservation: total pigment after laying clean water over a painted
    // stroke, relative to before. Should be 1.
    async conserve(paper = 'coldPress') {
      await fresh(paper);
      const total = async () => {
        const a = await S.read();
        let p = 0;
        for (let i = 0; i < a.length; i += 4) p += a[i + 1] + a[i + 2];
        return p;
      };
      let before, after, dried;
      await withValues({ brushRadius: 16 }, async () => {
        for (let y = 300; y <= 400; y += 14) { h.lift(); await h.paint(300, y, 700, y, 20); }
        await h.wait(3);
        before = await total();
        h.setMode(1);
        for (let y = 290; y <= 410; y += 14) { h.lift(); await h.paint(280, y, 720, y, 20); }
        await h.wait(3);
        after = await total();
        await h.wait(20); await h.wait(10, { dry: true });
        dried = await total();
      });
      h.setMode(0); h.end();
      return [+(after / before).toFixed(3), +(dried / before).toFixed(3)];
    },

    // Edge darkening: peak deposited pigment near the right edge of a dried
    // wash divided by the interior mean. >1 means a dark rim.
    async edge(paper = 'coldPress') {
      await fresh(paper);
      await withValues({ granulation: 0, brushRadius: 16 }, async () => {
        for (let y = 300; y <= 460; y += 20) { h.lift(); await h.paint(300, y, 700, y, 20); }
        await h.wait(30); await h.wait(10, { dry: true }); await h.wait(2);
      });
      h.end();
      const a = await S.read();
      const prof = [];
      for (let x = 600; x <= 730; x++) {
        let acc = 0;
        for (let y = 340; y < 420; y++) acc += a[(y * W + x) * 4 + 2];
        prof.push(acc / 80);
      }
      let edgeX = 0;
      for (let i = prof.length - 1; i >= 0; i--) if (prof[i] > 1e-3) { edgeX = i; break; }
      const interior = prof.slice(0, 40).reduce((s, v) => s + v, 0) / 40;
      const peak = Math.max(...prof.slice(Math.max(edgeX - 12, 0), edgeX + 1));
      return +(peak / interior).toFixed(2);
    },

    // Bleed: dense paint, then clean water laid alongside it. Pigment that
    // crossed into the water side after 1 s and 4 s.
    async bleed(paper = 'coldPress') {
      await fresh(paper);
      const out = [];
      await withValues({ brushRadius: 16, brushPigment: 0.8 }, async () => {
        for (let y = 300; y <= 400; y += 12) { h.lift(); await h.paint(300, y, 500, y, 16); }
        await h.wait(1);
        h.setMode(1);
        for (let y = 300; y <= 400; y += 12) { h.lift(); await h.paint(490, y, 700, y, 16); }
        await h.wait(1); out.push(await region(530, 720, 280, 420));
        await h.wait(3); out.push(await region(530, 720, 280, 420));
      });
      h.setMode(0); h.end();
      return out;
    },

    // Wet-in-wet: a dab of dense paint dropped into a clean wet wash.
    // [r50, r90] in mm at 0.5 s and 3 s.
    async drop(paper = 'coldPress') {
      await fresh(paper);
      const out = [];
      h.setMode(1);
      await withValues({ brushRadius: 20 }, async () => {
        for (let y = 250; y <= 550; y += 15) { h.lift(); await h.paint(350, y, 700, y, 20); }
      });
      await h.wait(1);
      h.setMode(0);
      await withValues({ brushRadius: 8, brushPigment: 0.8 }, async () => {
        await h.paint(525, 400, 526, 400, 12);
        await h.wait(0.5); out.push(await radius(525, 400));
        await h.wait(2.5); out.push(await radius(525, 400));
      });
      h.end();
      return out;
    },
  };

  window.__probes = { ...probes, withValues };
})();
