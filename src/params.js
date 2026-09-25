// Every physical constant is a knob. Slider ranges are suggestions only:
// the number boxes accept anything, including illegal values.
//
// target: 'sim'    -> packed into the simulation uniform struct
//         'render' -> packed into the render uniform
//         'js'     -> used on the CPU side only

export const PARAMS = [
  // --- Flow (shallow-water layer) ---
  { key: 'dt',            v: 0.25,   min: 0.01, max: 1,     group: 'Flow', target: 'sim',  label: 'timestep' },
  { key: 'simSpeed',      v: 960,    min: 0,    max: 4000,  group: 'Flow', target: 'js',   label: 'steps / second' },
  { key: 'gravity',       v: 1.0,    min: 0,    max: 5,     group: 'Flow', target: 'sim',  label: 'pressure (gravity)' },
  { key: 'viscosity',     v: 0.1,    min: 0,    max: 1,     group: 'Flow', target: 'sim' },
  { key: 'drag',          v: 0.5,    min: 0,    max: 5,     group: 'Flow', target: 'sim',  label: 'paper drag' },
  { key: 'dragMaxBoost',  v: 1,      min: 1,    max: 100,   group: 'Flow', target: 'sim',  label: 'thin-film drag cap' },
  { key: 'dragDepth',     v: 0.1,    min: 0,    max: 0.5,   group: 'Flow', target: 'sim',  label: 'drag reference depth' },
  { key: 'paperRelief',   v: 0.03,    min: 0,    max: 2,     group: 'Flow', target: 'sim',  label: 'paper relief' },
  { key: 'tiltX',         v: 0,      min: -0.05, max: 0.05, group: 'Flow', target: 'sim',  label: 'tilt x' },
  { key: 'tiltY',         v: 0,      min: -0.05, max: 0.05, group: 'Flow', target: 'sim',  label: 'tilt y' },
  { key: 'pinning',       v: 0.1,    min: 0,    max: 0.5,   group: 'Flow', target: 'sim',  label: 'edge pinning' },
  { key: 'edgePull',      v: 0.15,   min: 0,    max: 0.2,   group: 'Flow', target: 'sim',  label: 'edge pull (Curtis η)' },

  // --- Paper and drying (capillary layer) ---
  { key: 'evaporation',      v: 0.00001, min: 0, max: 0.0002,  group: 'Paper & drying', target: 'sim' },
  { key: 'edgeEvaporation',  v: 4,      min: 0, max: 20,    group: 'Paper & drying', target: 'sim', label: 'edge evaporation boost' },
  { key: 'sizing',           v: 0.8,    min: 0, max: 1,     group: 'Paper & drying', target: 'sim', label: 'sizing' },
  { key: 'absorption',       v: 0.02,   min: 0, max: 0.2,   group: 'Paper & drying', target: 'sim' },
  { key: 'capacityMin',      v: 0.03,   min: 0, max: 0.3,   group: 'Paper & drying', target: 'sim', label: 'capacity (peaks)' },
  { key: 'capacityMax',      v: 0.12,   min: 0, max: 0.5,   group: 'Paper & drying', target: 'sim', label: 'capacity (valleys)' },
  { key: 'capillarySpread',  v: 0.1,    min: 0, max: 0.24,  group: 'Paper & drying', target: 'sim', label: 'capillary spread' },
  { key: 'capillaryMin',     v: 0.02,   min: 0, max: 0.2,   group: 'Paper & drying', target: 'sim', label: 'capillary threshold' },
  { key: 'dampThreshold',    v: 0.05,   min: 0, max: 0.3,   group: 'Paper & drying', target: 'sim', label: 'damp enough to flow' },
  { key: 'paperEvaporation', v: 0.00003, min: 0, max: 0.001, group: 'Paper & drying', target: 'sim', label: 'paper evaporation' },
  { key: 'wEps',             v: 0.004,  min: 0, max: 0.05,  group: 'Paper & drying', target: 'sim', label: 'wet threshold' },
  { key: 'dryerStrength',    v: 15,     min: 1, max: 100,   group: 'Paper & drying', target: 'js',  label: 'blow-dryer ×' },

  // --- Pigment (Curtis's ρ, ω, γ) ---
  { key: 'marangoni',   v: 4,    min: -2, max: 10,   group: 'Pigment', target: 'sim', label: 'spreads on water (Marangoni)' },
  { key: 'pigmentDiffusion', v: 0.05, min: 0, max: 1, group: 'Pigment', target: 'sim', label: 'diffusion in water' },
  { key: 'mixEdgeLo',   v: 0.6,  min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'no mixing near edge (lo)' },
  { key: 'mixEdgeHi',   v: 0.9,  min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'no mixing near edge (hi)' },
  { key: 'density',     v: 0.02, min: 0, max: 0.2, group: 'Pigment', target: 'sim', label: 'density (settling)' },
  { key: 'staining',    v: 1,    min: 0, max: 10,  group: 'Pigment', target: 'sim' },
  { key: 'granulation', v: 0.6,  min: 0, max: 2,   group: 'Pigment', target: 'sim' },
  { key: 'valleyFill',  v: 3,    min: 0, max: 20,  group: 'Pigment', target: 'sim', label: 'valleys fill up' },
  { key: 'settleDepth', v: 0.05, min: 0, max: 0.5, group: 'Pigment', target: 'sim', label: 'settles below depth' },

  // --- Brush ---
  { key: 'brushRadius',   v: 18,   min: 1, max: 100, group: 'Brush', target: 'sim', label: 'radius' },
  { key: 'brushSoftness', v: 0.4,  min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'softness' },
  { key: 'brushWater',    v: 0.3,  min: 0, max: 2,   group: 'Brush', target: 'sim', label: 'water level' },
  { key: 'brushPigment',  v: 0.4,  min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'pigment concentration' },
  { key: 'brushRate',     v: 0.4,  min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'load rate' },
  { key: 'brushCharge',   v: 0.1,  min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'wet-in-wet charge' },
  { key: 'chargeDuration', v: 0.1, min: 0, max: 2,  group: 'Brush', target: 'js',  label: 'charge lasts (s)' },
  { key: 'liftStrength',  v: 0.2,  min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'lift strength' },

  // --- Render (Kubelka-Munk) ---
  { key: 'thickness',       v: 8,    min: 0, max: 40, group: 'Render', target: 'render', label: 'pigment thickness' },
  { key: 'wetDarken',       v: 0.5,  min: 0, max: 3,  group: 'Render', target: 'render', label: 'wet sheen' },
  { key: 'paperShade',      v: 0.12, min: 0, max: 1,  group: 'Render', target: 'render', label: 'paper texture' },
  { key: 'suspendedWeight', v: 1,    min: 0, max: 2,  group: 'Render', target: 'render', label: 'show suspended' },
];

export const SIM_PARAMS = PARAMS.filter(p => p.target === 'sim');

// WGSL struct generated from the table, so adding a knob is a one-line change.
export function paramStructWGSL() {
  const fields = SIM_PARAMS.map(p => `  ${p.key}: f32,`);
  const pad = (4 - (SIM_PARAMS.length % 4)) % 4;
  for (let i = 0; i < pad; i++) fields.push(`  _pad${i}: f32,`);
  return `struct Params {\n${fields.join('\n')}\n};`;
}

export function simParamBufferSize() {
  return Math.ceil(SIM_PARAMS.length / 4) * 16;
}
