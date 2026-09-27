// Every physical constant is a knob. Slider ranges are suggestions only:
// the number boxes accept anything, including illegal values.
//
// target: 'sim'    -> packed into the simulation uniform struct
//         'render' -> packed into the render uniform
//         'js'     -> used on the CPU side only

export const PARAMS = [
  // --- Flow (shallow-water layer) ---
  { key: 'activeTiles',   v: 1,      min: 0,    max: 1,     group: 'Flow', target: 'sim',  label: 'skip dry tiles (0/1)' },
  { key: 'dt',            v: 0.4,    min: 0.01, max: 1,     group: 'Flow', target: 'sim',  label: 'timestep' },
  { key: 'simSpeed',      v: 600,    min: 0,    max: 4000,  group: 'Flow', target: 'js',   label: 'steps / second' },
  { key: 'gravity',       v: 1.0,    min: 0,    max: 5,     group: 'Flow', target: 'sim',  label: 'pressure (gravity)' },
  { key: 'viscosity',     v: 0.1,    min: 0,    max: 1,     group: 'Flow', target: 'sim' },
  { key: 'drag',          v: 0.5,    min: 0,    max: 5,     group: 'Flow', target: 'sim',  label: 'paper drag' },
  { key: 'dragMaxBoost',  v: 1,      min: 1,    max: 100,   group: 'Flow', target: 'sim',  label: 'thin-film drag cap' },
  { key: 'dragDepth',     v: 0.1,    min: 0,    max: 0.5,   group: 'Flow', target: 'sim',  label: 'drag reference depth' },
  { key: 'paperRelief',   v: 0.03,    min: 0,    max: 2,     group: 'Flow', target: 'sim',  label: 'paper relief' },
  { key: 'tiltX',         v: 0,      min: -0.05, max: 0.05, group: 'Flow', target: 'sim',  label: 'tilt x' },
  { key: 'tiltY',         v: 0,      min: -0.05, max: 0.05, group: 'Flow', target: 'sim',  label: 'tilt y' },
  { key: 'surfaceTension', v: 0.5,  min: 0,    max: 3,     group: 'Flow', target: 'sim',  label: 'surface tension' },
  { key: 'capSuction',    v: 0,      min: 0,    max: 2,     group: 'Flow', target: 'sim',  label: 'thin-film suction' },
  { key: 'suctionDepth',  v: 0.02,   min: 0.001, max: 0.2,  group: 'Flow', target: 'sim',  label: 'suction depth scale' },
  { key: 'pinning',       v: 0.35,    min: 0,    max: 0.5,   group: 'Flow', target: 'sim',  label: 'edge pinning' },
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
  { key: 'mixing',      v: 1,    min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'mixing in water (0/1)' },
  { key: 'marangoniContrast', v: 1, min: 0, max: 4, group: 'Pigment', target: 'sim', label: 'Marangoni needs contrast' },
  { key: 'marangoni',   v: 4,    min: -2, max: 10,   group: 'Pigment', target: 'sim', label: 'spreads on water (Marangoni)' },
  { key: 'pigmentDiffusion', v: 0.05, min: 0, max: 1, group: 'Pigment', target: 'sim', label: 'diffusion in water' },
  { key: 'mixEdgeLo',   v: 0.6,  min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'no mixing near edge (lo)' },
  { key: 'mixEdgeHi',   v: 0.9,  min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'no mixing near edge (hi)' },
  { key: 'jamLo',       v: 6,    min: 0, max: 50,  group: 'Pigment', target: 'sim', label: 'paste: jams from (pigment/water)' },
  { key: 'jamHi',       v: 12,   min: 0, max: 100, group: 'Pigment', target: 'sim', label: 'paste: fully jammed at' },
  { key: 'density',     v: 0.02, min: 0, max: 0.2, group: 'Pigment', target: 'sim', label: 'density (settling)' },
  { key: 'staining',    v: 1,    min: 0, max: 10,  group: 'Pigment', target: 'sim' },
  { key: 'granulation', v: 0.6,  min: 0, max: 2,   group: 'Pigment', target: 'sim' },
  { key: 'rewetLift',   v: 0.002, min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'dried paint rewets' },
  { key: 'stainCapacity', v: 0.015, min: 0, max: 0.2, group: 'Pigment', target: 'sim', label: 'fibres hold (stain capacity)' },
  { key: 'thickRewet',  v: 0.1,   min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'thick dried paint rewets' },
  { key: 'bindTime',    v: 3,     min: 0, max: 30,  group: 'Pigment', target: 'sim', label: 'gum sets (s, gradually)' },
  // Workable fixative (like SpectraFix: casein in alcohol). Sprayed over
  // dry paint, it commits it (it won't rewet or lift much), partly reverses
  // the lightening paint shows as it dries, fills some of the paper's tooth
  // and seals it so later washes soak in more slowly.
  { key: 'fixRewet',    v: 0,    min: 0, max: 1,   group: 'Fixative', target: 'sim', label: 'fixed paint rewets (x dried)' },
  { key: 'fixLift',     v: 0.1,  min: 0, max: 1,   group: 'Fixative', target: 'sim', label: 'fixed paint lifts (x unfixed)' },
  { key: 'fixSeal',     v: 0.6,  min: 0, max: 1,   group: 'Fixative', target: 'sim', label: 'seals the paper' },
  { key: 'fixTooth',    v: 0.25,  min: 0, max: 1,   group: 'Fixative', target: 'js',  label: 'fills the tooth' },
  { key: 'fixDeepen',   v: 0.25, min: 0, max: 1,   group: 'Fixative', target: 'render', label: 'deepens fixed paint' },
  { key: 'flocculation', v: 1,   min: 0, max: 3,   group: 'Pigment', target: 'sim', label: 'flocculation' },
  { key: 'flocTogether', v: 0.85, min: 0, max: 1, group: 'Pigment', target: 'sim', label: 'mixed pigments floc together' },
  { key: 'flocDrift',   v: 0.5,    min: 0, max: 20,  group: 'Pigment', target: 'sim', label: 'floc clumping speed' },
  { key: 'flocScale',   v: 1.2,  min: 0.2, max: 5, group: 'Pigment', target: 'sim', label: 'floc size (mm)' },
  { key: 'magnetism',   v: 4,    min: -10, max: 10,  group: 'Magnets', target: 'sim', label: 'magnet pull' },
  { key: 'magnetDepth', v: 5,    min: 0.5, max: 20, group: 'Magnets', target: 'sim', label: 'magnet depth (mm)' },
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
  { key: 'brushShape',    v: 0,    min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'shape (0 round, 1 flat)' },
  { key: 'flatAngle',     v: 0,    min: -180, max: 180, group: 'Brush', target: 'sim', label: 'flat: angle (deg; R / scroll)' },
  { key: 'flatThickness', v: 0.18, min: 0.02, max: 1, group: 'Brush', target: 'sim', label: 'flat: edge thickness (x width)' },
  { key: 'tipLanding',    v: 0.12, min: 0, max: 1,   group: 'Brush', target: 'js',  label: 'tip trails for (s after landing)' },
  { key: 'tipLength',     v: 1.6,  min: 0, max: 6,   group: 'Brush', target: 'sim', label: 'tip trails (x radius)' },
  { key: 'taperMin',      v: 0.15, min: 0, max: 1,   group: 'Brush', target: 'js',  label: 'taper (width at no pressure)' },
  { key: 'brushCapacity', v: 5000, min: 0, max: 30000, group: 'Brush', target: 'js', label: 'reservoir (0 = endless)' },
  { key: 'contactLength', v: 0,    min: 0, max: 120, group: 'Brush', target: 'js',  label: 'contact length (cells, 0 = 2×radius)' },
  { key: 'lightTouch',    v: 0.3,  min: 0, max: 1,   group: 'Brush', target: 'js',  label: 'Option: light touch pressure' },
  { key: 'speedTouch',    v: 0,  min: 0, max: 5,   group: 'Brush', target: 'js',  label: 'mouse: faster = lighter' },
  { key: 'touchdownEase', v: 0.12, min: 0, max: 1,   group: 'Brush', target: 'js',  label: 'mouse: ease-in (s)' },
  { key: 'emptyLevel',    v: 0.35, min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'water left when empty' },
  { key: 'dabSize',       v: 1500, min: 50, max: 10000, group: 'Brush', target: 'js', label: 'water brush dab (pigment)' },
  { key: 'squeezeRate',   v: 0.6,  min: 0, max: 3,   group: 'Brush', target: 'js',  label: 'water brush squeeze (per s)' },
  { key: 'thicken',       v: 1.5,  min: 0, max: 5,   group: 'Brush', target: 'sim', label: 'paint thickens as it empties' },
  { key: 'skipAmount',    v: 0.9,  min: 0, max: 1.5, group: 'Brush', target: 'sim', label: 'dry-brush skip' },
  { key: 'mistWater',   v: 0.06, min: 0, max: 0.5, group: 'Brush', target: 'sim', label: 'mist: droplet water' },
  { key: 'mistDensity', v: 0.25, min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'mist: droplets per pass' },
  { key: 'mistDamp',    v: 0.04, min: 0, max: 0.5, group: 'Brush', target: 'sim', label: 'mist: dampens the paper' },
  { key: 'liftDry',       v: 0.05, min: 0, max: 2,   group: 'Brush', target: 'sim', label: 'lifts dried paint' },
  { key: 'liftStrength',  v: 0.2,  min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'lift strength' },

  // --- Render (Kubelka-Munk) ---
  { key: 'thickness',       v: 8,    min: 0, max: 40, group: 'Render', target: 'render', label: 'pigment thickness' },
  { key: 'wetDarken',       v: 0.5,  min: 0, max: 3,  group: 'Render', target: 'render', label: 'wet sheen' },
  { key: 'paperShade',      v: 0.12, min: 0, max: 1,  group: 'Render', target: 'render', label: 'paper texture' },
  { key: 'spectral',        v: 0,    min: 0, max: 1,  group: 'Render', target: 'render', label: 'spectral colour (0/1)' },
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
