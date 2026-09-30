import { PARAMS, SIM_PARAMS, simParamBufferSize } from './params.js';
import { simWGSL, renderWGSL, MAX_PIGMENTS, MAX_CHARGES } from './shaders.js';
import { SHAPES, buildCharges, drawMagnet, hitMagnet } from './magnets.js';
import { BRUSHES, DEFAULT_BRUSH } from './brushes.js';
import { makeMinds } from './minds.js';
import { TOOLS, ACTIONS, STUDIO, KEYS } from './actions.js';
import { KNOB_DOCS } from './knob-docs.js';
import { makePaper, PAPERS, DEFAULT_PAPER, TONES } from './paper.js';
import { PIGMENTS, STAIN_MAP, RECIPES, RECIPE_FIELDS, SPECTRA, OPACITIES, buildPigment, refitStainMap } from './pigments.js';
import { NB, upsample, srgbToLinear, TO_RGB, spectrumToLinear } from './spectral.js';

const W = 1024, H = 768, N = W * H;
const WG = 16;
// Spectral table floats: pigments (16 K + 16 S each), ground, stain maps.
const SPEC_FLOATS = MAX_PIGMENTS * 32 + NB + 6 * NB;
// Suspended components (G): bytes per cell, stored packed (GP in
// shaders.js): eight 8-bit pigment ids in two u32, then eight f32 amounts.
// As 32-bit words: ids 0-1, amounts 2-9.
const NG = 8, GB = 40;
const gId = (gu, c, k) => (gu[c * 10 + (k >> 2)] >>> (8 * (k & 3))) & 255;
const gAmt = (gf, c, k) => gf[c * 10 + 2 + k];
// Deposits (D): bytes per cell, stored packed (DS in shaders.js): stainK,
// stainS (4 f32 each), 8 pigment ids as bytes in 2 u32, 8 f32 amounts,
// 8 f32 stamps, masking fluid (0/1), padding. As floats: 0-3, 4-7, 8-9,
// 10-17, 18-25, 26. (Older saves have 0 in the padding: no mask.)
const ND = 8, DB = 112;
const dId = (du, c, k) => (du[c * 28 + 8 + (k >> 2)] >>> (8 * (k & 3))) & 255;
// Older saves: id vec4u, amt, stainK, stainS, stamp (vec4 each, 80 bytes).
function packOldD(old) {
  const ou = new Uint32Array(old), of = new Float32Array(old);
  const out = new ArrayBuffer(N * DB), nu = new Uint32Array(out), nf = new Float32Array(out);
  for (let c = 0; c < N; c++) {
    const o = c * 20, n = c * 28;
    for (let k = 0; k < 4; k++) {
      nf[n + k] = of[o + 8 + k]; nf[n + 4 + k] = of[o + 12 + k];
      nf[n + 10 + k] = of[o + 4 + k]; nf[n + 18 + k] = of[o + 16 + k];
    }
    nu[n + 8] = ((ou[o] & 255) | ((ou[o + 1] & 255) << 8) | ((ou[o + 2] & 255) << 16) | ((ou[o + 3] & 255) << 24)) >>> 0;
  }
  return out;
}
// Older saves: version 3 packed four ids into one u32 then four amounts (20
// bytes a cell); before that, four u32 ids then four amounts (32 bytes).
function packOldG(old, version) {
  const ou = new Uint32Array(old), of = new Float32Array(old);
  const out = new ArrayBuffer(N * GB), nu = new Uint32Array(out), nf = new Float32Array(out);
  for (let c = 0; c < N; c++) {
    let ids = 0;
    for (let k = 0; k < 4; k++) {
      const id = version >= 3 ? (ou[c * 5] >>> (8 * k)) & 255 : ou[c * 8 + k] & 255;
      ids |= id << (8 * k);
      nf[c * 10 + 2 + k] = version >= 3 ? of[c * 5 + 1 + k] : of[c * 8 + 4 + k];
    }
    nu[c * 10] = ids >>> 0;
  }
  return out;
}

const values = Object.fromEntries(PARAMS.map(p => [p.key, p.v]));
// Stop a wash in progress now: the brush lifts at once, and the wash ends
// at its next step (sim.path rejects).
const stopWashNow = () => { if (state.washing) { state.cancelWash = true; state.pointer.down = false; } if (state.skipping) state.cancelSkip = true; };
const state = {
  stopWash: () => stopWashNow(),
  mode: 0,          // 0 paint, 1 water, 2 lift, 3 magnet, 4 mist, 5 mask, 6 blot, 7 wash, 8 pencil, 9 eraser
  // What the brush is loaded with: up to 4 pigments (PIGMENTS indices) and
  // their fractions of the load. One pigment straight from a pan, or a mix.
  brush: [{ pigment: 0, frac: 1 }],
  paper: DEFAULT_PAPER,
  tone: 'natural',
  drying: false,
  paused: false,
  headless: false,
  simTime: 0,       // simulated seconds (deposit timestamps)
  lastEdit: -Infinity, // when the painting was last touched (for autosave)
  ground: null,     // render over this colour instead of the paper (layer export)
  carry: null,      // pigment the brush has picked up from wet paint, by id (set up at start)
  fixPending: false, // spray fixative over the sheet on the next step
  unmaskPending: false, // peel off the masking fluid on the next step
  magnets: [],      // { shape, x, y, angle, moment } in grid cells (see magnets.js)
  magnetShape: 'disc',
  magDirty: true,   // magnet field needs recomputing
  reservoir: 1,     // water in the brush: 1 = fully loaded
  // Dip brush: reloads its recipe every stroke. Water brush: pigment and
  // water are separate stores that persist between strokes; clicking a pan
  // adds a dab of pigment, Q squeezes water in, E wipes the pigment out.
  brushType: 'dip',
  pigStore: 1,      // pigment in the brush, in dabs (water brush)
  squeezing: false,
  brushActive: false,
  smoothSeg: 0,     // smoothed brush travel per frame (cells), for dwell
  pointer: { down: false, x: 0, y: 0, px: 0, py: 0, pressure: 1 },
};

async function init() {
  const canvas = document.getElementById('canvas');
  if (!navigator.gpu) return fail('WebGPU is not available in this browser.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return fail('No WebGPU adapter found.');
  // 10 storage buffers per stage are needed; WebGPU's default limit is 8.
  const device = await adapter.requestDevice({
    requiredLimits: { maxStorageBuffersPerShaderStage: Math.min(adapter.limits.maxStorageBuffersPerShaderStage, 10) },
  });
  device.lost.then(info => fail(`GPU device lost: ${info.message}`));
  device.addEventListener('uncapturederror', e => console.error('[wgpu]', e.error.message));

  canvas.width = W; canvas.height = H;
  const overlay = document.getElementById('overlay');
  overlay.width = W; overlay.height = H;
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  // ---- buffers
  const S = GPUBufferUsage.STORAGE, CD = GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, U = GPUBufferUsage.UNIFORM;
  const buf = (size, usage) => device.createBuffer({ size, usage });
  const auxBuf = buf(N * 16, S | CD);  // (paper height, wet mask, scratch, -)
  const A = [buf(N * 16, S | CD), buf(N * 16, S | CD)];
  const B = [buf(N * 16, S | CD), buf(N * 16, S | CD)];
  const G = [buf(N * GB, S | CD), buf(N * GB, S | CD)];  // suspended components (packed, see GP in shaders.js)
  const Dbuf = buf(N * DB, S | CD);                      // deposited components + stain + stamps (DS in shaders.js)
  const paramBuf = buf(simParamBufferSize(), U | CD);
  const frameBuf = buf(160, U | CD);
  const renderBuf = buf(64, U | CD);
  const pigBuf = buf(MAX_PIGMENTS * 64, U | CD);
  const specBuf = buf(SPEC_FLOATS * 4, S | CD);
  const magBuf = buf(16 + MAX_CHARGES * 32, U | CD);
  const magData = new ArrayBuffer(16 + MAX_CHARGES * 32);
  const magU32 = new Uint32Array(magData), magF32 = new Float32Array(magData);
  const magPhiBuf = buf(N * 4, S | CD);   // |B|^2, recomputed when magnets change
  let magDepthSeen = null;
  const TILE = 16, TX = Math.ceil(W / TILE), TY = Math.ceil(H / TILE);
  // Tiles struct: indirect args (16 bytes), then per-tile state, then list.
  // Tiles struct: indirect args (16 bytes), brush tallies (16), per-tile
  // state, then the list.
  state.carry = new Float64Array(MAX_PIGMENTS);
  const CARRY_OFF = 32 + TX * TY * 8;   // tiles.carry, MAX_PIGMENTS u32 (x1e5)
  const CARRY_WORDS = MAX_PIGMENTS * 3 + 2;   // carry, its step tallies, and the brush's trade (see Tiles)
  const tilesBuf = buf(CARRY_OFF + CARRY_WORDS * 4, S | CD);
  // Indirect args are copied out of tilesBuf: a buffer can't be both bound as
  // writable storage and used for an indirect dispatch.
  const argsBuf = buf(16, CD | GPUBufferUsage.INDIRECT);

  // The history log (undo and redo replay it; see "history" below). Ops
  // that write the sheet from the CPU are logged by what they do, so replay
  // can do them again.
  const hist = { log: [], recording: true, lastParams: null, marks: [], cursor: null, tail: [], endSnap: null };
  // After an undo, what the live sheet does goes to a tail, kept only if
  // painting carries on from there (redo drops it).
  const histPush = e => { if (hist.recording) (hist.cursor === null ? hist.log : hist.tail).push(e); };
  const logOp = e => histPush({ t: 'op', ...e });
  const paperNow = (key, seed) => {
    const h = makePaper(W, H, PAPERS[key], seed);
    const aux = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) aux[i * 4] = h[i];
    device.queue.writeBuffer(auxBuf, 0, aux);
  };
  const newPaper = (seed = (Math.random() * 1e9) | 0) => {
    state.stopWash();
    logOp({ op: 'paper', key: state.paper, seed });
    paperNow(state.paper, seed);
  };
  // Anything that replaces the sheet stops a wash in progress first.
  const clear = () => {
    state.stopWash();
    window.__sim?.checkpoint?.();
    logOp({ op: 'clear' });
    clearNow();
  };
  function clearNow() {
    const z = new Float32Array(N * 4);
    for (const b of [...A, ...B]) device.queue.writeBuffer(b, 0, z);
    // A cleared sheet starts its clock again (deposit timestamps and
    // flocculation fields are relative), so identical sessions reproduce.
    state.simTime = 0;
    for (const b of G) device.queue.writeBuffer(b, 0, new Float32Array(N * GB / 4));
    device.queue.writeBuffer(Dbuf, 0, new Float32Array(N * DB / 4));
    device.queue.writeBuffer(tilesBuf, 32, new Uint32Array(TX * TY));
    device.queue.writeBuffer(tilesBuf, CARRY_OFF, new Uint32Array(CARRY_WORDS));   // a clean brush
    state.carry?.fill(0);
  }
  newPaper();

  // ---- pipelines
  const simModule = device.createShaderModule({ code: simWGSL(TX * TY, undefined, undefined, window.__transportVariant ?? 0) });
  const renderModule = device.createShaderModule({ code: renderWGSL() });
  for (const m of [simModule, renderModule]) {
    const info = await m.getCompilationInfo();
    for (const msg of info.messages) console[msg.type === 'error' ? 'error' : 'warn'](`[wgsl ${msg.lineNum}:${msg.linePos}] ${msg.message}`);
  }

  const C = GPUShaderStage.COMPUTE;
  const simLayout = device.createBindGroupLayout({
    entries: [
      [0, 'uniform'], [1, 'uniform'], [2, 'storage'],
      [3, 'read-only-storage'], [4, 'storage'], [5, 'read-only-storage'], [6, 'storage'],
      [7, 'storage'], [8, 'storage'], [9, 'read-only-storage'], [10, 'storage'], [11, 'storage'], [12, 'uniform'], [13, 'uniform'],
    ].map(([binding, type]) => ({ binding, visibility: C, buffer: { type } })),
  });
  const simPL = device.createPipelineLayout({ bindGroupLayouts: [simLayout] });
  const compute = entryPoint => device.createComputePipeline({
    layout: simPL, compute: { module: simModule, entryPoint },
  });
  const pipes = {
    blurH: compute('blurH'), blurV: compute('blurV'),
    velocity: compute('velocity'), transport: compute('transport'),
    markTiles: compute('markTiles'), compactTiles: compute('compactTiles'),
    magField: compute('magField'), fixSheet: compute('fixSheet'), bumpStep: compute('bumpStep'), unmaskSheet: compute('unmaskSheet'),
  };

  // Parity k reads A[k], B[k], G[k] and writes A[1-k], B[1-k], G[1-k].
  const simBG = [0, 1].map(k => device.createBindGroup({
    layout: simLayout,
    entries: [[0, paramBuf], [1, frameBuf], [2, auxBuf], [3, A[k]], [4, A[1 - k]], [5, B[k]], [6, B[1 - k]],
              [7, tilesBuf], [8, magPhiBuf], [9, G[k]], [10, G[1 - k]], [11, Dbuf], [12, pigBuf], [13, magBuf]]
      .map(([binding, buffer]) => ({ binding, resource: { buffer } })),
  }));

  const F = GPUShaderStage.FRAGMENT;
  const renderLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: F, buffer: { type: 'uniform' } },
      { binding: 1, visibility: F, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: F, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: F, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: F, buffer: { type: 'read-only-storage' } },
      { binding: 5, visibility: F, buffer: { type: 'uniform' } },
      { binding: 6, visibility: F, buffer: { type: 'read-only-storage' } },
    ],
  });
  const renderPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [renderLayout] }),
    vertex: { module: renderModule, entryPoint: 'vs' },
    fragment: { module: renderModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const renderBG = [0, 1].map(k => device.createBindGroup({
    layout: renderLayout,
    entries: [renderBuf, A[k], auxBuf, G[k], Dbuf, pigBuf, specBuf].map((buffer, binding) => ({ binding, resource: { buffer } })),
  }));

  let parity = 0;

  // ---- uniforms
  const paramData = new Float32Array(simParamBufferSize() / 4);
  const frameData = new ArrayBuffer(160);
  const frameU32 = new Uint32Array(frameData), frameF32 = new Float32Array(frameData);
  const renderData = new ArrayBuffer(64);
  // The pigment table: colour and physical properties of every pigment in
  // the paint box, and (render only) their spectra: per pigment 16 K then
  // 16 S bands; then the ground (paper) spectrum; then maps from the stain
  // layer's RGB K and S totals to spectra (the stain layer keeps only RGB
  // sums, see stainDep). Uploaded again when the painter edits a pigment.
  const pigData = new Float32Array(MAX_PIGMENTS * 16);
  const specData = new Float32Array(SPEC_FLOATS);
  const uploadPigments = () => {
    pigData.fill(0);
    PIGMENTS.slice(0, MAX_PIGMENTS).forEach((pg, k) => {
      pigData.set([...pg.K, 0, ...pg.S, 0,
        pg.density, pg.staining, pg.granulation, pg.flocculation,
        pg.mobility, pg.wick, pg.load ?? 1, pg.magnetic ?? 0], k * 16);
    });
    device.queue.writeBuffer(pigBuf, 0, pigData);
    refitStainMap();
    PIGMENTS.slice(0, MAX_PIGMENTS).forEach((pg, k) => specData.set([...pg.Kspec, ...pg.Sspec], k * 32));
    specData.set(STAIN_MAP.K.flat(), MAX_PIGMENTS * 32 + NB);
    specData.set(STAIN_MAP.S.flat(), MAX_PIGMENTS * 32 + NB + 3 * NB);
    device.queue.writeBuffer(specBuf, 0, specData);
    logOp({ op: 'pig', pig: pigData.slice(), spec: specData.slice() });
  };
  // The painter's paint box: edits to the built-in recipes and pigments of
  // their own, kept in this browser and in saved paintings. Editing a
  // pigment changes it everywhere, paint already on the sheet included
  // (except the colour of paint that has stained into the fibres, which is
  // fixed when it stains).
  const BOX_KEY = 'hyperreal-watercolor.pigments';
  const RECIPE_KEYS = ['name', 'code', 'kind', 'masstone', 'mid', 'tint', 'opacity', 'scatter', 'spectrum', 'density', 'staining', 'granulation', 'flocculation', 'mobility', 'wick', 'load', 'magnetic', 'custom', 'hidden'];
  const recipeOf = pg => Object.fromEntries(RECIPE_KEYS.filter(k => pg[k] !== undefined).map(k => [k, pg[k]]));
  const box = {
    changed: [],
    get(name) { const pg = PIGMENTS.find(pg => pg.name === name); if (!pg) throw new Error(`unknown pigment ${name}`); return recipeOf(pg); },
    // Change some of a pigment's recipe: box.edit('Transparent Red Oxide', { masstone: '#5A2010', staining: 0.8 }).
    edit(name, changes) {
      const i = PIGMENTS.findIndex(pg => pg.name === name);
      if (i < 0) throw new Error(`unknown pigment ${name}`);
      const recipe = { ...recipeOf(PIGMENTS[i]), ...changes, name: changes.name ?? name };
      PIGMENTS[i] = buildPigment(recipe);
      box.commit();
      return recipeOf(PIGMENTS[i]);
    },
    // A new pan, starting from an existing pigment's recipe.
    add(from, name, changes = {}) {
      if (PIGMENTS.length >= MAX_PIGMENTS) throw new Error(`the paint box holds ${MAX_PIGMENTS} pigments`);
      if (PIGMENTS.some(pg => pg.name === name)) throw new Error(`there is already a pigment called ${name}`);
      PIGMENTS.push(buildPigment({ ...box.get(from), code: 'custom', ...changes, name, custom: true }));
      box.commit();
      return PIGMENTS.length - 1;
    },
    // Back to the built-in recipe (built-in pigments only).
    reset(name) {
      const r = RECIPES.find(r => r.name === name);
      if (!r) throw new Error(`${name} isn't a built-in pigment`);
      PIGMENTS[PIGMENTS.findIndex(pg => pg.name === name)] = buildPigment(r);
      box.commit();
    },
    // Remove a pigment of the painter's own (only if it isn't on the sheet
    // or in the brush: ids are GPU slots, so it has to be the last one).
    remove(name) {
      const i = PIGMENTS.findIndex(pg => pg.name === name);
      if (!PIGMENTS[i]?.custom) throw new Error(`${name} isn't a pigment of your own`);
      if (i !== PIGMENTS.length - 1) throw new Error('only the newest pigment of your own can be removed');
      PIGMENTS.pop();
      state.brush = state.brush.filter(b => b.pigment < PIGMENTS.length);
      if (!state.brush.length) state.brush = [{ pigment: 0, frac: 1 }];
      box.commit();
    },
    edited(name) {
      const pg = PIGMENTS.find(pg => pg.name === name), r = RECIPES.find(r => r.name === name);
      return !!pg && (!r || JSON.stringify(recipeOf(pg)) !== JSON.stringify(recipeOf(buildPigment(r))));
    },
    // Every pigment that differs from the built-in box, as recipes.
    recipes() { return PIGMENTS.filter(pg => pg.custom || box.edited(pg.name)).map(recipeOf); },
    // Apply saved recipes (from this browser or a painting): edits to
    // built-ins by name, pigments of the painter's own added.
    apply(recipes) {
      for (const r of recipes ?? []) {
        const i = PIGMENTS.findIndex(pg => pg.name === r.name);
        if (i >= 0) PIGMENTS[i] = buildPigment(r);
        else if (PIGMENTS.length < MAX_PIGMENTS) PIGMENTS.push(buildPigment({ ...r, custom: true }));
      }
      box.commit(false);
    },
    commit(persist = true) {
      uploadPigments();
      if (persist && !state.headless) try { localStorage.setItem(BOX_KEY, JSON.stringify(box.recipes())); } catch {}
      for (const f of box.changed) f();
    },
  };
  try { box.apply(JSON.parse(localStorage.getItem(BOX_KEY) ?? '[]')); } catch { uploadPigments(); }
  let groundKey = '';
  const writeGround = rgb => {
    const key = rgb.join(',');
    if (key === groundKey) return;
    groundKey = key;
    specData.set(upsample(rgb.map(srgbToLinear)), MAX_PIGMENTS * 32);
    device.queue.writeBuffer(specBuf, 0, specData);
  };
  const renderU32 = new Uint32Array(renderData), renderF32 = new Float32Array(renderData);

  const pointerBrush = () => {
    const ptr = state.pointer;
    // Mouse and trackpad: the Touch dial (Z / Option lighter, X heavier).
    if (!ptr.down) return null;
    const age = (performance.now() - ptr.downAt) / 1000;
    let pressure = ptr.pen ? ptr.pressure : values.mouseTouch;
    // Without a pen: strokes ease in from a light touch at touchdown.
    if (!ptr.pen) pressure *= Math.min(1, 0.3 + 0.7 * age / Math.max(values.touchdownEase, 1e-3));
    // Hand input: the brush trails the pointer smoothly instead of jumping to
    // each event, so it never sits still between events (which dotted fast
    // strokes). Scripted strokes are already smooth and go straight there.
    const follow = ptr.scripted ? 1 : 0.5;
    ptr.nx = ptr.px + (ptr.x - ptr.px) * follow;
    ptr.ny = ptr.py + (ptr.y - ptr.py) * follow;
    return { x0: ptr.px, y0: ptr.py, x1: ptr.nx, y1: ptr.ny, pressure, side: ptr.side ?? 0, age, hand: !ptr.scripted };
  };

  function writeUniforms(substeps, brush = pointerBrush(), drying = state.drying) {
    SIM_PARAMS.forEach((p, i) => { paramData[i] = values[p.key]; });
    device.queue.writeBuffer(paramBuf, 0, paramData);

    frameU32[0] = W; frameU32[1] = H; frameU32[2] = state.mode; frameU32[3] = brush ? 1 : 0;
    // A new stroke: the brush wasn't down last frame, or the pointer touched
    // down again since (one scripted stroke can follow another with no gap),
    // or a headless stroke's first frame.
    const newStroke = brush && (!state.brushActive || state.pointer.downAt !== state.strokeDownAt || brush.age === 0);
    if (brush) state.strokeDownAt = state.pointer.downAt;
    if (brush) {
      frameF32[4] = brush.x0; frameF32[5] = brush.y0; frameF32[6] = brush.x1; frameF32[7] = brush.y1;
      // Side of the brush (Shift, or a tilted pen): a wider stroke. Loaded,
      // the belly lays a broad wet stroke; as it runs dry, it skims (the
      // classic dry-brush drag).
      const side = Math.min(Math.max(brush.side ?? 0, 0), 1);
      const pr = Math.min(Math.max(brush.pressure ?? 1, 0), 1);
      const load = brushLoad();
      frameF32[8] = pr;
      // Dry-brush (how lightly the brush skims the tooth on dry paper): a
      // light touch, the side of the brush, or speed, but only as far as the
      // brush is dry (Wetness down, or running out): a full brush lays solid
      // lines at any touch or speed.
      const segNow = Math.hypot(brush.x1 - brush.x0, brush.y1 - brush.y0);
      // No landing dot: a stroke lays nothing while the brush sits at its
      // first point, until it moves (a flick lands already moving) or is
      // held still on purpose for dabDelay (a dab).
      if (newStroke) { state.strokeMoved = false; state.strokeTravel = 0; }
      if (segNow >= 0.5) state.strokeMoved = true;
      const ptrS = state.pointer;
      const dabbing = ptrS.down && ptrS.scripted ? ptrS.dabIntended : (brush.age ?? 1) >= values.dabDelay;
      if (!state.strokeMoved && !dabbing) frameU32[3] = 0;
      state.smoothSeg = newStroke || !state.strokeMovedBefore ? segNow : state.smoothSeg * 0.6 + segNow * 0.4;
      state.strokeMovedBefore = state.strokeMoved;
      const speed = Math.min(1, state.smoothSeg / Math.max(4 * values.brushRadius, 1e-3));
      // Dry only once it's well down (below dryBelow full): a brush that's
      // used a little water still lays a solid line at a light touch.
      const dryness = Math.min(1, Math.max(0, (values.dryBelow - load) / Math.max(values.dryBelow, 1e-3)));
      frameF32[24] = dryness * Math.max(1 - pr, side * 0.8, values.speedSkim * speed);
      // Taper: width follows pressure; the side of the brush is wider.
      frameF32[13] = values.brushRadius * (values.taperMin + (1 - values.taperMin) * pr) * (1 + 0.8 * side);
      // The mist is a spray bottle: its own reach, whatever brush is loaded.
      if (state.mode === 4) frameF32[13] = values.mistRadius;
      if (state.mode === 6) frameF32[13] = values.blotRadius;   // the towel, not the brush
      if (state.mode === 10) frameF32[13] = values.spatterReach;   // where the drops land
      // The pencil's point and the eraser: their own sizes (pressure widens
      // a pencil line only a little).
      if (state.mode === 8) frameF32[13] = values.pencilRadius * (0.7 + 0.3 * pr);
      if (state.mode === 9) frameF32[13] = values.eraserRadius;
      // Wet-in-wet charge: strongest at touchdown, then the reservoir is spent.
      const dur = Math.max(values.chargeDuration, 1e-3);
      frameF32[11] = Math.exp(-(brush.age ?? 0) / dur);
      // How fresh the stroke is, by distance (a fast stroke's start is as
      // fresh as a slow one's): 1 at touchdown, fading over ~3 brush-widths.
      if (state.strokeMoved) state.strokeTravel = (state.strokeTravel ?? 0) + segNow;
      frameF32[26] = Math.exp(-(state.strokeTravel ?? 0) / Math.max(6 * frameF32[13], 1));
    }
    // Dwell: a fast stroke spends less time over each spot and lays less
    // there. Measured from the smoothed per-frame travel, since mouse events
    // and frames don't line up (a frame with no new event would otherwise
    // read as the brush resting, and dot the stroke).
    let dwell = 1;
    if (brush) {
      // A brush releases paint as it travels: every spot it crosses gets
      // the same dose however fast it moves (brushDose frames' worth; a
      // quick stroke isn't paler), and a brush that lingers adds a frame's
      // worth per frame, so slow strokes and dabs build up. A spot is under
      // a moving brush for (2r / travel) frames (each substep stamps only its
      // slice of the segment, see the shader).
      // Hand strokes use the smoothed travel (mouse events and frames don't
      // line up); scripted strokes their exact travel. Moving, at least a
      // frame's worth per frame; resting, lingerRate frames' worth per frame,
      // so a held dab builds up but a one-frame hiccup doesn't blot.
      const seg1 = brush.hand ? state.smoothSeg : Math.hypot(brush.x1 - brush.x0, brush.y1 - brush.y0);
      const w2 = Math.max(2 * frameF32[13], 1e-3);
      const moving = Math.hypot(brush.x1 - brush.x0, brush.y1 - brush.y0) >= 0.5;
      dwell = moving ? Math.max(1, values.brushDose * seg1 / w2) : values.lingerRate;
    }
    frameF32[29] = substeps;
    frameF32[30] = 1 / Math.max(values.simSpeed, 1);   // seconds per step
    frameF32[31] = PIGMENTS.findIndex(pg => pg.name === 'Graphite');
    frameF32[9] = dwell / substeps;
    frameF32[10] = (drying ? values.dryerStrength : 1) * values.dryingPace;
    frameF32[12] = state.simTime;
    frameF32[14] = brushLoad();
    frameF32[27] = state.brushType === 'dip' ? DIP_EMPTY : values.emptyLevel;
    frameF32[15] = concMul();
    if (!brush) { frameF32[13] = values.brushRadius; frameF32[24] = 0; frameF32[26] = 0; }
    frameF32[25] = values.fixTooth;
    if (newStroke) {
      state.strokeStart = state.simTime;
      // A new stroke: the brush has been reloaded or rinsed, mostly clean.
      state.rinsePending = true;
      for (let id = 0; id < state.carry.length; id++) state.carry[id] *= values.carryKeep;
    }
    frameF32[28] = state.strokeStart ?? 0;
    // What the brush carries (picked up from wet paint): the four largest,
    // as concentrations in its water (carryVolume).
    // Diluted in the water in the brush's tip (its footprint's worth).
    const carryVol = Math.max(values.carryVolume * Math.PI * values.brushRadius ** 2 * values.brushWater, 1e-3);
    frameF32[36] = 1 / carryVol;
    state.brushActive = !!brush;
    // Brush load: pigment ids at u32 16..19, fractions at f32 20..23.
    const total = state.brush.reduce((t, b) => t + b.frac, 0) || 1;
    for (let b = 0; b < 4; b++) {
      const item = state.brush[b];
      frameU32[16 + b] = item ? item.pigment : 0;
      frameF32[20 + b] = item ? item.frac / total : 0;
    }
    device.queue.writeBuffer(frameBuf, 0, frameData);

    renderU32[0] = W; renderU32[1] = H;
    renderF32[2] = values.thickness; renderF32[3] = values.wetDarken;
    renderF32.set([...(state.ground ?? TONES[state.tone].color ?? PAPERS[state.paper].color), 1], 4);
    renderF32[8] = state.ground ? 0 : values.paperShade; renderF32[9] = values.suspendedWeight;
    renderF32[10] = values.fixDeepen; renderF32[11] = values.spectral;
    renderF32[12] = values.dampDarken;
    if (values.spectral > 0.5) writeGround(state.ground ?? TONES[state.tone].color ?? PAPERS[state.paper].color);
    device.queue.writeBuffer(renderBuf, 0, renderData);
  }

  // ---- frame loop
  const gx = Math.ceil(W / WG), gy = Math.ceil(H / WG);
  const fpsEl = document.getElementById('fps');
  const loadBar = document.getElementById('loadBar');
  const pigBar = document.getElementById('pigBar');
  let last = performance.now(), frames = 0;

  // The sim advances in real time, independent of display refresh rate.
  // Fractional steps carry over; a stalled tab doesn't cause a catch-up burst.
  // When the GPU can't keep up (a whole sheet wet), the sim runs slower than
  // real time rather than cramming steps into each frame and stuttering.
  const MAX_STEPS_PER_FRAME = 10;
  let stepDebt = 0, lastFrame = performance.now();

  const argsReset = new Uint32Array([0, 1, 1, 0, 0, 0, 0, 0]);

  // Paint concentration relative to the recipe. Dip brush: its pigment stays
  // in the bristles as the water goes, so paint thickens as it empties.
  // Water brush: the ratio of the two stores.
  // How full of water the brush is. A dip brush is as wet as its Wetness
  // says, every stroke and all through it (a hidden reservoir draining
  // mid-stroke made dry-brushing unpredictable); the water brush has real
  // stores: squeezed in (Q), drawn down as it paints.
  function brushLoad() {
    if (state.brushType === 'dip') return values.dipLoad;
    return values.brushCapacity > 0 ? state.reservoir : 1;
  }
  function concMul() {
    const w = brushLoad();
    if (state.brushType === 'water') return Math.min(state.pigStore / Math.max(w, 0.05), 4);
    // A dip brush's water goes right down to nothing at Wetness 0 (so it can
    // be drier than damp paper, and a thick dab stays put instead of
    // blooming), but its paint doesn't: it's the same pigment in less
    // water, thick paint, up to a paste.
    const was = values.emptyLevel + (1 - values.emptyLevel) * w, now = DIP_EMPTY + (1 - DIP_EMPTY) * w;
    return Math.min(10, (1 + values.thicken * (1 - w)) * was / now);
  }
  const DIP_EMPTY = 0.03;   // a dry dip brush still holds a trace of water in its paste

  // Brush reservoir: the GPU tallies the water each frame's stamp actually
  // left on the paper (wet paper takes little, dry paper a lot); it comes
  // back a frame or so later and drains the reservoir.
  const brushRB = [0, 1, 2].map(() => device.createBuffer({ size: 16 + MAX_PIGMENTS * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }));
  const rbBusy = [false, false, false];
  function queueBrushReadback(enc) {
    if (!state.brushActive) return -1;
    const k = rbBusy.indexOf(false);
    if (k < 0) return -1;
    rbBusy[k] = true;
    enc.copyBufferToBuffer(tilesBuf, 16, brushRB[k], 0, 16);
    enc.copyBufferToBuffer(tilesBuf, CARRY_OFF, brushRB[k], 16, MAX_PIGMENTS * 4);
    return k;
  }
  async function collectBrush(k) {
    if (k < 0) return;
    await brushRB[k].mapAsync(GPUMapMode.READ);
    const u = new Uint32Array(brushRB[k].getMappedRange().slice(0));
    brushRB[k].unmap();
    rbBusy[k] = false;
    // What the brush holds (kept on the GPU; this copy sets how strongly
    // it lays it back down).
    for (let id = 0; id < MAX_PIGMENTS; id++) state.carry[id] = u[4 + id] / 1e5;
    if (values.brushCapacity > 0 && state.brushType === 'water') {
      state.reservoir = Math.max(0, state.reservoir - u[0] / 1e4 / values.brushCapacity);
      // A dab is a fixed amount of pigment, whatever the brush's water holds.
      if (state.brushType === 'water') state.pigStore = Math.max(0, state.pigStore - u[1] / 1e4 / Math.max(values.dabSize, 1e-6));
    }
  }

  // One frame's worth of simulation: find active tiles, then run the physics
  // passes on those tiles only (indirect dispatch; the tile count never
  // leaves the GPU). Must be the only sim work in its command buffer, since
  // the tile counter is reset by writeBuffer at submit time.
  // One frame's steps: its inputs are logged (see "history") and then run
  // by runStep, the same code replay uses, so a replay does exactly what
  // the painting did.
  function encodeSim(enc, substeps) {
    const e = { t: 'step', n: substeps, frame: new Uint8Array(frameData.slice(0)), fix: !!state.fixPending, unmask: !!state.unmaskPending };
    // Parameters only when they've changed since the last logged step.
    if (!hist.lastParams || paramData.some((v, i) => v !== hist.lastParams[i])) { e.params = paramData.slice(); hist.lastParams = e.params; }
    // Rinsed between strokes: keep carryKeep of what the brush held.
    if (state.rinsePending) {
      // (with its pending step tallies cleared, so they don't land after it)
      e.carry = new Uint32Array(MAX_PIGMENTS * 3);
      e.carry.set([...state.carry].map(v => Math.floor(v * values.carryKeep * 1e5)));
      state.rinsePending = false;
    }
    // Magnet field: only recomputed when a magnet or the depth changes.
    if (values.magnetDepth !== magDepthSeen) { state.magDirty = true; magDepthSeen = values.magnetDepth; }
    if (state.magDirty) {
      const charges = buildCharges(state.magnets, values.magnetDepth, MAX_CHARGES);
      magU32.fill(0);
      magU32[0] = charges.length;
      magU32[1] = state.magnets.length > 0 ? 1 : 0;
      charges.forEach(([ax, ay, bx, by, z, q], k) => magF32.set([ax, ay, z, q, bx, by, 0, 0], 4 + k * 8));
      e.mag = new Uint8Array(magData.slice(0));
      state.magDirty = false;
    }
    state.fixPending = false; state.unmaskPending = false;
    state.simTime += substeps / Math.max(values.simSpeed, 1);
    e.tAfter = state.simTime;
    histPush(e);
    runStep(enc, e);
    return queueBrushReadback(enc);
  }
  function runStep(enc, e) {
    if (e.params) device.queue.writeBuffer(paramBuf, 0, e.params);
    device.queue.writeBuffer(frameBuf, 0, e.frame);
    device.queue.writeBuffer(tilesBuf, 0, argsReset);
    if (e.carry) device.queue.writeBuffer(tilesBuf, CARRY_OFF, e.carry);
    const pass = enc.beginComputePass();
    pass.setBindGroup(0, simBG[parity]);
    pass.setPipeline(pipes.blurH); pass.dispatchWorkgroups(gx, gy);
    pass.setPipeline(pipes.blurV); pass.dispatchWorkgroups(gx, gy);
    if (e.mag) { device.queue.writeBuffer(magBuf, 0, e.mag); pass.setPipeline(pipes.magField); pass.dispatchWorkgroups(gx, gy); }
    if (e.fix) { pass.setPipeline(pipes.fixSheet); pass.dispatchWorkgroups(gx, gy); }
    if (e.unmask) { pass.setPipeline(pipes.unmaskSheet); pass.dispatchWorkgroups(gx, gy); }
    pass.setPipeline(pipes.markTiles); pass.dispatchWorkgroups(gx, gy);
    pass.setPipeline(pipes.compactTiles); pass.dispatchWorkgroups(Math.ceil(TX * TY / 64));
    pass.end();
    enc.copyBufferToBuffer(tilesBuf, 0, argsBuf, 0, 16);
    const step = enc.beginComputePass();
    for (let s = 0; s < e.n; s++) {
      step.setBindGroup(0, simBG[parity]);
      step.setPipeline(pipes.bumpStep); step.dispatchWorkgroups(1);
      step.setPipeline(pipes.velocity); step.dispatchWorkgroupsIndirect(argsBuf, 0);
      step.setPipeline(pipes.transport); step.dispatchWorkgroupsIndirect(argsBuf, 0);
      parity ^= 1;
    }
    step.end();
  }

  // Draw the current state immediately (for exporting the canvas).
  function renderNow() {
    writeUniforms(1, null, false);
    const enc = device.createCommandEncoder();
    const rp = enc.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] }],
    });
    rp.setPipeline(renderPipe);
    rp.setBindGroup(0, renderBG[parity]);
    rp.draw(3);
    rp.end();
    device.queue.submit([enc.finish()]);
  }

  function frame() {
    if (state.replaying) {
      // Replaying history: the sim is driven by the replay; just draw.
      const enc = device.createCommandEncoder();
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] }] });
      rp.setPipeline(renderPipe); rp.setBindGroup(0, renderBG[parity]); rp.draw(3); rp.end();
      device.queue.submit([enc.finish()]);
      lastFrame = performance.now();
      requestAnimationFrame(frame);
      return;
    }
    const t = performance.now();
    const elapsed = Math.min((t - lastFrame) / 1000, 0.1);
    lastFrame = t;
    stepDebt = Math.min(stepDebt + values.simSpeed * elapsed, MAX_STEPS_PER_FRAME);
    const substeps = Math.floor(stepDebt);
    stepDebt -= substeps;
    // (Not while a script drives the sim headless: writing the frame here
    // changed its brush state between its steps, at the display's timing,
    // and made headless runs differ.)
    if (!state.headless) writeUniforms(Math.max(substeps, 1));
    const enc = device.createCommandEncoder();
    let rbk = -1;
    if (state.pointer.down || state.drying) state.lastEdit = t;
    if (!state.paused && !state.headless && substeps > 0) {
      rbk = encodeSim(enc, substeps);
      // Only consume the brush segment once the sim has actually stamped it.
      if (state.pointer.down) { state.pointer.px = state.pointer.nx; state.pointer.py = state.pointer.ny; }
    }
    const rp = enc.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] }],
    });
    rp.setPipeline(renderPipe);
    rp.setBindGroup(0, renderBG[parity]);
    rp.draw(3);
    rp.end();
    device.queue.submit([enc.finish()]);
    collectBrush(rbk);
    if (state.squeezing) state.reservoir = Math.min(1, state.reservoir + values.squeezeRate * elapsed);
    loadBar.style.width = `${Math.round(brushLoad() * 100)}%`;
    pigBar.style.width = `${Math.round(Math.min(state.brushType === 'water' ? state.pigStore : 1, 1) * 100)}%`;
    pigBar.style.background = state.brush.length ? swatchColor(PIGMENTS[state.brush[0].pigment]) : 'transparent';

    frames++;
    const now = performance.now();
    if (now - last > 500) { fpsEl.textContent = `${Math.round(frames * 1000 / (now - last))} fps`; frames = 0; last = now; }
    requestAnimationFrame(frame);
  }

  // Debug hook: summary statistics of the current cell state.
  window.__sim = {
    values,
    async read() {
      const rb = device.createBuffer({ size: N * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = device.createCommandEncoder();
      enc.copyBufferToBuffer(A[parity], 0, rb, 0, N * 16);
      device.queue.submit([enc.finish()]);
      await rb.mapAsync(GPUMapMode.READ);
      const a = new Float32Array(rb.getMappedRange().slice(0));
      rb.destroy();
      return a;
    },
    async stats() {
      const a = await this.read();
      const names = ['w', 'g', 'd', 's'], out = {};
      for (let c = 0; c < 4; c++) {
        let sum = 0, max = 0, nz = 0;
        for (let i = c; i < a.length; i += 4) { const v = a[i]; sum += v; if (v > max) max = v; if (v > 1e-4) nz++; }
        out[names[c]] = { sum: +sum.toFixed(3), max: +max.toFixed(4), cells: nz };
      }
      return out;
    },
  };

  // Headless stepping: drives the sim directly instead of through
  // requestAnimationFrame, so scripted tests run the same (and faster than
  // real time) even when the tab is hidden. Simulated time assumes the
  // interactive loop's 120 Hz frame with simSpeed steps per second.
  const HZ = 120;
  let pending = 0;
  let strokeFrame = 0;
  async function simFrames(nFrames, brushAt = () => null, drying = false) {
    const per = Math.max(1, Math.round(values.simSpeed / HZ));
    for (let f = 0; f < nFrames; f++) {
      writeUniforms(per, brushAt(f), drying);
      const enc = device.createCommandEncoder();
      const rbk = encodeSim(enc, per);
      device.queue.submit([enc.finish()]);
      if (rbk >= 0) await collectBrush(rbk);
      if (++pending >= 60) { await device.queue.onSubmittedWorkDone(); pending = 0; }
    }
    await device.queue.onSubmittedWorkDone(); pending = 0;
  }
  window.__sim.pigments = box;
  window.__sim.headless = {
    begin() { state.headless = true; },
    end() { state.headless = false; },
    // A stroke from (x0,y0) to (x1,y1) over `frames` simulated frames.
    // Consecutive paint() calls continue one stroke (the brush isn't
    // reloaded) unless lift() is called in between.
    lift() { strokeFrame = 0; state.strokeStart = state.simTime; },
    async paint(x0, y0, x1, y1, frames = 24, pressure = 1) {
      if (strokeFrame === 0 && state.brushType === 'dip') state.reservoir = values.dipLoad;   // a fresh dip stroke: reloaded
      const at = f => {
        const t0 = f / frames, t1 = (f + 1) / frames;
        return { x0: x0 + (x1 - x0) * t0, y0: y0 + (y1 - y0) * t0, x1: x0 + (x1 - x0) * t1, y1: y0 + (y1 - y0) * t1,
                 age: (strokeFrame + f) / HZ, pressure };
      };
      await simFrames(frames, at);
      strokeFrame += frames;
    },
    wait(seconds, { dry = false } = {}) { strokeFrame = 0; return simFrames(Math.round(seconds * HZ), () => null, dry); },
    setMode(m) { state.mode = m; },
    mode() { return state.mode; },
    setTone(key) { state.tone = key; },
    // Brush type ('dip' | 'water'), and water-brush squeezing / store levels.
    setBrushType(t) { state.brushType = t; state.reservoir = 1; state.pigStore = 1; },
    setBrushPreset(key) { const b = BRUSHES[key]; Object.assign(values, b.knobs); state.brushType = b.type; state.reservoir = 1; state.pigStore = 1; },
    squeeze(seconds) { state.reservoir = Math.min(1, state.reservoir + values.squeezeRate * seconds); },
    brushStores() { return { water: +state.reservoir.toFixed(3), pigment: +state.pigStore.toFixed(3) }; },
    brushPigmentNames() { return state.brush.map(b => PIGMENTS[b.pigment].name); },
    // Magnets under the paper: [{ x, y, moment }] in grid cells.
    setMagnets(list) { state.magnets = list.map(mg => ({ shape: 'disc', angle: 0, moment: 1, ...mg })); drawMagnets(); },
    magnetCount() { return state.magnets.length; },
    pigmentNames() { return PIGMENTS.map(pg => pg.name); },
    // Load the brush: setBrush('French Ultramarine') or a mix,
    // setBrush([['French Ultramarine', 2], ['Burnt Umber', 1]]).
    setBrush(load) {
      const items = typeof load === 'string' ? [[load, 1]] : load;
      state.brush = items.map(([name, frac]) => {
        const i = PIGMENTS.findIndex(pg => pg.name === name);
        if (i < 0) throw new Error(`unknown pigment ${name}`);
        return { pigment: i, frac };
      });
    },
    // A fixed seed makes probe results comparable between runs.
    setPaper(key, seed = 1) {
      const sel = document.getElementById('paperType');
      sel.value = key; sel.dispatchEvent(new Event('change'));
      newPaper(seed);
    },
  };

  // Debug hook: paint a straight stroke from (x0,y0) to (x1,y1) in grid
  // coordinates over the given number of frames.
  window.__sim.stroke = (x0, y0, x1, y1, frames = 30) => new Promise(done => {
    const ptr = state.pointer;
    let f = 0;
    ptr.x = ptr.px = x0; ptr.y = ptr.py = y0; ptr.pressure = 1; ptr.downAt = performance.now(); ptr.down = true;
    state.strokeStart = state.simTime;
    ptr.pen = true; ptr.side = 0; ptr.scripted = true;
    if (state.brushType === 'dip') state.reservoir = values.dipLoad;
    const step = () => {
      f++;
      ptr.x = x0 + (x1 - x0) * f / frames; ptr.y = y0 + (y1 - y0) * f / frames;
      if (f < frames) requestAnimationFrame(step); else { ptr.down = false; done(); }
    };
    requestAnimationFrame(step);
  });
  window.__sim.clear = clear;

  // Debug hook: per-cell amount of one pigment (suspended + deposited
  // components; pigment fixed in the anonymous stain layer isn't counted).
  window.__sim.readPigment = async name => {
    const id = PIGMENTS.findIndex(pg => pg.name === name);
    const g = await readBuffer(G[parity], N * GB), d = await readBuffer(Dbuf, N * DB);
    const gu = new Uint32Array(g), gf = new Float32Array(g), du = new Uint32Array(d), df = new Float32Array(d);
    const out = new Float32Array(N);
    for (let c = 0; c < N; c++) {
      for (let k = 0; k < NG; k++) if (gAmt(gf, c, k) > 0 && gId(gu, c, k) === id) out[c] += gAmt(gf, c, k);
      for (let k = 0; k < ND; k++) if (df[c * 28 + 10 + k] > 0 && dId(du, c, k) === id) out[c] += df[c * 28 + 10 + k];
    }
    return out;
  };

  // Real-time painting helpers (for scripted painting you can watch): a
  // continuous stroke through points [x, y, pressure?, side?], and the
  // blow-dryer.
  window.__sim.path = (points, framesPerSeg = 4) => new Promise((done, stop) => {
    const ptr = state.pointer;
    const [x0, y0, p0 = 1, s0 = 0] = points[0];
    ptr.x = ptr.px = x0; ptr.y = ptr.py = y0; ptr.pressure = p0; ptr.downAt = performance.now(); ptr.down = true;
    state.strokeStart = state.simTime;   // a new stroke
    ptr.pen = true; ptr.side = s0; ptr.scripted = true;   // scripted strokes use their exact pressure and path
    // A scripted dab repeats its first point; anything else lands moving.
    ptr.dabIntended = points.length < 2 || (points[1][0] === x0 && points[1][1] === y0);
    if (state.brushType === 'dip') state.reservoir = values.dipLoad;
    let seg = 1, f = 0;
    const step = () => {
      if (state.washing && state.cancelWash) { ptr.down = false; stop(new Error('cancelled')); return; }
      if (seg >= points.length) { ptr.down = false; done(); return; }
      f++;
      const [ax, ay, ap = 1, as = 0] = points[seg - 1], [bx, by, bp = 1, bs = 0] = points[seg];
      const t = f / framesPerSeg;
      ptr.x = ax + (bx - ax) * t; ptr.y = ay + (by - ay) * t; ptr.pressure = ap + (bp - ap) * t; ptr.side = as + (bs - as) * t;
      if (f >= framesPerSeg) { f = 0; seg++; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  // Rinse the brush clean of paint it has picked up from the paper.
  window.__sim.rinse = () => { state.carry.fill(0); logOp({ op: 'rinse' }); rinseNow(); };
  const rinseNow = () => device.queue.writeBuffer(tilesBuf, CARRY_OFF, new Uint32Array(CARRY_WORDS));
  window.__sim.setDrying = on => window.__sim.act('dry', on);
  // Spray workable fixative over the whole sheet (applied on the next step).
  // ---- undo: full snapshots of the paper on the GPU (about 145 MB each;
  // a copy takes a few milliseconds), taken at the start of every stroke and
  // before sprays, fixative, peeling the mask, clearing and opening. Undo
  // restores the paper exactly, wet paint mid-flow included (velocities
  // restart at rest). undoDepth levels; redo until the next change.
  // Velocities and the tile/brush-carry buffer are kept too, so a replay
  // from a snapshot carries on exactly as the painting did.
  const TILES_SIZE = CARRY_OFF + CARRY_WORDS * 4;
  const SNAP = [['A', N * 16], ['B', N * 16], ['G', N * GB], ['D', N * DB], ['aux', N * 16], ['tiles', TILES_SIZE], ['mag', N * 4]];
  const undoPool = [];
  const allocSnap = () => undoPool.pop() ?? Object.fromEntries(SNAP.map(([k, size]) => [k, device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC })]));
  function takeSnap() {
    const snap = allocSnap(), enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(A[parity], 0, snap.A, 0, N * 16);
    enc.copyBufferToBuffer(B[parity], 0, snap.B, 0, N * 16);
    enc.copyBufferToBuffer(G[parity], 0, snap.G, 0, N * GB);
    enc.copyBufferToBuffer(Dbuf, 0, snap.D, 0, N * DB);
    enc.copyBufferToBuffer(auxBuf, 0, snap.aux, 0, N * 16);
    enc.copyBufferToBuffer(tilesBuf, 0, snap.tiles, 0, TILES_SIZE);
    enc.copyBufferToBuffer(magPhiBuf, 0, snap.mag, 0, N * 4);
    device.queue.submit([enc.finish()]);
    snap.simTime = state.simTime; snap.magnets = JSON.parse(JSON.stringify(state.magnets));
    snap.params = hist.lastParams;
    return snap;
  }
  function putSnap(snap) {
    const enc = device.createCommandEncoder();
    for (const b of A) enc.copyBufferToBuffer(snap.A, 0, b, 0, N * 16);
    for (const b of B) enc.copyBufferToBuffer(snap.B, 0, b, 0, N * 16);
    for (const b of G) enc.copyBufferToBuffer(snap.G, 0, b, 0, N * GB);
    enc.copyBufferToBuffer(snap.D, 0, Dbuf, 0, N * DB);
    enc.copyBufferToBuffer(snap.aux, 0, auxBuf, 0, N * 16);
    enc.copyBufferToBuffer(snap.tiles, 0, tilesBuf, 0, TILES_SIZE);
    enc.copyBufferToBuffer(snap.mag, 0, magPhiBuf, 0, N * 4);
    device.queue.submit([enc.finish()]);
    if (snap.params) device.queue.writeBuffer(paramBuf, 0, snap.params);
    state.simTime = snap.simTime; state.magnets = snap.magnets; drawMagnets();   // (its field came back with it)
    state.lastEdit = performance.now();
  }
  // A look at the painting mid-script: a PNG, handed to tools/paint.mjs if
  // it's listening (saved under its --looks folder), else just returned.
  window.__sim.look = async name => {
    const blob = await new Promise(resolve => { renderNow(); canvas.toBlob(resolve, 'image/png'); });
    if (window.__saveLook) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      await window.__saveLook(name, btoa(bin));
    }
    return blob;
  };
  // ---- history: undo and redo by replaying the logged inputs (steps and
  // ops) from snapshots. Undo points are marks in the log (each stroke or
  // action); recent ones keep a full snapshot, older ones are thinned so the
  // snapshots stay spread out, and the gaps are replayed. Replay is exact
  // (see sim.history.check). values.undoDepth snapshots at most.
  const freeSnap = snap => { if (snap) undoPool.push(snap); };
  const fpsNote = t => { document.getElementById('fps').textContent = t; };
  async function replayLog(from, to, log = hist.log) {
    state.replaying = true; hist.recording = false;
    const total = log.slice(from, to).reduce((t, e) => t + (e.n ?? 0), 0);
    let done = 0;
    try {
      let k = 0;
      for (let i = from; i < to; i++) {
        const e = log[i];
        if (e.t === 'step') {
          const enc = device.createCommandEncoder();
          runStep(enc, e);
          device.queue.submit([enc.finish()]);
          state.simTime = e.tAfter;
          if (e.params) hist.lastParams = e.params;
          done += e.n;
          if (++k % 30 === 0) { await device.queue.onSubmittedWorkDone(); if (total > 3000) fpsNote(`replaying ${Math.round(100 * done / total)}%`); }
        } else if (e.op === 'clear') { clearNow(); state.simTime = 0; }
        else if (e.op === 'paper') paperNow(e.key, e.seed);
        else if (e.op === 'rinse') rinseNow();
        else if (e.op === 'dampen') { await device.queue.onSubmittedWorkDone(); await dampenNow(e); }
        else if (e.op === 'pig') { device.queue.writeBuffer(pigBuf, 0, e.pig); device.queue.writeBuffer(specBuf, 0, e.spec); }
      }
      await device.queue.onSubmittedWorkDone();
    } finally { state.replaying = false; hist.recording = true; }
  }
  const copyMagnets = () => JSON.parse(JSON.stringify(state.magnets));
  // Make the sheet what it was at log position pos: the nearest snapshot at
  // or before it, then replay.
  async function restoreTo(pos) {
    let from = null;
    for (const m of hist.marks) if (m.snap && m.at <= pos && (!from || m.at >= from.at)) from = m;
    if (hist.endSnap && pos === hist.log.length) from = { at: pos, snap: hist.endSnap };
    if (!from) return false;
    putSnap(from.snap); hist.lastParams = from.snap.params;
    await replayLog(from.at, pos);
    const mark = [...hist.marks].reverse().find(m => m.at <= pos);
    state.magnets = pos === hist.log.length && hist.endMagnets ? JSON.parse(JSON.stringify(hist.endMagnets)) : JSON.parse(JSON.stringify(mark?.magnets ?? state.magnets));
    state.magDirty = true; drawMagnets();
    return true;
  }
  // Painting on after an undo: the redo future is dropped and what the
  // sheet did since the undo joins the log.
  function commit() {
    if (hist.cursor === null) return;
    hist.log.length = hist.cursor;
    hist.log.push(...hist.tail); hist.tail = [];
    hist.marks = hist.marks.filter(m => { if (m.at > hist.cursor) { freeSnap(m.snap); return false; } return true; });
    freeSnap(hist.endSnap); hist.endSnap = null;
    hist.cursor = null;
  }
  // Keep at most undoDepth snapshots: the newest two, the oldest (and any
  // after an opened painting, which can't be replayed across), and among the
  // rest drop whichever is closest to the one before it. With no room left
  // at all, the oldest history goes.
  function thin() {
    const budget = Math.max(3, values.undoDepth);
    for (;;) {
      const snapped = hist.marks.filter(m => m.snap);
      if (snapped.length + (hist.endSnap ? 1 : 0) <= budget) return;
      let best = null, gap = Infinity;
      for (let k = 1; k < snapped.length - 2; k++) {
        if (snapped[k].barrier) continue;
        const g = snapped[k].at - snapped[k - 1].at;
        if (g < gap) { gap = g; best = snapped[k]; }
      }
      if (best) { freeSnap(best.snap); best.snap = null; continue; }
      // Drop the oldest history, up to the second snapshot.
      const keep = snapped[1], cut = keep.at;
      hist.marks = hist.marks.filter(m => { if (m.at < cut) { freeSnap(m.snap); return false; } return true; });
      hist.log.splice(0, cut);
      for (const m of hist.marks) m.at -= cut;
      if (hist.cursor !== null) hist.cursor -= cut;
    }
  }
  function mark(barrier = false) {
    commit();
    hist.marks.push({ at: hist.log.length, snap: takeSnap(), magnets: copyMagnets(), barrier });
    thin();
  }
  // A note in the painting journal (notes/journal.md) when run by
  // tools/paint.mjs; otherwise just logged.
  window.__sim.note = async text => { if (window.__saveNote) await window.__saveNote(String(text)); else console.log('[note]', text); };
  window.__sim.checkpoint = () => { if (!state.replaying) mark(); };
  window.__sim.undo = async () => {
    state.stopWash();
    if (state.replaying) return false;
    const pos = hist.cursor ?? hist.log.length;
    // (Barrier marks are only snapshots to replay from, not undo points.)
    const target = [...hist.marks].reverse().find(m => m.at < pos && !m.barrier);
    if (!target) return false;
    if (hist.cursor === null) { freeSnap(hist.endSnap); hist.endSnap = takeSnap(); hist.endMagnets = copyMagnets(); }
    const note = document.getElementById('fps').textContent;
    fpsNote('undoing…');
    await restoreTo(target.at);
    hist.cursor = target.at; hist.tail = [];
    fpsNote(note);
    uploadPigments(); window.__sim.rinse();   // today's paint box; a clean brush
    state.lastEdit = performance.now();
    return true;
  };
  window.__sim.redo = async () => {
    state.stopWash();
    if (state.replaying || hist.cursor === null) return false;
    const next = hist.marks.find(m => m.at > hist.cursor && !m.barrier);
    const pos = next ? next.at : hist.log.length;
    const note = document.getElementById('fps').textContent;
    fpsNote('redoing…');
    await restoreTo(pos);
    hist.tail = [];
    hist.cursor = pos === hist.log.length ? null : pos;
    if (hist.cursor === null) { freeSnap(hist.endSnap); hist.endSnap = null; }
    fpsNote(note);
    uploadPigments(); window.__sim.rinse();
    state.lastEdit = performance.now();
    return true;
  };
  window.__sim.history = {
    // Start over: one snapshot of the sheet as it is, an empty log.
    begin() {
      for (const m of hist.marks) freeSnap(m.snap);
      freeSnap(hist.endSnap); hist.endSnap = null;
      hist.log = []; hist.tail = []; hist.cursor = null; hist.lastParams = null; hist.marks = [];
      mark(true);
      return true;
    },
    // After opening a painting (not replayable): a snapshot to replay from.
    barrier() { mark(true); },
    // Determinism check: back to the first snapshot and replay everything
    // since; the same sim.stateHashes() as before means replay is exact.
    async replayAll() {
      commit();
      const first = hist.marks.find(m => m.snap), simTime = state.simTime;
      putSnap(first.snap); hist.lastParams = first.snap.params;
      await replayLog(first.at, hist.log.length);
      return { entries: hist.log.length - first.at, steps: hist.log.slice(first.at).reduce((t, e) => t + (e.n ?? 0), 0), simTimeMatches: Math.abs(state.simTime - simTime) < 1e-6 };
    },
    info() {
      let b = 0; for (const e of hist.log) b += (e.frame?.byteLength ?? 0) + (e.params?.byteLength ?? 0) + (e.carry?.byteLength ?? 0) + (e.mag?.byteLength ?? 0) + (e.mask?.runs.byteLength ?? 0) + (e.pig ? e.pig.byteLength + e.spec.byteLength : 0) + 32;
      return { entries: hist.log.length, bytes: b, marks: hist.marks.length, snapshots: hist.marks.filter(m => m.snap).length + (hist.endSnap ? 1 : 0), undone: hist.cursor !== null };
    },
    size() { return this.info(); },
  };
  // ---- bug reports: the oldest snapshot history has, everything logged
  // since (up to the sheet as it is now), the paint box, the knobs, and the
  // hashes of the sheet now. Replayed (sim.openBugReport, tools/paint.mjs
  // --bug), it has to come out identical: a one-off glitch the painter saw
  // can be reproduced exactly, and stepped through.
  // Typed arrays in the log go into one binary block after a JSON header.
  function packLog(entries) {
    const chunks = []; let off = 0;
    const walk = v => {
      if (ArrayBuffer.isView(v)) {
        const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice();
        const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); off += pad; }
        chunks.push(bytes); const r = { __ta: v.constructor.name, off, len: v.length }; off += bytes.byteLength; return r;
      }
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
      return v;
    };
    return { entries: walk(entries), bin: chunks };
  }
  function unpackLog(entries, bin) {
    const types = { Uint8Array, Uint32Array, Float32Array, Int32Array, Float64Array };
    const walk = v => {
      if (v && typeof v === 'object' && v.__ta) return new types[v.__ta](bin.slice(v.off, v.off + v.len * types[v.__ta].BYTES_PER_ELEMENT));
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
      return v;
    };
    return walk(entries);
  }
  const SNAP_SIZES = Object.fromEntries(SNAP);
  async function bugReportBlob(note = '') {
    // Paused while the log and the sheet's hashes are taken, so they're of
    // the same moment (the sheet ran on while the hashes were read back).
    const paused = state.paused;
    state.paused = true;
    await device.queue.onSubmittedWorkDone();
    try { return await captureReport(note); } finally { state.paused = paused; }
  }
  async function captureReport(note) {
    const first = hist.marks.find(m => m.snap);
    const end = hist.cursor ?? hist.log.length;
    const entries = hist.log.slice(first.at, end).concat(hist.cursor !== null ? hist.tail : []);
    const snap = {};
    for (const [k, size] of SNAP) snap[k] = await readBuffer(first.snap[k], size);
    const hex = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
    const snapHashes = { A: await hex(snap.A), G: await hex(snap.G), D: await hex(snap.D), aux: await hex(snap.aux) };
    const { entries: packed, bin } = packLog(entries);
    const meta = {
      kind: 'hyperreal-watercolor bug report', version: 1, at: new Date().toISOString(), note, W, H,
      snapshot: { simTime: first.snap.simTime, magnets: first.snap.magnets, params: first.snap.params ? [...first.snap.params] : null, sizes: SNAP_SIZES },
      paper: state.paper, tone: state.tone, values, recipes: window.__sim.pigments.recipes(), pigments: PIGMENTS.map(pg => pg.name),
      paramKeys: SIM_PARAMS.map(p => p.key),
      entries: packed, binBytes: bin.reduce((t, b) => t + b.byteLength, 0),
      hashes: await window.__sim.stateHashes(), simTime: state.simTime, snapHashes,
    };
    const head = new TextEncoder().encode(JSON.stringify(meta));
    const blob = new Blob([new Uint32Array([head.byteLength]), head, ...SNAP.map(([k]) => snap[k]), ...bin]);
    return new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  }
  window.__sim.bugReportBlob = bugReportBlob;
  window.__sim.saveBugReport = async () => {
    fpsNote('saving bug report…');
    try { download(await bugReportBlob(), `bug-${stamp()}.wcbug`); } finally { fpsNote(''); }
  };
  // Load a bug report and replay it (to entry upTo, default all). Returns
  // whether the sheet came out identical to when the report was saved.
  window.__sim.openBugReport = async (file, { upTo = Infinity } = {}) => {
    state.stopWash();
    // Hold the live loop off from here (it stepped the sheet between loading
    // the snapshot and replaying, and a fresh page's replay came out
    // different); replayLog lets go when it's done.
    state.replaying = true;
    const raw = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const len = new Uint32Array(raw, 0, 1)[0];
    const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(raw, 4, len)));
    let off = 4 + len;
    const bufs = {};
    for (const [k, size] of SNAP) { bufs[k] = raw.slice(off, off + size); off += size; }
    const entries = unpackLog(meta.entries, raw.slice(off, off + meta.binBytes));
    // Knobs added (or reordered) since the report was saved: remap each
    // logged parameter block by name, new knobs at their current values.
    const keysNow = SIM_PARAMS.map(p => p.key);
    let remapped = false;
    if (meta.paramKeys && meta.paramKeys.join() !== keysNow.join()) {
      const at = Object.fromEntries(meta.paramKeys.map((k, i) => [k, i]));
      const remap = old => { const out = new Float32Array(paramData.length); keysNow.forEach((k, i) => { out[i] = k in at ? old[at[k]] : values[k]; }); return out; };
      for (const e of entries) if (e.params) e.params = remap(e.params);
      if (meta.snapshot.params) meta.snapshot.params = [...remap(meta.snapshot.params)];
      remapped = true;
    }
    // The paint box and knobs as they were; then the snapshot.
    window.__sim.pigments.apply(meta.recipes);
    Object.assign(values, meta.values);
    state.paper = meta.paper; state.tone = meta.tone;
    for (const b of A) device.queue.writeBuffer(b, 0, bufs.A);
    for (const b of B) device.queue.writeBuffer(b, 0, bufs.B);
    for (const b of G) device.queue.writeBuffer(b, 0, bufs.G);
    device.queue.writeBuffer(Dbuf, 0, bufs.D);
    device.queue.writeBuffer(auxBuf, 0, bufs.aux);
    device.queue.writeBuffer(tilesBuf, 0, bufs.tiles);
    device.queue.writeBuffer(magPhiBuf, 0, bufs.mag);
    if (meta.snapshot.params) { hist.lastParams = Float32Array.from(meta.snapshot.params); device.queue.writeBuffer(paramBuf, 0, hist.lastParams); }
    state.simTime = meta.snapshot.simTime; state.magnets = meta.snapshot.magnets ?? []; drawMagnets();
    uiSync();
    const loaded = await window.__sim.stateHashes();
    const snapshotOK = !meta.snapHashes || JSON.stringify(loaded) === JSON.stringify(meta.snapHashes);
    // Paused at the replayed moment, to look at (space to carry on): the
    // live loop stepping on before the check made every replay "differ".
    state.paused = true;
    await replayLog(0, Math.min(upTo, entries.length), entries);
    window.__sim.act('pause', true);
    const now = await window.__sim.stateHashes();
    window.__sim.history.barrier();
    return { entries: entries.length, replayed: Math.min(upTo, entries.length), identical: JSON.stringify(now) === JSON.stringify(meta.hashes), snapshotOK, remapped, unknownKnobs: !meta.paramKeys, note: meta.note, savedAt: meta.at };
  };

  // The sheet as the page opened: the first snapshot history replays from.
  hist.log = []; mark(true);
  window.__sim.fix = () => { window.__sim.checkpoint(); state.fixPending = true; state.lastEdit = performance.now(); };
  // Peel off all masking fluid (applied on the next step).
  window.__sim.unmask = () => { window.__sim.checkpoint(); state.unmaskPending = true; state.lastEdit = performance.now(); };

  // ---- save / open
  async function readBuffer(src, size, offset = 0) {
    const rb = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(src, offset, rb, 0, size);
    device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const out = rb.getMappedRange().slice(0);
    rb.destroy();
    return out;
  }
  const download = (blob, name) => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

  // PNG of the painting as it looks now (without the magnet overlay).
  async function savePNG() {
    const blob = await new Promise(resolve => { renderNow(); canvas.toBlob(resolve, 'image/png'); });
    download(blob, `watercolor-${stamp()}.png`);
  }

  // The paint alone, as two layers to put over any ground or image. Paint
  // over a ground reflects about body + filter * ground: transparent
  // watercolour is mostly filter (it colours the light coming back from the
  // paper), gouache and pearlescents add body (light they scatter back
  // themselves). Rendering over pure white and pure black (no paper
  // texture) recovers both: filter = white - black, body = black.
  //   filter.png: set to Multiply (white where there's no paint)
  //   body.png:   set to Add / Linear Dodge (black where there's no paint)
  async function renderOver(ground) {
    state.ground = ground;
    try { return await new Promise(resolve => { renderNow(); canvas.toBlob(resolve, 'image/png'); }); }
    finally { state.ground = null; renderNow(); }
  }
  async function layerBlobs() {
    const pixelsOver = async ground => {
      const c = new OffscreenCanvas(W, H), g = c.getContext('2d');
      g.drawImage(await createImageBitmap(await renderOver(ground)), 0, 0);
      return g.getImageData(0, 0, W, H);
    };
    const w = (await pixelsOver([1, 1, 1])).data, b = (await pixelsOver([0, 0, 0])).data;
    const filter = new ImageData(W, H), f = filter.data;
    for (let i = 0; i < f.length; i += 4) {
      for (let c = 0; c < 3; c++) f[i + c] = Math.max(0, w[i + c] - b[i + c]);
      f[i + 3] = 255;
    }
    const png = async img => { const c = new OffscreenCanvas(W, H); c.getContext('2d').putImageData(img, 0, 0); return c.convertToBlob({ type: 'image/png' }); };
    return { filter: await png(filter), body: await png(new ImageData(b, W, H)) };
  }
  async function saveLayer() {
    const { filter, body } = await layerBlobs(), t = stamp();
    download(filter, `watercolor-${t}-filter-multiply.png`);
    setTimeout(() => download(body, `watercolor-${t}-body-add.png`), 300);
  }

  // The full paint state: water, paper dampness, every pigment component,
  // deposit timestamps, the paper itself, magnets and knobs, so a painting can
  // be reopened (and rewetted) later. Gzipped; mostly zeros compress well.
  // Version 2: aux.z holds when each cell was last fixed (it was scratch).
  // Version 3: suspended components packed (20 bytes a cell, see GP).
  // Version 4: eight deposit components, packed (112 bytes a cell, see DS).
  // Version 5: eight suspended components (40 bytes a cell, see GP).
  const STATE_VERSION = 5;
  async function paintingBlob() {
    const parts = {
      A: await readBuffer(A[parity], N * 16),
      G: await readBuffer(G[parity], N * GB),
      D: await readBuffer(Dbuf, N * DB),
      aux: await readBuffer(auxBuf, N * 16),
    };
    const meta = {
      version: STATE_VERSION, W, H, simTime: state.simTime, paper: state.paper, tone: state.tone,
      magnets: state.magnets, values, pigments: PIGMENTS.map(pg => pg.name), recipes: window.__sim.pigments.recipes(),
      sizes: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.byteLength])),
    };
    const head = new TextEncoder().encode(JSON.stringify(meta));
    const len = new Uint32Array([head.byteLength]);
    const blob = new Blob([len, head, parts.A, parts.G, parts.D, parts.aux]);
    return new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  }
  async function savePainting() {
    download(await paintingBlob(), `painting-${stamp()}.wcpaint`);
  }

  // Autosave into the browser's own storage (IndexedDB), so a reload or a
  // closed tab doesn't lose unsaved work. Saves every 20 s while you're
  // painting and for two minutes after (while it dries), keeping the last
  // two saves; after a reload, Restore offers them.
  const autosave = (() => {
    const open = () => new Promise((res, rej) => {
      const rq = indexedDB.open('hyperreal-watercolor', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('autosave');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('autosave', mode), st = t.objectStore('autosave'), out = fn(st);
        t.oncomplete = () => res(out?.result); t.onerror = () => rej(t.error);
      });
    };
    let saving = false;
    async function save() {
      if (saving || state.headless) return;
      saving = true;
      try {
        const blob = await paintingBlob(), at = Date.now();
        const prev = await tx('readonly', st => st.get('latest'));
        await tx('readwrite', st => { if (prev) st.put(prev, 'previous'); return st.put({ blob, at }, 'latest'); });
      } catch (e) { console.warn('autosave failed:', e); } finally { saving = false; }
    }
    setInterval(() => {
      const now = performance.now();
      if (now - state.lastEdit < 120000) save();
    }, 20000);
    return { save, get: key => tx('readonly', st => st.get(key)) };
  })();

  async function openPainting(file) {
    state.stopWash();
    window.__sim.checkpoint?.();
    const raw = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const len = new Uint32Array(raw, 0, 1)[0];
    const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(raw, 4, len)));
    if (meta.W !== W || meta.H !== H) throw new Error(`painting is ${meta.W}x${meta.H}, canvas is ${W}x${H}`);
    let off = 4 + len;
    const take = n => { const b = raw.slice(off, off + n); off += n; return b; };
    const a = take(meta.sizes.A); let g = take(meta.sizes.G), d = take(meta.sizes.D); const ax = take(meta.sizes.aux);
    if ((meta.version ?? 1) < 2) { const f = new Float32Array(ax); for (let c = 0; c < N; c++) f[c * 4 + 2] = 0; }
    // The painting's own pigments (edited or the painter's own) join the box.
    if (meta.recipes) window.__sim.pigments.apply(meta.recipes);
    // Pigment ids refer to the library at save time; remap by name.
    const remap = meta.pigments.map(name => Math.max(PIGMENTS.findIndex(pg => pg.name === name), 0));
    // Version 5 holds eight packed suspended components (see GP).
    if ((meta.version ?? 1) < 5) g = packOldG(g, meta.version ?? 1);
    const gu = new Uint32Array(g), gf = new Float32Array(g);
    for (let c = 0; c < N; c++) {
      const w = [0, 0];
      for (let k = 0; k < NG; k++) w[k >> 2] |= ((gAmt(gf, c, k) > 0 ? remap[gId(gu, c, k)] ?? 0 : 0) & 255) << (8 * (k & 3));
      gu[c * 10] = w[0] >>> 0; gu[c * 10 + 1] = w[1] >>> 0;
    }
    // Version 4 has eight packed deposit components (see DS); older saves
    // hold four, unpacked (80 bytes a cell).
    if ((meta.version ?? 1) < 4) d = packOldD(d);
    const du = new Uint32Array(d), df = new Float32Array(d);
    for (let c = 0; c < N; c++) {
      const w = [0, 0];
      for (let k = 0; k < ND; k++) w[k >> 2] |= ((df[c * 28 + 10 + k] > 0 ? remap[dId(du, c, k)] ?? 0 : 0) & 255) << (8 * (k & 3));
      du[c * 28 + 8] = w[0] >>> 0; du[c * 28 + 9] = w[1] >>> 0;
    }
    for (const b of A) device.queue.writeBuffer(b, 0, a);
    for (const b of G) device.queue.writeBuffer(b, 0, g);
    for (const b of B) device.queue.writeBuffer(b, 0, new Float32Array(N * 4));
    device.queue.writeBuffer(Dbuf, 0, d);
    device.queue.writeBuffer(auxBuf, 0, ax);
    device.queue.writeBuffer(tilesBuf, 32, new Uint32Array(TX * TY).fill(4));
    state.simTime = meta.simTime;
    state.paper = meta.paper; state.tone = meta.tone;
    state.magnets = meta.magnets ?? [];
    Object.assign(values, meta.values);
    uiSync();
    drawMagnets();
    window.__sim.history.barrier();   // an opened painting can't be replayed into: history resumes from a snapshot of it
  }
  // The paper's working stage, wettest first (handprint.com's stages of
  // wetness), from surface water w and water in the fibres s:
  //   soaked  standing water that runs if tilted (background washes)
  //   shiny   wet, texture showing through the shine
  //   satin   a dull sheen; flat washes and wet-in-wet
  //   moist   no sheen but darkened; paint still flows into it (crisp backruns)
  //   damp    looks dry, paint doesn't flow into it; lifting, dry-brush
  //   dry     the gum sets; linework, glazes, finishing
  const STAGES = ['dry', 'damp', 'moist', 'satin', 'shiny', 'soaked'];
  // (Where the lines fall, from streak swatches: paint dropped into 0.08 of
  // standing water spread and vanished, into 0.05 nearly, Handprint's shiny; into 0.03 it
  // held with a soft edge, his satin.)
  const stageOf = (w, s) => w >= 0.2 ? 'soaked' : w >= 0.04 ? 'shiny' : w > values.wEps ? 'satin'
    : s >= values.dampThreshold ? 'moist' : s >= 0.25 * values.dampThreshold ? 'damp' : 'dry';
  // What the brush would feel at (x, y), averaged over radius r: water,
  // paper dampness, its stage, and pigment amounts by name (wet and
  // settled). Reads only the rows it needs.
  window.__sim.sense = async (x, y, r = 6) => {
    // A point off the sheet senses the nearest edge of it.
    x = Math.min(W - 1, Math.max(0, x)); y = Math.min(H - 1, Math.max(0, y)); r = Math.max(r, 0.5);
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r)), rows = y1 - y0 + 1;
    const grab = async (buf, stride) => {
      const size = rows * W * stride;
      const rb = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = device.createCommandEncoder();
      enc.copyBufferToBuffer(buf, y0 * W * stride, rb, 0, size);
      device.queue.submit([enc.finish()]);
      await rb.mapAsync(GPUMapMode.READ);
      const out = rb.getMappedRange().slice(0); rb.destroy(); return out;
    };
    const a = new Float32Array(await grab(A[parity], 16));
    const gB = await grab(G[parity], GB), dB = await grab(Dbuf, DB);
    const gu = new Uint32Array(gB), gf = new Float32Array(gB), du = new Uint32Array(dB), df = new Float32Array(dB);
    let n = 0, water = 0, damp = 0; const wet = {}, dry = {};
    for (let yy = y0; yy <= y1; yy++) for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(W - 1, Math.ceil(x + r)); xx++) {
      if (Math.hypot(xx - x, yy - y) > r) continue;
      const c = (yy - y0) * W + xx; n++;
      water += a[c * 4]; damp += a[c * 4 + 3];
      for (let k = 0; k < NG; k++) {
        if (gAmt(gf, c, k) > 0) { const nm = PIGMENTS[gId(gu, c, k)]?.name; wet[nm] = (wet[nm] ?? 0) + gAmt(gf, c, k); }
      }
      for (let k = 0; k < ND; k++) {
        if (df[c * 28 + 10 + k] > 0) { const nm = PIGMENTS[dId(du, c, k)]?.name; dry[nm] = (dry[nm] ?? 0) + df[c * 28 + 10 + k]; }
      }
    }
    const avg = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v / n).toFixed(4)]));
    return { water: +(water / n).toFixed(4), damp: +(damp / n).toFixed(4), stage: stageOf(water / n, damp / n), wet: avg(wet), settled: avg(dry), reservoir: +state.reservoir.toFixed(3) };
  };
  // Skip ahead: let the paper dry until it reaches `stage` (or drier), the
  // same physics fast-forwarded (as fast as the GPU goes, not in real time),
  // with the dryer if it's on. Where: the whole sheet (all but specks of it,
  // under ~8 mm²), or only at `points` [[x, y], ...]. Esc, Stop or touching
  // the paper stops it. Resolves to the seconds of drying skipped, or -1 if
  // stopped or it hadn't got there in maxS.
  window.__sim.stages = STAGES;
  window.__sim.skipTo = async (stage = 'damp', { points = null, maxS = 1800 } = {}) => {
    const target = STAGES.indexOf(stage);
    if (target < 0) throw new Error(`unknown stage ${stage}; stages: ${STAGES.join(', ')}`);
    if (state.skipping || state.washing) return -1;
    // How much of the sheet (or the points) is still wetter than the
    // target, and whether any standing water is left anywhere.
    const look = async () => {
      const a = await window.__sim.read();
      let standing = 0;
      for (let c = 0; c < N; c++) if (a[c * 4] > values.wEps) standing++;
      let there = true;
      if (points) {
        for (const [x, y] of points) if (STAGES.indexOf((await window.__sim.sense(x, y, 6)).stage) > target) there = false;
      } else {
        // Wetter than the target stage: standing water above its bound, or
        // (for moist and drier) fibres above it.
        const wMax = [values.wEps, values.wEps, values.wEps, 0.04, 0.2, Infinity][target];
        const sMax = [0.25 * values.dampThreshold, values.dampThreshold, Infinity, Infinity, Infinity, Infinity][target];
        let over = 0;
        for (let c = 0; c < N && over <= 200; c++) if (a[c * 4] > wMax || (a[c * 4] <= values.wEps && a[c * 4 + 3] >= sMax)) over++;
        there = over <= 200;
      }
      return { there, standing: standing > 200 };
    };
    let now = await look();
    if (now.there && stage !== 'dry') return 0;
    const h = window.__sim.headless, pe = values.paperEvaporation;
    state.skipping = true; state.cancelSkip = false; state.onWash?.();
    let t = 0;
    h.begin();
    try {
      for (;;) {
        // With no standing water left on the sheet, nothing moves but the
        // water in the fibres, so that is hurried (10x): the result is the
        // same, sooner. While there is standing water it isn't (hurrying
        // it is what the dryer does: the pigment has no time to settle).
        const lapse = now.standing ? 1 : 10;
        values.paperEvaporation = pe * lapse;
        await h.wait(1, { dry: state.drying }); t += lapse;
        now = await look();
        if (now.there) {
          // Dry is for glazing and linework: let the gum set too (it sets
          // over bindTime once the paper is dry), or a wash laid straight
          // over a just-dried line lifted it. Nothing else moves by then.
          if (stage === 'dry') { values.paperEvaporation = pe; await h.wait(values.bindTime * 1.2); t += values.bindTime * 1.2; }
          return t;
        }
        if (state.cancelSkip || state.pointer.down || t >= maxS) return -1;
      }
    } finally { values.paperEvaporation = pe; h.end(); state.skipping = false; state.cancelSkip = false; state.onWash?.(); }
  };
  // The paper's stage under the cursor, beside the title, kept up to date
  // as it dries.
  const stageEl = document.getElementById('stageAt');
  let stageBusy = false;
  setInterval(async () => {
    if (!state.hover) { stageEl.textContent = ''; return; }
    if (stageBusy) return;
    stageBusy = true;
    try { stageEl.textContent = `paper: ${(await window.__sim.sense(state.hover[0], state.hover[1], 4)).stage}`; } catch { } finally { stageBusy = false; }
  }, 500);
  // Debug hook: everything stored for one cell.
  // Dampen the paper by fiat: every cell of the mask (Uint8Array over the
  // sheet) is brought up to `level` of what its fibres hold (more in the
  // texture's valleys), evenly, with no strokes. What a painter gets from a
  // clean pass with a big brush and a wait for the shine to go. Time stops
  // while the sheet is read and written back, so nothing flowing elsewhere
  // is lost.
  window.__sim.dampen = async (mask, level = 1, film = 0.03, feather = 0) => {
    const paused = state.paused;
    state.paused = true;
    try {
      await device.queue.onSubmittedWorkDone();
      const e = { op: 'dampen', mask: packMask(mask), level, film, feather, sizing: values.sizing, capMin: values.capacityMin, capMax: values.capacityMax };
      logOp(e);
      await dampenNow(e);
    } finally { state.paused = paused; }
  };
  // Masks are logged run-length encoded (a wash area is a few runs a row).
  function packMask(mask) {
    const runs = [];
    for (let c = 0; c < N;) { const v = mask[c]; let k = c; while (k < N && mask[k] === v) k++; runs.push(k - c); c = k; }
    return { first: mask[0] ? 1 : 0, runs: Uint32Array.from(runs) };
  }
  function unpackMask({ first, runs }) {
    const m = new Uint8Array(N); let c = 0, v = first;
    for (const r of runs) { if (v) m.fill(1, c, c + r); c += r; v = 1 - v; }
    return m;
  }
  async function dampenNow(e) {
    const mask = unpackMask(e.mask);
    const a = new Float32Array(await readBuffer(A[parity], N * 16));
    const aux = new Float32Array(await readBuffer(auxBuf, N * 16));
    const sizing = Math.min(1, Math.max(0, e.sizing));
    // Feathered: dampness fades out over the last `feather` cells inside the
    // area (no standing film there), so paint running into it slows and
    // fades instead of stopping at the damp area's edge in a line.
    let inward = null;
    if (e.feather > 0) {
      inward = new Float32Array(N).fill(1e9);
      for (let c = 0; c < N; c++) if (!mask[c]) inward[c] = 0;
      const D2 = Math.SQRT2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = y * W + x; let d = inward[c]; if (x > 0) d = Math.min(d, inward[c - 1] + 1); if (y > 0) { d = Math.min(d, inward[c - W] + 1); if (x > 0) d = Math.min(d, inward[c - W - 1] + D2); if (x < W - 1) d = Math.min(d, inward[c - W + 1] + D2); } inward[c] = d; }
      for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const c = y * W + x; let d = inward[c]; if (x < W - 1) d = Math.min(d, inward[c + 1] + 1); if (y < H - 1) { d = Math.min(d, inward[c + W] + 1); if (x < W - 1) d = Math.min(d, inward[c + W + 1] + D2); if (x > 0) d = Math.min(d, inward[c + W - 1] + D2); } inward[c] = d; }
    }
    for (let c = 0; c < N; c++) {
      if (!mask[c]) continue;
      const f = inward ? Math.min(1, inward[c] / e.feather) : 1;
      const texture = (1 - aux[c * 4]) * (1 - sizing) + 0.5 * sizing;
      const cap = e.capMin + (e.capMax - e.capMin) * texture;
      a[c * 4 + 3] = Math.max(a[c * 4 + 3], e.level * cap * (0.3 + 0.7 * f));
      // Damp, not just moist: a trace of water on the surface too, so
      // strokes laid into it melt together (fibres alone left each stroke
      // its own hard edge, with white gaps between the rows of a wash).
      if (e.film && f >= 1) a[c * 4] = Math.max(a[c * 4], e.film);
    }
    for (const b of A) device.queue.writeBuffer(b, 0, a);
    device.queue.writeBuffer(tilesBuf, 32, new Uint32Array(TX * TY).fill(4));   // wake every tile
  }
  // Masking fluid over the sheet (per cell, 0..1): what areaAt treats as a
  // boundary.
  window.__sim.maskField = async () => {
    const df = new Float32Array(await readBuffer(Dbuf, N * DB)), out = new Float32Array(N);
    for (let c = 0; c < N; c++) out[c] = df[c * 28 + 26];
    return out;
  };
  window.__sim.cell = async (x, y) => {
    const c = y * W + x, f = async (buf, n) => new Float32Array(await readBuffer(buf, n * 4, c * n * 4));
    const d = await f(Dbuf, DB / 4), du = new Uint32Array(d.buffer);
    return { A: [...await f(A[parity], 4)], aux: [...await f(auxBuf, 4)], stain: d[3], dep: [...Array(ND).keys()].filter(k => d[10 + k] > 0).map(k => ({ pig: PIGMENTS[dId(du, 0, k)]?.name, amt: d[10 + k], stamp: d[18 + k] })), time: state.simTime };
  };
  window.__sim.open = blob => openPainting(blob);
  window.__sim.carry = () => [...state.carry];
  // SHA-256 of each state buffer, to check that an optimisation leaves the
  // simulation bit-identical.
  window.__sim.stateHashes = async () => {
    const hex = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
    return {
      A: await hex(await readBuffer(A[parity], N * 16)), G: await hex(await readBuffer(G[parity], N * GB)),
      D: await hex(await readBuffer(Dbuf, N * DB)), aux: await hex(await readBuffer(auxBuf, N * 16)),
    };
  };
  window.__sim.paintingBlob = paintingBlob;
  window.__sim.savePNG = savePNG;
  window.__sim.layerBlobs = layerBlobs;
  window.__sim.renderOver = renderOver;
  window.__minds = makeMinds(window.__sim);
  // The Wash tool: a little mind a person can use too. Fills an outline
  // with the loaded brush, in real time, as one undo step. The painter's
  // lasso and scripts both call this.
  // paper: how wet the wash is laid. 'moist' (satin: a flat wash, or
  // wet-in-wet) or 'wet' (shiny: a juicy background wash). Dampening
  // brings the area to that, and a moist wash's rows keep it there.
  window.__sim.washOptions = { kind: 'flat', fadeTo: 0.2, paper: 'moist', dampen: true, water: false, dampenOnly: false, around: false, into: null, direction: 'down', area: 'lasso', scrubWidth: 40 };
  const WASH_PAPER = { moist: { film: 0.05, rows: 0.12 }, wet: { film: 0.15, rows: null } };
  // Show an area on the overlay (faint blue) while it's being washed.
  const drawArea = mask => {
    drawMagnets();
    const g = document.getElementById('overlay').getContext('2d'), img = g.getImageData(0, 0, W, H);
    for (let c = 0; c < N; c++) if (mask[c]) { img.data[c * 4] = 60; img.data[c * 4 + 1] = 100; img.data[c * 4 + 2] = 190; img.data[c * 4 + 3] = 40; }
    g.putImageData(img, 0, 0);
  };
  // A variegated wash's brush load at (x, y): the brush's own colour
  // blending into `into` (a pigment name, a mixing well 0-5 as { well }, or
  // a mix [[name, parts], ...]) down the area, across it, or in soft
  // patches. At most four pigments in the brush at once.
  const loadOf = into => {
    if (typeof into === 'string') return [[into, 1]];
    if (into && Number.isInteger(into.well)) return window.__sim.wells.get()[into.well].map(d => [d.name, d.dabs]);
    return into ?? [];
  };
  const variegate = (mask, into, direction = 'down') => {
    const A = state.brush.map(b => [PIGMENTS[b.pigment].name, b.frac]), B = loadOf(into);
    if (!B.length) throw new Error('pick a colour to variegate into');
    const norm = L => { const t = L.reduce((a, [, f]) => a + f, 0) || 1; return L.map(([n, f]) => [n, f / t]); };
    const nA = norm(A), nB = norm(B);
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let c = 0; c < N; c++) if (mask[c]) { const x = c % W, y = (c / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    // Soft patches: smooth value noise about 30 mm across.
    const hash = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7 + state.simTime) * 43758.5453; return v - Math.floor(v); };
    const noise = (x, y) => {
      const s = 150, gx = x / s, gy = y / s, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
    };
    const tAt = (x, y) => direction === 'across' ? (x - x0) / Math.max(1, x1 - x0)
      : direction === 'patches' ? Math.min(1, Math.max(0, (noise(x, y) - 0.25) * 2))
      : (y - y0) / Math.max(1, y1 - y0);
    return (x, y) => {
      const t = Math.min(1, Math.max(0, tAt(x, y))), m = new Map();
      for (const [n, f] of nA) m.set(n, (m.get(n) ?? 0) + f * (1 - t));
      for (const [n, f] of nB) m.set(n, (m.get(n) ?? 0) + f * t);
      return [...m].filter(([, f]) => f > 0.02).sort((p, q) => q[1] - p[1]).slice(0, 4);
    };
  };
  // Soften an edge: trace roughly along a wet edge; the soften mind finds
  // the edge and runs a damp brush half over it. One undo step.
  window.__sim.softenEdge = async line => {
    if (state.washing) throw new Error('a wash is already running');
    window.__sim.checkpoint();
    state.washing = true; state.cancelWash = false; state.washReturn = state.mode; state.onWash?.();
    const mode0 = state.mode;
    try { await window.__minds.soften(line.map(([x, y]) => [x, y])); return true; }
    catch (e) { if (e.message !== 'cancelled') throw e; return false; }
    finally {
      state.washing = false; state.cancelWash = false;
      window.__sim.headless.setMode(state.washReturn ?? mode0); state.washReturn = null;
      uiSync(); drawMagnets(); state.onWash?.();
    }
  };
  window.__sim.wash = async (outline, opts = {}) => {
    if (state.washing) throw new Error('a wash is already running');
    const { kind, fadeTo, water, dampenOnly, into, direction, around, paper } = { ...window.__sim.washOptions, ...opts };
    const wet = WASH_PAPER[paper];
    if (!wet) throw new Error(`unknown wash paper ${paper}; ${Object.keys(WASH_PAPER).join(' or ')}`);
    const dampen = opts.dampen ?? opts.mist ?? window.__sim.washOptions.dampen;
    const M = window.__minds, h = window.__sim.headless;
    // The area: a polygon; null for the whole sheet (a little past its
    // edges, so rows run off the paper); { at: [x, y] } for the unpainted
    // shape around a point; { scrub: points, radius } for a scrubbed area;
    // or { mask }.
    outline ??= [[-8, -8], [W + 8, -8], [W + 8, H + 8], [-8, H + 8]];
    if (!Array.isArray(outline) && outline.at) {
      outline = await M.areaAt(...outline.at);
      if (!outline) throw new Error('that spot is painted: click inside an unpainted shape');
    } else if (outline.scrub) {
      const R = outline.radius ?? window.__sim.washOptions.scrubWidth, path = outline.scrub;
      outline = M.scrubArea(path, R);
      if (M.isBand(path, R, outline.mask)) outline.band = { path, R };
    }
    if (outline.mask) drawArea(outline.mask);
    const areaMask = M.maskOf(outline);
    const keep = ['brushRadius', 'brushPigment', 'mistRadius', 'dipLoad'].map(k => [k, values[k]]);
    const mode0 = state.mode;   // (the pigment isn't restored: switching pans mid-wash variegates it)
    const load0 = state.brush.map(b => ({ ...b }));
    window.__sim.checkpoint();
    window.__sim.rinse();   // a clean brush for a new wash (it carried the last wash's colour into this one)
    state.washing = true; state.cancelWash = false; state.washReturn = mode0; state.onWash?.();
    try {
      h.setMode(water ? 1 : 0);
      if (dampen || dampenOnly) await window.__sim.dampen(areaMask, 1, wet.film, opts.feather ?? 0);
      if (dampenOnly) return true;
      const brushAt = kind === 'variegated' ? variegate(areaMask, into, direction) : null;
      // A found or scrubbed shape is cut in along its edge with the tip and
      // filled with rows that fit the room (washAround): flat rows would
      // spill a big brush over a thin painted outline.
      if (outline.band && kind !== 'around') {
        // A scrub that follows a shape: strokes follow it too. Graded fades
        // along the band.
        const { path, R } = outline.band, pig0 = values.brushPigment;
        let total = 0; const at = [0];
        for (let k = 1; k < path.length; k++) at.push(total += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]));
        const along = (x, y) => { let best = 0, bd = Infinity; path.forEach(([px, py], k) => { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = at[k]; } }); return best / Math.max(1, total); };
        const pigmentAt = kind === 'graded' ? (x, y) => pig0 * (1 + (fadeTo - 1) * along(x, y)) : null;
        const dip0 = values.dipLoad;
        if (wet.rows && !water) values.dipLoad = Math.min(dip0, 0.5);
        await M.alongBand(path, R, outline.mask, { brushAt, pigmentAt });
        values.brushPigment = pig0; values.dipLoad = dip0;
      } else {
        let pigmentAt = null;
        if (kind === 'graded') {
          let top = H, bottom = 0;
          for (let c = 0; c < N; c++) if (areaMask[c]) { const y = (c / W) | 0; if (y < top) top = y; bottom = y; }
          const pig0 = values.brushPigment;
          pigmentAt = (x, y) => pig0 * (1 + (fadeTo - 1) * Math.min(1, Math.max(0, (y - top) / Math.max(1, bottom - top))));
        }
        // Cut in along the edge with the tip and fill with rows that narrow
        // toward it, so a big brush doesn't spill past the outline (plain
        // rows stopped only the brush's middle short of it). Only 'around'
        // goes around paint already inside; the rest glaze over it.
        await M.washAround(outline, { mist: false, pigmentAt, brushAt, even: opts.even ?? true, avoidPaint: kind === 'around' || !!around, water: water ? null : wet.rows });
      }
      return true;
    } catch (e) {
      // Stopped midway: the minds didn't get to put back what they change
      // while working (size, strength, spray reach). Otherwise they do,
      // and a Size the painter changes during the wash stays.
      for (const [k, v] of keep) values[k] = v;
      if (e.message !== 'cancelled') throw e;
      return false;
    } finally {
      state.washing = false; state.cancelWash = false;
      if (kind === 'variegated') state.brush = load0;   // back to the colour it started from
      h.setMode(state.washReturn ?? mode0); state.washReturn = null;
      uiSync(); drawMagnets(); state.onWash?.();
    }
  };
  window.__sim.savePainting = savePainting;

  bindPointer(canvas);
  const openInput = document.getElementById('openInput');
  openInput.addEventListener('change', () => {
    if (openInput.files[0]) openPainting(openInput.files[0]).catch(e => fail(`Couldn't open painting: ${e.message}`));
    openInput.value = '';
  });
  let restoreNext = () => {};
  const { btns } = buildUI({ clear, newPaper, acts: {
    fix: () => window.__sim.fix(),
    unmask: () => window.__sim.unmask(),
    undo: () => window.__sim.undo(),
    redo: () => window.__sim.redo(),
    savePNG: () => savePNG().catch(e => fail(e.message)),
    saveLayer: () => saveLayer().catch(e => fail(e.message)),
    savePainting: () => savePainting().catch(e => fail(e.message)),
    open: () => openInput.click(),
    restore: () => restoreNext(),
    bugReport: () => window.__sim.saveBugReport().catch(e => fail(`Bug report: ${e.message}`)),
  } });
  // Restore: offer the autosaves, newest first.
  const restoreBtn = btns.restore;
  const ago = at => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'just now' : m < 90 ? `${m} min ago` : new Date(at).toLocaleString(); };
  (async () => {
    const saves = (await Promise.all(['latest', 'previous'].map(k => autosave.get(k).catch(() => null)))).filter(Boolean);
    if (!saves.length) return;
    let k = 0;
    const label = () => { restoreBtn.textContent = `Restore (${ago(saves[k].at)})`; restoreBtn.title = saves.length > 1 ? 'Restore the autosave; click again for the one before' : 'Restore the autosave'; };
    label(); restoreBtn.hidden = false;
    restoreNext = () => {
      openPainting(saves[k].blob).then(() => { k = (k + 1) % saves.length; label(); }).catch(e => fail(`Couldn't restore: ${e.message}`));
    };
  })();
  requestAnimationFrame(frame);
}

function bindPointer(canvas) {
  const ptr = state.pointer;
  const toGrid = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
  };
  // Stroke recorder: while state.recording is an array, every pointer event
  // on the canvas is kept (grid position, pressure, Touch dial, Shift/Option,
  // pen tilt, timing), and each touchdown also keeps the mode, brush and all
  // knobs, so sim.replay() can put the same strokes through the same code.
  const record = e => {
    if (!state.recording) return;
    const [gx, gy] = toGrid(e);
    const ev = { t: performance.now() - (state.recording.t0 ?? (state.recording.t0 = performance.now())), type: e.type, gx, gy,
      pressure: e.pressure, pointerType: e.pointerType, shiftKey: e.shiftKey, altKey: e.altKey, button: e.button, buttons: e.buttons,
      tiltX: e.tiltX, tiltY: e.tiltY, touch: values.mouseTouch };
    if (e.type === 'pointerdown') Object.assign(ev, { mode: state.mode, brush: JSON.parse(JSON.stringify(state.brush)), brushType: state.brushType, values: { ...values }, wash: { ...window.__sim.washOptions } });
    state.recording.push(ev);
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup']) canvas.addEventListener(type, record);
  canvas.closest('main').addEventListener('pointerdown', e => { if (e.target !== canvas && state.mode === 7) record(e); });   // a wash area started on the margin
  // Replay a recording: real PointerEvents on the canvas, at the recorded
  // times (scaled by 1 / speed), with each stroke's settings restored.
  window.__sim.replay = (rec, { speed = 1 } = {}) => new Promise(done => {
    const events = Array.isArray(rec) ? rec : rec.events;
    const t0 = performance.now();
    let k = 0;
    const tick = () => {
      const now = (performance.now() - t0) * speed;
      while (k < events.length && events[k].t <= now) {
        const ev = events[k++];
        if (ev.values) { Object.assign(values, ev.values); state.brush = ev.brush; state.brushType = ev.brushType; window.__sim.headless.setMode(ev.mode); if (ev.wash) Object.assign(window.__sim.washOptions, ev.wash); }
        values.mouseTouch = ev.touch;
        const r = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new PointerEvent(ev.type, { clientX: r.left + ev.gx / W * r.width, clientY: r.top + ev.gy / H * r.height,
          pressure: ev.pressure, pointerType: ev.pointerType, shiftKey: ev.shiftKey, altKey: ev.altKey, button: ev.button, buttons: ev.buttons,
          tiltX: ev.tiltX, tiltY: ev.tiltY, pointerId: 1, bubbles: true }));
      }
      if (k < events.length) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  // Touch: a pen's pressure; with a mouse or trackpad, the Touch dial
  // (values.mouseTouch: hold Z or Option lighter, X heavier). Side of the
  // brush from Shift or pen tilt.
  const pressureOf = e => (e.pointerType === 'pen' ? Math.max(e.pressure, 0.05) * 1.5 : values.mouseTouch);
  const sideOf = e => {
    if (e.shiftKey) return 1;
    if (e.pointerType === 'pen' && (e.tiltX || e.tiltY)) return Math.min(Math.max((Math.hypot(e.tiltX, e.tiltY) - 30) / 40, 0), 1);
    return 0;
  };
  // Magnet mode: click to place, drag to move. To remove one: double-click
  // it, drag it off the paper, press Delete after touching it, or
  // Option/Control/right-click it.
  let dragMagnet = null;
  let lastMagnet = null;
  const removeMagnet = mg => { state.magnets = state.magnets.filter(x => x !== mg); if (lastMagnet === mg) lastMagnet = null; drawMagnets(); };
  canvas.addEventListener('dblclick', e => {
    if (state.mode !== 3) return;
    const hit = magnetAt(...toGrid(e));
    if (hit) removeMagnet(hit);
  });
  window.addEventListener('keydown', e => {
    if (state.mode === 3 && lastMagnet && (e.key === 'Delete' || e.key === 'Backspace')
        && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
      e.preventDefault();
      removeMagnet(lastMagnet);
    }
  });
  const magnetAt = (x, y) => [...state.magnets].reverse().find(mg => hitMagnet(mg, x, y));
  // Rotate a magnet: R (Shift+R backwards) for the last one touched, or the
  // scroll wheel over one.
  const rotateMagnet = (mg, da) => { mg.angle = (mg.angle ?? 0) + da; drawMagnets(); };
  // Turn a flat brush: R (Shift+R backwards) or the scroll wheel, painting.
  const turnFlat = deg => { values.flatAngle = ((values.flatAngle + deg + 540) % 360) - 180; uiSync(); };
  canvas.addEventListener('wheel', e => {
    if (state.mode !== 3 && values.brushShape > 0.5) { e.preventDefault(); turnFlat(Math.sign(e.deltaY) * 7.5); return; }
    if (state.mode !== 3) return;
    const hit = magnetAt(...toGrid(e));
    if (!hit) return;
    e.preventDefault();
    rotateMagnet(hit, Math.sign(e.deltaY) * Math.PI / 24);
    lastMagnet = hit;
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (state.mode !== 3 && values.brushShape > 0.5 && (e.key === 'r' || e.key === 'R')
        && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') { turnFlat((e.shiftKey ? -1 : 1) * 15); return; }
    if (state.mode === 3 && lastMagnet && (e.key === 'r' || e.key === 'R')
        && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
      rotateMagnet(lastMagnet, (e.shiftKey ? -1 : 1) * Math.PI / 12);
    }
  });
  canvas.addEventListener('contextmenu', e => { if (state.mode === 3) e.preventDefault(); });
  // Wash tool: draw a loose outline (a lasso); on release the brush fills
  // it (sim.wash). Nothing else paints while a wash is running.
  let lasso = null;
  const drawLasso = (pts, done = false) => {
    drawMagnets();
    const g = document.getElementById('overlay').getContext('2d');
    g.save();
    g.setLineDash([6, 5]); g.lineWidth = 2; g.strokeStyle = done ? 'rgba(80,120,200,.35)' : 'rgba(40,80,170,.8)';
    g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
    g.restore();
  };
  const drawScrub = (pts, width = null) => {
    drawMagnets();
    const g = document.getElementById('overlay').getContext('2d');
    g.save();
    g.lineCap = g.lineJoin = 'round'; g.lineWidth = width ?? 2 * window.__sim.washOptions.scrubWidth; g.strokeStyle = width ? 'rgba(40,80,170,.7)' : 'rgba(60,100,190,.18)';
    g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.restore();
  };
  // Wash areas can start on the margin around the paper, so a rectangle
  // can run off the sheet without leaving a sliver at its edge.
  canvas.closest('main').addEventListener('pointerdown', e => {
    if (e.target === canvas || state.mode !== 7 || state.washing) return;
    if (!['rect', 'lasso', 'scrub', 'soften'].includes(window.__sim.washOptions.area)) return;
    lasso = [toGrid(e)];
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  canvas.addEventListener('pointerdown', e => {
    if (state.washing || state.replaying) return;
    if (state.mode === 7) {
      const area = window.__sim.washOptions.area;
      if (area === 'sheet' || area === 'shape') {
        document.getElementById('error').textContent = '';
        window.__sim.wash(area === 'sheet' ? null : { at: toGrid(e) }).catch(err => fail(`Wash: ${err.message}`));
        return;
      }
      lasso = [toGrid(e)];
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      return;
    }
    if (state.mode !== 3) window.__sim.checkpoint();   // each stroke can be undone
    if (state.brushType === 'dip') state.reservoir = values.dipLoad;   // a dip brush is reloaded each stroke (Wetness: how full)
    if (state.mode === 3) {
      const [x, y] = toGrid(e);
      const hit = magnetAt(x, y);
      if (e.altKey || e.ctrlKey || e.button === 2) {
        if (hit) removeMagnet(hit);
      } else if (hit) {
        dragMagnet = hit;
      } else if (state.magnets.length < 8) {
        dragMagnet = { shape: state.magnetShape, x, y, angle: 0, moment: 1 };
        state.magnets.push(dragMagnet);
      }
      lastMagnet = dragMagnet ?? lastMagnet;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      drawMagnets();
      return;
    }
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    [ptr.x, ptr.y] = toGrid(e);
    ptr.px = ptr.x; ptr.py = ptr.y;
    ptr.scripted = false;
    ptr.pressure = pressureOf(e);
    ptr.side = sideOf(e);
    ptr.pen = e.pointerType === 'pen';
    ptr.downAt = performance.now();
    ptr.down = true;
    state.strokeStart = state.simTime;   // a new stroke
  });
  canvas.addEventListener('pointermove', e => { state.hover = toGrid(e); });
  canvas.addEventListener('pointerleave', () => { state.hover = null; });
  canvas.addEventListener('pointermove', e => {
    if (lasso) {
      const p = toGrid(e), q = lasso[lasso.length - 1];
      if (window.__sim.washOptions.area === 'scrub' || window.__sim.washOptions.area === 'soften') {
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 3) { lasso.push(p); drawScrub(lasso, window.__sim.washOptions.area === 'soften' ? 3 : null); }
      } else if (window.__sim.washOptions.area === 'rect') {
        const [a] = lasso;
        lasso = [a, p];
        drawLasso([a, [p[0], a[1]], p, [a[0], p[1]]]);
      } else if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 4) { lasso.push(p); drawLasso(lasso); }
      return;
    }
    if (state.washing) return;
    if (dragMagnet) { [dragMagnet.x, dragMagnet.y] = toGrid(e); drawMagnets(); return; }
    [ptr.x, ptr.y] = toGrid(e);
    ptr.pressure = pressureOf(e);
    ptr.side = sideOf(e);
    ptr.pen = e.pointerType === 'pen';
  });
  // The Touch dial: hold Z (or Option) to lighten the touch, X to press
  // harder; it glides while held and stays where it's left.
  const held = { light: false, heavy: false };
  const typing = e => e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT';
  window.addEventListener('keydown', e => {
    if (typing(e)) return;
    if (e.metaKey || e.ctrlKey) return;   // Cmd+Z is undo
    if (e.key === 'Alt' || e.key === 'z' || e.key === 'Z') held.light = true;
    if (e.key === 'x' || e.key === 'X') held.heavy = true;
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'Alt' || e.key === 'z' || e.key === 'Z') held.light = false;
    if (e.key === 'x' || e.key === 'X') held.heavy = false;
  });
  window.addEventListener('blur', () => { held.light = held.heavy = false; });
  let lastTick = performance.now();
  const tick = () => {
    const now = performance.now(), dt = Math.min((now - lastTick) / 1000, 0.1); lastTick = now;
    const dir = (held.heavy ? 1 : 0) - (held.light ? 1 : 0);
    if (dir) inputs_mouseTouch(Math.min(1, Math.max(0.02, values.mouseTouch + dir * values.touchRate * dt)));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const up = () => {
    if (lasso) {
      let pts = lasso; lasso = null;
      if (window.__sim.washOptions.area === 'rect' && pts.length === 2) {
        let [[ax, ay], [bx, by]] = pts;
        // An edge dragged to within a millimetre of the sheet's edge goes past it.
        const snapX = x => (x < 5 ? -8 : x > W - 5 ? W + 8 : x), snapY = y => (y < 5 ? -8 : y > H - 5 ? H + 8 : y);
        [ax, bx] = [snapX(ax), snapX(bx)]; [ay, by] = [snapY(ay), snapY(by)];
        pts = Math.abs(bx - ax) > 4 && Math.abs(by - ay) > 4 ? [[ax, ay], [bx, ay], [bx, by], [ax, by]] : [];
      }
      if (window.__sim.washOptions.area === 'soften') {
        drawMagnets();
        if (pts.length >= 2) window.__sim.softenEdge(pts).catch(err => fail(`Soften: ${err.message}`));
      } else if (window.__sim.washOptions.area === 'scrub') {
        window.__sim.wash({ scrub: pts }).catch(err => fail(`Wash: ${err.message}`));
      } else if (pts.length >= 3) {
        drawLasso(pts, true);
        window.__sim.wash(pts).catch(err => fail(`Wash: ${err.message}`));
      } else drawMagnets();
      return;
    }
    if (state.washing) return;
    ptr.down = false;
    // A magnet dragged off the paper is removed.
    if (dragMagnet && (dragMagnet.x < 0 || dragMagnet.y < 0 || dragMagnet.x > W || dragMagnet.y > H)) removeMagnet(dragMagnet);
    dragMagnet = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
}

// Set by buildUI: refresh knob inputs and menus from the current state
// (after opening a saved painting).
let uiSync = () => {};
let inputs_mouseTouch = v => {};   // set by buildUI

function buildUI({ clear, newPaper, acts }) {
  // Knobs live in three places: the studio (turned while painting), the
  // builders (what the chosen brush and paper are made of; choosing a preset
  // resets them), and the lab (global laws, hidden unless asked for).
  const inputs = {}, setters = {};
  const studioKeys = new Set(STUDIO.map(k => k.key));
  const brushKeys = new Set(Object.values(BRUSHES).flatMap(b => Object.keys(b.knobs)).filter(k => !studioKeys.has(k)));
  const paperKeys = new Set(Object.values(PAPERS).flatMap(pp => Object.keys(pp.knobs ?? {})).filter(k => !studioKeys.has(k)));
  const docOf = p => KNOB_DOCS[p.key]?.doc ?? '';
  const knobRow = (p, parent) => {
    const row = document.createElement('label');
    row.className = 'knob';
    row.title = docOf(p);
    const range = Object.assign(document.createElement('input'), {
      type: 'range', min: p.min, max: p.max, step: (p.max - p.min) / 1000, value: p.v,
    });
    const num = Object.assign(document.createElement('input'), { type: 'number', step: 'any', value: p.v });
    const name = document.createElement('span');
    name.textContent = p.label ?? p.key;
    range.addEventListener('input', () => inputs[p.key](parseFloat(range.value)));
    num.addEventListener('change', () => inputs[p.key](parseFloat(num.value)));
    (setters[p.key] ??= []).push(v => { range.value = v; num.value = +v.toPrecision(4); });
    row.append(name, range, num);
    parent.appendChild(row);
  };
  const byKey = Object.fromEntries(PARAMS.map(p => [p.key, p]));
  const studioEl = document.getElementById('studio');
  const studioRows = STUDIO.map(k => {
    const p = byKey[k.key];
    const row = document.createElement('label');
    row.className = 'studio';
    row.title = k.doc;
    const name = document.createElement('span');
    name.textContent = k.label;
    const range = Object.assign(document.createElement('input'), {
      type: 'range', min: k.min ?? p.min, max: k.max ?? p.max, step: ((k.max ?? p.max) - (k.min ?? p.min)) / 500, value: p.v,
    });
    // Centred sliders (tilt) snap to their middle; double-click any slider
    // to put it back to its default.
    const lo = k.min ?? p.min, hi = k.max ?? p.max, snap = lo < 0 && hi > 0;
    range.addEventListener('input', () => {
      let v = parseFloat(range.value);
      if (snap && Math.abs(v) < 0.04 * (hi - lo)) v = 0;
      inputs[k.key](v);
    });
    range.addEventListener('dblclick', () => inputs[k.key](p.v));
    row.title += ' Double-click to reset.';
    (setters[k.key] ??= []).push(v => { range.value = v; name.textContent = k.label + (snap && v !== 0 ? ' •' : ''); });
    row.append(name, range);
    studioEl.appendChild(row);
    return { k, row };
  });
  // Put the board back down flat.
  const level = Object.assign(document.createElement('button'), { textContent: 'Level the board', title: 'Tilt back to flat' });
  level.addEventListener('click', () => { inputs.tiltX(0); inputs.tiltY(0); });
  const levelRow = Object.assign(document.createElement('div'), { className: 'row' });
  levelRow.appendChild(level);
  studioEl.appendChild(levelRow);
  const showStudio = () => {
    for (const { k, row } of studioRows) {
      row.hidden = (k.tool && TOOLS.find(t => t.name === k.tool).mode !== state.mode) || (k.flat && values.brushShape < 0.5);
    }
  };
  const lab = document.getElementById('knobs');
  const groups = {};
  const labGroup = name => {
    if (!groups[name]) {
      const det = document.createElement('details');
      det.innerHTML = `<summary>${name}</summary>`;
      lab.appendChild(det);
      groups[name] = det;
    }
    return groups[name];
  };
  for (const p of PARAMS) {
    inputs[p.key] = v => {
      if (!Number.isFinite(v)) return;
      values[p.key] = v;
      for (const set of setters[p.key] ?? []) set(v);
      if (p.key === 'brushShape') showStudio();
      if (p.key === 'tiltX' || p.key === 'tiltY') levelRow.hidden = !values.tiltX && !values.tiltY;
    };
    if (studioKeys.has(p.key)) continue;
    if (brushKeys.has(p.key)) knobRow(p, document.getElementById('brushKnobs'));
    else if (paperKeys.has(p.key)) knobRow(p, document.getElementById('paperKnobs'));
    else knobRow(p, labGroup(KNOB_DOCS[p.key]?.tier === 'dev' ? 'Performance and debugging' : p.group));
  }
  const dev = groups['Performance and debugging'];
  if (dev) lab.appendChild(dev);   // last
  const labToggle = document.getElementById('labToggle'), labEl = document.getElementById('lab');
  const LAB_KEY = 'hyperreal-watercolor.lab';
  try { labToggle.checked = localStorage.getItem(LAB_KEY) === '1'; } catch {}
  const showLab = () => { labEl.hidden = !labToggle.checked; try { localStorage.setItem(LAB_KEY, labToggle.checked ? '1' : '0'); } catch {} };
  labToggle.addEventListener('change', showLab);
  showLab();

  // Paint box: every pigment in the library. Clicking a pan loads the brush
  // with it; Shift-clicking (or clicking with Mix on) adds a dab of it to
  // the selected mixing well instead. Pigment already on the paper is never
  // changed.
  const palette = document.getElementById('palette');
  const brushLabel = document.getElementById('brushLabel');
  const mixToggle = document.getElementById('mixToggle');
  let mixing = false;
  mixToggle.addEventListener('click', () => { mixing = !mixing; mixToggle.classList.toggle('on', mixing); });

  let pans = [];
  const renderPans = () => {
    palette.replaceChildren();
    pans = PIGMENTS.map((pg, i) => {
      if (pg.hidden) return null;   // (graphite: the pencil's, not a paint)
      const pan = document.createElement('button');
      pan.className = 'pan';
      pan.title = `${pg.name} (${pg.code}, ${pg.kind})${window.__sim.pigments.edited(pg.name) ? ', edited' : ''}`;
      pan.style.background = swatchColor(pg);
      if (window.__sim.pigments.edited(pg.name)) pan.classList.add('edited');
      pan.addEventListener('click', e => (e.shiftKey || mixing) ? addDab(i) : setPigment(i));
      palette.appendChild(pan);
      return pan;
    });
    if (state.brush.length === 1) pans[state.brush[0].pigment]?.classList.add('on');
    pans = pans.map(p => p ?? { classList: { toggle() {}, remove() {}, add() {} } });
  };
  renderPans();

  // The pigment editor: the recipe of the pigment in the brush (a pan
  // click still just loads the brush; the editor follows it).
  const editor = document.getElementById('pigEditor');
  const editBtn = document.getElementById('editPigment');
  editBtn.addEventListener('click', () => { editor.hidden = !editor.hidden; editBtn.classList.toggle('on', !editor.hidden); renderEditor(); });
  const refs = key => {
    const vals = RECIPES.map(r => [r[key] ?? (key === 'load' ? 1 : 0), r.name]).sort((a, b) => a[0] - b[0]);
    const ub = RECIPES.find(r => r.name === 'French Ultramarine');
    const pick = [vals[0], [ub[key] ?? 1, ub.name], vals[vals.length - 1]];
    return pick.filter((v, i) => pick.findIndex(w => w[1] === v[1]) === i).map(([v, n]) => `${n} ${+(+v).toFixed(2)}`).join(' · ');
  };
  function renderEditor() {
    if (editor.hidden) return;
    const box = window.__sim.pigments;
    const pg = PIGMENTS[state.brush[0]?.pigment ?? 0], r = box.get(pg.name);
    const edit = changes => { try { box.edit(pg.name, changes); editor.querySelector('.msg').textContent = ''; } catch (e) { editor.querySelector('.msg').textContent = e.message; } };
    editor.replaceChildren();
    const head = document.createElement('div');
    head.className = 'edHead';
    head.innerHTML = `<b></b> <span class="hint"></span>`;
    head.querySelector('b').textContent = pg.name;
    head.querySelector('span').textContent = `${pg.code}${box.edited(pg.name) ? ' · edited' : ''}${state.brush.length > 1 ? ' · first pigment of the mix' : ''}`;
    editor.appendChild(head);
    const line = (label, doc, ...els) => {
      const row = document.createElement('label');
      row.className = 'studio';
      row.title = doc;
      const name = document.createElement('span');
      name.textContent = label;
      const cell = document.createElement('div');
      cell.className = 'edCell';
      cell.append(...els);
      row.append(name, cell);
      editor.appendChild(row);
      return row;
    };
    const color = (key, label, doc) => {
      const inp = Object.assign(document.createElement('input'), { type: 'color', value: r[key] ?? '#ffffff' });
      inp.addEventListener('change', () => edit({ [key]: inp.value }));
      const els = [inp];
      if (key === 'tint') {
        const none = Object.assign(document.createElement('button'), { textContent: r.tint ? 'no tint' : 'add tint' });
        none.addEventListener('click', e => { e.preventDefault(); edit({ tint: r.tint ? null : r.masstone }); });
        els.push(none);
      }
      line(label, doc, ...els);
    };
    color('masstone', 'Masstone', 'The colour of a heavy, concentrated application over white paper. Together with the tint this sets the hue, the value and the tinting strength.');
    if (r.mid) color('mid', 'Mid', 'The colour of a medium-strength wash: keeps the spectral render on hue between the masstone and the tint (quinacridones otherwise went violet in between).');
    else { const add = Object.assign(document.createElement('button'), { textContent: 'add mid colour' }); add.addEventListener('click', e => { e.preventDefault(); edit({ mid: r.tint ?? r.masstone }); }); line('Mid', 'Optional: the colour of a medium-strength wash, to keep the spectral render on hue between masstone and tint.', add); }
    if (r.tint !== null) color('tint', 'Tint', 'The colour of a light wash over white paper. Far from the masstone (a pale tint of a dark masstone) = a strong tinter; close to it = a weak one.');
    else color('tint', 'Tint', 'No tint colour: the fit uses the masstone and the opacity alone (usual for whites and metallics).');
    const opSel = document.createElement('select');
    for (const o of OPACITIES) opSel.add(new Option(o, o));
    opSel.value = r.opacity;
    opSel.addEventListener('change', () => edit({ opacity: opSel.value }));
    const low = Object.assign(document.createElement('input'), { type: 'checkbox', checked: r.scatter !== undefined, title: 'Low refractive index (organics, ultramarine, fine oxides): scatters little light, so a heavy film is dark and can\'t lighten a dark ground; the colours then set its tinting strength.' });
    low.addEventListener('change', () => edit({ scatter: low.checked ? 0.04 : undefined }));
    const lowLbl = Object.assign(document.createElement('span'), { className: 'hint', textContent: 'low index' });
    line('Body', 'How much the pigment scatters light: whether it shows on a dark ground (opaque) or glazes over it (transparent).', opSel, low, lowLbl);
    const spSel = document.createElement('select');
    spSel.add(new Option('from the colours', 'colours'));
    for (const k of SPECTRA) spSel.add(new Option(`measured: ${k}`, k));
    spSel.value = r.spectrum ?? (SPECTRA.includes(pg.name) ? pg.name : 'colours');
    spSel.addEventListener('change', () => edit({ spectrum: spSel.value }));
    line('Spectrum', 'Where the spectral render gets the shape of its absorption (which decides how it mixes): a measured pigment, or a smooth spectrum fitted to the colours. Its strength always follows the colours above.', spSel);
    for (const f of RECIPE_FIELDS) {
      const v = r[f.key] ?? (f.key === 'load' ? 1 : 0);
      const range = Object.assign(document.createElement('input'), { type: 'range', min: f.min, max: f.max, step: (f.max - f.min) / 200, value: v });
      const num = Object.assign(document.createElement('span'), { className: 'hint', textContent: (+v).toFixed(2) });
      range.addEventListener('input', () => { num.textContent = (+range.value).toFixed(2); });
      range.addEventListener('change', () => edit({ [f.key]: +range.value }));
      line(f.label, `${f.doc}\nFor comparison: ${refs(f.key)}.`, range, num);
    }
    const actions = document.createElement('div');
    actions.className = 'row';
    const btn = (label, title, fn) => { const b = Object.assign(document.createElement('button'), { textContent: label, title }); b.addEventListener('click', fn); actions.appendChild(b); };
    if (!pg.custom) btn('Reset', 'Back to the built-in recipe', () => { window.__sim.pigments.reset(pg.name); });
    btn('New pan from this', 'A pigment of your own, starting from this one', () => {
      let n = 2; while (PIGMENTS.some(p => p.name === `${pg.name} ${n}`)) n++;
      try { const i = window.__sim.pigments.add(pg.name, `${pg.name} ${n}`); setPigment(i); } catch (e) { editor.querySelector('.msg').textContent = e.message; }
    });
    if (pg.custom) {
      const nm = Object.assign(document.createElement('input'), { value: pg.name, title: 'Name' });
      nm.addEventListener('change', () => { if (nm.value && !PIGMENTS.some(p => p.name === nm.value)) edit({ name: nm.value }); });
      actions.prepend(nm);
      btn('Remove', 'Remove this pigment of your own', () => { try { window.__sim.pigments.remove(pg.name); setPigment(0); } catch (e) { editor.querySelector('.msg').textContent = e.message; } });
    }
    editor.appendChild(actions);
    editor.appendChild(Object.assign(document.createElement('div'), { className: 'hint msg', style: 'color:#e98a7a' }));
    editor.appendChild(Object.assign(document.createElement('p'), { className: 'hint doc', textContent: 'Changes apply to this pigment everywhere, paint already on the sheet included (colour that has stained into the fibres stays). Kept in this browser and saved with paintings.' }));
  }
  window.__sim.pigments.changed.push(() => { renderPans(); renderEditor(); updateBrushLabel(); renderWells(); });

  const setPigment = i => {
    if (state.brushType === 'water') {
      // Pick up a dab: it joins whatever is still in the brush.
      const items = state.brush.map(b => ({ ...b, frac: b.frac * state.pigStore }));
      const hit = items.find(b => b.pigment === i);
      if (hit) hit.frac += 1; else items.push({ pigment: i, frac: 1 });
      items.sort((a, b) => b.frac - a.frac);
      state.brush = items.filter(b => b.frac > 0.02).slice(0, 4);
      state.pigStore = state.brush.reduce((t, b) => t + b.frac, 0);
      state.brush.forEach(b => { b.frac /= state.pigStore; });
    } else {
      state.brush = [{ pigment: i, frac: 1 }];
    }
    selectedWell = -1;
    renderWells();
    pans.forEach((pan, j) => pan.classList.toggle('on', j === i));
    updateBrushLabel();
    renderEditor();
  };
  function updateBrushLabel() {
    const names = state.brush.map(b => PIGMENTS[b.pigment].code);
    brushLabel.textContent = state.brushType === 'water'
      ? `Water brush: ${state.pigStore > 0.02 ? state.brush.map(b => `${Math.round(b.frac * 100)}% ${PIGMENTS[b.pigment].code}`).join(' + ') : 'clean'} · Q squeeze, E wipe`
      : (state.brush.length === 1 ? `${PIGMENTS[state.brush[0].pigment].name} · ${names[0]}` : names.join(' + '));
  }
  // Brush presets set the brush knobs and type together.
  const brushSel = document.getElementById('brushType');
  for (const [key, b] of Object.entries(BRUSHES)) brushSel.add(new Option(b.name, key));
  // Each brush remembers the size it was last given (in this browser), so
  // picking a brush again doesn't snap Size back to the preset's.
  const SIZE_KEY = 'hyperreal-watercolor.brushSizes';
  let sizes = {};
  try { sizes = JSON.parse(localStorage.getItem(SIZE_KEY) ?? '{}') ?? {}; } catch {}
  let applying = false;
  (setters.brushRadius ??= []).push(v => {
    if (applying || state.washing || !brushSel.value) return;
    sizes[brushSel.value] = v;
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(sizes)); } catch {}
  });
  const applyBrush = key => {
    const b = BRUSHES[key];
    applying = true;
    for (const [k, v] of Object.entries(b.knobs)) inputs[k](v);
    if (Number.isFinite(sizes[key])) inputs.brushRadius(sizes[key]);
    applying = false;
    document.getElementById('brushDetails').querySelector('summary').textContent = `Build: brush (${b.name})`;
    state.brushType = b.type;
    // A freshly picked water brush is clean: the first pan clicked is its
    // first dab (it held a full dab of the last brush's pigment, so the
    // first click gave it two).
    state.reservoir = 1; state.pigStore = b.type === 'water' ? 0 : 1;
    brushSel.value = key;
    updateBrushLabel();
  };
  brushSel.addEventListener('change', () => applyBrush(brushSel.value));
  applyBrush(DEFAULT_BRUSH);
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || state.brushType !== 'water') return;
    if (e.key === 'q' || e.key === 'Q') window.__sim.act('squeeze', true);
    if (e.key === 'e' || e.key === 'E') window.__sim.act('wipe');
  });
  window.addEventListener('keyup', e => { if (e.key === 'q' || e.key === 'Q') window.__sim.act('squeeze', false); });

  // Mixing wells: each holds dabs of up to 4 pigments (the most a wet spot
  // on the paper can carry). Saved in this browser.
  const WELLS = 6, WELL_KEY = 'hyperreal-watercolor.wells';
  const byName = name => PIGMENTS.findIndex(pg => pg.name === name);
  let wells = Array.from({ length: WELLS }, () => []);   // [{ pigment, dabs }]
  try {
    const saved = JSON.parse(localStorage.getItem(WELL_KEY) ?? 'null');
    if (Array.isArray(saved)) {
      wells = wells.map((_, k) => (saved[k] ?? [])
        .map(d => ({ pigment: byName(d.name), dabs: d.dabs }))
        .filter(d => d.pigment >= 0 && d.dabs > 0).slice(0, 4));
    }
  } catch {}
  const saveWells = () => {
    try {
      localStorage.setItem(WELL_KEY, JSON.stringify(
        wells.map(w => w.map(d => ({ name: PIGMENTS[d.pigment].name, dabs: d.dabs })))));
    } catch {}
  };
  let selectedWell = -1;
  const wellsEl = document.getElementById('wells');
  const wellMsg = document.getElementById('wellMsg');

  const loadWell = k => {
    selectedWell = k;
    const w = wells[k];
    pans.forEach(pan => pan.classList.remove('on'));
    if (w.length) {
      state.brush = w.map(d => ({ pigment: d.pigment, frac: d.dabs }));
      if (state.brushType === 'water') state.pigStore = 1;
      brushLabel.textContent = `Well ${k + 1}: ` + w.map(d => `${d.dabs} ${PIGMENTS[d.pigment].code}`).join(' + ');
    } else {
      brushLabel.textContent = `Well ${k + 1} is empty: shift-click pans (or turn on Mix) to add dabs`;
    }
    renderWells();
    renderEditor();
  };

  function addDab(i) {
    if (selectedWell < 0) { selectedWell = 0; }
    const w = wells[selectedWell];
    const d = w.find(d => d.pigment === i);
    wellMsg.textContent = '';
    if (d) d.dabs++;
    else if (w.length < 4) w.push({ pigment: i, dabs: 1 });
    else { wellMsg.textContent = 'A well holds up to 4 pigments.'; return; }
    saveWells();
    loadWell(selectedWell);
  }

  function renderWells() {
    wellsEl.replaceChildren();
    wells.forEach((w, k) => {
      const well = document.createElement('div');
      well.className = 'well' + (k === selectedWell ? ' on' : '');
      const chip = document.createElement('button');
      chip.className = 'wellChip';
      chip.title = w.length ? w.map(d => `${d.dabs}× ${PIGMENTS[d.pigment].name}`).join(', ') : `Well ${k + 1} (empty)`;
      chip.style.background = w.length
        ? mixColor(w.map(d => [PIGMENTS[d.pigment], d.dabs]))
        : 'transparent';
      chip.addEventListener('click', () => loadWell(k));
      well.appendChild(chip);
      if (k === selectedWell) {
        const parts = document.createElement('div');
        parts.className = 'wellParts';
        w.forEach(d => {
          const b = document.createElement('button');
          b.className = 'dab';
          b.title = `Remove a dab of ${PIGMENTS[d.pigment].name}`;
          b.style.background = swatchColor(PIGMENTS[d.pigment]);
          b.textContent = d.dabs;
          b.addEventListener('click', () => {
            d.dabs--;
            wells[k] = w.filter(x => x.dabs > 0);
            saveWells(); loadWell(k);
          });
          parts.appendChild(b);
        });
        if (w.length) {
          const clr = document.createElement('button');
          clr.className = 'dab clr';
          clr.title = 'Empty this well';
          clr.textContent = '×';
          clr.addEventListener('click', () => { wells[k] = []; saveWells(); loadWell(k); });
          parts.appendChild(clr);
        }
        well.appendChild(parts);
      }
      wellsEl.appendChild(well);
    });
  }

  setPigment(0);

  // Tools and actions, from the shared tables (src/actions.js); scripts use
  // the same ones through sim.tool(name) and sim.act(name, ...args).
  const toolBtns = TOOLS.map(t => {
    const b = document.createElement('button');
    b.textContent = t.label;
    b.title = `${t.doc} (key ${t.key})`;
    b.addEventListener('click', () => setTool(t.name));
    document.getElementById('tools').appendChild(b);
    return b;
  });
  const magnetRow = document.getElementById('magnetRow');
  // The Wash tool's settings (sim.washOptions, shared with scripts).
  const washRow = document.getElementById('washRow');
  const wo = window.__sim.washOptions;
  const washKind = document.getElementById('washKind'), washWith = document.getElementById('washWith');
  const washFade = document.getElementById('washFade'), washMist = document.getElementById('washMist');
  // Variegated: blend into a pan or a mixing well, down, across or in patches.
  const washInto = document.getElementById('washInto'), washDir = document.getElementById('washDir');
  const fillInto = () => {
    const keep = washInto.value;
    washInto.replaceChildren(new Option('into…', ''));
    window.__sim.wells.get().forEach((w, k) => { if (w.length) washInto.add(new Option(`Well ${k + 1}: ${w.map(d => d.name).join(' + ')}`, `well:${k}`)); });
    PIGMENTS.filter(pg => !pg.hidden).forEach(pg => washInto.add(new Option(pg.name, `pan:${pg.name}`)));
    washInto.value = keep;
  };
  washInto.addEventListener('focus', fillInto);
  washInto.addEventListener('change', () => {
    const v = washInto.value;
    wo.into = v.startsWith('well:') ? { well: +v.slice(5) } : v.startsWith('pan:') ? v.slice(4) : null;
  });
  washDir.addEventListener('change', () => { wo.direction = washDir.value; });
  const showWash = () => {
    const soften = wo.area === 'soften';
    washKind.hidden = washWith.hidden = soften;
    document.getElementById('washVarRow').hidden = soften || wo.kind !== 'variegated';
    if (!document.getElementById('washVarRow').hidden) fillInto();
    document.getElementById('washMistRow').hidden = soften;
    document.getElementById('washPaperRow').hidden = soften;
    document.getElementById('washFadeRow').hidden = soften || wo.kind !== 'graded';
  };
  washKind.addEventListener('change', () => { wo.kind = washKind.value; showWash(); });
  washWith.addEventListener('change', () => { wo.water = washWith.value === 'water'; wo.dampenOnly = washWith.value === 'dampen'; });
  const washArea = document.getElementById('washArea');
  washArea.addEventListener('change', () => { wo.area = washArea.value; washHint.textContent = WASH_HINTS[wo.area]; showWash(); });
  const washHint = document.getElementById('washHint');
  const washScrub = document.getElementById('washScrub');
  washScrub.addEventListener('input', () => { wo.scrubWidth = +washScrub.value; });
  washArea.addEventListener('change', () => { document.getElementById('washScrubRow').hidden = wo.area !== 'scrub'; });
  const WASH_HINTS = { soften: 'Trace roughly along the edge of wet paint; a damp brush finds the edge and runs half over it so it fades out. Wetness sets how damp. Esc stops.', shape: 'Click inside a shape bounded by paint or masking fluid (small gaps are bridged); the brush fills it. Esc stops.', scrub: 'Scrub roughly over the area; the brush lays an even wash where you scrubbed. Esc stops.', lasso: 'Draw a loose outline on the paper; the brush fills it. Esc stops.', rect: 'Drag a rectangle on the paper; the brush fills it. Esc stops.', sheet: 'Click the paper to wash the whole sheet. Esc stops.' };
  washFade.addEventListener('input', () => { wo.fadeTo = +washFade.value; });
  washMist.addEventListener('change', () => { wo.dampen = washMist.checked; });
  const washPaper = document.getElementById('washPaper');
  washPaper.addEventListener('change', () => { wo.paper = washPaper.value; });
  const washAroundEl = document.getElementById('washAround');
  washAroundEl.addEventListener('change', () => { wo.around = washAroundEl.checked; });
  washFade.addEventListener('dblclick', () => { washFade.value = wo.fadeTo = 0.2; });
  showWash();
  // During a wash the wash switches between paint and water itself
  // (internal); a tool chosen meanwhile takes over when the wash ends, and
  // the buttons keep showing the Wash tool (or the one chosen next).
  const setMode = (m, internal = false) => {
    if (state.washing && !internal) state.washReturn = m;
    else state.mode = m;
    const shown = state.washing ? (state.washReturn ?? 7) : m;
    TOOLS.forEach((t, i) => toolBtns[i].classList.toggle('on', t.mode === shown));
    magnetRow.hidden = shown !== 3;
    washRow.hidden = shown !== 7;
    showStudio();
  };
  const setTool = name => {
    // Lift became the clean brush turned right down (thirsty).
    if (name === 'lift') { setMode(1); inputs.dipLoad(0); return; }
    const t = TOOLS.find(t => t.name === name);
    if (!t) throw new Error(`unknown tool ${name}; tools: ${TOOLS.map(t => t.name).join(', ')}`);
    setMode(t.mode);
  };
  setMode(0);

  const btns = {};
  const dryBtn = () => btns.dry;
  const setDry = on => { state.drying = on; dryBtn().classList.toggle('on', on); };
  const pauseBtn = () => btns.pause;
  const togglePause = (on = !state.paused) => { state.paused = on; pauseBtn().classList.toggle('on', state.paused); };
  const recBtn = () => btns.record;
  const toggleRecord = () => {
    if (state.recording) {
      const rec = { version: 1, W, H, paper: state.paper, tone: state.tone, events: state.recording };
      state.recording = null; recBtn().classList.remove('on'); recBtn().textContent = 'Record strokes';
      if (rec.events.length) download(new Blob([JSON.stringify(rec)], { type: 'application/json' }), `strokes-${stamp()}.json`);
    } else {
      state.recording = []; recBtn().classList.add('on'); recBtn().textContent = 'Stop and save strokes';
    }
  };
  const skipSel = document.createElement('select');
  const act = {
    ...acts,
    dry: (on = true) => setDry(on),
    pause: on => togglePause(on),
    clear: () => clear(),
    newPaper: () => newPaper(),
    flipMagnets: () => flipMagnets(),
    removeMagnets: () => { state.magnets = []; drawMagnets(); },
    record: () => toggleRecord(),
    stop: () => state.stopWash(),
    skip: (stage = skipSel.value, opts) => window.__sim.skipTo(stage, opts),
    squeeze: (on = true) => { if (state.brushType === 'water') state.squeezing = on; },
    wipe: () => { if (state.brushType === 'water') { state.pigStore = 0; updateBrushLabel(); } },
  };
  const rows = { sheet: 'sheetActions', magnet: 'magnetRow', history: 'historyActions', file: 'fileActions' };
  for (const a of ACTIONS) {
    if (!act[a.name]) throw new Error(`action ${a.name} has no implementation`);
    const b = document.createElement('button');
    b.textContent = a.label;
    b.title = a.doc + (a.key ? ` (${a.key})` : '');
    if (a.hold) {
      b.addEventListener('pointerdown', () => act[a.name](true));
      for (const ev of ['pointerup', 'pointerleave']) b.addEventListener(ev, () => act[a.name](false));
    } else {
      b.addEventListener('click', () => act[a.name]());
    }
    btns[a.name] = b;
    if (rows[a.group]) document.getElementById(rows[a.group]).appendChild(b);   // 'keys': key only
  }
  // Which stage Skip ahead goes to, beside its button.
  skipSel.title = 'The stage Skip ahead lets the paper dry to.';
  for (const st of ['satin', 'moist', 'damp', 'dry']) skipSel.add(new Option(`to ${st}`, st));
  skipSel.value = 'damp';
  btns.skip.after(skipSel);
  btns.restore.hidden = true;
  btns.stop.hidden = true;
  state.onWash = () => { btns.stop.hidden = !state.washing && !state.skipping; btns.skip.classList.toggle('on', !!state.skipping); };
  window.__sim.tool = setTool;
  window.__sim.act = (name, ...args) => {
    if (!act[name]) throw new Error(`unknown action ${name}; actions: ${ACTIONS.map(a => a.name).join(', ')}`);
    return act[name](...args);
  };
  window.__sim.headless.setMode = m => setMode(m, true);
  // Scripts pick brushes and load pigment through the same functions as
  // the brush menu, the pans and the wells.
  const pigIndex = name => { const i = PIGMENTS.findIndex(pg => pg.name === name); if (i < 0) throw new Error(`unknown pigment ${name}`); return i; };
  window.__sim.headless.setBrushPreset = key => { if (!BRUSHES[key]) throw new Error(`unknown brush ${key}`); applyBrush(key); };
  window.__sim.headless.setBrush = load => {
    if (typeof load === 'string') return setPigment(pigIndex(load));
    if (load.length === 1) return setPigment(pigIndex(load[0][0]));
    state.brush = load.map(([name, frac]) => ({ pigment: pigIndex(name), frac }));
    if (state.brushType === 'water') state.pigStore = 1;
    selectedWell = -1; renderWells();
    pans.forEach(pan => pan.classList.remove('on'));
    brushLabel.textContent = state.brush.map(b => `${b.frac} ${PIGMENTS[b.pigment].code}`).join(' + ');
    renderEditor();
  };
  window.__sim.wells = {
    get: () => wells.map(w => w.map(d => ({ name: PIGMENTS[d.pigment].name, dabs: d.dabs }))),
    add: (k, name) => { selectedWell = k; addDab(pigIndex(name)); return window.__sim.wells.get()[k]; },
    load: k => loadWell(k),
    empty: k => { wells[k] = []; saveWells(); loadWell(k); },
  };
  document.getElementById('keys').textContent = 'Keys: ' + [
    ...TOOLS.map(t => `${t.key} ${t.label.toLowerCase()}`),
    ...ACTIONS.filter(a => a.key).map(a => `${a.key} ${a.label.toLowerCase().replace(' (hold)', '')}`),
    ...KEYS.map(([k, what]) => `${k} ${what}`),
  ].join(' · ') + '.';

  const shapeSel = document.getElementById('magnetShape');
  for (const [key, sh] of Object.entries(SHAPES)) shapeSel.add(new Option(sh.name, key));
  shapeSel.addEventListener('change', () => { state.magnetShape = shapeSel.value; setMode(3); });
  // A paper preset sets its surface and its physics knobs together.
  const applyPaperKnobs = () => {
    for (const [k, v] of Object.entries(PAPERS[state.paper].knobs)) inputs[k](v);
    document.getElementById('paperDetails').querySelector('summary').textContent = `Build: paper (${PAPERS[state.paper].name})`;
  };
  inputs_mouseTouch = v => inputs.mouseTouch(v);
  uiSync = () => {
    for (const p of PARAMS) inputs[p.key](values[p.key]);
    document.getElementById('paperType').value = state.paper;
    document.getElementById('tone').value = state.tone;
  };
  const toneSel = document.getElementById('tone');
  for (const [key, t] of Object.entries(TONES)) toneSel.add(new Option(t.name, key));
  toneSel.addEventListener('change', () => { state.tone = toneSel.value; });

  const paperSel = document.getElementById('paperType');
  for (const [key, pp] of Object.entries(PAPERS)) paperSel.add(new Option(pp.name, key));
  paperSel.value = state.paper;
  paperSel.addEventListener('change', () => {
    state.paper = paperSel.value;
    applyPaperKnobs();
    newPaper();
  });
  applyPaperKnobs();
  uiSync();

  document.getElementById('reset').addEventListener('click', () => {
    PARAMS.forEach(p => inputs[p.key](p.v));
    applyPaperKnobs();
    applyBrush(brushSel.value);
  });

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      act[e.shiftKey ? 'redo' : 'undo']();
      return;
    }
    if (e.metaKey || e.ctrlKey) return;
    if (e.key === 'Escape') { act.stop(); return; }
    const tool = TOOLS.find(t => t.key === e.key);
    if (tool) setMode(tool.mode);
    else if (e.key === 'f') act.flipMagnets();
    else if (e.key === '[' || e.key === ']') {
      const n = PIGMENTS.length;
      let i = state.brush[0].pigment;
      do { i = (i + (e.key === ']' ? 1 : n - 1)) % n; } while (PIGMENTS[i].hidden);
      setPigment(i);
    }
    else if (e.key === 'd' && !e.repeat) setDry(true);
    else if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'c') act.clear();
  });
  window.addEventListener('keyup', e => { if (e.key === 'd') setDry(false); });
  return { btns };
}

// Display colour of a pigment at a mid-strength wash over white paper
// (Kubelka-Munk), for the palette chips.
function swatchColor(pg, thickness = 2) {
  return mixColor([[pg, 1]], thickness);
}

// Display colour of a mix of pigments, given as [pigment, parts] pairs:
// absorption and scattering add in proportion, as on the paper.
function mixColor(parts, thickness = 2) {
  // In the spectral render's terms (K and S per band), like the paper, so a
  // pan shows the colour it paints.
  const total = parts.reduce((t, [, n]) => t + n, 0) || 1;
  const R = new Array(NB).fill(0).map((_, k) => {
    const K = parts.reduce((t, [pg, n]) => t + pg.Kspec[k] * n / total, 0);
    const S = Math.max(parts.reduce((t, [pg, n]) => t + pg.Sspec[k] * n / total, 0), 1e-4);
    const a = 1 + K / S, b = Math.max(Math.sqrt(a * a - 1), 1e-4);
    const bs = Math.min(b * S * thickness, 20), sh = Math.sinh(bs), c = a * sh + b * Math.cosh(bs);
    const Rr = sh / c, T = b / c, Rg = 0.97;
    return Rr + T * T * Rg / (1 - Rr * Rg);
  });
  const lin = spectrumToLinear(R);
  const c = lin.map(v => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))));
  return `rgb(${c.join(',')})`;
}

// Flip every magnet's pole (spec: flipping during drying lays down bands).
function flipMagnets() {
  state.magnets.forEach(mg => { mg.moment = -mg.moment; });
  drawMagnets();
}

// Magnets are drawn on a 2D canvas laid over the paper. Any change that
// redraws them also marks the field for recomputation.
function drawMagnets() {
  state.magDirty = true;
  const ov = document.getElementById('overlay');
  if (!ov) return;
  const g = ov.getContext('2d');
  g.clearRect(0, 0, ov.width, ov.height);
  for (const mg of state.magnets) drawMagnet(g, mg);
}

function fail(msg) {
  document.getElementById('error').textContent = msg;
  console.error(msg);
}

init().catch(e => fail(e.message));
