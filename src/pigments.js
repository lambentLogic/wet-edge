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

import { upsampleSigmoid, hexToLinear, spectrumToLinear, srgbToLinear, NB } from './spectral.js';
import { MEASURED } from './spectra-data.js';

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

// 2026-09-29: masstone / mid / tint for most of the box were measured from
// reference swatches the painter gathered (manufacturers' paint-outs,
// value scales and swatch cards), white-balanced to each image's paper,
// several makers averaged. The painter's own earlier calibrations were kept where they
// conflict (rubine's dark masstone, PY110's tint, PY128, transparent red
// oxide's strength). PB80 awaits a better reference.
export const RECIPES = [
  { name: 'Phthalo Green', code: 'PG7', masstone: '#00594A', tint: '#1FA58C', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 2.2, wick: 0.7 },
  { name: 'Phthalo Blue (GS)', code: 'PB15:3', masstone: '#0B3A7E', tint: '#1C8FD8', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 2.2, wick: 0.7 },
  // Painter (2026-09-29): read as a redundant cyan beside PB15:3; their
  // PB16 leans greener. Matched to a greener PB16 swatch and a PB16 vs
  // PB15:3 comparison: a clear teal.
  { name: 'Phthalo Turquoise', code: 'PB16', masstone: '#00505A', mid: '#0E97A8', tint: '#8FD9DF', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 2, wick: 0.6 },
  // Hostaperm Blue R5R; discontinued industrially, sold by handmade makers.
  // Painter's note: dark and strong, lower chroma than PV23 or PB29 either
  // side of it. A lower-chroma fit (#28284A / #65689A) was tried and read
  // worse; the research estimate is kept for now.
  { name: 'Benzimidazolone Blue', code: 'PB80', masstone: '#2E2A7A', tint: '#6C6FC4', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 2, wick: 0.6 },
  // Painter (2026-09-29): too dull; matched to a brand comparison of
  // graded washes across makers: a vivid, slightly violet royal blue,
  // clean pale blue tints (was #20308E / #5A6FD0).
  { name: 'French Ultramarine', code: 'PB29', masstone: '#1B2FA6', tint: '#769FF3', opacity: 'semitransparent',
    ...mineral, scatter: 0.06, density: 1, staining: STAIN.lowmed, granulation: GRAN.strong, flocculation: 1, mobility: 1 },
  { name: 'Dioxazine Violet', code: 'PV23', masstone: '#3A1F5E', tint: '#8A6FC0', opacity: 'semitransparent',
    ...organic, staining: STAIN.high, mobility: 1.5 },
  { name: 'Perylene Violet', code: 'PV29', masstone: '#45282A', mid: '#7E515D', tint: '#C7B0BE', opacity: 'semitransparent',
    ...organic, staining: STAIN.medium, mobility: 1.2 },
  // Painter (2026-09-26): quin rose and magenta didn't get as dark as
  // rubine at the same load; heavy quinacridone is deep. Masstones deepened.
  // 2026-09-29, spectral render: fitted to the painter's references (a PR122
  // swatch, swatch cards, a quinacridone rose paint-out):
  // wine masstone, vivid mid, clean pink tints; mid colours anchor the hue.
  { name: 'Quinacridone Magenta', code: 'PR122', masstone: '#5D0633', mid: '#E71A88', tint: '#F982BB', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 1.7 },
  { name: 'Quinacridone Rose', code: 'PV19', masstone: '#A0103A', mid: '#E35980', tint: '#EF8BAA', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 1.7 },
  // Painter: "a lil less ruby-dark than I'd expect and more pink" with the
  // tint at #E07090 (2026-09-26): deeper ruby masstone, raspberry-red tint.
  { name: 'Pyrrole Rubine', code: 'PR264', masstone: '#760B28', mid: '#CC4058', tint: '#FDADBD', opacity: 'semitransparent',
    ...organic, staining: STAIN.medium, mobility: 1.3 },
  // "Blooms very readily" yet "inert wet in wet" (handprint).
  { name: 'Pyrrole Scarlet', code: 'PR255', masstone: '#D82A22', mid: '#EE4535', tint: '#FDAD9F', opacity: 'semitransparent',
    ...organic, scatter: undefined, staining: STAIN.high, granulation: 0.1, mobility: 0.8 },
  // Rated transparent, but shows up on a dark ground (painter's
  // observation), so its scattering is fitted rather than fixed low.
  { name: 'Perylene Maroon', code: 'PR179', masstone: '#6E2324', mid: '#AA4A48', tint: '#F0A49C', opacity: 'semitransparent',
    ...organic, scatter: undefined, staining: STAIN.high, mobility: 1.2 },
  { name: 'Perylene Green', code: 'PBk31', masstone: '#243330', mid: '#5F8A7E', tint: '#BFD6CE', opacity: 'semitransparent',
    ...organic, staining: STAIN.medium, mobility: 1.2 },
  // "Inactive wet in wet but blossoms when rewetted" (handprint).
  // Painter (2026-09-26): tints can be a very rich, bright yellow; with
  // phthalo blue it makes a very warm green, not an olive.
  // Colours sampled from the painter's references (two PY110 paints, a
  // deep yellow and an Indian yellow; scans read a little light).
  { name: 'Isoindolinone Yellow', code: 'PY110', masstone: '#F0820C', mid: '#FFBC22', tint: '#FCD440', opacity: 'transparent',
    ...organic, staining: STAIN.medium, mobility: 0.8 },
  // Painter (2026-09-26): about as bright as bismuth vanadate in glazes,
  // but a middle yellow leaning lemon (bismuth is lemon leaning middle;
  // both a little warmer than PY3). Was #E8D400 / #F2E24A, dull and green.
  // A PY128 maker's chart reads #F3DC38 at strength.
  { name: 'Azo Condensation Yellow', code: 'PY128', masstone: '#F4D81C', mid: '#F7E845', tint: '#F9EF7C', opacity: 'transparent',
    ...organic, staining: STAIN.high, mobility: 1.4 },
  // Inorganic but fine; "very inert with water" (handprint).
  // Painter (2026-09-26): lemon, a mite neon (as neon as it gets without a
  // fluorescent; like PY3 but not as cold), a very bright mixer; it
  // rendered dark and golden from #F4D020 / #F8E27A. Colours sampled from
  // references they shared: a watercolour chart (#F5E640 strong, #F5E856
  // lighter) and an acrylic masstone (#FAF215).
  // Painter (2026-09-29): extremely saturated; from one angle a slightly
  // darker yellow, from the other brighter than the paper it's on (a
  // high-index scatterer). Strong scattering lets pale washes reflect more
  // yellow than bare paper.
  { name: 'Bismuth Vanadate Yellow', code: 'PY184', masstone: '#FCE81C', mid: '#FFF24A', tint: '#FFF88A', opacity: 'semiopaque',
    ...mineral, staining: STAIN.medium, granulation: GRAN.none, flocculation: 0, mobility: 0.5 , scatter: 0.6},
  { name: 'Indian Red', code: 'PR101', masstone: '#7A2E24', tint: '#C08070', opacity: 'semiopaque',
    ...mineral, density: 1.5, staining: STAIN.lowmed, granulation: GRAN.moderate },
  // Sub-micron oxide, but granulates "in threads" in some formulations.
  // Painter (2026-09-26): seemed weak, and with ultramarine should go to
  // grey. Deep brown-red masstone, strong tinter (was #9A3A1A / #D88050).
  { name: 'Transparent Red Oxide', code: 'PR101', masstone: '#6A2412', tint: '#C86A3E', opacity: 'transparent',
    ...mineral, scatter: 0.04, density: 0.9, staining: STAIN.low, granulation: GRAN.moderate, flocculation: 0.5 },
  { name: 'Transparent Yellow Oxide', code: 'PY42', masstone: '#C8761E', mid: '#F5AA35', tint: '#FFE092', opacity: 'transparent',
    ...mineral, scatter: 0.04, density: 0.9, staining: STAIN.low, granulation: GRAN.moderate, flocculation: 0.3 },
  // Natural raw umber; granulation seen wet largely vanishes dry.
  { name: 'Raw Umber', code: 'PBr7', masstone: '#4A3F2E', tint: '#A09A80', opacity: 'transparent',
    ...mineral, scatter: 0.06, staining: STAIN.medium, granulation: GRAN.slight },
  // Synthetic magnetite, Fe3O4: a heavy, granulating, low-staining warm black
  // with a high refractive index, and ferrimagnetic. It moves under a magnet
  // while wet (the magnetism feature in the spec). Colours are estimates.
  { name: 'Mars Black', code: 'PBk11', masstone: '#2F2D29', mid: '#8A857C', tint: '#C9C3BA', opacity: 'semiopaque',
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
  // A mica gold. Hidden from the paint box until its metallic flakes (a
  // sheen that changes with the angle of the light) are modelled; as a
  // flat colour it read as a dull ochre.
  { name: 'Mica Gold', code: 'mica', masstone: '#C9A24A', tint: null, opacity: 'opaque',
    ...mineral, density: 1.6, staining: STAIN.low, granulation: GRAN.slight, flocculation: 0, mobility: 0.7, hidden: true },
  // Pencil lead, not a paint: the pencil tool lays it dry (hidden from the
  // paint box). Graphite flakes: dark, neutral, a slight sheen; insoluble,
  // so it never rewets (staining high) or travels.
  { name: 'Graphite', code: 'pencil', masstone: '#3C3D40', tint: '#A6A8AB', opacity: 'semitransparent',
    ...mineral, scatter: 0.3, density: 2, staining: 10, granulation: 0, flocculation: 0, mobility: 0, wick: 0, hidden: true },
];

// Measured spectra (src/spectra-data.js; notes/spectra/sources.md) are
// acrylic paints and one printing ink. They include the surface's own gloss
// (specular included, about 3-4% of light bounced straight back), which puts
// a floor under every dark band and flattens the absorption contrast;
// Saunderson's correction takes it out (k1, k2 as the sources give them).
const saunderson = R => R.map(v => Math.max((v - 0.03) / (1 - 0.03 - 0.65 + 0.65 * v), 1e-3));

// Only samples with a tint (or a film over paper) are used: a lone masstone
// is saturated in the bands where the pigment absorbs, so it can't tell how
// much more it absorbs in one than another.
function measuredFor(name) {
  const m = MEASURED[name];
  if (name === 'colours') return null;
  // A transparent film over paper (process cyan ink): measured without
  // gloss, already a glaze's shape.
  if (m?.film) return { film: m.film };
  if (!m || !m.tint) return null;
  return { masstone: saunderson(m.masstone), tint: saunderson(m.tint) };
}

// Absorption spectrum shape from a measurement, up to a scale factor:
// - a transparent film over paper (process cyan): T^2 = film / paper, so
//   K is proportional to -ln T^2;
// - a tint in titanium white (opaque): K/S of the mix = (1 - R)^2 / 2R, and
//   white dominates S, so K is proportional to K/S(tint) - K/S(white);
// - an opaque masstone: K/S of the pigment itself (times its S).
const ksOf = R => R.map(v => { const r = Math.min(Math.max(v, 1e-3), 0.999); return (1 - r) ** 2 / (2 * r); });
const WHITE_KS = ksOf(saunderson(MEASURED['White Gouache'].masstone));
// Where a sample saturates, its K/S runs away; cap the shape's range at
// 50:1, which is about what a single pigment spans across the visible.
function kShape(m, opaque) {
  let sh;
  if (m.film) sh = m.film.map(v => -Math.log(Math.max(v, 1e-3)));
  else if (opaque || !m.tint) sh = ksOf(m.masstone);
  else sh = ksOf(m.tint).map((v, k) => Math.max(v - WHITE_KS[k], 1e-4));
  const top = Math.max(...sh);
  return sh.map(v => Math.max(v, top / 50));
}

// Spectral K and S. With a measurement, the measured absorption shape is
// kept as is (it decides hue and how the pigment mixes) and only its
// overall strength and the tint's thickness are fitted, in colour, to the
// painter's masstone and tint. (Fitting every band freely to the masstone
// forced absorption into phthalo blue's own blue, since the swatch is dark
// there in linear light, and greyed its mixes; spectral mixing should make
// blue + yellow greener, not duller.) Without one, the swatch colours'
// sigmoid spectra are fitted band by band. Scattering is kept from the RGB
// fit: it carries the painter's calibration of which pigments show body
// on dark grounds, and the acrylic data says nothing reliable about S in
// watercolour.
function fitSpectral(p, rgbFit) {
  const S = rgbFit.S[0];
  const m = measuredFor(p.spectrum ?? p.name);
  const lin = hex => hexToLinear(hex);
  if (m) {
    const opaque = !m.film && (p.opacity === 'opaque' || p.opacity === 'semiopaque');
    const shape = kShape(m, opaque).map(v => (opaque ? v * S : v));
    const mean = shape.reduce((a, v) => a + v, 0) / NB, unit = shape.map(v => v / mean);
    // Hue: the measured shape (acrylic paints, one printing ink) keeps its
    // narrow absorption features, but is tilted and bowed smoothly across
    // the spectrum, and scaled, so a heavy application and a light wash
    // render as the painter's masstone and tint (measured shapes alone made
    // quinacridone magenta violet, rose too cool, ultramarine cyan). Without
    // a tint, only the strength is fitted, to the masstone.
    const Mt = lin(p.masstone), Tt = p.tint ? lin(p.tint) : null, Dt = p.mid ? lin(p.mid) : null;
    const err = (rgb, t) => rgb.reduce((a, v, c) => a + Math.log((Math.max(v, 0) + 0.01) / (t[c] + 0.01)) ** 2, 0);
    const spec = (K, x) => spectrumToLinear(K.map(k => kmReflect(k, S, x, PAPER_WHITE)));
    const TX = [0.08, 0.12, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0];
    const cost = (a, b, la, c = 0) => {
      const K = unit.map((v, k) => { const u = (k - (NB - 1) / 2) / ((NB - 1) / 2); return v * Math.exp(la + a * u + b * (u * u - 1 / 3) + c * (u * u * u - 0.6 * u)); });
      // (The masstone counts for less: its channels are near 0, where the
      // log error is touchiest, and it outweighed the washes painters see.)
      let e = 0.3 * err(spec(K, MASS_X), Mt);
      if (Tt) e += Math.min(...TX.map(x => err(spec(K, x), Tt)));
      // (A mid-strength colour, if given, keeps the path between them on hue.)
      if (Dt) e += Math.min(...[0.2, 0.3, 0.45, 0.65, 0.9, 1.2].map(x => err(spec(K, x), Dt)));
      return { e, K };
    };
    const bestStrength = (a, b, cc = 0) => {   // golden-section on log strength
      let lo = Math.log(1e-3), hi = Math.log(200);
      const g = (Math.sqrt(5) - 1) / 2;
      let c = hi - g * (hi - lo), d = lo + g * (hi - lo), fc = cost(a, b, c, cc).e, fd = cost(a, b, d, cc).e;
      for (let it = 0; it < 40; it++) {
        if (fc < fd) { hi = d; d = c; fd = fc; c = hi - g * (hi - lo); fc = cost(a, b, c, cc).e; }
        else { lo = c; c = d; fc = fd; d = lo + g * (hi - lo); fd = cost(a, b, d, cc).e; }
      }
      return cost(a, b, (lo + hi) / 2, cc);
    };
    let best = { e: Infinity }, ba = 0, bb = 0, bc = 0;
    const tries = Tt ? [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2] : [0];
    for (const a of tries) for (const b of tries) for (const c of (Tt ? [-2, -1, 0, 1, 2] : [0])) { const r = bestStrength(a, b, c); if (r.e < best.e) { best = r; ba = a; bb = b; bc = c; } }
    if (Tt) for (const da of [-0.25, 0, 0.25]) for (const db of [-0.25, 0, 0.25]) for (const dc of [-0.5, 0, 0.5]) { const r = bestStrength(ba + da, bb + db, bc + dc); if (r.e < best.e) best = r; }
    return { Kspec: best.K.map(v => +v.toFixed(5)), Sspec: new Array(NB).fill(S) };
  }
  const Rm = upsampleSigmoid(lin(p.masstone)), Rt = p.tint ? upsampleSigmoid(lin(p.tint)) : null;
  const { K } = fitChannels(Rm, Rt, p.opacity, S);
  return { Kspec: K, Sspec: new Array(NB).fill(S) };
}

// Spectra a pigment can take its absorption shape from: measurements with
// a tint or a transparent film (see measuredFor), or 'colours' (fitted from
// the masstone and tint alone).
export const SPECTRA = Object.keys(MEASURED).filter(k => MEASURED[k].tint || MEASURED[k].film);

// A pigment built from its recipe: colour (masstone, tint, opacity,
// scatter, spectrum) fitted to Kubelka-Munk K and S, plus the physical
// ratings as given. The painter's pigment editor changes recipes and
// rebuilds them.
export function buildPigment(recipe) {
  const rgb = fitKM(recipe.masstone, recipe.tint, recipe.opacity, recipe.scatter);
  return { ...recipe, ...rgb, ...fitSpectral(recipe, rgb) };
}

// The paint box: built pigments, indexed by id (their slot on the GPU).
// Edited in place, so ids stay stable.
export const PIGMENTS = RECIPES.map(buildPigment);

// The recipe fields the editor shows, with what they mean.
export const RECIPE_FIELDS = [
  { key: 'density',      label: 'Weight', min: 0, max: 2.5, doc: 'How heavy and coarse the particles are: heavy pigments settle out of a wash fast (and lie in the paper\'s valleys); fine ones stay suspended and travel.' },
  { key: 'staining',     label: 'Staining', min: 0, max: 4, doc: 'How hard it grips the fibres once settled. High stains (phthalos, quinacridones) resist lifting and rewetting; low ones lift back to white.' },
  { key: 'granulation',  label: 'Granulation', min: 0, max: 1.5, doc: 'How strongly settling favours the paper\'s valleys, for a speckled, textured wash.' },
  { key: 'flocculation', label: 'Flocculation', min: 0, max: 1.5, doc: 'How strongly particles clump together into soft flecks as the wash settles (ultramarine\'s mottling).' },
  { key: 'mobility',     label: 'Spreads wet-in-wet', min: 0, max: 3, doc: 'How far it travels and blooms in wet paint. Phthalos push through a wash; "inert" pigments stay where they are put.' },
  { key: 'wick',         label: 'Halo past the edge', min: 0, max: 1, doc: 'How much the paper\'s capillary flow carries it past the wet edge: the soft halo staining organics leave.' },
  { key: 'load',         label: 'Pigment per brushful', min: 0, max: 4, doc: 'Pigment carried per brushful relative to watercolour (1). Gouache is about 3.' },
  { key: 'magnetic',     label: 'Magnetic', min: 0, max: 1, doc: 'Pull under a magnet, relative to Mars black (magnetite). 0 for almost everything.' },
];
export const OPACITIES = Object.keys(OPACITY_S);

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
export const STAIN_MAP = {};
export function refitStainMap() {
  STAIN_MAP.K = fitMap(pg => pg.K, pg => pg.Kspec);
  STAIN_MAP.S = fitMap(pg => pg.S, pg => pg.Sspec);
}
refitStainMap();
