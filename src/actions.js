// Everything the painter can do, by one name. The page builds its tool
// buttons, action buttons and keys from these tables, and scripts call the
// same actions with sim.tool(name) and sim.act(name, ...args), so a person
// and an agent reach every tool the same way. tools/agents-doc.mjs writes
// AGENTS.md from this file (and the knob table), so the guide can't drift.
//
// This file is data only (no DOM, no GPU) so node can read it.

// Tools: what the pointer does on the paper. One is active at a time.
export const TOOLS = [
  { name: 'paint',  mode: 0, key: '1', label: 'Paint',  doc: 'Lay paint from the loaded brush (a pan, a mixing well, or the water brush\'s dab).' },
  { name: 'water',  mode: 1, key: '2', label: 'Water',  doc: 'The same brush with clean water: wet the paper for wet-in-wet, soften edges, rewet and move dried paint.' },
  { name: 'lift',   mode: 2, key: '3', label: 'Lift',   doc: 'A thirsty brush that soaks up paint and water. Turn Wetness down for a thirstier brush; full Wetness barely lifts.' },
  { name: 'mist',   mode: 4, key: '5', label: 'Mist',   doc: 'Spray bottle: fine droplets over a wide cone that dampen the paper, so strokes laid into it melt together.' },
  { name: 'blot',   mode: 6, key: '7', label: 'Blot',   doc: 'Press a crumpled paper towel on wet paint to soak it up, leaving a mottled crease texture.' },
  { name: 'mask',   mode: 5, key: '6', label: 'Mask',   doc: 'Masking fluid: a rubber film on dry paper or dried paint that washes flow around. Peel it with Remove mask.' },
  { name: 'wash',   mode: 7, key: '8', label: 'Wash',   doc: 'Choose an area (lasso, rectangle or the whole sheet) and the loaded brush lays a wash in it, in real time: flat, graded, or around whatever is already painted there. Esc stops it; Cmd+Z takes the whole wash back.' },
  { name: 'magnet', mode: 3, key: '4', label: 'Magnet', doc: 'Place a magnet under the paper (it pulls magnetic pigments such as Mars black). Drag to move; double-click, drag off the sheet or press Delete to remove; R or scroll to rotate.' },
];

// Actions: buttons (and keys) that do something once, or while held.
//   group   where the button lives: 'sheet' (on the paper), 'magnet' (shown
//           with the magnet tool), 'history', 'file'
//   hold    true: active while the button or key is held (act(name, on))
//   human   true: only makes sense for a person at the page (a script has
//           another way, named in the doc)
export const ACTIONS = [
  { name: 'dry',        group: 'sheet',   label: 'Blow-dry (hold)', key: 'D', hold: true,
    doc: 'A hair dryer over the whole sheet while held: water evaporates much faster (see the dryer knob).' },
  { name: 'fix',        group: 'sheet',   label: 'Fix (spray)',
    doc: 'Spray workable fixative (like SpectraFix) over the sheet: commits the dry paint so it barely rewets or lifts, deepens it a little, fills some tooth and seals the paper.' },
  { name: 'unmask',     group: 'sheet',   label: 'Remove mask',
    doc: 'Peel off all masking fluid. Some dried paint under it comes away too, more for non-staining pigments.' },
  { name: 'stop',       group: 'sheet',   label: 'Stop wash', key: 'Esc',
    doc: 'Stop a wash in progress (what it painted stays; Cmd+Z takes it back).' },
  { name: 'pause',      group: 'sheet',   label: 'Pause', key: 'Space', toggle: true,
    doc: 'Stop time: nothing flows or dries until unpaused.' },
  { name: 'clear',      group: 'sheet',   label: 'Clear', key: 'C',
    doc: 'Wipe the sheet back to clean paper (undoable).' },
  { name: 'newPaper',   group: 'sheet',   label: 'New paper',
    doc: 'A fresh sheet of the chosen paper, with a new random texture.' },
  { name: 'flipMagnets', group: 'magnet', label: 'Flip poles', key: 'F',
    doc: 'Flip every magnet\'s pole: pigment is pushed instead of pulled.' },
  { name: 'removeMagnets', group: 'magnet', label: 'Remove magnets',
    doc: 'Take every magnet away.' },
  { name: 'undo',       group: 'history', label: 'Undo', key: 'Cmd+Z',
    doc: 'Undo the last stroke or sheet action. Wet paint comes back exactly as it was, mid-flow.' },
  { name: 'redo',       group: 'history', label: 'Redo', key: 'Shift+Cmd+Z',
    doc: 'Redo what was undone (until the next stroke).' },
  { name: 'savePainting', group: 'file',  label: 'Save painting',
    doc: 'Download the full paint state (.wcpaint) to reopen and keep working on, even rewet, later. Scripts: sim.paintingBlob().' },
  { name: 'open',       group: 'file',    label: 'Open…', human: true,
    doc: 'Open a saved painting. Scripts: sim.open(blob), or tools/paint.mjs --open file.' },
  { name: 'restore',    group: 'history',   label: 'Restore', human: true,
    doc: 'Reopen the autosave (kept in this browser every few seconds), newest first; click again for the one before.' },
  { name: 'savePNG',    group: 'file',    label: 'Save PNG',
    doc: 'Download the painting as it looks. Scripts: tools/paint.mjs --shot file.' },
  { name: 'saveLayer',  group: 'file',    label: 'Save layer',
    doc: 'Download just the paint on a transparent background: a filter layer (multiply) and a body layer (add). Scripts: sim.layerBlobs().' },
  { name: 'record',     group: 'file',    label: 'Record strokes', toggle: true, human: true,
    doc: 'Record pointer strokes and settings to a file that replays exactly. Scripts replay them with sim.replay(rec) or tools/paint.mjs --replay file.' },
];

// The painting controls always in view: knobs a painter turns while
// painting. Everything else lives in the brush and paper builders or the
// hidden lab. `tool` / `flat`: shown only with that tool / a flat brush.
export const STUDIO = [
  { key: 'brushRadius',  label: 'Size', min: 1, max: 80, doc: 'Brush size (full pressure). Pressure narrows it toward the brush\'s taper.' },
  { key: 'brushPigment', label: 'Paint strength', min: 0.02, max: 1.5, doc: 'How much pigment the brush picks up: a pale wash to thick paint.' },
  { key: 'dipLoad',      label: 'Wetness', doc: 'How much water the brush holds: turn it down for a blotted, dry-ish brush (dry-brush skips; a thirstier lift).' },
  { key: 'mouseTouch',   label: 'Touch', doc: 'Mouse and trackpad pressure: hold Z (or Option) to lighten, X to press harder; it stays where you leave it.' },
  { key: 'tiltY',        label: 'Tilt (down)', doc: 'Tilt the board so wet paint runs down the sheet (negative: up). Real painters tilt constantly to move a wash.' },
  { key: 'tiltX',        label: 'Tilt (right)', doc: 'Tilt the board sideways.' },
  { key: 'flatAngle',    label: 'Angle', flat: true, doc: 'Which way the flat brush faces (R / Shift+R, or scroll over the paper).' },
  { key: 'mistRadius',   label: 'Spray reach', tool: 'mist', doc: 'How wide the spray bottle\'s cone is.' },
  { key: 'blotRadius',   label: 'Towel size', tool: 'blot', doc: 'Size of the paper-towel wad.' },
  { key: 'blotScale',    label: 'Crease size', tool: 'blot', doc: 'How coarse the towel\'s crumpled creases are (mm).' },
];

// Keys that aren't tied to one action.
export const KEYS = [
  ['[ ]', 'previous / next pigment'], ['Shift-drag', 'side of the brush'], ['Z / X', 'lighter / heavier touch'],
  ['R, scroll', 'turn a flat brush or a magnet'], ['Q / E', 'water brush: squeeze water in / wipe pigment out'],
];

// The script interface beyond tools and actions, for AGENTS.md. `probe`
// entries are checked to exist by the api probe (tools/probes.js).
export const SCRIPT_API = [
  { section: 'Tools and actions' },
  { call: 'sim.tool(name)', probe: 'sim.tool', doc: 'Pick a tool by name (table above); the page\'s buttons follow.' },
  { call: 'sim.act(name, ...args)', probe: 'sim.act', doc: 'Do an action by name (table above). Held actions take on/off: sim.act(\'dry\', true).' },
  { section: 'Painting' },
  { call: 'sim.path(points, framesPerSeg = 4)', probe: 'sim.path',
    doc: 'One stroke through [x, y, pressure?, side?] points in grid cells (1024×768, 0.2 mm each), in real time. Pressure sets width (down to the brush\'s taper); side > 0 lays the brush on its side. A path whose first two points are equal is a dab.' },
  { call: 'sim.headless.setBrushPreset(key)', probe: 'sim.headless.setBrushPreset',
    doc: 'Pick a brush: round, mop, water, rigger, flat.' },
  { call: 'sim.headless.setBrush(nameOrMix)', probe: 'sim.headless.setBrush',
    doc: 'Load pigment: a name (\'French Ultramarine\') or a mix [[name, parts], ...]. sim.headless.pigmentNames() lists the paint box.' },
  { call: 'sim.values', probe: 'sim.values',
    doc: 'Every knob by key (see the tables below). brushRadius, brushPigment (paint strength) and dipLoad (Wetness) are the everyday ones; set them directly.' },
  { call: 'sim.headless.setPaper(key, seed)', probe: 'sim.headless.setPaper',
    doc: 'New sheet of a paper preset with a fixed seed.' },
  { call: 'sim.headless.setTone(key)', probe: 'sim.headless.setTone', doc: 'Paper tone (natural, white, …).' },
  { section: 'The paint box' },
  { call: 'sim.pigments.get(name)', probe: 'sim.pigments.get', doc: 'A pigment\'s recipe: masstone and tint colours, opacity, scatter, spectrum, and its physical ratings (density, staining, granulation, flocculation, mobility, wick, load, magnetic; see RECIPE_FIELDS in src/pigments.js).' },
  { call: 'sim.pigments.edit(name, changes)', probe: 'sim.pigments.edit', doc: 'Change a pigment\'s recipe; it is rebuilt (colour fit included) and applies everywhere at once. The painter\'s edits live in their browser and in saved paintings; a headless page starts from the built-in box.' },
  { call: 'sim.pigments.add(from, name, changes)', probe: 'sim.pigments.add', doc: 'A new pan starting from another pigment\'s recipe. Returns its id. The box holds 32.' },
  { call: 'sim.pigments.reset(name) / remove(name) / recipes()', probe: 'sim.pigments.reset', doc: 'Back to the built-in recipe; remove the newest pigment of one\'s own; every recipe that differs from the built-in box.' },
  { section: 'The Wash tool' },
  { call: 'sim.wash(outline, { kind, fadeTo, mist, water })', probe: 'sim.wash', doc: 'What the Wash tool does with the painter\'s lasso: fill the outline ([[x, y], ...], or null for the whole sheet) with the loaded brush. kind: \'flat\' (fill), \'graded\' (strength fades top to bottom to fadeTo × paint strength) or \'around\' (washAround: goes around paint already there; mist: spray first). water: true for clean water (wetting an area for wet-in-wet). One undo step; resolves false if stopped. The panel\'s settings are sim.washOptions.' },
  { section: 'Little minds (src/minds.js, window.__minds)' },
  { call: 'M.fill(poly, { grade, mode })', probe: '__minds.fill',
    doc: 'Paint a polygon evenly with the loaded brush (rows, cutting in along the edge, rewetting edges that start to dry). grade: [start, end] multiplies paint strength top to bottom.' },
  { call: 'M.washAround(area, { margin, pigmentAt, brushAt, mist })', probe: '__minds.washAround',
    doc: 'A wash that senses paint already on the sheet and goes around it: tip contours along shapes, then rows. pigmentAt/brushAt vary strength and mix by position.' },
  { call: 'M.soften(line, out)', probe: '__minds.soften', doc: 'Find the wet edge along a line and run a damp brush along it to soften it.' },
  { call: 'M.mark(points, { target })', probe: '__minds.mark', doc: 'A stroke that checks it actually left paint, and repeats if it skipped.' },
  { call: 'M.waitDry(points)', probe: '__minds.waitDry', doc: 'Wait (with the dryer) until those points are dry and the gum has set. Returns seconds.' },
  { call: 'M.waitDamp(points, { below })', probe: '__minds.waitDamp', doc: 'Wait until those points are only damp (for soft-but-held marks).' },
  { section: 'Looking and history' },
  { call: 'sim.look(name)', probe: 'sim.look', doc: 'Save a screenshot under that name (tools/paint.mjs --looks dir collects them), to look at mid-painting.' },
  { call: 'sim.checkpoint() / sim.undo() / sim.redo()', probe: 'sim.checkpoint', doc: 'Undo points: strokes by hand checkpoint themselves; scripts call checkpoint() before something they may want to take back.' },
  { call: 'sim.sense(x, y, r)', probe: 'sim.sense', doc: 'What is on the paper around a point: water, suspended and deposited pigment.' },
  { call: 'sim.cell(x, y)', probe: 'sim.cell', doc: 'Everything stored in one cell (debugging).' },
  { call: 'sim.replay(rec)', probe: 'sim.replay', doc: 'Replay a recorded hand stroke file exactly (hand and scripted strokes take different code paths; use this to reproduce the painter\'s bugs).' },
];
