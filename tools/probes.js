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
        for (let y = 300; y <= 400; y += 14) await h.paint(300, y, 700, y, 20);
        await h.wait(3);
        before = await total();
        h.setMode(1);
        for (let y = 290; y <= 410; y += 14) await h.paint(280, y, 720, y, 20);
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
        for (let y = 300; y <= 460; y += 20) await h.paint(300, y, 700, y, 20);
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
        for (let y = 300; y <= 400; y += 12) await h.paint(300, y, 500, y, 16);
        await h.wait(1);
        h.setMode(1);
        for (let y = 300; y <= 400; y += 12) await h.paint(490, y, 700, y, 16);
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
        for (let y = 250; y <= 550; y += 15) await h.paint(350, y, 700, y, 20);
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
