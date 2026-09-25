// Procedural paper height field in [0, 1]: multi-scale value noise for the
// tooth, plus short wandering fibers pressed into the sheet.

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

function addFibers(h, W, H, rand) {
  const count = Math.floor((W * H) / 220);
  for (let f = 0; f < count; f++) {
    let x = rand() * W, y = rand() * H, ang = rand() * Math.PI * 2;
    const len = 15 + rand() * 60, strength = 0.08 + rand() * 0.12;
    for (let s = 0; s < len; s++) {
      ang += (rand() - 0.5) * 0.25;
      x += Math.cos(ang); y += Math.sin(ang);
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 1 || yi < 1 || xi >= W - 1 || yi >= H - 1) break;
      h[yi * W + xi] += strength;
      h[yi * W + xi + 1] += strength * 0.4;
      h[(yi + 1) * W + xi] += strength * 0.4;
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

export function makePaper(W, H, seed = (Math.random() * 1e9) | 0) {
  const rand = mulberry32(seed);
  let h = new Float32Array(W * H);
  addValueNoise(h, W, H, 96, 0.35, rand);
  addValueNoise(h, W, H, 24, 0.25, rand);
  addValueNoise(h, W, H, 6, 0.2, rand);
  addValueNoise(h, W, H, 2, 0.15, rand);
  addFibers(h, W, H, rand);
  h = blur3(h, W, H);
  let lo = Infinity, hi = -Infinity;
  for (const v of h) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - lo) / (hi - lo);
  return h;
}
