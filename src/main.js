import { PARAMS, SIM_PARAMS, simParamBufferSize } from './params.js';
import { simWGSL, renderWGSL, MAX_PIGMENTS, MAX_CHARGES } from './shaders.js';
import { SHAPES, buildCharges, drawMagnet, hitMagnet } from './magnets.js';
import { BRUSHES, DEFAULT_BRUSH } from './brushes.js';
import { makeMinds } from './minds.js';
import { makePaper, PAPERS, DEFAULT_PAPER, TONES } from './paper.js';
import { PIGMENTS, STAIN_MAP } from './pigments.js';
import { NB, upsample, srgbToLinear, TO_RGB } from './spectral.js';

const W = 1024, H = 768, N = W * H;
const WG = 16;
// Spectral table floats: pigments (16 K + 16 S each), ground, stain maps.
const SPEC_FLOATS = MAX_PIGMENTS * 32 + NB + 6 * NB;

const values = Object.fromEntries(PARAMS.map(p => [p.key, p.v]));
const state = {
  mode: 0,          // 0 paint, 1 water, 2 lift
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
  fixPending: false, // spray fixative over the sheet on the next step
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
  const G = [buf(N * 32, S | CD), buf(N * 32, S | CD)];  // suspended components
  const Dbuf = buf(N * 80, S | CD);                      // deposited components + stain + stamps
  const paramBuf = buf(simParamBufferSize(), U | CD);
  const frameBuf = buf(112, U | CD);
  const renderBuf = buf(48, U | CD);
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
  const tilesBuf = buf(32 + TX * TY * 8, S | CD);
  // Indirect args are copied out of tilesBuf: a buffer can't be both bound as
  // writable storage and used for an indirect dispatch.
  const argsBuf = buf(16, CD | GPUBufferUsage.INDIRECT);

  const newPaper = seed => {
    const h = makePaper(W, H, PAPERS[state.paper], seed);
    const aux = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) aux[i * 4] = h[i];
    device.queue.writeBuffer(auxBuf, 0, aux);
  };
  const clear = () => {
    const z = new Float32Array(N * 4);
    for (const b of [...A, ...B]) device.queue.writeBuffer(b, 0, z);
    // A cleared sheet starts its clock again (deposit timestamps and
    // flocculation fields are relative), so identical sessions reproduce.
    state.simTime = 0;
    for (const b of G) device.queue.writeBuffer(b, 0, new Float32Array(N * 8));
    device.queue.writeBuffer(Dbuf, 0, new Float32Array(N * 20));
    device.queue.writeBuffer(tilesBuf, 32, new Uint32Array(TX * TY));
  };
  newPaper();

  // ---- pipelines
  const simModule = device.createShaderModule({ code: simWGSL(TX * TY) });
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
    magField: compute('magField'), fixSheet: compute('fixSheet'),
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
  const frameData = new ArrayBuffer(112);
  const frameU32 = new Uint32Array(frameData), frameF32 = new Float32Array(frameData);
  const renderData = new ArrayBuffer(48);
  // The pigment table: colour and physical properties of every pigment in
  // the library. Constant, so it's uploaded once.
  const pigData = new Float32Array(MAX_PIGMENTS * 16);
  PIGMENTS.slice(0, MAX_PIGMENTS).forEach((pg, k) => {
    pigData.set([...pg.K, 0, ...pg.S, 0,
      pg.density, pg.staining, pg.granulation, pg.flocculation,
      pg.mobility, pg.wick, pg.load ?? 1, pg.magnetic ?? 0], k * 16);
  });
  device.queue.writeBuffer(pigBuf, 0, pigData);
  // Spectral table (render only): per pigment 16 K then 16 S bands; then
  // the ground (paper) spectrum; then maps from the stain layer's RGB K and
  // S totals to spectra (the stain layer keeps only RGB sums, see stainDep).
  const specData = new Float32Array(SPEC_FLOATS);
  PIGMENTS.slice(0, MAX_PIGMENTS).forEach((pg, k) => specData.set([...pg.Kspec, ...pg.Sspec], k * 32));
  specData.set(STAIN_MAP.K.flat(), MAX_PIGMENTS * 32 + NB);
  specData.set(STAIN_MAP.S.flat(), MAX_PIGMENTS * 32 + NB + 3 * NB);
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
    if (!ptr.down) return null;
    const age = (performance.now() - ptr.downAt) / 1000;
    let pressure = ptr.pressure;
    // Without a pen: strokes ease in from a light touch at touchdown.
    if (!ptr.pen) pressure *= Math.min(1, 0.3 + 0.7 * age / Math.max(values.touchdownEase, 1e-3));
    // Hand input: the brush trails the pointer smoothly instead of jumping to
    // each event, so it never sits still between events (which dotted fast
    // strokes). Scripted strokes are already smooth and go straight there.
    const follow = ptr.scripted ? 1 : 0.5;
    ptr.nx = ptr.px + (ptr.x - ptr.px) * follow;
    ptr.ny = ptr.py + (ptr.y - ptr.py) * follow;
    return { x0: ptr.px, y0: ptr.py, x1: ptr.nx, y1: ptr.ny, pressure, side: ptr.side ?? 0, age };
  };

  function writeUniforms(substeps, brush = pointerBrush(), drying = state.drying) {
    SIM_PARAMS.forEach((p, i) => { paramData[i] = values[p.key]; });
    device.queue.writeBuffer(paramBuf, 0, paramData);

    frameU32[0] = W; frameU32[1] = H; frameU32[2] = state.mode; frameU32[3] = brush ? 1 : 0;
    if (brush) {
      frameF32[4] = brush.x0; frameF32[5] = brush.y0; frameF32[6] = brush.x1; frameF32[7] = brush.y1;
      // Side of the brush (Shift, or a tilted pen): a wider stroke. Loaded,
      // the belly lays a broad wet stroke; as it runs dry, it skims (the
      // classic dry-brush drag).
      const side = Math.min(Math.max(brush.side ?? 0, 0), 1);
      const pr = Math.min(Math.max(brush.pressure ?? 1, 0), 1);
      const load = values.brushCapacity > 0 ? state.reservoir : 1;
      frameF32[8] = pr;
      frameF32[24] = Math.max((1 - pr) * (1 - 0.6 * load), side * 0.8 * (1 - load));
      // Taper: width follows pressure; the side of the brush is wider.
      frameF32[13] = values.brushRadius * (values.taperMin + (1 - values.taperMin) * pr) * (1 + 0.8 * side);
      // Wet-in-wet charge: strongest at touchdown, then the reservoir is spent.
      const dur = Math.max(values.chargeDuration, 1e-3);
      frameF32[11] = Math.exp(-(brush.age ?? 0) / dur);
    }
    // Dwell: a fast stroke spends less time over each spot and lays less
    // there. Measured from the smoothed per-frame travel, since mouse events
    // and frames don't line up (a frame with no new event would otherwise
    // read as the brush resting, and dot the stroke).
    let dwell = 1;
    if (brush) {
      const seg = Math.hypot(brush.x1 - brush.x0, brush.y1 - brush.y0);
      state.smoothSeg = brush.age < 0.02 ? seg : state.smoothSeg * 0.6 + seg * 0.4;
      // Contact length: how much hair trails along the paper feeding paint
      // to the line (a rigger's long hairs), else about the brush's width.
      const contact = values.contactLength > 0 ? values.contactLength : 2 * frameF32[13];
      dwell = Math.min(1, Math.max(0.3, contact / Math.max(state.smoothSeg, 1e-3)));
    }
    frameF32[9] = dwell / substeps;
    frameF32[10] = drying ? values.dryerStrength : 1;
    frameF32[12] = state.simTime;
    frameF32[14] = values.brushCapacity > 0 ? state.reservoir : 1;
    frameF32[15] = concMul();
    if (!brush) { frameF32[13] = values.brushRadius; frameF32[24] = 0; }
    frameF32[25] = values.fixTooth;
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
  function concMul() {
    const w = values.brushCapacity > 0 ? state.reservoir : 1;
    if (state.brushType === 'water') return Math.min(state.pigStore / Math.max(w, 0.05), 4);
    return 1 + values.thicken * (1 - w);
  }

  // Brush reservoir: the GPU tallies the water each frame's stamp actually
  // left on the paper (wet paper takes little, dry paper a lot); it comes
  // back a frame or so later and drains the reservoir.
  const brushRB = [0, 1, 2].map(() => device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }));
  const rbBusy = [false, false, false];
  function queueBrushReadback(enc) {
    if (!state.brushActive) return -1;
    const k = rbBusy.indexOf(false);
    if (k < 0) return -1;
    rbBusy[k] = true;
    enc.copyBufferToBuffer(tilesBuf, 16, brushRB[k], 0, 16);
    return k;
  }
  async function collectBrush(k) {
    if (k < 0) return;
    await brushRB[k].mapAsync(GPUMapMode.READ);
    const u = new Uint32Array(brushRB[k].getMappedRange().slice(0));
    brushRB[k].unmap();
    rbBusy[k] = false;
    if (values.brushCapacity > 0) {
      state.reservoir = Math.max(0, state.reservoir - u[0] / 1e4 / values.brushCapacity);
      // A dab is a fixed amount of pigment, whatever the brush's water holds.
      if (state.brushType === 'water') state.pigStore = Math.max(0, state.pigStore - u[1] / 1e4 / Math.max(values.dabSize, 1e-6));
    }
  }

  // One frame's worth of simulation: find active tiles, then run the physics
  // passes on those tiles only (indirect dispatch; the tile count never
  // leaves the GPU). Must be the only sim work in its command buffer, since
  // the tile counter is reset by writeBuffer at submit time.
  function encodeSim(enc, substeps) {
    state.simTime += substeps / Math.max(values.simSpeed, 1);
    device.queue.writeBuffer(tilesBuf, 0, argsReset);
    const pass = enc.beginComputePass();
    pass.setBindGroup(0, simBG[parity]);
    pass.setPipeline(pipes.blurH); pass.dispatchWorkgroups(gx, gy);
    pass.setPipeline(pipes.blurV); pass.dispatchWorkgroups(gx, gy);
    // Magnet field: only recomputed when a magnet or the depth changes.
    if (values.magnetDepth !== magDepthSeen) { state.magDirty = true; magDepthSeen = values.magnetDepth; }
    if (state.magDirty) {
      const charges = buildCharges(state.magnets, values.magnetDepth, MAX_CHARGES);
      magU32[0] = charges.length;
      magU32[1] = state.magnets.length > 0 ? 1 : 0;
      charges.forEach(([ax, ay, bx, by, z, q], k) => magF32.set([ax, ay, z, q, bx, by, 0, 0], 4 + k * 8));
      device.queue.writeBuffer(magBuf, 0, magData);
      pass.setPipeline(pipes.magField); pass.dispatchWorkgroups(gx, gy);
      state.magDirty = false;
    }
    if (state.fixPending) { pass.setPipeline(pipes.fixSheet); pass.dispatchWorkgroups(gx, gy); state.fixPending = false; }
    pass.setPipeline(pipes.markTiles); pass.dispatchWorkgroups(gx, gy);
    pass.setPipeline(pipes.compactTiles); pass.dispatchWorkgroups(Math.ceil(TX * TY / 64));
    pass.end();
    enc.copyBufferToBuffer(tilesBuf, 0, argsBuf, 0, 16);
    const step = enc.beginComputePass();
    for (let s = 0; s < substeps; s++) {
      step.setBindGroup(0, simBG[parity]);
      step.setPipeline(pipes.velocity); step.dispatchWorkgroupsIndirect(argsBuf, 0);
      step.setPipeline(pipes.transport); step.dispatchWorkgroupsIndirect(argsBuf, 0);
      parity ^= 1;
    }
    step.end();
    return queueBrushReadback(enc);
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
    const t = performance.now();
    const elapsed = Math.min((t - lastFrame) / 1000, 0.1);
    lastFrame = t;
    stepDebt = Math.min(stepDebt + values.simSpeed * elapsed, MAX_STEPS_PER_FRAME);
    const substeps = Math.floor(stepDebt);
    stepDebt -= substeps;
    writeUniforms(Math.max(substeps, 1));
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
    loadBar.style.width = `${Math.round((values.brushCapacity > 0 ? state.reservoir : 1) * 100)}%`;
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
  window.__sim.headless = {
    begin() { state.headless = true; },
    end() { state.headless = false; },
    // A stroke from (x0,y0) to (x1,y1) over `frames` simulated frames.
    // Consecutive paint() calls continue one stroke (the brush isn't
    // reloaded) unless lift() is called in between.
    lift() { strokeFrame = 0; },
    async paint(x0, y0, x1, y1, frames = 24) {
      if (strokeFrame === 0 && state.brushType === 'dip') state.reservoir = 1;   // a fresh dip stroke: reloaded
      const at = f => {
        const t0 = f / frames, t1 = (f + 1) / frames;
        return { x0: x0 + (x1 - x0) * t0, y0: y0 + (y1 - y0) * t0, x1: x0 + (x1 - x0) * t1, y1: y0 + (y1 - y0) * t1,
                 age: (strokeFrame + f) / HZ };
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
    ptr.pen = true; ptr.side = 0; ptr.scripted = true;
    if (state.brushType === 'dip') state.reservoir = 1;
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
    const g = await readBuffer(G[parity], N * 32), d = await readBuffer(Dbuf, N * 80);
    const gu = new Uint32Array(g), gf = new Float32Array(g), du = new Uint32Array(d), df = new Float32Array(d);
    const out = new Float32Array(N);
    for (let c = 0; c < N; c++) for (let k = 0; k < 4; k++) {
      if (gf[c * 8 + 4 + k] > 0 && gu[c * 8 + k] === id) out[c] += gf[c * 8 + 4 + k];
      if (df[c * 20 + 4 + k] > 0 && du[c * 20 + k] === id) out[c] += df[c * 20 + 4 + k];
    }
    return out;
  };

  // Real-time painting helpers (for scripted painting you can watch): a
  // continuous stroke through points [x, y, pressure?, side?], and the
  // blow-dryer.
  window.__sim.path = (points, framesPerSeg = 4) => new Promise(done => {
    const ptr = state.pointer;
    const [x0, y0, p0 = 1, s0 = 0] = points[0];
    ptr.x = ptr.px = x0; ptr.y = ptr.py = y0; ptr.pressure = p0; ptr.downAt = performance.now(); ptr.down = true;
    ptr.pen = true; ptr.side = s0; ptr.scripted = true;   // scripted strokes use their exact pressure and path
    if (state.brushType === 'dip') state.reservoir = 1;
    let seg = 1, f = 0;
    const step = () => {
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
  window.__sim.setDrying = on => { state.drying = on; document.getElementById('dry').classList.toggle('on', on); };
  // Spray workable fixative over the whole sheet (applied on the next step).
  window.__sim.fix = () => { state.fixPending = true; state.lastEdit = performance.now(); };

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
  const STATE_VERSION = 2;
  async function paintingBlob() {
    const parts = {
      A: await readBuffer(A[parity], N * 16),
      G: await readBuffer(G[parity], N * 32),
      D: await readBuffer(Dbuf, N * 80),
      aux: await readBuffer(auxBuf, N * 16),
    };
    const meta = {
      version: STATE_VERSION, W, H, simTime: state.simTime, paper: state.paper, tone: state.tone,
      magnets: state.magnets, values, pigments: PIGMENTS.map(pg => pg.name),
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
    const raw = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const len = new Uint32Array(raw, 0, 1)[0];
    const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(raw, 4, len)));
    if (meta.W !== W || meta.H !== H) throw new Error(`painting is ${meta.W}x${meta.H}, canvas is ${W}x${H}`);
    let off = 4 + len;
    const take = n => { const b = raw.slice(off, off + n); off += n; return b; };
    const a = take(meta.sizes.A), g = take(meta.sizes.G), d = take(meta.sizes.D), ax = take(meta.sizes.aux);
    if ((meta.version ?? 1) < 2) { const f = new Float32Array(ax); for (let c = 0; c < N; c++) f[c * 4 + 2] = 0; }
    // Pigment ids refer to the library at save time; remap by name.
    const remap = meta.pigments.map(name => Math.max(PIGMENTS.findIndex(pg => pg.name === name), 0));
    const remapIds = (buf, stride, idOffset) => {
      const u = new Uint32Array(buf), f = new Float32Array(buf);
      for (let c = 0; c < N; c++) for (let k = 0; k < 4; k++) {
        const i = c * stride + idOffset + k;
        if (f[i + 4] > 0) u[i] = remap[u[i]] ?? 0;
      }
    };
    remapIds(g, 8, 0);
    remapIds(d, 20, 0);
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
  }
  // What the brush would feel at (x, y), averaged over radius r: water,
  // paper dampness, and pigment amounts by name (wet and settled). Reads only
  // the rows it needs.
  window.__sim.sense = async (x, y, r = 6) => {
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
    const gB = await grab(G[parity], 32), dB = await grab(Dbuf, 80);
    const gu = new Uint32Array(gB), gf = new Float32Array(gB), du = new Uint32Array(dB), df = new Float32Array(dB);
    let n = 0, water = 0, damp = 0; const wet = {}, dry = {};
    for (let yy = y0; yy <= y1; yy++) for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(W - 1, Math.ceil(x + r)); xx++) {
      if (Math.hypot(xx - x, yy - y) > r) continue;
      const c = (yy - y0) * W + xx; n++;
      water += a[c * 4]; damp += a[c * 4 + 3];
      for (let k = 0; k < 4; k++) {
        if (gf[c * 8 + 4 + k] > 0) { const nm = PIGMENTS[gu[c * 8 + k]]?.name; wet[nm] = (wet[nm] ?? 0) + gf[c * 8 + 4 + k]; }
        if (df[c * 20 + 4 + k] > 0) { const nm = PIGMENTS[du[c * 20 + k]]?.name; dry[nm] = (dry[nm] ?? 0) + df[c * 20 + 4 + k]; }
      }
    }
    const avg = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v / n).toFixed(4)]));
    return { water: +(water / n).toFixed(4), damp: +(damp / n).toFixed(4), wet: avg(wet), settled: avg(dry), reservoir: +state.reservoir.toFixed(3) };
  };
  // Debug hook: everything stored for one cell.
  window.__sim.cell = async (x, y) => {
    const c = y * W + x, f = async (buf, n) => new Float32Array(await readBuffer(buf, n * 4, c * n * 4));
    const d = await f(Dbuf, 20), du = new Uint32Array(d.buffer);
    return { A: [...await f(A[parity], 4)], aux: [...await f(auxBuf, 4)], dep: [0, 1, 2, 3].filter(k => d[4 + k] > 0).map(k => ({ pig: PIGMENTS[du[k]]?.name, amt: d[4 + k], stamp: d[16 + k] })), time: state.simTime };
  };
  window.__sim.open = blob => openPainting(blob);
  // SHA-256 of each state buffer, to check that an optimisation leaves the
  // simulation bit-identical.
  window.__sim.stateHashes = async () => {
    const hex = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
    return {
      A: await hex(await readBuffer(A[parity], N * 16)), G: await hex(await readBuffer(G[parity], N * 32)),
      D: await hex(await readBuffer(Dbuf, N * 80)), aux: await hex(await readBuffer(auxBuf, N * 16)),
    };
  };
  window.__sim.paintingBlob = paintingBlob;
  window.__sim.savePNG = savePNG;
  window.__sim.layerBlobs = layerBlobs;
  window.__sim.renderOver = renderOver;
  window.__minds = makeMinds(window.__sim);
  window.__sim.savePainting = savePainting;

  bindPointer(canvas);
  buildUI({ clear, newPaper });
  document.getElementById('savePNG').addEventListener('click', () => savePNG().catch(e => fail(e.message)));
  document.getElementById('saveLayer').addEventListener('click', () => saveLayer().catch(e => fail(e.message)));
  document.getElementById('savePainting').addEventListener('click', () => savePainting().catch(e => fail(e.message)));
  // Restore: offer the autosaves, newest first.
  const restoreBtn = document.getElementById('restorePainting');
  const ago = at => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'just now' : m < 90 ? `${m} min ago` : new Date(at).toLocaleString(); };
  (async () => {
    const saves = (await Promise.all(['latest', 'previous'].map(k => autosave.get(k).catch(() => null)))).filter(Boolean);
    if (!saves.length) return;
    let k = 0;
    const label = () => { restoreBtn.textContent = `Restore (${ago(saves[k].at)})`; restoreBtn.title = saves.length > 1 ? 'Restore the autosave; click again for the one before' : 'Restore the autosave'; };
    label(); restoreBtn.hidden = false;
    restoreBtn.addEventListener('click', () => {
      openPainting(saves[k].blob).then(() => { k = (k + 1) % saves.length; label(); }).catch(e => fail(`Couldn't restore: ${e.message}`));
    });
  })();
  const openInput = document.getElementById('openInput');
  document.getElementById('openPainting').addEventListener('click', () => openInput.click());
  openInput.addEventListener('change', () => {
    if (openInput.files[0]) openPainting(openInput.files[0]).catch(e => fail(`Couldn't open painting: ${e.message}`));
    openInput.value = '';
  });
  requestAnimationFrame(frame);
}

function bindPointer(canvas) {
  const ptr = state.pointer;
  const toGrid = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
  };
  // Touch: a pen's pressure. With a mouse or trackpad, full pressure, or a
  // light touch while Option is held (the brush skims: on dry paper it
  // catches only the tooth). Speed can lighten the touch too (knob
  // speedTouch; off by default, as it made fast strokes break up into
  // dots unexpectedly). Side of the brush from Shift or pen tilt.
  let lastMove = null, smoothSpeed = 0;
  const pressureOf = e => {
    if (e.pointerType === 'pen') return Math.max(e.pressure, 0.05) * 1.5;
    const now = performance.now(), [x, y] = toGrid(e);
    if (lastMove) {
      const dt = Math.max(now - lastMove.t, 1), v = Math.hypot(x - lastMove.x, y - lastMove.y) / dt;
      smoothSpeed = smoothSpeed * 0.7 + v * 0.3;
    }
    lastMove = { t: now, x, y };
    const light = e.altKey ? values.lightTouch : 1;
    return light / (1 + values.speedTouch * smoothSpeed);
  };
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
  canvas.addEventListener('wheel', e => {
    if (state.mode !== 3) return;
    const hit = magnetAt(...toGrid(e));
    if (!hit) return;
    e.preventDefault();
    rotateMagnet(hit, Math.sign(e.deltaY) * Math.PI / 24);
    lastMagnet = hit;
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (state.mode === 3 && lastMagnet && (e.key === 'r' || e.key === 'R')
        && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
      rotateMagnet(lastMagnet, (e.shiftKey ? -1 : 1) * Math.PI / 12);
    }
  });
  canvas.addEventListener('contextmenu', e => { if (state.mode === 3) e.preventDefault(); });
  canvas.addEventListener('pointerdown', e => {
    if (state.brushType === 'dip') state.reservoir = 1;   // a dip brush is reloaded each stroke
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
    lastMove = null; smoothSpeed = 0;
    ptr.scripted = false;
    ptr.pressure = pressureOf(e);
    ptr.side = sideOf(e);
    ptr.pen = e.pointerType === 'pen';
    ptr.downAt = performance.now();
    ptr.down = true;
  });
  canvas.addEventListener('pointermove', e => {
    if (dragMagnet) { [dragMagnet.x, dragMagnet.y] = toGrid(e); drawMagnets(); return; }
    [ptr.x, ptr.y] = toGrid(e);
    ptr.pressure = pressureOf(e);
    ptr.side = sideOf(e);
    ptr.pen = e.pointerType === 'pen';
  });
  const up = () => {
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

function buildUI({ clear, newPaper }) {
  const panel = document.getElementById('knobs');
  const groups = {};
  const inputs = {};
  for (const p of PARAMS) {
    if (!groups[p.group]) {
      const det = document.createElement('details');
      det.open = p.group !== 'Render';
      det.innerHTML = `<summary>${p.group}</summary>`;
      panel.appendChild(det);
      groups[p.group] = det;
    }
    const row = document.createElement('label');
    row.className = 'knob';
    const range = Object.assign(document.createElement('input'), {
      type: 'range', min: p.min, max: p.max, step: (p.max - p.min) / 1000, value: p.v,
    });
    const num = Object.assign(document.createElement('input'), { type: 'number', step: 'any', value: p.v });
    const name = document.createElement('span');
    name.textContent = p.label ?? p.key;
    const set = v => {
      if (!Number.isFinite(v)) return;
      values[p.key] = v; range.value = v; num.value = +v.toPrecision(4);
      if (p.key === 'brushPigment') document.getElementById('strength').value = v;   // the panel's Paint strength slider
    };
    range.addEventListener('input', () => set(parseFloat(range.value)));
    num.addEventListener('change', () => set(parseFloat(num.value)));
    inputs[p.key] = set;
    row.append(name, range, num);
    groups[p.group].appendChild(row);
  }

  // Paint box: every pigment in the library. Clicking a pan loads the brush
  // with it; Shift-clicking (or clicking with Mix on) adds a dab of it to
  // the selected mixing well instead. Pigment already on the paper is never
  // changed.
  const palette = document.getElementById('palette');
  const brushLabel = document.getElementById('brushLabel');
  const mixToggle = document.getElementById('mixToggle');
  let mixing = false;
  mixToggle.addEventListener('click', () => { mixing = !mixing; mixToggle.classList.toggle('on', mixing); });

  const pans = PIGMENTS.map((pg, i) => {
    const pan = document.createElement('button');
    pan.className = 'pan';
    pan.title = `${pg.name} (${pg.code}, ${pg.kind})`;
    pan.style.background = swatchColor(pg);
    pan.addEventListener('click', e => (e.shiftKey || mixing) ? addDab(i) : setPigment(i));
    palette.appendChild(pan);
    return pan;
  });

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
  const applyBrush = key => {
    const b = BRUSHES[key];
    for (const [k, v] of Object.entries(b.knobs)) inputs[k](v);
    state.brushType = b.type;
    state.reservoir = 1; state.pigStore = 1;
    brushSel.value = key;
    updateBrushLabel();
  };
  brushSel.addEventListener('change', () => applyBrush(brushSel.value));
  applyBrush(DEFAULT_BRUSH);
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || state.brushType !== 'water') return;
    if (e.key === 'q' || e.key === 'Q') state.squeezing = true;
    if (e.key === 'e' || e.key === 'E') { state.pigStore = 0; updateBrushLabel(); }
  });
  window.addEventListener('keyup', e => { if (e.key === 'q' || e.key === 'Q') state.squeezing = false; });

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

  const modeBtns = [...document.querySelectorAll('[data-mode]')];
  const setMode = m => { state.mode = m; modeBtns.forEach(b => b.classList.toggle('on', +b.dataset.mode === m)); };
  modeBtns.forEach(b => b.addEventListener('click', () => setMode(+b.dataset.mode)));
  setMode(0);

  document.getElementById('fix').addEventListener('click', () => window.__sim.fix());
  const dryBtn = document.getElementById('dry');
  const setDry = on => { state.drying = on; dryBtn.classList.toggle('on', on); };
  dryBtn.addEventListener('pointerdown', () => setDry(true));
  for (const ev of ['pointerup', 'pointerleave']) dryBtn.addEventListener(ev, () => setDry(false));

  const pauseBtn = document.getElementById('pause');
  const togglePause = () => { state.paused = !state.paused; pauseBtn.classList.toggle('on', state.paused); };
  pauseBtn.addEventListener('click', togglePause);

  document.getElementById('clear').addEventListener('click', clear);
  document.getElementById('flipMagnets').addEventListener('click', flipMagnets);
  const shapeSel = document.getElementById('magnetShape');
  for (const [key, sh] of Object.entries(SHAPES)) shapeSel.add(new Option(sh.name, key));
  shapeSel.addEventListener('change', () => { state.magnetShape = shapeSel.value; setMode(3); });
  document.getElementById('clearMagnets').addEventListener('click', () => { state.magnets = []; drawMagnets(); });
  document.getElementById('paper').addEventListener('click', () => newPaper());
  // A paper preset sets its surface and its physics knobs together.
  const applyPaperKnobs = () => {
    for (const [k, v] of Object.entries(PAPERS[state.paper].knobs)) inputs[k](v);
  };
  const strength = document.getElementById('strength');
  strength.value = values.brushPigment;
  strength.addEventListener('input', () => { values.brushPigment = +strength.value; inputs.brushPigment(values.brushPigment); });
  uiSync = () => {
    for (const p of PARAMS) inputs[p.key](values[p.key]);
    strength.value = values.brushPigment;
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

  document.getElementById('reset').addEventListener('click', () => {
    PARAMS.forEach(p => inputs[p.key](p.v));
    applyPaperKnobs();
  });

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key >= '1' && e.key <= '4') setMode(+e.key - 1);
    else if (e.key === 'f') flipMagnets();
    else if (e.key === '[' || e.key === ']') {
      const n = PIGMENTS.length;
      setPigment((state.brush[0].pigment + (e.key === ']' ? 1 : n - 1)) % n);
    }
    else if (e.key === 'd' && !e.repeat) setDry(true);
    else if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'c') clear();
  });
  window.addEventListener('keyup', e => { if (e.key === 'd') setDry(false); });
}

// Display colour of a pigment at a mid-strength wash over white paper
// (Kubelka-Munk), for the palette chips.
function swatchColor(pg, thickness = 2) {
  return mixColor([[pg, 1]], thickness);
}

// Display colour of a mix of pigments, given as [pigment, parts] pairs:
// absorption and scattering add in proportion, as on the paper.
function mixColor(parts, thickness = 2) {
  const total = parts.reduce((t, [, n]) => t + n, 0) || 1;
  const c = [0, 1, 2].map(ch => {
    const K = parts.reduce((t, [pg, n]) => t + pg.K[ch] * n / total, 0);
    const S = Math.max(parts.reduce((t, [pg, n]) => t + pg.S[ch] * n / total, 0), 1e-4);
    const a = 1 + K / S, b = Math.max(Math.sqrt(a * a - 1), 1e-4);
    const bs = Math.min(b * S * thickness, 20), sh = Math.sinh(bs), c = a * sh + b * Math.cosh(bs);
    const R = sh / c, T = b / c, Rg = 0.97;
    return Math.round(255 * Math.min(1, R + T * T * Rg / (1 - R * Rg)));
  });
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
