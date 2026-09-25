import { PARAMS, SIM_PARAMS, simParamBufferSize } from './params.js';
import { simWGSL, renderWGSL } from './shaders.js';
import { makePaper, PAPERS, DEFAULT_PAPER } from './paper.js';
import { PIGMENTS } from './pigments.js';

const W = 1024, H = 768, N = W * H;
const WG = 16;

const values = Object.fromEntries(PARAMS.map(p => [p.key, p.v]));
const state = {
  mode: 0,          // 0 paint, 1 water, 2 lift
  pigment: 0,
  paper: DEFAULT_PAPER,
  drying: false,
  paused: false,
  headless: false,
  pointer: { down: false, x: 0, y: 0, px: 0, py: 0, pressure: 1 },
};

async function init() {
  const canvas = document.getElementById('canvas');
  if (!navigator.gpu) return fail('WebGPU is not available in this browser.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return fail('No WebGPU adapter found.');
  const device = await adapter.requestDevice();
  device.lost.then(info => fail(`GPU device lost: ${info.message}`));
  device.addEventListener('uncapturederror', e => console.error('[wgpu]', e.error.message));

  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  // ---- buffers
  const S = GPUBufferUsage.STORAGE, CD = GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, U = GPUBufferUsage.UNIFORM;
  const buf = (size, usage) => device.createBuffer({ size, usage });
  const paperBuf = buf(N * 4, S | CD);
  const A = [buf(N * 16, S | CD), buf(N * 16, S | CD)];
  const B = [buf(N * 16, S | CD), buf(N * 16, S | CD)];
  const mbBuf = buf(N * 4, S | CD);
  const tmpBuf = buf(N * 4, S | CD);
  const paramBuf = buf(simParamBufferSize(), U | CD);
  const frameBuf = buf(48, U | CD);
  const renderBuf = buf(80, U | CD);

  const newPaper = () => device.queue.writeBuffer(paperBuf, 0, makePaper(W, H, PAPERS[state.paper]));
  const clear = () => {
    const z = new Float32Array(N * 4);
    for (const b of [...A, ...B]) device.queue.writeBuffer(b, 0, z);
  };
  newPaper();

  // ---- pipelines
  const simModule = device.createShaderModule({ code: simWGSL() });
  const renderModule = device.createShaderModule({ code: renderWGSL });
  for (const m of [simModule, renderModule]) {
    const info = await m.getCompilationInfo();
    for (const msg of info.messages) console[msg.type === 'error' ? 'error' : 'warn'](`[wgsl ${msg.lineNum}:${msg.linePos}] ${msg.message}`);
  }

  const C = GPUShaderStage.COMPUTE;
  const simLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, buffer: { type: 'uniform' } },
      { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: C, buffer: { type: 'storage' } },
      { binding: 5, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 6, visibility: C, buffer: { type: 'storage' } },
      { binding: 7, visibility: C, buffer: { type: 'storage' } },
      { binding: 8, visibility: C, buffer: { type: 'storage' } },
    ],
  });
  const simPL = device.createPipelineLayout({ bindGroupLayouts: [simLayout] });
  const compute = entryPoint => device.createComputePipeline({
    layout: simPL, compute: { module: simModule, entryPoint },
  });
  const pipes = {
    blurH: compute('blurH'), blurV: compute('blurV'),
    velocity: compute('velocity'), transport: compute('transport'),
  };

  // Parity k reads A[k], B[k] and writes A[1-k], B[1-k].
  const simBG = [0, 1].map(k => device.createBindGroup({
    layout: simLayout,
    entries: [paramBuf, frameBuf, paperBuf, A[k], A[1 - k], B[k], B[1 - k], mbBuf, tmpBuf]
      .map((buffer, binding) => ({ binding, resource: { buffer } })),
  }));

  const F = GPUShaderStage.FRAGMENT;
  const renderLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: F, buffer: { type: 'uniform' } },
      { binding: 1, visibility: F, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: F, buffer: { type: 'read-only-storage' } },
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
    entries: [renderBuf, A[k], paperBuf].map((buffer, binding) => ({ binding, resource: { buffer } })),
  }));

  let parity = 0;

  // ---- uniforms
  const paramData = new Float32Array(simParamBufferSize() / 4);
  const frameData = new ArrayBuffer(48);
  const frameU32 = new Uint32Array(frameData), frameF32 = new Float32Array(frameData);
  const renderData = new ArrayBuffer(80);
  const renderU32 = new Uint32Array(renderData), renderF32 = new Float32Array(renderData);

  const pointerBrush = () => {
    const ptr = state.pointer;
    return ptr.down ? { x0: ptr.px, y0: ptr.py, x1: ptr.x, y1: ptr.y, pressure: ptr.pressure } : null;
  };

  function writeUniforms(substeps, brush = pointerBrush(), drying = state.drying) {
    SIM_PARAMS.forEach((p, i) => { paramData[i] = values[p.key]; });
    device.queue.writeBuffer(paramBuf, 0, paramData);

    frameU32[0] = W; frameU32[1] = H; frameU32[2] = state.mode; frameU32[3] = brush ? 1 : 0;
    if (brush) {
      frameF32[4] = brush.x0; frameF32[5] = brush.y0; frameF32[6] = brush.x1; frameF32[7] = brush.y1;
      frameF32[8] = brush.pressure ?? 1;
    }
    frameF32[9] = 1 / substeps;
    frameF32[10] = drying ? values.dryerStrength : 1;
    device.queue.writeBuffer(frameBuf, 0, frameData);

    const pig = PIGMENTS[state.pigment];
    renderU32[0] = W; renderU32[1] = H;
    renderF32[2] = values.thickness; renderF32[3] = values.wetDarken;
    renderF32.set([...pig.K, 0], 4);
    renderF32.set([...pig.S, 0], 8);
    renderF32.set([...PAPERS[state.paper].color, 1], 12);
    renderF32[16] = values.paperShade; renderF32[17] = values.suspendedWeight;
    device.queue.writeBuffer(renderBuf, 0, renderData);
  }

  // ---- frame loop
  const gx = Math.ceil(W / WG), gy = Math.ceil(H / WG);
  const fpsEl = document.getElementById('fps');
  let last = performance.now(), frames = 0;

  // The sim advances in real time, independent of display refresh rate.
  // Fractional steps carry over; a stalled tab doesn't cause a catch-up burst.
  const MAX_STEPS_PER_FRAME = 64;
  let stepDebt = 0, lastFrame = performance.now();

  function encodeSim(enc, substeps) {
    const pass = enc.beginComputePass();
    pass.setBindGroup(0, simBG[parity]);
    pass.setPipeline(pipes.blurH); pass.dispatchWorkgroups(gx, gy);
    pass.setPipeline(pipes.blurV); pass.dispatchWorkgroups(gx, gy);
    for (let s = 0; s < substeps; s++) {
      pass.setBindGroup(0, simBG[parity]);
      pass.setPipeline(pipes.velocity); pass.dispatchWorkgroups(gx, gy);
      pass.setPipeline(pipes.transport); pass.dispatchWorkgroups(gx, gy);
      parity ^= 1;
    }
    pass.end();
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
    if (!state.paused && !state.headless && substeps > 0) {
      encodeSim(enc, substeps);
      // Only consume the brush segment once the sim has actually stamped it.
      state.pointer.px = state.pointer.x; state.pointer.py = state.pointer.y;
    }
    const rp = enc.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] }],
    });
    rp.setPipeline(renderPipe);
    rp.setBindGroup(0, renderBG[parity]);
    rp.draw(3);
    rp.end();
    device.queue.submit([enc.finish()]);

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
  async function simFrames(nFrames, brushAt = () => null, drying = false) {
    const per = Math.max(1, Math.round(values.simSpeed / HZ));
    for (let f = 0; f < nFrames; f++) {
      writeUniforms(per, brushAt(f), drying);
      const enc = device.createCommandEncoder();
      encodeSim(enc, per);
      device.queue.submit([enc.finish()]);
      if (++pending >= 60) { await device.queue.onSubmittedWorkDone(); pending = 0; }
    }
    await device.queue.onSubmittedWorkDone(); pending = 0;
  }
  window.__sim.headless = {
    begin() { state.headless = true; },
    end() { state.headless = false; },
    // A stroke from (x0,y0) to (x1,y1) over `frames` simulated frames.
    paint(x0, y0, x1, y1, frames = 24) {
      const at = f => {
        const t0 = f / frames, t1 = (f + 1) / frames;
        return { x0: x0 + (x1 - x0) * t0, y0: y0 + (y1 - y0) * t0, x1: x0 + (x1 - x0) * t1, y1: y0 + (y1 - y0) * t1 };
      };
      return simFrames(frames, at);
    },
    wait(seconds, { dry = false } = {}) { return simFrames(Math.round(seconds * HZ), () => null, dry); },
    setMode(m) { state.mode = m; },
    setPaper(key) { const sel = document.getElementById('paperType'); sel.value = key; sel.dispatchEvent(new Event('change')); },
  };

  // Debug hook: paint a straight stroke from (x0,y0) to (x1,y1) in grid
  // coordinates over the given number of frames.
  window.__sim.stroke = (x0, y0, x1, y1, frames = 30) => new Promise(done => {
    const ptr = state.pointer;
    let f = 0;
    ptr.x = ptr.px = x0; ptr.y = ptr.py = y0; ptr.pressure = 1; ptr.down = true;
    const step = () => {
      f++;
      ptr.x = x0 + (x1 - x0) * f / frames; ptr.y = y0 + (y1 - y0) * f / frames;
      if (f < frames) requestAnimationFrame(step); else { ptr.down = false; done(); }
    };
    requestAnimationFrame(step);
  });
  window.__sim.clear = clear;

  bindPointer(canvas);
  buildUI({ clear, newPaper });
  requestAnimationFrame(frame);
}

function bindPointer(canvas) {
  const ptr = state.pointer;
  const toGrid = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
  };
  const pressureOf = e => (e.pointerType === 'pen' ? Math.max(e.pressure, 0.05) * 1.5 : 1);
  canvas.addEventListener('pointerdown', e => {
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    [ptr.x, ptr.y] = toGrid(e);
    ptr.px = ptr.x; ptr.py = ptr.y;
    ptr.pressure = pressureOf(e);
    ptr.down = true;
  });
  canvas.addEventListener('pointermove', e => {
    [ptr.x, ptr.y] = toGrid(e);
    ptr.pressure = pressureOf(e);
  });
  const up = () => { ptr.down = false; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
}

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
    const set = v => { if (Number.isFinite(v)) { values[p.key] = v; range.value = v; num.value = +v.toPrecision(4); } };
    range.addEventListener('input', () => set(parseFloat(range.value)));
    num.addEventListener('change', () => set(parseFloat(num.value)));
    inputs[p.key] = set;
    row.append(name, range, num);
    groups[p.group].appendChild(row);
  }

  const sel = document.getElementById('pigment');
  PIGMENTS.forEach((pg, i) => sel.add(new Option(pg.name, i)));
  sel.addEventListener('change', () => { state.pigment = +sel.value; });

  const modeBtns = [...document.querySelectorAll('[data-mode]')];
  const setMode = m => { state.mode = m; modeBtns.forEach(b => b.classList.toggle('on', +b.dataset.mode === m)); };
  modeBtns.forEach(b => b.addEventListener('click', () => setMode(+b.dataset.mode)));
  setMode(0);

  const dryBtn = document.getElementById('dry');
  const setDry = on => { state.drying = on; dryBtn.classList.toggle('on', on); };
  dryBtn.addEventListener('pointerdown', () => setDry(true));
  for (const ev of ['pointerup', 'pointerleave']) dryBtn.addEventListener(ev, () => setDry(false));

  const pauseBtn = document.getElementById('pause');
  const togglePause = () => { state.paused = !state.paused; pauseBtn.classList.toggle('on', state.paused); };
  pauseBtn.addEventListener('click', togglePause);

  document.getElementById('clear').addEventListener('click', clear);
  document.getElementById('paper').addEventListener('click', newPaper);
  // A paper preset sets its surface and its physics knobs together.
  const applyPaperKnobs = () => {
    for (const [k, v] of Object.entries(PAPERS[state.paper].knobs)) inputs[k](v);
  };
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
    if (e.key >= '1' && e.key <= '3') setMode(+e.key - 1);
    else if (e.key === 'd' && !e.repeat) setDry(true);
    else if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'c') clear();
  });
  window.addEventListener('keyup', e => { if (e.key === 'd') setDry(false); });
}

function fail(msg) {
  document.getElementById('error').textContent = msg;
  console.error(msg);
}

init().catch(e => fail(e.message));
