// Kubelka-Munk absorption (K) and scattering (S) per RGB channel.
// Values after the table in Curtis et al. 1997, fig. 5.
export const PIGMENTS = [
  { name: 'French Ultramarine', K: [0.86, 0.86, 0.06], S: [0.005, 0.005, 0.09] },
  { name: 'Quinacridone Rose',  K: [0.22, 1.47, 0.57], S: [0.05, 0.003, 0.03] },
  { name: 'Indian Red',         K: [0.46, 1.07, 1.50], S: [1.28, 0.38, 0.21] },
  { name: 'Cadmium Yellow',     K: [0.10, 0.36, 3.45], S: [0.97, 0.65, 0.007] },
  { name: "Hooker's Green",     K: [1.62, 0.61, 1.64], S: [0.01, 0.012, 0.003] },
  { name: 'Cerulean Blue',      K: [1.52, 0.32, 0.25], S: [0.06, 0.26, 0.40] },
  { name: 'Burnt Umber',        K: [0.74, 1.54, 2.10], S: [0.09, 0.09, 0.004] },
  { name: 'Cadmium Red',        K: [0.14, 1.08, 1.68], S: [0.77, 0.015, 0.018] },
  { name: 'Hansa Yellow',       K: [0.06, 0.21, 1.78], S: [0.50, 0.88, 0.009] },
  { name: 'Phthalo Green',      K: [1.55, 0.47, 0.63], S: [0.01, 0.05, 0.035] },
  { name: 'Interference Lilac', K: [0.08, 0.11, 0.07], S: [1.25, 0.42, 1.43] },
];
