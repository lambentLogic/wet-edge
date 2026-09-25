// Pigments: Kubelka-Munk absorption (K) and scattering (S) per RGB channel,
// after the table in Curtis et al. 1997 (fig. 5), plus physical behaviour.
//
// Physical properties are relative to French ultramarine (= 1) and are
// estimates from each pigment's chemistry and its reputation among painters,
// not measurements:
//   density      settling speed. Mineral pigments (heavy, coarse particles)
//                settle fast; synthetic organics (fine particles) stay
//                suspended longer.
//   staining     grip on paper fibres once settled (resists lifting).
//                Organics stain; most minerals lift readily.
//   granulation  how strongly settling favours the paper's valleys.
//   flocculation how strongly particles clump onto their own kind, giving
//                speckle independent of the paper (ultramarine is the classic).
//   mobility     how far the pigment travels by diffusion / Marangoni flow in
//                wet-in-wet. Fine organics (phthalos especially) push through
//                a wash; heavy minerals stay put.
//   wick         how much suspended pigment the paper's capillary flow carries
//                past the wet edge (the soft halo staining organics leave).

const mineral = { kind: 'mineral', density: 1.3, staining: 0.8, granulation: 0.6, flocculation: 0.3, mobility: 0.8, wick: 0 };
const organic = { kind: 'organic', density: 0.3, staining: 2.5, granulation: 0.1, flocculation: 0, mobility: 1.7, wick: 0.5 };

export const PIGMENTS = [
  { name: 'French Ultramarine', code: 'PB29', K: [0.86, 0.86, 0.06], S: [0.005, 0.005, 0.09],
    ...mineral, density: 1, staining: 1, granulation: 1, flocculation: 1, mobility: 1 },
  { name: 'Quinacridone Rose', code: 'PV19', K: [0.22, 1.47, 0.57], S: [0.05, 0.003, 0.03],
    ...organic, staining: 3 },
  // Not in Curtis's table: estimated. A bluer, cooler magenta than PV19.
  { name: 'Quinacridone Magenta', code: 'PR122', K: [0.28, 1.75, 0.40], S: [0.04, 0.003, 0.025],
    ...organic, staining: 2.8 },
  { name: 'Indian Red', code: 'PR101', K: [0.46, 1.07, 1.50], S: [1.28, 0.38, 0.21],
    ...mineral, density: 1.5, staining: 1.5, granulation: 0.5 },
  { name: 'Cadmium Yellow', code: 'PY35', K: [0.10, 0.36, 3.45], S: [0.97, 0.65, 0.007],
    ...mineral, granulation: 0.3, flocculation: 0.1 },
  { name: "Hooker's Green", code: 'PG7+PY', K: [1.62, 0.61, 1.64], S: [0.01, 0.012, 0.003],
    ...organic, mobility: 1.5 },
  { name: 'Cerulean Blue', code: 'PB35', K: [1.52, 0.32, 0.25], S: [0.06, 0.26, 0.40],
    ...mineral, density: 1.4, staining: 0.6, granulation: 1.2, flocculation: 0.5 },
  { name: 'Burnt Umber', code: 'PBr7', K: [0.74, 1.54, 2.10], S: [0.09, 0.09, 0.004],
    ...mineral, granulation: 0.8, flocculation: 0.4 },
  { name: 'Cadmium Red', code: 'PR108', K: [0.14, 1.08, 1.68], S: [0.77, 0.015, 0.018],
    ...mineral, granulation: 0.3, flocculation: 0.1 },
  { name: 'Hansa Yellow', code: 'PY97', K: [0.06, 0.21, 1.78], S: [0.50, 0.88, 0.009],
    ...organic, staining: 2 },
  { name: 'Phthalo Green', code: 'PG7', K: [1.55, 0.47, 0.63], S: [0.01, 0.05, 0.035],
    ...organic, density: 0.25, staining: 3.5, granulation: 0, mobility: 2.2, wick: 0.7 },
  { name: 'Interference Lilac', code: 'mica', K: [0.08, 0.11, 0.07], S: [1.25, 0.42, 1.43],
    ...mineral, density: 1.6, staining: 0.5, granulation: 0.5, flocculation: 0.2, mobility: 0.7 },
];

// Default palette: a mineral blue, an organic rose, an earth red and an
// organic yellow, so mixtures show mineral/organic separation.
export const DEFAULT_SLOTS = [0, 1, 3, 9];
