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
  { key: 'dragMaxBoost',  v: 100,      min: 1,    max: 100,   group: 'Flow', target: 'sim',  label: 'thin-film drag cap' },
  { key: 'dragDepth',     v: 0.03,    min: 0,    max: 0.5,   group: 'Flow', target: 'sim',  label: 'drag reference depth' },
  { key: 'paperRelief',   v: 0.01,    min: 0,    max: 2,     group: 'Flow', target: 'sim',  label: 'paper relief' },
  { key: 'tiltX',         v: 0,      min: -0.05, max: 0.05, group: 'Flow', target: 'sim',  label: 'tilt x' },
  { key: 'tiltY',         v: 0,      min: -0.05, max: 0.05, group: 'Flow', target: 'sim',  label: 'tilt y' },
  { key: 'surfaceTension', v: 0.5,  min: 0,    max: 3,     group: 'Flow', target: 'sim',  label: 'surface tension' },
  { key: 'capSuction',    v: 0,      min: 0,    max: 2,     group: 'Flow', target: 'sim',  label: 'thin-film suction' },
  { key: 'suctionDepth',  v: 0.02,   min: 0.001, max: 0.2,  group: 'Flow', target: 'sim',  label: 'suction depth scale' },
  { key: 'pinning',       v: 0.35,    min: 0,    max: 0.5,   group: 'Flow', target: 'sim',  label: 'wet edges hold their line (pinning)' },
  { key: 'edgeDamp',      v: 3,      min: 0,    max: 50,    group: 'Flow', target: 'sim',  label: 'sheet edge damps rebound' },
  { key: 'edgePull',      v: 0,   min: 0,    max: 0.2,   group: 'Flow', target: 'sim',  label: 'edge darkening (pull to the edge, Curtis η)' },

  // --- Paper and drying (capillary layer) ---
  { key: 'evaporation',      v: 0.00001, min: 0, max: 0.0002,  group: 'Paper & drying', target: 'sim' },
  { key: 'edgeEvaporation',  v: 4,      min: 0, max: 20,    group: 'Paper & drying', target: 'sim', label: 'edge evaporation boost' },
  { key: 'sizing',           v: 0.8,    min: 0, max: 1,     group: 'Paper & drying', target: 'sim', label: 'sizing' },
  { key: 'absorption',       v: 0.02,   min: 0, max: 0.2,   group: 'Paper & drying', target: 'sim' },
  { key: 'capacityMin',      v: 0.03,   min: 0, max: 0.3,   group: 'Paper & drying', target: 'sim', label: 'capacity (peaks)' },
  { key: 'capacityMax',      v: 0.12,   min: 0, max: 0.5,   group: 'Paper & drying', target: 'sim', label: 'capacity (valleys)' },
  { key: 'capillarySpread',  v: 0.1,    min: 0, max: 0.24,  group: 'Paper & drying', target: 'sim', label: 'capillary spread' },
  { key: 'pigmentWick',      v: 1,      min: 0, max: 5,     group: 'Paper & drying', target: 'sim', label: 'wicking carries pigment' },
  { key: 'fibreSettle',      v: 0.001,   min: 0, max: 1,     group: 'Paper & drying', target: 'sim', label: 'wicked pigment settles (per step)' },
  { key: 'capillaryMin',     v: 0.02,   min: 0, max: 0.2,   group: 'Paper & drying', target: 'sim', label: 'capillary threshold' },
  { key: 'dampThreshold',    v: 0.05,   min: 0, max: 0.3,   group: 'Paper & drying', target: 'sim', label: 'damp enough to flow (and dry-brush contact)' },
  { key: 'paperEvaporation', v: 0.000057, min: 0, max: 0.001, group: 'Paper & drying', target: 'sim', label: 'paper evaporation' },
  { key: 'wEps',             v: 0.004,  min: 0, max: 0.05,  group: 'Paper & drying', target: 'sim', label: 'wet threshold' },
  { key: 'dryingPace',       v: 1,      min: 0.15, max: 3,   group: 'Paper & drying', target: 'js',  label: 'drying pace' },
  { key: 'dryerStrength',    v: 15,     min: 1, max: 100,   group: 'Paper & drying', target: 'js',  label: 'blow-dryer ×' },

  // --- Pigment (Curtis's ρ, ω, γ) ---
  { key: 'mixing',      v: 1,    min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'paint moves in water: diffusion, floc, Marangoni (0/1)' },
  { key: 'marangoniContrast', v: 1, min: 0, max: 4, group: 'Pigment', target: 'sim', label: 'Marangoni needs contrast' },
  { key: 'marangoni',   v: 4,    min: -2, max: 10,   group: 'Pigment', target: 'sim', label: 'spreads on water (Marangoni)' },
  { key: 'pigmentDiffusion', v: 0.05, min: 0, max: 1, group: 'Pigment', target: 'sim', label: 'diffusion in water' },
  { key: 'mixEdgeLo',   v: 0.6,  min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'no mixing near edge (lo)' },
  { key: 'mixEdgeHi',   v: 0.9,  min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'no mixing near edge (hi)' },
  { key: 'jamLo',       v: 6,    min: 0, max: 50,  group: 'Pigment', target: 'sim', label: 'paste: jams from (pigment/water)' },
  { key: 'jamHi',       v: 12,   min: 0, max: 100, group: 'Pigment', target: 'sim', label: 'paste: fully jammed at' },
  { key: 'packLo',      v: 0.15,  min: 0, max: 2,   group: 'Pigment', target: 'sim', label: 'edge ring: packs from (pigment)' },
  { key: 'packHi',      v: 0.3,   min: 0, max: 4,   group: 'Pigment', target: 'sim', label: 'edge ring: full at' },
  { key: 'density',     v: 0.02, min: 0, max: 0.2, group: 'Pigment', target: 'sim', label: 'all pigments: density × (settling, redissolving)' },
  { key: 'staining',    v: 1,    min: 0, max: 10,  group: 'Pigment', target: 'sim', label: 'all pigments: staining ×' },
  { key: 'granulation', v: 0.3,  min: 0, max: 2,   group: 'Pigment', target: 'sim', label: 'all pigments: granulation ×' },
  { key: 'rewetLift',   v: 0.002, min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'dried paint rewets' },
  { key: 'stainCapacity', v: 0.015, min: 0, max: 0.2, group: 'Pigment', target: 'sim', label: 'fibres hold (stain capacity)' },
  { key: 'thickRewet',  v: 0.5,   min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'thick dried paint rewets' },
  { key: 'soakTime',    v: 30,    min: 0, max: 120, group: 'Pigment', target: 'sim', label: 'dried paint softens after (s under water)' },
  { key: 'thickLo',     v: 0.1,   min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'thick paint rewets freely from (pigment)' },
  { key: 'thickHi',     v: 0.2,   min: 0, max: 2,   group: 'Pigment', target: 'sim', label: '... fully at' },
  { key: 'soakRewet',   v: 0.02,   min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'softened paint left alone lifts (x scrubbed)' },
  { key: 'agitation',   v: 0.5,   min: 0, max: 1,   group: 'Pigment', target: 'sim', label: 'a working brush loosens dried paint (x firmness)' },
  { key: 'scrubRewet',  v: 8,     min: 0, max: 40,  group: 'Pigment', target: 'sim', label: 'scrubbing softens dried paint (x soaking)' },
  { key: 'bindTime',    v: 60,     min: 0, max: 30,  group: 'Pigment', target: 'sim', label: 'gum sets (s, gradually)' },
  // Workable fixative (like SpectraFix: casein in alcohol). Sprayed over
  // dry paint, it commits it (it won't rewet or lift much), partly reverses
  // the lightening paint shows as it dries, fills some of the paper's tooth
  // and seals it so later washes soak in more slowly.
  { key: 'fixRewet',    v: 0,    min: 0, max: 1,   group: 'Fixative', target: 'sim', label: 'fixed paint rewets (x dried)' },
  { key: 'fixLift',     v: 0.1,  min: 0, max: 1,   group: 'Fixative', target: 'sim', label: 'fixed paint lifts (x unfixed)' },
  { key: 'fixSeal',     v: 0.6,  min: 0, max: 1,   group: 'Fixative', target: 'sim', label: 'seals the paper' },
  { key: 'fixTooth',    v: 0.25,  min: 0, max: 1,   group: 'Fixative', target: 'js',  label: 'fills the tooth (at the time of spraying)' },
  { key: 'fixDeepen',   v: 0.25, min: 0, max: 1,   group: 'Fixative', target: 'render', label: 'deepens fixed paint' },
  { key: 'flocculation', v: 0.3,   min: 0, max: 3,   group: 'Pigment', target: 'sim', label: 'all pigments: flocculation ×' },
  { key: 'flocTogether', v: 0.85, min: 0, max: 1, group: 'Pigment', target: 'sim', label: 'mixed pigments floc together' },
  { key: 'flocDrift',   v: 0.5,    min: 0, max: 20,  group: 'Pigment', target: 'sim', label: 'floc clumping speed (× flocculation)' },
  { key: 'flocScale',   v: 1.2,  min: 0.2, max: 5, group: 'Pigment', target: 'sim', label: 'floc size (mm)' },
  { key: 'magnetism',   v: 4,    min: -10, max: 10,  group: 'Magnets', target: 'sim', label: 'magnet pull' },
  { key: 'magnetDepth', v: 5,    min: 0.5, max: 20, group: 'Magnets', target: 'sim', label: 'magnet depth (mm)' },
  { key: 'valleyFill',  v: 3,    min: 0, max: 20,  group: 'Pigment', target: 'sim', label: 'valleys fill up' },
  { key: 'settleDepth', v: 0.05, min: 0, max: 0.5, group: 'Pigment', target: 'sim', label: 'settling speeds up in thin water' },

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
  { key: 'lingerRate',    v: 0.3,  min: 0, max: 2,   group: 'Brush', target: 'js',  label: 'resting brush adds (frames per frame)' },
  { key: 'dabDelay',      v: 0.25, min: 0, max: 1,   group: 'Brush', target: 'js',  label: 'hold still this long to dab (s)' },
  { key: 'startWet',      v: 0.5,  min: 0, max: 2,   group: 'Brush', target: 'sim', label: 'stroke starts wetter (fresh brush)' },
  { key: 'brushFirmness', v: 0.4,  min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'firmness (how hard it scrubs)' },
  { key: 'brushDrag',     v: 0.1,  min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'brush pushes wet paint' },
  { key: 'brushPickup',   v: 0.1,  min: 0, max: 2,   group: 'Brush', target: 'sim', label: 'brush picks up wet paint' },
  { key: 'carryVolume',   v: 0.5,  min: 0.1, max: 20, group: 'Brush', target: 'js', label: 'carried paint dilutes in (x tip water)' },
  { key: 'carryKeep',     v: 0.2,  min: 0, max: 1,   group: 'Brush', target: 'js',  label: 'carried paint kept to the next stroke' },
  { key: 'brushDose',     v: 2.1,  min: 0, max: 10,  group: 'Brush', target: 'js',  label: 'dose per spot crossed (frames)' },
  { key: 'taperMin',      v: 0.15, min: 0, max: 1,   group: 'Brush', target: 'js',  label: 'taper (width at no pressure)' },
  { key: 'brushCapacity', v: 5000, min: 0, max: 30000, group: 'Brush', target: 'js', label: 'water brush: reservoir (0 = endless)' },
  { key: 'mouseTouch',    v: 1,    min: 0.02, max: 1, group: 'Brush', target: 'js',  label: 'mouse: touch (Z / Option lighter, X heavier)' },
  { key: 'touchRate',     v: 0.8,  min: 0, max: 5,   group: 'Brush', target: 'js',  label: 'mouse: touch glides per second' },
  { key: 'dipLoad',       v: 1,    min: 0, max: 1, group: 'Brush', target: 'js',  label: 'wetness (dip brush reload)' },
  { key: 'dryBelow',      v: 0.7,  min: 0.05, max: 1, group: 'Brush', target: 'js',  label: 'brush skips below (fraction full)' },
  { key: 'speedSkim',     v: 0.6,  min: 0, max: 2,   group: 'Brush', target: 'js',  label: 'fast strokes skim the tooth' },
  { key: 'touchdownEase', v: 0.12, min: 0, max: 1,   group: 'Brush', target: 'js',  label: 'mouse: ease-in (s)' },
  { key: 'emptyLevel',    v: 0.35, min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'water left when empty' },
  { key: 'dabSize',       v: 1500, min: 50, max: 10000, group: 'Brush', target: 'js', label: 'water brush dab (pigment)' },
  { key: 'squeezeRate',   v: 0.6,  min: 0, max: 3,   group: 'Brush', target: 'js',  label: 'water brush squeeze (per s)' },
  { key: 'thicken',       v: 1.5,  min: 0, max: 5,   group: 'Brush', target: 'sim', label: 'paint thickens as it empties' },
  { key: 'skipAmount',    v: 0.9,  min: 0, max: 1.5, group: 'Brush', target: 'sim', label: 'dry-brush skip' },
  { key: 'mistRadius',  v: 110,  min: 10, max: 400, group: 'Brush', target: 'sim', label: 'mist: spray reach (cells)' },
  { key: 'mistWater',   v: 0.14, min: 0, max: 0.5, group: 'Brush', target: 'sim', label: 'mist: droplet water' },
  { key: 'mistDensity', v: 0.5,  min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'mist: droplets per pass' },
  { key: 'mistDamp',    v: 0.04, min: 0, max: 0.5, group: 'Brush', target: 'sim', label: 'mist: dampens the paper' },
  { key: 'pencilRadius', v: 2.5,  min: 0.5, max: 15, group: 'Brush', target: 'js',  label: 'pencil: line width (cells)' },
  { key: 'pencilDark',  v: 0.3,  min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'pencil: darkness (hard to soft lead)' },
  { key: 'eraserRadius', v: 14,  min: 2, max: 80,  group: 'Brush', target: 'js',  label: 'eraser: size (cells)' },
  { key: 'eraseRate',   v: 1,    min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'eraser: how much a pass takes' },
  { key: 'maskTear',    v: 0.15, min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'mask peel lifts paint under it' },
  { key: 'blotRadius',  v: 70,   min: 10, max: 300, group: 'Brush', target: 'sim', label: 'blot: towel wad size (cells)' },
  { key: 'blotScale',   v: 2.5,  min: 0.5, max: 10, group: 'Brush', target: 'sim', label: 'blot: crease size (mm)' },
  { key: 'blotRate',    v: 0.9,  min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'blot: how much it soaks up per press' },
  { key: 'liftWater',   v: 0.35, min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'lift: how much a thirsty brush takes (Wetness down = thirstier)' },
  { key: 'liftLeaves',  v: 0.04, min: 0, max: 0.3, group: 'Brush', target: 'sim', label: 'lifting leaves wet paper damp (water)' },
  { key: 'liftDry',       v: 0.05, min: 0, max: 2,   group: 'Brush', target: 'sim', label: 'lift and blot take settled paint' },
  { key: 'liftStrength',  v: 0.24,  min: 0, max: 1,   group: 'Brush', target: 'sim', label: 'lift strength' },

  // --- Render (Kubelka-Munk) ---
  { key: 'undoDepth',       v: 5,    min: 3, max: 20, group: 'Render', target: 'js', label: 'undo snapshots (~175 MB each; history between them is replayed)' },
  { key: 'thickness',       v: 8,    min: 0, max: 40, group: 'Render', target: 'render', label: 'pigment thickness' },
  { key: 'wetDarken',       v: 0.5,  min: 0, max: 3,  group: 'Render', target: 'render', label: 'standing water darkens' },
  { key: 'dampDarken',      v: 0.8,  min: 0, max: 3,  group: 'Render', target: 'render', label: 'damp paper shows' },
  { key: 'paperShade',      v: 0.12, min: 0, max: 1,  group: 'Render', target: 'render', label: 'paper texture' },
  { key: 'spectral',        v: 1,    min: 0, max: 1,  group: 'Render', target: 'render', label: 'spectral colour (0/1)' },
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
