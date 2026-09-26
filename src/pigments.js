// The paint box: a real 23-pan palette.
//
// Colour: masstone and tint hex values are estimates from swatch
// descriptions (research notes, 2026-09-25), not measurements. Replace them
// with scans of real swatches when available. Kubelka-Munk absorption (K)
// and scattering (S) per RGB channel are fitted from them (see fitKM): the
// masstone is taken as a heavy application (thickness MASS_X) and the tint
// as a light wash (TINT_X), both over white paper, and K and S are solved
// together so both colours are reproduced. The transparency rating is a weak
// prior on S, which settles channels the colours say little about (a
// yellow's red channel, say) and is all there is for pigments without a
// tint colour.
//
// Physical properties are relative to French ultramarine (= 1), mapped from
// handprint.com ratings where they exist and maker data otherwise:
//   density      settling speed. Minerals (heavy, coarse) settle fast;
//                synthetic organics (fine) stay suspended longer.
//   staining     grip on paper fibres once settled (resists lifting).
//   granulation  how strongly settling favours the paper's valleys.
//   flocculation how strongly particles clump onto their own kind.
//   mobility     how far it travels by diffusion / Marangoni flow wet-in-wet
//                (phthalos push through a wash; "inert" pigments stay put).
//   wick         how much the paper's capillary flow carries past the wet
//                edge (the soft halo staining organics leave).
//   load         pigment carried per brushful relative to watercolour (1):
//                gouache is paint at a much higher pigment-to-water ratio.
//   magnetic     magnetic susceptibility relative to Mars black (magnetite);
//                0 for everything else. Not used by the physics yet.

import { upsample, hexToLinear, NB } from './spectral.js';

const PAPER_WHITE = 0.97;
const MASS_X = 2.0;
const TINT_X = 0.35;
const OPACITY_S = { transparent: 0.04, semitransparent: 0.2, semiopaque: 0.8, opaque: 2.5 };

// Staining / granulation ratings to multipliers (ultramarine: low-medium
// staining, strong granulation).
const STAIN = { low: 0.7, lowmed: 1, medium: 1.5, high: 2.5 };
const GRAN = { none: 0, slight: 0.3, moderate: 0.6, strong: 1 };

function hexToRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
}

// Kubelka-Munk reflectance of a layer (K, S, thickness x) over a ground.
function kmReflect(K, S, x, Rg) {
  const a = 1 + K / S, b = Math.sqrt(a * a - 1);
  const bs = Math.min(b * S * x, 20), sh = Math.sinh(bs), c = a * sh + b * Math.cosh(bs);
  const R = sh / c, T = b / c;
  return R + T * T * Rg / (1 - R * Rg);
}

// Fit K per channel and a single S so a heavy application reproduces the
// masstone and a light wash the tint. Scattering comes from particle size and
// refractive index and is close to flat across the visible range; colour is
// carried by absorption. A per-channel S is unconstrained by colours seen
// only over white paper, and produced nonsense on dark grounds (a green
// bismuth vanadate).
//
// Scattering is set by how far the pigment's refractive index is from the
// binder's (gum arabic, ~1.5), not by its transparency rating: ratings like
// "semi-transparent" often reflect a pigment's darkness and strength. So
// pigments with a known low index (organics, ultramarine, sub-micron oxides)
// get a fixed low `scatter`, and the fit finds their tinting strength
// instead: how much thinner their light wash is than their masstone. A
// concentrated film of such a pigment is dark and can't lighten black.
// High-index pigments (titanium dioxide, bismuth vanadate, opaque iron
// oxides) fit S, with the transparency rating as a weak prior.
function fitKM(masstone, tint, opacity, scatter) {
  return fitChannels(hexToRGB(masstone), tint ? hexToRGB(tint) : null, opacity, scatter);
}

// The same fit for any set of channels (RGB above; spectral bands below).
function fitChannels(Rm, Rt, opacity, scatter) {
  const prior = Math.log(scatter ?? OPACITY_S[opacity]);
  const kGrid = [], sGrid = [];
  for (let v = Math.log(1e-3); v <= Math.log(40); v += 0.05) kGrid.push(v);
  if (scatter) sGrid.push(prior);
  else for (let v = Math.log(1e-3); v <= Math.log(40); v += 0.05) sGrid.push(v);
  const tintXs = scatter && Rt ? [0.08, 0.12, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0] : [TINT_X];
  let best = Infinity, bestK = null, bestS = 0;
  for (const tx of tintXs) for (const ls of sGrid) {
    const s = Math.exp(ls);
    let total = 1e-3 * (ls - prior) ** 2;
    const K = [];
    for (let ch = 0; ch < Rm.length; ch++) {
      let e = Infinity, kb = 0;
      for (const lk of kGrid) {
        const k = Math.exp(lk);
        let err = (kmReflect(k, s, MASS_X, PAPER_WHITE) - Rm[ch]) ** 2;
        if (Rt) err += (kmReflect(k, s, tx, PAPER_WHITE) - Rt[ch]) ** 2;
        if (err < e) { e = err; kb = k; }
      }
      total += e; K.push(kb);
    }
    if (total < best) { best = total; bestK = K; bestS = s; }
  }
  return { K: bestK.map(v => +v.toFixed(5)), S: Rm.map(() => +bestS.toFixed(5)) };
}

// Organic pigments have low refractive indices: little scattering.
const organic = { kind: 'organic', magnetic: 0, scatter: 0.04, density: 0.3, granulation: 0, flocculation: 0, mobility: 1.5, wick: 0.5 };
const mineral = { kind: 'mineral', magnetic: 0, density: 1.3, flocculation: 0.2, mobility: 0.8, wick: 0 };

const PANS = [
  { name: 'Phthalo Green', code: 'PG7', masstone: '#00594A', tint: '#1FA58C', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 2.2, wick: 0.7 },
  { name: 'Phthalo Blue (GS)', code: 'PB15:3', masstone: '#0B3A7E', tint: '#1C8FD8', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 2.2, wick: 0.7 },
  { name: 'Phthalo Turquoise', code: 'PB16', masstone: '#005F6E', tint: '#2CB3C2', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 2, wick: 0.6 },
  // Hostaperm Blue R5R; discontinued industrially, sold by handmade makers.
  // Painter's note: dark and strong, lower chroma than PV23 or PB29 either
  // side of it. A lower-chroma fit (#28284A / #65689A) was tried and read
  // worse; the research estimate is kept for now.
  { name: 'Benzimidazolone Blue', code: 'PB80', masstone: '#2E2A7A', tint: '#6C6FC4', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 2, wick: 0.6 },
  { name: 'French Ultramarine', code: 'PB29', masstone: '#20308E', tint: '#5A6FD0', opacity: 'semitransparent',
    ...mineral, scatter: 0.06, density: 1, staining: STAIN.lowmed, granulation: GRAN.strong, flocculation: 1, mobility: 1 },
  { name: 'Dioxazine Violet', code: 'PV23', masstone: '#3A1F5E', tint: '#8A6FC0', opacity: 'semitransparent',
    ...organic, staining: STAIN.high, mobility: 1.5 },
  { name: 'Perylene Violet', code: 'PV29', masstone: '#4A2331', tint: '#B08090', opacity: 'semitransparent',
    ...organic, staining: STAIN.medium, mobility: 1.2 },
  // Painter (2026-09-26): quin rose and magenta didn't get as dark as
  // rubine at the same load; heavy quinacridone is deep. Masstones deepened.
  { name: 'Quinacridone Magenta', code: 'PR122', masstone: '#861A5C', tint: '#E07AB5', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 1.7 },
  { name: 'Quinacridone Rose', code: 'PV19', masstone: '#A3164A', tint: '#EF8FA8', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 1.7 },
  // Painter: "a lil less ruby-dark than I'd expect and more pink" with the
  // tint at #E07090 (2026-09-26): deeper ruby masstone, raspberry-red tint.
  { name: 'Pyrrole Rubine', code: 'PR264', masstone: '#760B28', tint: '#CC4058', opacity: 'semitransparent',
    ...organic, staining: STAIN.medium, mobility: 1.3 },
  // "Blooms very readily" yet "inert wet in wet" (handprint).
  { name: 'Pyrrole Scarlet', code: 'PR255', masstone: '#D8321E', tint: '#F2826A', opacity: 'semitransparent',
    ...organic, scatter: undefined, staining: STAIN.high, granulation: 0.1, mobility: 0.8 },
  // Rated transparent, but shows up on a dark ground (painter's
  // observation), so its scattering is fitted rather than fixed low.
  { name: 'Perylene Maroon', code: 'PR179', masstone: '#5A1A1E', tint: '#B8606A', opacity: 'semitransparent',
    ...organic, scatter: undefined, staining: STAIN.high, mobility: 1.2 },
  { name: 'Perylene Green', code: 'PBk31', masstone: '#1E2B24', tint: '#5E7F74', opacity: 'semitransparent',
    ...organic, staining: STAIN.medium, mobility: 1.2 },
  // "Inactive wet in wet but blossoms when rewetted" (handprint).
  { name: 'Isoindolinone Yellow', code: 'PY110', masstone: '#E07A10', tint: '#F7B84A', opacity: 'transparent',
    ...organic, staining: STAIN.medium, mobility: 0.8 },
  { name: 'Azo Condensation Yellow', code: 'PY128', masstone: '#E8D400', tint: '#F2E24A', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 1.4 },
  // Inorganic but fine; "very inert with water" (handprint).
  { name: 'Bismuth Vanadate Yellow', code: 'PY184', masstone: '#F4D020', tint: '#F8E27A', opacity: 'semiopaque',
    ...mineral, staining: STAIN.medium, granulation: GRAN.none, flocculation: 0, mobility: 0.5 },
  { name: 'Indian Red', code: 'PR101', masstone: '#7A2E24', tint: '#C08070', opacity: 'semiopaque',
    ...mineral, density: 1.5, staining: STAIN.lowmed, granulation: GRAN.moderate },
  // Sub-micron oxide, but granulates "in threads" in DS's formulation.
  { name: 'Transparent Red Oxide', code: 'PR101', masstone: '#9A3A1A', tint: '#D88050', opacity: 'transparent',
    ...mineral, scatter: 0.04, density: 0.9, staining: STAIN.low, granulation: GRAN.moderate, flocculation: 0.5 },
  { name: 'Transparent Yellow Oxide', code: 'PY42', masstone: '#B37A1E', tint: '#E0B060', opacity: 'transparent',
    ...mineral, scatter: 0.04, density: 0.9, staining: STAIN.low, granulation: GRAN.moderate, flocculation: 0.3 },
  // Da Vinci natural raw umber; granulation seen wet largely vanishes dry.
  { name: 'Raw Umber', code: 'PBr7', masstone: '#4A3F2E', tint: '#A09A80', opacity: 'transparent',
    ...mineral, scatter: 0.06, staining: STAIN.medium, granulation: GRAN.slight },
  // Synthetic magnetite, Fe3O4: a heavy, granulating, low-staining warm black
  // with a high refractive index, and ferrimagnetic. It moves under a magnet
  // while wet (the magnetism feature in the spec). Colours are estimates.
  { name: 'Mars Black', code: 'PBk11', masstone: '#1F1D1C', tint: '#7B7874', opacity: 'semiopaque',
    ...mineral, density: 1.7, staining: STAIN.low, granulation: GRAN.moderate, flocculation: 0.4, mobility: 0.7,
    magnetic: 1 },
  // A dropped brushload displaces pigment in a moist wash (DS).
  { name: 'Titanium Buff', code: 'PW6:1', masstone: '#D9C9A8', tint: null, opacity: 'semiopaque',
    ...mineral, density: 1.2, staining: STAIN.low, granulation: GRAN.moderate, mobility: 1 },
  // Gouache: covers dark paint as a near-white line at a working load
  // (painter's test card), so it carries 3x the pigment per brushful.
  { name: 'White Gouache', code: 'PW6', masstone: '#F7F5F0', tint: null, opacity: 'opaque',
    ...mineral, density: 1.2, staining: STAIN.low, granulation: GRAN.none, flocculation: 0, load: 3 },
  // Pearlescent mica. Really specular (angle-dependent flakes); rendered for
  // now as an opaque gold scatterer. See the flake layer on the roadmap.
  { name: 'Arabic Gold (Coliro)', code: 'mica', masstone: '#C9A24A', tint: null, opacity: 'opaque',
    ...mineral, density: 1.6, staining: STAIN.low, granulation: GRAN.slight, flocculation: 0, mobility: 0.7 },
];

// Spectral K and S (16 bands, see spectral.js), fitted the same way to
// masstone and tint spectra. Until measured spectra are in, those spectra
// are the smoothest ones with the swatch colours (in linear light, as
// physics wants; the RGB fit works on the sRGB-coded numbers directly).
function fitSpectral(p) {
  const Rm = upsample(hexToLinear(p.masstone)), Rt = p.tint ? upsample(hexToLinear(p.tint)) : null;
  const { K, S } = fitChannels(Rm, Rt, p.opacity, p.scatter);
  return { Kspec: K, Sspec: S };
}

export const PIGMENTS = PANS.map(p => ({ ...p, ...fitKM(p.masstone, p.tint, p.opacity, p.scatter), ...fitSpectral(p) }));

// The stain layer keeps only RGB sums of its pigments' K and S. For the
// spectral render, map those to spectra: least squares over the palette,
// per band, K_band ~ sum_c map[c][band] * K_c (and the same for S).
function fitMap(rgbOf, specOf) {
  const map = [[], [], []];
  for (let band = 0; band < NB; band++) {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    for (const pg of PIGMENTS) {
      const x = rgbOf(pg), y = specOf(pg)[band];
      for (let i = 0; i < 3; i++) { b[i] += x[i] * y; for (let j = 0; j < 3; j++) A[i][j] += x[i] * x[j]; }
    }
    for (let i = 0; i < 3; i++) A[i][i] += 1e-6;
    const m = solve3(A, b);
    for (let c = 0; c < 3; c++) map[c][band] = m[c];
  }
  return map;
}
function solve3(A, b) {
  const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const d = det(A);
  return [0, 1, 2].map(c => det(A.map((row, r) => row.map((v, k) => (k === c ? b[r] : v)))) / d);
}
export const STAIN_MAP = { K: fitMap(pg => pg.K, pg => pg.Kspec), S: fitMap(pg => pg.S, pg => pg.Sspec) };
