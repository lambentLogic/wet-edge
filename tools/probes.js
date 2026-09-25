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
    // Dark ground: interference lilac and ultramarine on black paper, alone
    // and glazed over each other. For screenshots.
    async dark(paper = 'coldPress') {
      await fresh(paper);
      h.setTone('black');
      h.setSlotPigment(3, 'Interference Lilac');
      await withValues({ brushRadius: 30, brushPigment: 0.8 }, async () => {
        h.setSlot(3);
        for (let y = 200; y <= 300; y += 25) { h.lift(); await h.paint(150, y, 870, y, 30); }
        h.setSlot(0);
        for (let x = 250; x <= 350; x += 25) { h.lift(); await h.paint(x, 150, x, 600, 30); }
        await h.wait(25); await h.wait(10, { dry: true }); await h.wait(2);
      });
      h.end();
      return 'painted';
    },

    // Multi-pigment test card: four pigments side by side and overlapping,
    // plus wet-in-wet mixes. For screenshots.
    async palette(paper = 'coldPress') {
      await fresh(paper);
      await withValues({ brushRadius: 22 }, async () => {
        for (let k = 0; k < 4; k++) {
          h.setSlot(k);
          for (let y = 120 + k * 60; y <= 150 + k * 60; y += 15) { h.lift(); await h.paint(120, y, 900, y, 30); }
        }
        await h.wait(25); await h.wait(10, { dry: true }); await h.wait(2);
        // Wet-in-wet: blue wash, then each other pigment dropped in.
        h.setSlot(0);
        for (let y = 420; y <= 640; y += 18) { h.lift(); await h.paint(150, y, 870, y, 30); }
        await h.wait(1);
        for (let k = 1; k < 4; k++) { h.setSlot(k); h.lift(); await h.paint(150 + k * 180, 530, 170 + k * 180, 535, 12); }
        await h.wait(25); await h.wait(10, { dry: true }); await h.wait(2);
        h.setSlot(0);
      });
      h.end();
      return 'painted';
    },

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

    // Throughput: simulated seconds per wall-clock second over a wet wash.
    // Needs to stay above 1 for the interactive app to run in real time.
    // Creep at hand-drawing speed (~1 mm per frame rather than ~2.5).
    async creepSlow(paper = 'coldPress') { return probes.creep(paper, 20); },

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
