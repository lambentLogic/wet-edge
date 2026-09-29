// Procedural paper height fields in [0, 1], plus presets that pair each
// surface with the physics of that paper (absorbency, wicking, staining).

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth random undulation.
function addValueNoise(h, W, H, scale, amp, rand) {
  const gw = Math.ceil(W / scale) + 2, gh = Math.ceil(H / scale) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  for (let y = 0; y < H; y++) {
    const fy = y / scale, iy = Math.floor(fy);
    let ty = fy - iy; ty = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < W; x++) {
      const fx = x / scale, ix = Math.floor(fx);
      let tx = fx - ix; tx = tx * tx * (3 - 2 * tx);
      const a = grid[iy * gw + ix], b = grid[iy * gw + ix + 1];
      const c = grid[(iy + 1) * gw + ix], d = grid[(iy + 1) * gw + ix + 1];
      h[y * W + x] += amp * ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
    }
  }
}

// Overlapping soft hills of random size and height: the irregular "tooth"
// that felts press into mould-made cotton paper. Summing Gaussians (rather
// than taking the nearest bump) avoids a cell-like network of seams.
function addTooth(h, W, H, scale, amp, rand) {
  const gw = Math.ceil(W / scale) + 1, gh = Math.ceil(H / scale) + 1;
  const n = gw * gh;
  const px = new Float32Array(n), py = new Float32Array(n), ph = new Float32Array(n), pk = new Float32Array(n);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i;
    px[k] = (i + rand()) * scale; py[k] = (j + rand()) * scale;
    ph[k] = 0.3 + 0.7 * rand();
    const sigma = scale * (0.3 + 0.35 * rand());
    pk[k] = 1 / (2 * sigma * sigma);
  }
  for (let y = 0; y < H; y++) {
    const cj = Math.floor(y / scale);
    for (let x = 0; x < W; x++) {
      const ci = Math.floor(x / scale);
      let acc = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
        const k = j * gw + i, dx = x - px[k], dy = y - py[k];
        acc += ph[k] * Math.exp(-(dx * dx + dy * dy) * pk[k]);
      }
      h[y * W + x] += amp * acc;
    }
  }
}

function addFibers(h, W, H, rand, { density, minLen, maxLen, strength, wander }) {
  const count = Math.floor(W * H * density);
  for (let f = 0; f < count; f++) {
    let x = rand() * W, y = rand() * H, ang = rand() * Math.PI * 2;
    const len = minLen + rand() * (maxLen - minLen);
    const s0 = strength * (0.5 + rand());
    for (let s = 0; s < len; s++) {
      ang += (rand() - 0.5) * wander;
      x += Math.cos(ang); y += Math.sin(ang);
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 1 || yi < 1 || xi >= W - 1 || yi >= H - 1) break;
      h[yi * W + xi] += s0;
      h[yi * W + xi + 1] += s0 * 0.4;
      h[(yi + 1) * W + xi] += s0 * 0.4;
    }
  }
}

function blur3(h, W, H) {
  const out = new Float32Array(h.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let acc = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) { acc += h[yy * W + xx]; n++; }
    }
    out[y * W + x] = acc / n;
  }
  return out;
}

// Physical scale: one grid cell is CELL_MM millimetres, so the 1024x768
// canvas is about 20 x 15 cm. All paper features below are given in mm.
export const CELL_MM = 0.2;

// gen:    how the surface is built (sizes in mm). `contrast` squeezes the normalized height
//         toward 0.5, so smooth papers stay smooth after normalization.
// knobs:  physics overrides applied when the preset is chosen.
// color:  paper white (linear-ish RGB).
export const PAPERS = {
  coldPress: {
    name: 'Cold-press cotton',
    color: [0.975, 0.97, 0.955],
    gen: {
      noise: [[24, 0.25], [6, 0.15], [1, 0.1], [0.4, 0.08]],
      tooth: [[0.8, 0.45], [0.4, 0.2]],
      fibers: { density: 1 / 1500, minLen: 2, maxLen: 6, strength: 0.05, wander: 0.4 },
      contrast: 1, blurPasses: 1,
    },
    knobs: {
      sizing: 0.8,
      paperRelief: 0.01, absorption: 0.05, capacityMin: 0.03, capacityMax: 0.12,
      capillarySpread: 0.1, capillaryMin: 0.02, dampThreshold: 0.05, staining: 1, paperShade: 0.05,
    },
  },
  hotPress: {
    name: 'Hot-press cotton',
    color: [0.975, 0.965, 0.935],
    gen: {
      noise: [[32, 0.3], [8, 0.2], [0.6, 0.1]],
      tooth: [[0.5, 0.2]],
      fibers: { density: 1 / 2500, minLen: 2, maxLen: 6, strength: 0.03, wander: 0.4 },
      contrast: 0.3, blurPasses: 2,
    },
    knobs: {
      sizing: 0.9,
      paperRelief: 0.0035, absorption: 0.06, capacityMin: 0.03, capacityMax: 0.07,
      capillarySpread: 0.06, capillaryMin: 0.025, dampThreshold: 0.05, staining: 0.7, paperShade: 0.06,
    },
  },
  rough: {
    name: 'Rough cotton',
    color: [0.965, 0.95, 0.91],
    gen: {
      noise: [[18, 0.35], [5, 0.2], [0.4, 0.08]],
      tooth: [[2.5, 0.7], [1.2, 0.3], [0.5, 0.1]],
      fibers: { density: 1 / 1500, minLen: 2, maxLen: 6, strength: 0.05, wander: 0.4 },
      contrast: 1, blurPasses: 1,
    },
    knobs: {
      sizing: 0.75,
      paperRelief: 0.04, absorption: 0.05, capacityMin: 0.02, capacityMax: 0.16,
      capillarySpread: 0.1, capillaryMin: 0.02, dampThreshold: 0.06, staining: 1, paperShade: 0.14,
    },
  },
  // After Strathmore 500 mixed media, vellum (190 gsm): 100% cotton,
  // internally sized, light tooth. Values mapped from maker specs and user
  // reports (absorbs about like 140 lb cold press, lifts moderately, soft
  // edges, little texture); tooth and capacity are estimates.
  vellum: {
    name: 'Mixed-media vellum (Strathmore 500-like)',
    color: [0.975, 0.972, 0.96],
    gen: {
      noise: [[20, 0.2], [5, 0.12], [0.6, 0.12]],
      tooth: [[0.25, 0.3], [0.2, 0.15]],
      fibers: { density: 1 / 3000, minLen: 1, maxLen: 3, strength: 0.02, wander: 0.5 },
      contrast: 0.45, blurPasses: 1,
    },
    knobs: {
      sizing: 0.65,
      paperRelief: 0.007, absorption: 0.03, capacityMin: 0.018, capacityMax: 0.072,
      capillarySpread: 0.16, capillaryMin: 0.02, dampThreshold: 0.035, staining: 1.15, paperShade: 0.04,
    },
  },
  washi: {
    name: 'Washi (kozo)',
    color: [0.955, 0.935, 0.88],
    gen: {
      noise: [[19, 0.35], [5, 0.25], [1.2, 0.2], [0.4, 0.15]],
      tooth: [],
      fibers: { density: 1 / 180, minLen: 6, maxLen: 28, strength: 0.12, wander: 0.2 },
      contrast: 1, blurPasses: 1,
    },
    knobs: {
      sizing: 0.15,
      paperRelief: 0.013, absorption: 0.06, capacityMin: 0.06, capacityMax: 0.2,
      capillarySpread: 0.2, capillaryMin: 0.01, dampThreshold: 0.03, staining: 1.5, paperShade: 0.12,
    },
  },
  yupo: {
    name: 'Yupo (synthetic)',
    color: [0.985, 0.985, 0.98],
    gen: {
      noise: [[40, 0.5], [10, 0.3], [0.8, 0.2]],
      tooth: [],
      fibers: null,
      contrast: 0.08, blurPasses: 2,
    },
    knobs: {
      sizing: 0,
      paperRelief: 0.007, absorption: 0.0005, capacityMin: 0.002, capacityMax: 0.005,
      capillarySpread: 0.01, capillaryMin: 0.05, dampThreshold: 1.0, staining: 0.2, paperShade: 0.02,
    },
  },
};

export const DEFAULT_PAPER = 'coldPress';

// Paper tone, independent of texture. 'natural' uses the preset's own colour.
// Dark and toned grounds matter for opaque and scattering paints (gouache,
// interference mica), which show up by scattering light back.
export const TONES = {
  natural: { name: 'Natural', color: null },
  white:   { name: 'Bright white', color: [0.98, 0.98, 0.975] },
  cream:   { name: 'Cream', color: [0.96, 0.93, 0.84] },
  grey:    { name: 'Grey', color: [0.55, 0.55, 0.54] },
  tan:     { name: 'Tan', color: [0.72, 0.62, 0.48] },
  blue:    { name: 'Blue-grey', color: [0.42, 0.47, 0.54] },
  black:   { name: 'Black', color: [0.035, 0.035, 0.035] },
};

export function makePaper(W, H, preset = PAPERS[DEFAULT_PAPER], seed = (Math.random() * 1e9) | 0) {
  const g = preset.gen;
  const cells = mm => Math.max(mm / CELL_MM, 1);
  const rand = mulberry32(seed);
  let h = new Float32Array(W * H);
  for (const [mm, amp] of g.noise) addValueNoise(h, W, H, cells(mm), amp, rand);
  for (const [mm, amp] of g.tooth) addTooth(h, W, H, cells(mm), amp, rand);
  if (g.fibers) {
    const f = g.fibers;
    addFibers(h, W, H, rand, { ...f, minLen: cells(f.minLen), maxLen: cells(f.maxLen) });
  }
  for (let i = 0; i < g.blurPasses; i++) h = blur3(h, W, H);
  let lo = Infinity, hi = -Infinity;
  for (const v of h) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < h.length; i++) h[i] = 0.5 + ((h[i] - lo) / (hi - lo) - 0.5) * g.contrast;
  return h;
}
