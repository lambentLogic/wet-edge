// Spectral colour: 16 bands, 400-700 nm in 20 nm steps. Kubelka-Munk mixing
// per wavelength is what makes pigments mix like paint (blue + yellow makes
// green because each absorbs where the other doesn't), where per-RGB-channel
// mixing is only an approximation.
//
// Reflectance spectra are turned into colour through the CIE 1931 2-degree
// observer under D65 light, then linear sRGB, normalised so a perfect white
// reflector is (1, 1, 1).

export const NB = 16;
export const BANDS = Array.from({ length: NB }, (_, k) => 400 + 20 * k);

// CIE 1931 2-degree colour matching functions at BANDS.
const CMF = [
  [0.01431, 0.000396, 0.06785], [0.13438, 0.0040, 0.64560], [0.34828, 0.0230, 1.74706], [0.29080, 0.0600, 1.66920],
  [0.09564, 0.13902, 0.81295], [0.00490, 0.3230, 0.27200], [0.06327, 0.7100, 0.07825], [0.29040, 0.9540, 0.02030],
  [0.59450, 0.9950, 0.00390], [0.91630, 0.8700, 0.00165], [1.06220, 0.6310, 0.00080], [0.85445, 0.3810, 0.00019],
  [0.44790, 0.1750, 0.00002], [0.16490, 0.0610, 0.0], [0.04677, 0.0170, 0.0], [0.01136, 0.004102, 0.0],
];
// CIE D65 relative spectral power at BANDS.
const D65 = [82.75, 93.43, 104.86, 117.81, 115.92, 109.35, 104.79, 104.41, 100.0, 95.79, 90.01, 87.70, 83.70, 80.21, 78.28, 71.61];
const XYZ_TO_RGB = [[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]];

// TO_RGB[c][k]: linear sRGB channel c from band k of a reflectance spectrum.
export const TO_RGB = (() => {
  const m = [[], [], []];
  for (let k = 0; k < NB; k++) {
    const xyz = CMF[k].map(v => v * D65[k]);
    for (let c = 0; c < 3; c++) m[c][k] = XYZ_TO_RGB[c][0] * xyz[0] + XYZ_TO_RGB[c][1] * xyz[1] + XYZ_TO_RGB[c][2] * xyz[2];
  }
  // Normalise so a flat 100% reflector is white.
  for (let c = 0; c < 3; c++) { const s = m[c].reduce((a, b) => a + b, 0); m[c] = m[c].map(v => v / s); }
  return m;
})();

export const spectrumToLinear = R => TO_RGB.map(row => row.reduce((a, v, k) => a + v * R[k], 0));

export const srgbToLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055);

export function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => srgbToLinear(v / 255));
}

// A smooth reflectance spectrum (0..1) with the given linear sRGB colour:
// among spectra that hit the colour, the one with the least wiggle
// (squared second differences). Solved as regularised least squares; bands
// that come out below 0 or above 1 are pinned there and the rest re-solved.
// Used for colours with no measured spectrum (paper tones, pigments without
// data). Real materials' reflectances are smooth like this.
export function upsample(rgb, { smooth = 1e-3 } = {}) {
  const fixed = new Array(NB).fill(null);
  let R = new Array(NB).fill(0.5);
  for (let pass = 0; pass < 12; pass++) {
    // Normal equations: (W M^T M + smooth D^T D) R = W M^T rgb, with pinned bands.
    const A = Array.from({ length: NB }, () => new Array(NB).fill(0)), b = new Array(NB).fill(0);
    const W = 1e3;
    for (let c = 0; c < 3; c++) for (let i = 0; i < NB; i++) {
      b[i] += W * TO_RGB[c][i] * rgb[c];
      for (let j = 0; j < NB; j++) A[i][j] += W * TO_RGB[c][i] * TO_RGB[c][j];
    }
    for (let k = 1; k < NB - 1; k++) {
      const d = [[k - 1, 1], [k, -2], [k + 1, 1]];
      for (const [i, di] of d) for (const [j, dj] of d) A[i][j] += smooth * di * dj;
    }
    for (let k = 0; k < NB; k++) if (fixed[k] !== null) {
      for (let j = 0; j < NB; j++) { b[j] -= A[j][k] * fixed[k]; A[j][k] = 0; A[k][j] = 0; }
      A[k][k] = 1; b[k] = fixed[k];
    }
    R = solve(A, b);
    let changed = false;
    for (let k = 0; k < NB; k++) {
      if (fixed[k] === null && R[k] < 1e-3) { fixed[k] = 1e-3; changed = true; }
      if (fixed[k] === null && R[k] > 1) { fixed[k] = 1; changed = true; }
    }
    if (!changed) break;
  }
  return R.map(v => Math.min(1, Math.max(1e-3, v)));
}

// A spectrum with the given linear sRGB colour, shaped like a measured one:
// R = prior * c, with c as smooth as possible (squared second differences),
// so the prior's absorption bands and edges survive while level and tilt
// adjust to hit the colour. Used to fit measured acrylic spectra to the
// painter's watercolour swatches.
export function upsampleNear(rgb, prior, { smooth = 0.03 } = {}) {
  const p = prior.map(v => Math.max(v, 1e-3));
  const fixed = new Array(NB).fill(null);
  let c = new Array(NB).fill(1);
  for (let pass = 0; pass < 12; pass++) {
    const A = Array.from({ length: NB }, () => new Array(NB).fill(0)), b = new Array(NB).fill(0);
    const W = 1e3;
    for (let ch = 0; ch < 3; ch++) for (let i = 0; i < NB; i++) {
      const mi = TO_RGB[ch][i] * p[i];
      b[i] += W * mi * rgb[ch];
      for (let j = 0; j < NB; j++) A[i][j] += W * mi * TO_RGB[ch][j] * p[j];
    }
    for (let k = 1; k < NB - 1; k++) {
      const d = [[k - 1, 1], [k, -2], [k + 1, 1]];
      for (const [i, di] of d) for (const [j, dj] of d) A[i][j] += smooth * di * dj;
    }
    for (let k = 0; k < NB; k++) A[k][k] += 1e-7;
    for (let k = 0; k < NB; k++) if (fixed[k] !== null) {
      for (let j = 0; j < NB; j++) { b[j] -= A[j][k] * fixed[k]; A[j][k] = 0; A[k][j] = 0; }
      A[k][k] = 1; b[k] = fixed[k];
    }
    c = solve(A, b);
    let changed = false;
    for (let k = 0; k < NB; k++) {
      if (fixed[k] === null && c[k] * p[k] < 1e-3) { fixed[k] = 1e-3 / p[k]; changed = true; }
      if (fixed[k] === null && c[k] * p[k] > 1) { fixed[k] = 1 / p[k]; changed = true; }
    }
    if (!changed) break;
  }
  return c.map((v, k) => Math.min(1, Math.max(1e-3, v * p[k])));
}

// A pigment-like spectrum with the given linear sRGB colour: a sigmoid of
// a quadratic in wavelength (Jakob & Hanika 2019), R = s(c0 t^2 + c1 t + c2),
// t = wavelength scaled to -1..1. Saturated colours get the step-like
// absorption edges real pigments have (a yellow absorbs blue and is clear
// from about 520 nm); pale ones stay gently curved. Three unknowns for
// three channels, solved by damped Newton steps.
export function upsampleSigmoid(rgb) {
  const t = BANDS.map(nm => (nm - 550) / 150);
  const spec = c => t.map(x => { const z = c[0] * x * x + c[1] * x + c[2]; return 1 / (1 + Math.exp(-z)); });
  const target = rgb.map(v => Math.min(Math.max(v, 1e-4), 0.9999));
  let c = [0, 0, 0];
  for (let it = 0; it < 200; it++) {
    const f = spectrumToLinear(spec(c)).map((v, k) => v - target[k]);
    if (Math.hypot(...f) < 1e-7) break;
    const J = [0, 1, 2].map(j => { const d = c.slice(); d[j] += 1e-4; return spectrumToLinear(spec(d)).map((v, k) => (v - target[k] - f[k]) / 1e-4); });
    // Solve J^T-layout (J[j][k] = df_k/dc_j) with a little damping.
    const A = [0, 1, 2].map(k => [0, 1, 2].map(j => J[j][k] + (j === k ? 1e-6 : 0)));
    const step = solve(A, f.map(v => -v));
    const len = Math.hypot(...step), scale = len > 5 ? 5 / len : 1;
    c = c.map((v, j) => v + step[j] * scale);
  }
  return spec(c).map(v => Math.min(1, Math.max(1e-3, v)));
}

// Gaussian elimination with partial pivoting.
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let v = M[r][n];
    for (let k = r + 1; k < n; k++) v -= M[r][k] * x[k];
    x[r] = v / M[r][r];
  }
  return x;
}
