// Brush presets. Each sets the brush knobs together, like paper presets.
//   type          'dip': reloads its recipe every stroke; 'water': separate
//                 pigment and water stores that persist between strokes
//                 (click a pan to pick up a dab, Q to squeeze water in,
//                 E to wipe the pigment out)
//   knobs         brushRadius (cells, 0.2 mm), brushSoftness, taperMin,
//                 brushCapacity (water it holds), brushRate (how readily it
//                 releases water), brushWater (how wet it lays), thicken
//                 (how much its paint concentrates as it empties),
//                 contactLength (hair trailing along the paper, cells;
//                 0 = about the brush's width)
// Sizes and capacities are estimates for common brushes.

export const BRUSHES = {
  round: {
    name: 'Synthetic round',
    type: 'dip',
    knobs: { brushShape: 0, tipLength: 1.6, tipLanding: 0.12, liftOut: 0.12, brushRadius: 14, brushSoftness: 0.4, taperMin: 0.15, brushCapacity: 5000, brushRate: 0.4, brushWater: 0.3, thicken: 1.5, contactLength: 0 },
  },
  mop: {
    // A squirrel mop's belly holds a huge amount of water and lets it go
    // gently; soft hair, and a surprisingly fine point: it's tapered, so it
    // lands long and pointed (tipLength), and narrows sharply as it lifts.
    name: 'Squirrel mop',
    type: 'dip',
    knobs: { brushShape: 0, tipLength: 3.2, tipLanding: 0.5, liftOut: 0.25, brushRadius: 30, brushSoftness: 0.8, taperMin: 0.08, brushCapacity: 30000, brushRate: 0.22, brushWater: 0.4, thicken: 0.8, contactLength: 0 },
  },
  water: {
    // Water in the handle, a little pigment at the tip.
    name: 'Water brush',
    type: 'water',
    knobs: { brushShape: 0, tipLength: 1.6, tipLanding: 0.12, liftOut: 0.12, brushRadius: 12, brushSoftness: 0.5, taperMin: 0.2, brushCapacity: 15000, brushRate: 0.4, brushWater: 0.28, thicken: 0, contactLength: 0 },
  },
  rigger: {
    // Long hair trails along the paper feeding paint to the line, so even
    // a quick flick leaves a full mark.
    name: 'Rigger',
    type: 'dip',
    knobs: { brushShape: 0, tipLength: 2.5, tipLanding: 0.3, liftOut: 0.2, brushRadius: 4, brushSoftness: 0.3, taperMin: 0.05, brushCapacity: 1500, brushRate: 0.5, brushWater: 0.3, thicken: 1.5, contactLength: 45 },
  },
  flat: {
    // A half-inch flat: square ends and a chisel edge, for cutting crisp
    // edges and laying bands; turn it with R or the scroll wheel.
    name: 'Flat (1/2")',
    type: 'dip',
    knobs: { brushShape: 1, liftOut: 0, flatAngle: 0, flatThickness: 0.18, brushRadius: 32, brushSoftness: 0.3, taperMin: 0.7, brushCapacity: 8000, brushRate: 0.4, brushWater: 0.32, thicken: 1.2, contactLength: 0 },
  },
};

export const DEFAULT_BRUSH = 'round';
