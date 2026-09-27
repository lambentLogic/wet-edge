import { paramStructWGSL } from './params.js';
import { TO_RGB } from './spectral.js';

// Cell state, ping-pong buffers:
//   A = (w, gSum, dSum, s)  surface water depth, total suspended pigment,
//                           total deposited pigment, paper saturation
//   G = suspended pigment: up to 4 components per cell, each a pigment id
//       (index into the pigment table) and an amount
//   B = (u, v, -, -)        staggered face velocities: u on the cell's right
//                           face, v on its bottom face (y points down)
// Plus D, deposited pigment: 4 components like G, plus a "stain" layer
// holding the Kubelka-Munk absorption and scattering totals of pigment that
// is fixed in the paper for good (no longer liftable). D is updated in
// place: only a cell's own thread touches it. A's totals are kept in sync
// for rendering, edge effects and probes.
//
// Components: a wet cell can carry up to 4 distinct pigments. When a fifth
// arrives, the smallest amount settles out of suspension into D; when D's 4
// components are full, the smallest is fixed into the stain layer. Colour is
// exact either way, since Kubelka-Munk absorption and scattering simply add.

export const MAX_PIGMENTS = 32;
export const MAX_CHARGES = 512;

export const simWGSL = (NTILES, MAXP = MAX_PIGMENTS, MAXQ = MAX_CHARGES, VARIANT = 0) => /* wgsl */ `
// Diagnostic transport variants for profiling (see docs/PERFORMANCE.md);
// 0 in normal use, where the others compile away. Chosen before load with
// window.__transportVariant (PRE_JS for tools/measure.mjs).
//   1: same reads and writes, no logic   2: no mixing/drift
//   3: no settling                      4: as 3, and no candidates from neighbours
const VARIANT: u32 = ${VARIANT}u;
${paramStructWGSL()}

struct Frame {
  W: u32, H: u32, mode: u32, brushOn: u32,
  bx0: f32, by0: f32, bx1: f32, by1: f32,
  pressure: f32, brushScale: f32, dryMul: f32, charge: f32,
  time: f32,          // simulated seconds, for deposit timestamps
  radius: f32,        // brush radius this frame (tapered by pressure)
  load: f32,          // brush reservoir, 1 = freshly loaded, 0 = empty
  concMul: f32,       // paint concentration relative to the recipe (brush's pigment : water)
  brushId: vec4u,     // the brush's load: up to 4 pigments ...
  brushFrac: vec4f,   // ... and their fractions of the load (sum 1)
  touch: f32,         // how lightly the brush skims (0 = full contact), from the CPU
  fixTooth: f32,      // how much a fixative spray fills the paper's tooth
  _t0: f32, _t1: f32,
  strokeStart: f32,   // sim time this stroke touched down
  substeps: f32,      // sim steps this frame (the brush's segment is split among them)
  _f2: f32, _f3: f32,
};

// Per-pigment physical properties, each relative to French ultramarine (1).
//   phys  = (density, staining, granulation, flocculation)
//   phys2 = (mobility, wick, load, magnetic)  load: pigment per brushful (gouache ~3);
//           magnetic: susceptibility (Mars black 1, negative = diamagnetic)
struct Pigment { K: vec4f, S: vec4f, phys: vec4f, phys2: vec4f };

@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<uniform> fr: Frame;
// aux = (paper height, blurred wet mask mb, blur scratch, time this cell's
//        current wetting began)
@group(0) @binding(2) var<storage, read_write> aux: array<vec4f>;
@group(0) @binding(3) var<storage, read> Ain: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> Aout: array<vec4f>;
@group(0) @binding(5) var<storage, read> Bin: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> Bout: array<vec4f>;
// A cell's suspended pigment: up to NG components (pigment id, amount).
// Eight, so a passage worked with many pigments keeps them all in the water
// (with four, a fifth pigment settled on arrival and diffusion kept feeding
// it in: dark veins where many pigments met).
const NG: i32 = 8;
struct Comp8 { id: array<u32, 8>, amt: array<f32, 8> };
// Stored form (40 bytes): the ids packed as bytes into two u32.
struct GP { ids: vec2u, amt: array<f32, 8> };
fn unpackG(g: GP) -> Comp8 {
  var o: Comp8;
  o.amt = g.amt;
  for (var k = 0; k < 8; k++) { o.id[k] = (g.ids[k / 4] >> (8u * u32(k % 4))) & 255u; }
  return o;
}
// A cell's deposited (settled) components, up to ND of them, plus the
// anonymous stain layer. stainK.w = stained amount; stamp = when each
// component last received pigment, so the renderer can stack washes in the
// order they dried (negative: bound, see stampMix). Eight components, so a
// passage worked with many pigments rarely runs out of room (with four,
// overflow went into the stain layer every step and built dark lines).
const ND: i32 = 8;
struct Dep { id: array<u32, 8>, amt: array<f32, 8>, stamp: array<f32, 8>, stainK: vec4f, stainS: vec4f };
// Stored form (112 bytes): the ids packed as bytes into two u32.
struct DS { stainK: vec4f, stainS: vec4f, ids: vec2u, amt: array<f32, 8>, stamp: array<f32, 8>, mask: f32 };
fn unpackD(d: DS) -> Dep {
  var o: Dep;
  o.stainK = d.stainK; o.stainS = d.stainS; o.amt = d.amt; o.stamp = d.stamp;
  for (var k = 0; k < 8; k++) { o.id[k] = (d.ids[k / 4] >> (8u * u32(k % 4))) & 255u; }
  return o;
}
fn packIds(d: Dep) -> vec2u {
  var w = vec2u(0u);
  for (var k = 0; k < 8; k++) { w[k / 4] |= (d.id[k] & 255u) << (8u * u32(k % 4)); }
  return w;
}
fn sumD(a: array<f32, 8>) -> f32 { var t = 0.0; for (var k = 0; k < 8; k++) { t += a[k]; } return t; }
@group(0) @binding(9) var<storage, read> Gin: array<GP>;
@group(0) @binding(10) var<storage, read_write> Gout: array<GP>;
fn packG(c: Comp8) -> GP {
  var w = vec2u(0u);
  for (var k = 0; k < 8; k++) { w[k / 4] |= (c.id[k] & 255u) << (8u * u32(k % 4)); }
  return GP(w, c.amt);
}
fn sumG(a: array<f32, 8>) -> f32 { var t = 0.0; for (var k = 0; k < 8; k++) { t += a[k]; } return t; }
@group(0) @binding(11) var<storage, read_write> D: array<DS>;
@group(0) @binding(12) var<uniform> pig: array<Pigment, ${MAXP}>;
// Magnets under the paper, as magnetic charges (the pole model): each magnet
// shape is built on the CPU from horizontal line-segment charges (a point
// charge is a zero-length segment), so discs, bars, horseshoes, rings, rods
// and striped sheets all share one field calculation and interact
// correctly. Each charge is two vec4s: (ax, ay, depth, q), (bx, by, -, -).
struct Magnets { count: u32, anyMagnet: u32, _b: u32, _c: u32, q: array<vec4f, ${MAXQ * 2}> };
@group(0) @binding(13) var<uniform> mag: Magnets;
// |B|^2 at the paper surface, recomputed only when magnets change.
@group(0) @binding(8) var<storage, read_write> magPhi: array<f32>;

struct Tiles {
  args: array<atomic<u32>, 4>,        // indirect dispatch (x, y, z) + pad
  brushAcc: array<atomic<u32>, 4>,    // water, pigment the brush laid down this frame (x1e4)
  state: array<u32, ${NTILES}>,       // frames left active
  list: array<u32, ${NTILES}>,        // active tiles this frame
};
@group(0) @binding(7) var<storage, read_write> tiles: Tiles;

fn W() -> i32 { return i32(fr.W); }
fn H() -> i32 { return i32(fr.H); }
fn ix(x: i32, y: i32) -> i32 { return y * W() + x; }
fn inb(x: i32, y: i32) -> bool { return x >= 0 && y >= 0 && x < W() && y < H(); }
fn finite(v: f32) -> f32 { return select(0.0, v, v == v && abs(v) < 1e30); }

// ---------------------------------------------------------------- active tiles
// The physics passes only run on 16x16-cell tiles that are wet, damp, under
// the brush, or next to such a tile (water can cross tile edges). Dry paint
// is left alone. A tile stays listed for TILE_HOLD frames after it goes
// quiet so both ping-pong copies of its state settle to the same values.
const TILE: i32 = 16;
const TILE_HOLD: u32 = 4u;
fn tilesX() -> i32 { return (W() + TILE - 1) / TILE; }
fn tilesY() -> i32 { return (H() + TILE - 1) / TILE; }

// Cell handled by this invocation of a tiled pass.
fn tileCell(wid: vec3u, lid: vec3u) -> vec2i {
  let t = i32(tiles.list[wid.x]);
  return vec2i((t % tilesX()) * TILE + i32(lid.x), (t / tilesX()) * TILE + i32(lid.y));
}

var<workgroup> tileHot: atomic<u32>;

// Counts substeps within a frame (tiles.brushAcc[2], reset each frame), so
// transport knows which slice of the brush's segment is this step's.
@compute @workgroup_size(1)
fn bumpStep() { atomicAdd(&tiles.brushAcc[2], 1u); }

// One workgroup per tile: is anything in it active this frame?
@compute @workgroup_size(16, 16)
fn markTiles(@builtin(global_invocation_id) gid: vec3u, @builtin(workgroup_id) wid: vec3u,
             @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { atomicStore(&tileHot, 0u); }
  workgroupBarrier();
  let x = i32(gid.x); let y = i32(gid.y);
  if (inb(x, y)) {
    let a = Ain[ix(x, y)];
    if (a.x > 0.0 || a.w > 0.0 || p.activeTiles < 0.5) { atomicStore(&tileHot, 1u); }
  }
  workgroupBarrier();
  if (li == 0u) {
    var hot = atomicLoad(&tileHot);
    if (fr.brushOn == 1u) {
      let r = fr.radius * 1.5 + 2.0;
      let lo = min(vec2f(fr.bx0, fr.by0), vec2f(fr.bx1, fr.by1)) - r;
      let hi = max(vec2f(fr.bx0, fr.by0), vec2f(fr.bx1, fr.by1)) + r;
      let t0 = vec2f(f32(i32(wid.x) * TILE), f32(i32(wid.y) * TILE));
      let t1 = t0 + f32(TILE);
      if (all(hi >= t0) && all(lo <= t1)) { hot = 1u; }
    }
    let t = i32(wid.y) * tilesX() + i32(wid.x);
    let prev = tiles.state[t];
    tiles.state[t] = select(select(prev - 1u, 0u, prev == 0u), TILE_HOLD, hot == 1u);
  }
}

// One thread per tile: list it if it or any neighbour tile is active.
@compute @workgroup_size(64)
fn compactTiles(@builtin(global_invocation_id) gid: vec3u) {
  let t = i32(gid.x);
  if (t >= tilesX() * tilesY()) { return; }
  let tx = t % tilesX(); let ty = t / tilesX();
  var on = false;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let nx = tx + dx; let ny = ty + dy;
      if (nx >= 0 && ny >= 0 && nx < tilesX() && ny < tilesY() && tiles.state[ny * tilesX() + nx] > 0u) { on = true; }
    }
  }
  if (on) { tiles.list[atomicAdd(&tiles.args[0], 1u)] = u32(t); }
}

// ---------------------------------------------------------------- wet mask blur
const BR: i32 = 8;

// ---------------------------------------------------------------- fixative
// Spraying workable fixative over the whole sheet: records when (aux.z;
// paint that dried before then is fixed), binds whatever has settled, and
// fills some of the paper's tooth (heights pulled toward the middle).
@compute @workgroup_size(16, 16)
fn fixSheet(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
  if (!inb(x, y)) { return; }
  let i = ix(x, y);
  aux[i].z = max(fr.time, 1e-3);
  aux[i].x = mix(aux[i].x, 0.5, clamp(fr.fixTooth, 0.0, 1.0));
  var st = D[i].stamp;
  for (var k = 0; k < ND; k++) { if (st[k] >= 0.0) { st[k] = -st[k] - 1.0; } }
  D[i].stamp = st;
}

// Peeling the masking fluid off the whole sheet. Where it covered dried
// paint, some comes away with it: the less staining the pigment, the more
// (Mars black, ultramarine; phthalos barely), less where it was fixed.
@compute @workgroup_size(16, 16)
fn unmaskSheet(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
  if (!inb(x, y)) { return; }
  let i = ix(x, y);
  if (D[i].mask <= 0.0) { return; }
  let fixT = aux[i].z;
  let d = unpackD(D[i]);
  var am = D[i].amt;
  for (var k = 0; k < ND; k++) {
    if (am[k] <= 0.0) { continue; }
    let om = stainOmega(d.id[k]);
    let fixed = select(1.0, p.fixLift, isFixed(d.stamp[k], fixT));
    am[k] *= 1.0 - clamp(p.maskTear * fixed / (om * om), 0.0, 0.9);
  }
  D[i].amt = am;
  D[i].mask = 0.0;
}

fn wetInd(i: i32) -> f32 { return select(0.0, 1.0, Ain[i].x > p.wEps); }

@compute @workgroup_size(16, 16)
fn blurH(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
  if (!inb(x, y)) { return; }
  var acc = 0.0;
  for (var k = -BR; k <= BR; k++) { acc += wetInd(ix(clamp(x + k, 0, W() - 1), y)); }
  Bout[ix(x, y)].z = acc / f32(2 * BR + 1);   // scratch (velocity leaves z unused)
}

@compute @workgroup_size(16, 16)
fn blurV(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
  if (!inb(x, y)) { return; }
  var acc = 0.0;
  for (var k = -BR; k <= BR; k++) { acc += Bout[ix(x, clamp(y + k, 0, H() - 1))].z; }
  aux[ix(x, y)].y = acc / f32(2 * BR + 1);
}

// ---------------------------------------------------------------- velocity
fn isWet(i: i32) -> bool { return Ain[i].x > p.wEps; }
// Surface water may only enter paper that is already wet or damp enough.
// Masking fluid closes a cell to water: washes flow around and over it.
fn isOpen(i: i32) -> bool { let a = Ain[i]; return (a.x > p.wEps || a.w > p.dampThreshold) && D[i].mask < 0.5; }

// Height of the free water surface above a common datum.
fn eta(i: i32) -> f32 { return Ain[i].x + p.paperRelief * aux[i].x; }

// Laplacian of the free surface over wet neighbours only; dry neighbours
// count as level with this cell, so the contact line itself adds no
// curvature (pinning handles the edge).
fn surfaceCurvature(i: i32) -> f32 {
  let x = i % W(); let y = i / W();
  let e = eta(i);
  var lap = 0.0;
  if (x > 0       && isWet(i - 1))   { lap += eta(i - 1) - e; }
  if (x < W() - 1 && isWet(i + 1))   { lap += eta(i + 1) - e; }
  if (y > 0       && isWet(i - W())) { lap += eta(i - W()) - e; }
  if (y < H() - 1 && isWet(i + W())) { lap += eta(i + W()) - e; }
  return lap;
}

fn pres(i: i32) -> f32 {
  let a = Ain[i];
  let wet = select(0.0, 1.0, a.x > p.wEps);
  // Hydrostatic pressure, plus surface tension (Laplace pressure from the
  // free surface's curvature: bumps push water away, dips draw it in, which
  // keeps a thin film smooth over the paper's tooth). Lowering pressure near
  // the wet edge draws water (and pigment) outward: edge darkening.
  // The explicit scheme's stability limit for surface tension tightens with
  // depth (capillary waves: omega^2 ~ sigma*h*k^4), so deep puddles get a
  // capped strength; thin films get the full value.
  let sigma = min(p.surfaceTension, 0.023 / (max(a.x, 0.01) * p.dt * p.dt));
  var tension = 0.0;
  if (sigma > 0.0 && wet > 0.0) { tension = sigma * surfaceCurvature(i); }
  // Capillary suction at thin film: pressure drops where the film thins,
  // like the curved meniscus at a wash's rim, so water flows from thick to
  // thin wet cells. A drying wash keeps feeding its edge instead of the wet
  // edge retreating in steps (which laid a band of deposits and a crisp
  // inner tide line). Only acts on wet cells.
  let suction = p.capSuction / (1.0 + a.x / max(p.suctionDepth, 1e-4)) * wet;
  return p.gravity * eta(i)
    - tension
    - suction
    - p.edgePull * (1.0 - aux[i].y) * wet;
}

// Thin films stick to the paper; deep puddles flow. Viscous drag in a film
// of depth h scales roughly as 1/h^2, referenced to dragDepth.
fn dragAt(i: i32, j: i32) -> f32 {
  let h = max(0.5 * (Ain[i].x + Ain[j].x), 0.002);
  let r = p.dragDepth / h;
  return p.drag * min(r * r, p.dragMaxBoost);
}

// Contact-line pinning: a wet edge only advances onto paper that isn't
// already wet when the pressure behind it exceeds a threshold (contact-angle
// hysteresis). Between two wet cells water flows freely.
fn pinned(i: i32, j: i32) -> bool {
  let wi = isWet(i); let wj = isWet(j);
  if (wi == wj) { return false; }
  let push = select(pres(j) - pres(i), pres(i) - pres(j), wi);
  return push < p.pinning;
}

// Gravity waves limit the explicit step: roughly g*h*dt^2 must stay below a
// constant. Deep puddles get their pressure push scaled down to stay stable;
// ordinary washes (h ~ 0.3) are well inside the limit and unaffected.
fn waveCap(i: i32, j: i32) -> f32 {
  let h = max(0.5 * (Ain[i].x + Ain[j].x), 1e-3);
  return min(1.0, 0.12 / (max(p.gravity, 1e-3) * h * p.dt * p.dt));
}

fn uAt(x: i32, y: i32) -> f32 { if (!inb(x, y)) { return 0.0; } return Bin[ix(x, y)].x; }
fn vAt(x: i32, y: i32) -> f32 { if (!inb(x, y)) { return 0.0; } return Bin[ix(x, y)].y; }

@compute @workgroup_size(16, 16)
fn velocity(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let c = tileCell(wid, lid);
  let x = c.x; let y = c.y;
  if (!inb(x, y)) { return; }
  let i = ix(x, y);
  let vmax = 0.24 / max(abs(p.dt), 1e-6);  // keeps upwind transport positive
  var u = 0.0;
  var v = 0.0;

  if (x < W() - 1) {
    let j = ix(x + 1, y);
    if ((isWet(i) || isWet(j)) && isOpen(i) && isOpen(j) && !pinned(i, j)) {
      let u0 = Bin[i].x;
      let lap = uAt(x - 1, y) + uAt(x + 1, y) + uAt(x, y - 1) + uAt(x, y + 1) - 4.0 * u0;
      let acc = -(pres(j) - pres(i)) * waveCap(i, j) + p.viscosity * lap + p.tiltX;
      u = (u0 + p.dt * acc) / (1.0 + p.dt * dragAt(i, j));
    }
  }
  if (y < H() - 1) {
    let j = ix(x, y + 1);
    if ((isWet(i) || isWet(j)) && isOpen(i) && isOpen(j) && !pinned(i, j)) {
      let v0 = Bin[i].y;
      let lap = vAt(x - 1, y) + vAt(x + 1, y) + vAt(x, y - 1) + vAt(x, y + 1) - 4.0 * v0;
      let acc = -(pres(j) - pres(i)) * waveCap(i, j) + p.viscosity * lap + p.tiltY;
      v = (v0 + p.dt * acc) / (1.0 + p.dt * dragAt(i, j));
    }
  }
  Bout[i] = vec4f(clamp(finite(u), -vmax, vmax), clamp(finite(v), -vmax, vmax), 0.0, 0.0);
}

// ---------------------------------------------------------------- transport + paper
fn sum4(v: vec4f) -> f32 { return v.x + v.y + v.z + v.w; }

// Amount of pigment id in a component list (0 if absent).
// How freely pigment can be carried into a cell: 1 normally, falling to 0
// as its suspended pigment gets as concentrated as a paste (jamLo..jamHi
// pigment per unit of water).
fn jam(a: vec4f) -> f32 {
  if (a.y <= 0.0) { return 1.0; }
  return 1.0 - smoothstep(p.jamLo, p.jamHi, a.y / max(a.x, 1e-4));
}

fn amtOf(c: Comp8, id: u32) -> f32 {
  var a = 0.0;
  for (var k = 0; k < NG; k++) { if (c.amt[k] > 0.0 && c.id[k] == id) { a += c.amt[k]; } }
  return a;
}

// Candidate list for this cell's suspended pigment: everything that ends up
// here this step (own pigment that stays, inflow from neighbours, brush),
// merged by id before NG of them are kept.
const MAXC: u32 = 16u;
var<private> cid: array<u32, 16>;
var<private> camt: array<f32, 16>;
var<private> cn: u32;
// Pigment fixed into the stain layer this step (KM totals and amount).
var<private> stK: vec3f;
var<private> stS: vec3f;
var<private> stA: f32;
var<private> stL: f32;   // liftability-weighted amount (sum a / staining^2)

fn stainOmega(id: u32) -> f32 { return max(p.staining * pig[id].phys.y, 1e-4); }

fn stainAdd(id: u32, a: f32) {
  if (!(a > 0.0)) { return; }
  let om = stainOmega(id);
  stK += pig[id].K.rgb * a; stS += pig[id].S.rgb * a; stA += a; stL += a / (om * om);
}

fn candIndex(id: u32) -> i32 {
  for (var k = 0u; k < cn; k++) { if (cid[k] == id) { return i32(k); } }
  return -1;
}

// Add (or with a negative amount, remove) pigment id.
fn addCand(id: u32, a: f32) {
  if (a == 0.0 || a != a) { return; }
  let k = candIndex(id);
  if (k >= 0) { camt[k] += a; return; }
  if (a < 0.0) { return; }
  if (cn < MAXC) { cid[cn] = id; camt[cn] = a; cn++; return; }
  stainAdd(id, a);   // seventeen or more pigments meeting in one cell: fix it
}

@compute @workgroup_size(16, 16)
fn transport(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let c = tileCell(wid, lid);
  let x = c.x; let y = c.y;
  if (!inb(x, y)) { return; }
  let i = ix(x, y);
  let a = Ain[i];
  let gi = unpackG(Gin[i]);
  cn = 0u; stK = vec3f(0.0); stS = vec3f(0.0); stA = 0.0; stL = 0.0;

  // Upwind finite-volume flux of water and suspended pigment together,
  // so each pigment rides the water at its local concentration.
  let uR = Bout[i].x;
  let vD = Bout[i].y;
  var uL = 0.0; var vU = 0.0;
  var aL = a; var aR = a; var aU = a; var aD = a;
  var gL = gi; var gR = gi; var gU = gi; var gD = gi;
  if (x > 0)       { let j = ix(x - 1, y); uL = Bout[j].x; aL = Ain[j]; gL = unpackG(Gin[j]); }
  if (x < W() - 1) { let j = ix(x + 1, y); aR = Ain[j]; gR = unpackG(Gin[j]); }
  if (y > 0)       { let j = ix(x, y - 1); vU = Bout[j].y; aU = Ain[j]; gU = unpackG(Gin[j]); }
  if (y < H() - 1) { let j = ix(x, y + 1); aD = Ain[j]; gD = unpackG(Gin[j]); }
  if (VARIANT == 1u) {
    // DIAGNOSTIC: same reads and writes, no logic.
    let dep0 = D[i]; let au = aux[i];
    let nb = (aL + aR + aU + aD) * 1e-9 + vec4f(uR + uL + vD + vU) * 1e-9 + vec4f(au.w * 1e-12);
    var ga = gi.amt;
    for (var k = 0; k < NG; k++) { ga[k] += (gL.amt[k] + gR.amt[k] + gU.amt[k] + gD.amt[k]) * 1e-9; }
    Gout[i] = packG(Comp8(gi.id, ga));
    var am = dep0.amt; am[0] += dep0.stainK.w * 1e-12;
    D[i].amt = am;
    D[i].stamp = dep0.stamp;
    Aout[i] = a + nb;
    return;
  }

  let fwR = uR * select(aR.x, a.x, uR > 0.0);
  let fwL = uL * select(a.x, aL.x, uL > 0.0);
  let fwD = vD * select(aD.x, a.x, vD > 0.0);
  let fwU = vU * select(a.x, aU.x, vU > 0.0);
  var w = a.x - p.dt * (fwR - fwL + fwD - fwU);

  // Own pigment keeps the fraction that doesn't flow out; neighbours' flows
  // in carry their components. Pigment can't be carried into a cell where
  // it's already a paste (jam): the water flows on and leaves its pigment
  // behind. Without this, flow toward a drying contact line piled pigment
  // into single cells at 20-70 times the wash around them (black contour
  // lines). Each face uses the receiving cell's jam, the same on both
  // sides, so pigment is conserved.
  let jI = jam(a); let jR = jam(aR); let jL = jam(aL); let jD = jam(aD); let jU = jam(aU);
  let keep = 1.0 - p.dt * (max(uR, 0.0) * jR + max(-uL, 0.0) * jL + max(vD, 0.0) * jD + max(-vU, 0.0) * jU);
  for (var k = 0; k < NG; k++) { if (gi.amt[k] > 0.0) { addCand(gi.id[k], gi.amt[k] * keep); } }
  if (VARIANT != 4u) { for (var k = 0; k < NG; k++) {
    if (uR < 0.0 && gR.amt[k] > 0.0) { addCand(gR.id[k], -p.dt * uR * gR.amt[k] * jI); }
    if (uL > 0.0 && gL.amt[k] > 0.0) { addCand(gL.id[k],  p.dt * uL * gL.amt[k] * jI); }
    if (vD < 0.0 && gD.amt[k] > 0.0) { addCand(gD.id[k], -p.dt * vD * gD.amt[k] * jI); }
    if (vU > 0.0 && gU.amt[k] > 0.0) { addCand(gU.id[k],  p.dt * vU * gU.amt[k] * jI); }
  } }

  if (VARIANT != 2u && (p.mixing > 0.5 || mag.anyMagnet > 0u)) { mixPigments(x, y, a, gi, aL, aR, aU, aD, gL, gR, gU, gD); }

  var s = a.w;

  // Brush: stamped along the segment the pointer travelled this frame. Its
  // load can hold up to 4 pigments (a palette mix).
  var liftK = 0.0;   // lifting agitation from the brush this step
  let maskV = D[i].mask;
  var maskNew = maskV;
  if (fr.brushOn == 1u) {
    let P = vec2f(f32(x) + 0.5, f32(y) + 0.5);
    // Each substep stamps only its own slice of the segment the brush moved
    // this frame, so a spot gets paint for as long as the brush is actually
    // over it (a fast stroke lays less), and consecutive frames' segments
    // meet without overlapping (whole-segment stamps on every substep
    // doubled up at the joints: beads along fast strokes).
    let nSub = max(fr.substeps, 1.0);
    let kSub = min(f32(atomicLoad(&tiles.brushAcc[2])) - 1.0, nSub - 1.0);
    let F0 = vec2f(fr.bx0, fr.by0);
    let FB = vec2f(fr.bx1, fr.by1) - F0;
    let A = F0 + FB * (max(kSub, 0.0) / nSub);
    let AB = FB / nSub;
    let t = clamp(dot(P - A, AB) / max(dot(AB, AB), 1e-6), 0.0, 1.0);
    let dist = length(P - (A + AB * t));
    let r = fr.radius;
    var cover = r - dist;
    var soft = r * p.brushSoftness;
    // A flat brush: a thin rectangle (its chisel edge flatThickness of its
    // width) held at flatAngle, swept along the path. Pulled broadside it
    // lays a wide band with square, straight ends; drawn along its edge, a
    // thin line. Sampled along this frame's segment, closely enough that
    // the thin edge leaves no gaps.
    if (p.brushShape > 0.5) {
      let th = max(r * p.flatThickness, 0.5);
      let ang = radians(p.flatAngle);
      let ea = vec2f(cos(ang), sin(ang));
      let en = vec2f(-ea.y, ea.x);
      let n = clamp(i32(ceil(length(AB) / (th * 0.25))), 1, 96);
      var best = -1e9;
      for (var k = 0; k <= n; k++) {
        let q = P - (A + AB * (f32(k) / f32(n)));
        let d = vec2f(abs(dot(q, ea)) - r, abs(dot(q, en)) - th);
        best = max(best, -(length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0)));
      }
      cover = best;
      soft = min(r, th * 2.0) * p.brushSoftness;
    }
    var fall = clamp(cover / max(soft, 1e-3), 0.0, 1.0);
    fall = fall * fall * (3.0 - 2.0 * fall);
    // Dry-brush is technique: a light, fast touch with a fairly dry brush
    // only kisses the peaks of the paper's tooth. It needs dry paper; on
    // damp or wet paper the surface pulls the paint in and contact is full.
    // fr.touch comes from the CPU: a light touch (pressure, or mouse speed)
    // and, on the side of the brush, a drying belly.
    let touch = fr.touch;
    let dryPaper = a.x <= p.wEps && a.w < p.dampThreshold;
    if (fr.mode != 2u && fr.mode != 4u && dryPaper && touch > 0.0) {
      let cut = p.skipAmount * touch;
      fall *= smoothstep(cut - 0.15, cut + 0.15, aux[i].x);
    }
    // fr.brushScale is this substep's share of the frame, scaled by the
    // dwell (see writeUniforms): every spot the brush crosses gets the same
    // dose at any speed, and lingering adds more.
    let amt = fall * fr.brushScale * fr.pressure;
    let wBefore = w;
    var gAdded = 0.0;
    // The brush tops the paper up toward its own water level and pigment
    // concentration rather than adding a fixed amount per frame. Written so
    // passes compose exactly (two half-doses = one full dose), so a fast
    // stroke's few big passes match a slow one's many small ones; for small
    // doses it's the same as brushRate * amt.
    // Pressure sets the width (taper) only, not how strong the paint is.
    let k = 1.0 - pow(max(1.0 - clamp(p.brushRate * fall, 0.0, 0.999), 1e-4), fr.brushScale);
    // Touching an already-wet surface, a freshly loaded brush also releases a
    // charge of extra water, which pushes outward: the wet-in-wet burst.
    // fr.charge decays after touchdown (the brush's reservoir is finite), so
    // dragging a stroke through its own wet trail doesn't keep flooding.
    // Charges from repeated touchdowns can't stack past the level edge
    // pinning holds, or overlapping passes flood the paper.
    let chargeRoom = max(p.pinning - max(w, p.brushWater), 0.0);
    // Wet-in-wet charge: only into paper that was already wet before this
    // stroke. Paper this stroke wetted a moment ago (a fast stroke's
    // previous frame) isn't a wash to charge into; charging it put beads of
    // extra paint at every joint of a fast stroke.
    let wetBefore = a.x > p.wEps && aux[i].w > 0.0 && aux[i].w < fr.strokeStart - 0.02;
    let charge = select(0.0, min(p.brushCharge * fr.charge * k, chargeRoom), wetBefore);
    // Water the brush can still lay down falls as its reservoir empties.
    let level = p.brushWater * mix(p.emptyLevel, 1.0, clamp(fr.load, 0.0, 1.0));
    if (fr.mode == 0u) {
      for (var b = 0; b < 4; b++) {
        let frac = fr.brushFrac[b];
        if (frac <= 0.0) { continue; }
        let id = fr.brushId[b];
        let ci = candIndex(id);
        let cur = select(0.0, camt[max(ci, 0)], ci >= 0);
        // Concentration follows the brush's pigment : water (computed on the
        // CPU): an emptying dip brush's paint thickens, a squeezed water
        // brush's paint thins.
        let conc = p.brushPigment * frac * max(pig[id].phys2.z, 0.0) * max(fr.concMul, 0.0);
        let c0 = select(0.0, cur / w, w > p.wEps);
        let next = max(cur, mix(cur, level * conc, k)) + charge * max(conc - c0, 0.0);
        addCand(id, next - cur);
        gAdded += max(next - cur, 0.0);
      }
      w = max(w, mix(w, level, k)) + charge;
    } else if (fr.mode == 1u) {
      w = max(w, mix(w, p.brushWater, k)) + charge;
    } else if (fr.mode == 4u) {
      // Mist: a spray bottle, not the brush. fr.radius is the spray's reach
      // (mistRadius); droplets are densest in the middle and thin out, and
      // the paper under them is dampened. Painters mist an area so strokes
      // laid into it melt together instead of each drying with its own edge.
      // Droplets are round beads about 0.4-1.2 mm across (real spray on
      // sized paper): each pass, some 8 x 8 blocks get one at a random point
      // and size. A cell checks its own and the neighbouring blocks, so beads
      // near a block's edge stay round (only its own block clipped them).
      let cone = exp(-3.0 * (dist / max(r, 1.0)) * (dist / max(r, 1.0)));
      let kM = cone * fr.brushScale;
      let seedS = u32(fr.time * 600.0) + 7u + u32(kSub) * 13u;
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          let bx = x / 8 + ox; let by = y / 8 + oy;
          if (hash2(bx, by, seedS) >= p.mistDensity * kM) { continue; }
          let c = vec2f(f32(bx * 8) + 8.0 * hash2(bx, by, seedS + 1u), f32(by * 8) + 8.0 * hash2(bx, by, seedS + 2u));
          let rad = 2.0 + 4.0 * pow(hash2(bx, by, seedS + 3u), 2.0);
          let dd = length(vec2f(f32(x) + 0.5, f32(y) + 0.5) - c);
          let bead = smoothstep(rad + 0.6, rad - 0.9, dd);   // soft rim
          if (bead > 0.0) { w = max(w, p.mistWater * bead * (0.7 + 0.6 * hash2(bx, by, seedS + 4u))); }
        }
      }
      s = min(s + p.mistDamp * kM, max(s, p.capacityMax));
    } else if (fr.mode == 5u) {
      // Masking fluid, on dry paper (or over dried paint): a rubbery film.
      // Its edge follows the paper's tooth a little, as liquid latex does.
      if (a.x <= p.wEps) { maskNew = max(maskNew, step(0.45 + 0.2 * (0.5 - aux[i].x), fall)); }
    } else {
      // Lifting works by time: scrubbing longer lifts more.
      let kl = clamp(p.liftStrength * fall * fr.pressure * 8.0 / nSub, 0.0, 1.0);
      w *= 1.0 - kl;
      for (var j = 0u; j < cn; j++) { camt[j] *= 1.0 - kl; }
      s *= 1.0 - kl;
      liftK = kl;
    }
    // Tally what the brush laid down, for its reservoir (read back on the CPU).
    let dw = max(w - wBefore, 0.0);
    if (dw > 1e-6) { atomicAdd(&tiles.brushAcc[0], u32(dw * 1e4 + 0.5)); }
    if (gAdded > 1e-6) { atomicAdd(&tiles.brushAcc[1], u32(gAdded * 1e4 + 0.5)); }
  }
  // Masked: paint and water laid on the film stay on the film (removed with
  // it), and none reaches the paper; neighbours' water can't flow in.
  if (maskNew != maskV) { D[i].mask = maskNew; }
  if (maskNew > 0.5) { w = 0.0; for (var j = 0u; j < cn; j++) { camt[j] = 0.0; } }

  // Wetting and drying. aux.w > 0: when this cell's current wetting began.
  // aux.w <= 0: the cell is dry, since -aux.w. Gum arabic sets gradually
  // while the paper stays dry: rewetted after d seconds, a fraction
  // smoothstep(0, bindTime, d) of what's deposited here has set (it rewets
  // slowly) and the rest dissolves freely. A rim that flickers dry for a
  // moment between dabs has barely set at all. (All-or-nothing setting made
  // a rigger line half melt and half hold under a water brush: it dries at
  // different moments along its length.)
  var wetStart = aux[i].w;
  // Dry means the paper itself has nearly dried out, not just lost its shine.
  let dryNow = a.x <= p.wEps && a.w < 0.25 * p.dampThreshold;
  var bindNow = false;
  var setFrac = 0.0;
  // (Paper wicking ahead of a wet front counts as wetting too.)
  if (dryNow && wetStart > 0.0) { wetStart = -fr.time; }
  if (!dryNow && wetStart <= 0.0) {
    setFrac = smoothstep(0.0, max(p.bindTime, 1e-3), fr.time + wetStart);
    bindNow = setFrac > 0.001;
    wetStart = max(fr.time, 1e-3);
  }
  if (wetStart != aux[i].w) { aux[i].w = wetStart; }

  var dep = unpackD(D[i]);
  let depIn = dep;

  // Keep NG candidates in suspension; the rest settle out. With more than
  // NG, rank each by all of it that's free here: suspended plus its unset
  // deposit. Ranked by suspended amount alone, a pigment arriving as the
  // fifth settled on arrival and could never be lifted again (the four
  // slots stayed taken), so neighbours kept feeding it in and it piled up
  // into dark lines. This way a growing pile wins a slot and lifts.
  var rank: array<f32, 16>;
  for (var j = 0u; j < cn; j++) {
    var r = camt[j];
    if (cn > u32(NG)) { for (var k = 0; k < ND; k++) { if (dep.id[k] == cid[j] && dep.amt[k] > 0.0 && dep.stamp[k] >= 0.0) { r += dep.amt[k]; } } }
    rank[j] = r;
  }
  var gId: array<u32, 8>; var gAmt: array<f32, 8>; var gOcc: array<bool, 8>;
  var taken: array<bool, 16>;
  for (var slot = 0; slot < NG; slot++) {
    var best = -1; var bestR = 0.0;
    for (var j = 0u; j < cn; j++) {
      if (!taken[j] && camt[j] > 0.0 && rank[j] > bestR) { best = i32(j); bestR = rank[j]; }
    }
    if (best < 0) { break; }
    taken[best] = true;
    gId[slot] = cid[best]; gAmt[slot] = camt[best]; gOcc[slot] = true;
  }

  var dOcc: array<bool, 8>;
  for (var k = 0; k < ND; k++) { dOcc[k] = dep.amt[k] > 0.0; }
  if (bindNow) {
    // The set fraction of each free deposit becomes bound, split off into
    // a spare component (if none is free, the whole deposit goes whichever
    // way most of it would). Then bound layers of the same pigment merge,
    // so the next wash has free components to settle into.
    for (var k = 0; k < ND; k++) {
      if (!dOcc[k] || dep.stamp[k] < 0.0) { continue; }
      let boundStamp = -dep.stamp[k] - 1.0;
      if (setFrac >= 0.999 || dep.amt[k] * (1.0 - setFrac) < 1e-5) { dep.stamp[k] = boundStamp; continue; }
      if (dep.amt[k] * setFrac < 1e-5) { continue; }
      var spare = -1;
      for (var m = 0; m < ND; m++) { if (!dOcc[m] && spare < 0) { spare = m; } }
      if (spare >= 0) {
        dOcc[spare] = true; dep.id[spare] = dep.id[k]; dep.stamp[spare] = boundStamp;
        dep.amt[spare] = dep.amt[k] * setFrac; dep.amt[k] *= 1.0 - setFrac;
      } else if (setFrac > 0.5) {
        dep.stamp[k] = boundStamp;
      }
    }
    for (var k = 0; k < ND; k++) {
      for (var m = k + 1; m < ND; m++) {
        if (dOcc[k] && dOcc[m] && dep.id[m] == dep.id[k] && dep.stamp[k] < 0.0 && dep.stamp[m] < 0.0) {
          let t = (stampTime(dep.stamp[k]) * dep.amt[k] + stampTime(dep.stamp[m]) * dep.amt[m]) / max(dep.amt[k] + dep.amt[m], 1e-12);
          dep.amt[k] += dep.amt[m]; dep.stamp[k] = -t - 1.0;
          dep.amt[m] = 0.0; dOcc[m] = false;
        }
      }
    }
  }

  // Lifting: the damp, scrubbing brush detaches settled pigment and the
  // brush takes it away, in proportion to how liftable each pigment is
  // (inverse staining): Mars black and ultramarine come up readily, phthalos
  // and quinacridones barely. Pigment fixed in the stain layer stays.
  let fixT = aux[i].z;
  if (liftK > 0.0) {
    for (var j = 0; j < ND; j++) {
      if (!dOcc[j]) { continue; }
      let omega = max(p.staining * pig[dep.id[j]].phys.y, 1e-4);
      let fixed = select(1.0, p.fixLift, isFixed(dep.stamp[j], fixT));
      dep.amt[j] *= 1.0 - clamp(liftK * p.liftDry * fixed / (omega * omega), 0.0, 1.0);
    }
    // The stain layer lifts by its average liftability (its colour mix is
    // kept; an approximation, since what's in it has lost its identity).
    if (dep.stainK.w > 0.0) {
      let fixedS = select(1.0, p.fixLift, fixT > 0.0);
      let f = 1.0 - clamp(liftK * p.liftDry * fixedS * dep.stainS.w / dep.stainK.w, 0.0, 1.0);
      dep.stainK *= f; dep.stainS *= f;
    }
  }
  for (var j = 0u; j < cn; j++) {
    if (!taken[j] && camt[j] > 0.0) { depositInto(&dep, &dOcc, cid[j], camt[j]); }
  }

  // Settled pigment fills the paper's valleys, so granulation fades as a
  // wash gets dense: pale washes speckle, masstone goes flat.
  let h = min(aux[i].x + (sumD(dep.amt) + dep.stainK.w) * p.valleyFill, 1.0);

  // Pigment adsorption / desorption (Curtis §4.5), per pigment. Valleys
  // (low h) catch more pigment when granulation is high. Unlike Curtis,
  // settling also scales with 1/depth: pigment in a deep pool mostly stays
  // suspended and drops out as the water thins, which concentrates it at
  // drying edges. Global knobs multiply each pigment's own properties.
  if (VARIANT != 3u && VARIANT != 4u && w > p.wEps) {
    // Deposited pigment can go back into suspension when there's room.
    for (var j = 0; j < ND; j++) {
      if (!dOcc[j]) { continue; }
      var found = false;
      for (var k = 0; k < NG; k++) { if (gOcc[k] && gId[k] == dep.id[j]) { found = true; } }
      if (!found) {
        for (var k = 0; k < NG; k++) {
          if (!gOcc[k]) { gOcc[k] = true; gId[k] = dep.id[j]; gAmt[k] = 0.0; found = true; break; }
        }
      }
    }
    let thin = p.settleDepth / (w + 0.01);
    for (var k = 0; k < NG; k++) {
      if (!gOcc[k]) { continue; }
      let id = gId[k];
      // Matching deposited component (allocate, or evict the most staining).
      let j = depSlot(&dep, &dOcc, id, true);
      let rho = p.density * pig[id].phys.x;
      let omega = max(p.staining * pig[id].phys.y, 1e-4);
      let gam = p.granulation * pig[id].phys.z;
      let down = min(max(gAmt[k] * (1.0 - h * gam), 0.0) * rho * thin * p.dt, gAmt[k]);
      if (j < 0) {
        // No room among the deposits and it's the most staining pigment
        // here: while the paper is wet, it just stays in suspension (it
        // goes into the stain layer only if it's still homeless when the
        // water dries). Settling it straight into the stain layer every step
        // made a sink it could never lift out of, piling up ten times the
        // pigment into flat dark patches.
        continue;
      }
      // Pigment that dried before this wetting began is bound by its gum
      // arabic and rewets slowly: only a fraction goes back into suspension.
      // Staining is the grip of the first layer on the paper fibres (up to
      // stainCapacity); pigment piled on top rewets like any paint, so even
      // a thick staining line reactivates under a wet brush.
      let liftFree = max(1.0 + (h - 1.0) * gam, 0.0) * rho * p.dt;
      let lift = liftFree / omega;
      let up = min(rewetUp(dep.amt[j], dep.stamp[j], fixT, lift, liftFree), dep.amt[j]);
      gAmt[k] += up - down;
      dep.stamp[j] = stampMix(dep.stamp[j], dep.amt[j], down);
      dep.amt[j] += down - up;
      // A bound layer of the same pigment underneath, kept apart from the
      // fresh deposit, rewets slowly too.
      for (var m = 0; m < ND; m++) {
        if (m != j && dOcc[m] && dep.id[m] == id && dep.stamp[m] < 0.0) {
          let upB = min(rewetUp(dep.amt[m], dep.stamp[m], fixT, lift, liftFree), dep.amt[m]);
          gAmt[k] += upB; dep.amt[m] -= upB;
        }
      }
    }
  }

  // Evaporation, faster where the wet area is thin (near its edge).
  let edge = 1.0 - aux[i].y;
  if (w > 0.0) { w -= p.evaporation * fr.dryMul * p.dt * (1.0 + p.edgeEvaporation * edge); }
  w = max(w, 0.0);

  // Paper drinks surface water up to its capacity (more in valleys).
  // Sizing slows the drinking and evens it out across the texture; unsized
  // paper absorbs fast and blotchily. Past 1, sized paper pushes water back up.
  let texture = mix(1.0 - aux[i].x, 0.5, clamp(p.sizing, 0.0, 1.0));
  let capI = mix(p.capacityMin, p.capacityMax, texture);
  // Fixative seals the paper: washes over it soak in (and wick) more slowly.
  let seal = select(1.0, 1.0 - clamp(p.fixSeal, 0.0, 1.0), fixT > 0.0);
  let drink = clamp(p.absorption * (1.0 - p.sizing) * seal * p.dt * max(capI - s, 0.0), -s, w);
  w -= drink;
  s += drink;

  // Capillary diffusion through the fibers, only where saturated enough to
  // wick. Sizing makes fibres water-repellent, so it slows sideways wicking
  // too: unsized washi feathers, sized cotton barely wicks past a wash. Too
  // much wicking out from under a wash's edge drew water (and pigment)
  // edgeward all through drying, leaving a dark frame and a crisp inner
  // tide line.
  let wickRate = p.capillarySpread * (1.0 - clamp(p.sizing, 0.0, 1.0)) * seal;
  var ds = 0.0;
  let sMin = p.capillaryMin;
  if (aL.w > sMin || a.w > sMin) { ds += aL.w - a.w; }
  if (aR.w > sMin || a.w > sMin) { ds += aR.w - a.w; }
  if (aU.w > sMin || a.w > sMin) { ds += aU.w - a.w; }
  if (aD.w > sMin || a.w > sMin) { ds += aD.w - a.w; }
  s += wickRate * p.dt * ds;
  // Paper only dries once no standing water covers it.
  if (w <= p.wEps) { s = max(s - p.paperEvaporation * fr.dryMul * p.dt, 0.0); }

  // Once the surface water is gone, whatever pigment it carried settles.
  if (w <= p.wEps) {
    for (var k = 0; k < NG; k++) {
      if (gOcc[k] && gAmt[k] > 0.0) { depositInto(&dep, &dOcc, gId[k], gAmt[k]); }
      gAmt[k] = 0.0; gOcc[k] = false;
    }
  }

  // Write back; empty components get amount 0.
  var gOut: Comp8;
  for (var k = 0; k < NG; k++) {
    let am = finite(select(0.0, gAmt[k], gOcc[k] && gAmt[k] > 1e-12));
    gOut.id[k] = gId[k]; gOut.amt[k] = am;
  }
  for (var k = 0; k < ND; k++) {
    // Components down to a trace free their slot (a near-empty one held
    // a slot and helped push other pigments out).
    dep.amt[k] = finite(select(0.0, dep.amt[k], dOcc[k] && dep.amt[k] > 1e-7));
  }
  dep.stainK += vec4f(stK, stA);
  dep.stainS += vec4f(stS, stL);
  Gout[i] = packG(gOut);
  // Write back only what changed (memory traffic is the bottleneck when
  // much of the sheet is wet; amounts change every step, the rest rarely).
  var chA = false; var chS = false; var chI = false;
  for (var k = 0; k < ND; k++) {
    chA = chA || dep.amt[k] != depIn.amt[k];
    chS = chS || dep.stamp[k] != depIn.stamp[k];
    chI = chI || dep.id[k] != depIn.id[k];
  }
  if (chA) { D[i].amt = dep.amt; }
  if (chS) { D[i].stamp = dep.stamp; }
  if (chI) { D[i].ids = packIds(dep); }
  if (any(dep.stainK != depIn.stainK) || any(dep.stainS != depIn.stainS)) { D[i].stainK = dep.stainK; D[i].stainS = dep.stainS; }
  Aout[i] = vec4f(finite(w), sumG(gOut.amt), sumD(dep.amt) + dep.stainK.w, finite(s));
}

// A deposited component's timestamp is the amount-weighted mean time its
// pigment settled, so a little old paint lifting and resettling under a new
// wash doesn't drag the whole old layer up into it. Its sign says whether
// the component is bound (dried and gum-set): bound stamps are stored as
// -time - 1. Fresh pigment settling onto a bound layer of the same pigment
// joins it bound, rather than unbinding the old paint.
fn stampMix(stamp: f32, amt: f32, added: f32) -> f32 {
  if (added <= 0.0) { return stamp; }
  let t = (stampTime(stamp) * max(amt, 0.0) + fr.time * added) / (max(amt, 0.0) + added);
  return select(t, -t - 1.0, stamp < 0.0);
}

fn stampTime(stamp: f32) -> f32 { return select(stamp, -stamp - 1.0, stamp < 0.0); }

// How much of a deposited component goes back into suspension this step:
// the part within the fibres' stain capacity lifts at the pigment's own
// (staining-limited) rate, the part piled above it as freely as any paint;
// both slowed if the gum has set (rewetLift for the fibre layer, thickRewet
// for the pile) and slowed further under fixative.
fn rewetUp(amt: f32, stamp: f32, fixT: f32, lift: f32, liftFree: f32) -> f32 {
  let cap = max(p.stainCapacity, 0.0);
  let low = min(amt, cap);
  let high = max(amt - cap, 0.0);
  if (stamp >= 0.0) { return low * lift + high * liftFree; }
  let fx = select(1.0, p.fixRewet, isFixed(stamp, fixT));
  return (low * lift * p.rewetLift + high * liftFree * p.thickRewet) * fx;
}

// Is a deposited component under fixative (bound, and dried before the
// cell was last fixed at time fixT; 0 = never fixed)?
fn isFixed(stamp: f32, fixT: f32) -> bool { return fixT > 0.0 && stamp < 0.0 && stampTime(stamp) < fixT; }

// Put pigment into a cell's deposited components: same pigment, else an
// empty component, else the permanent stain layer.
fn depositInto(dep: ptr<function, Dep>, occ: ptr<function, array<bool, 8>>, id: u32, a: f32) {
  if (!(a > 0.0)) { return; }
  let j = depSlot(dep, occ, id, false);
  if (j < 0) { stainDep(dep, id, a); return; }
  (*dep).stamp[j] = stampMix((*dep).stamp[j], (*dep).amt[j], a);
  (*dep).amt[j] += a;
}

// Fix pigment into the permanent stain layer (KM totals, amount, and a
// liftability-weighted amount so scrubbing can still bring some up).
fn stainDep(dep: ptr<function, Dep>, id: u32, a: f32) {
  if (!(a > 0.0)) { return; }
  let om = stainOmega(id);
  (*dep).stainK += vec4f(pig[id].K.rgb * a, a);
  (*dep).stainS += vec4f(pig[id].S.rgb * a, a / (om * om));
}

// The deposited component for fresh pigment id: the matching unbound one,
// else an empty one (so fresh paint settling over a bound layer of the same
// pigment stays free while this wetting lasts), else room made by merging a
// pigment's set and unset twins, else by reclaiming a slot that holds only
// a trace (into the stain layer), else by pushing the most staining pigment
// present into the stain layer if it's more staining than the newcomer
// (non-staining pigments like Mars black keep their identity and stay
// liftable). Otherwise returns -1: while the paper is wet (wet = true) the
// caller leaves the pigment in suspension; when drying down it's stained.
// Only when drying may a pigment join its own bound layer: while wet,
// joining a bound layer (or staining the newcomer) was a one-way sink,
// piling pigment into dark lines and patches wherever the slots
// happened to be full.
fn depSlot(dep: ptr<function, Dep>, occ: ptr<function, array<bool, 8>>, id: u32, wet: bool) -> i32 {
  for (var m = 0; m < ND; m++) { if ((*occ)[m] && (*dep).id[m] == id && (*dep).stamp[m] >= 0.0) { return m; } }
  for (var m = 0; m < ND; m++) {
    if (!(*occ)[m]) { (*occ)[m] = true; (*dep).id[m] = id; (*dep).amt[m] = 0.0; (*dep).stamp[m] = fr.time; return m; }
  }
  // Full. Merge a pigment's set and unset parts (they're one pigment; the
  // merged part keeps the state of the larger).
  for (var m = 0; m < ND; m++) {
    for (var n = m + 1; n < ND; n++) {
      if ((*dep).id[m] == (*dep).id[n]) {
        let am = (*dep).amt[m]; let an = (*dep).amt[n];
        let t = (stampTime((*dep).stamp[m]) * am + stampTime((*dep).stamp[n]) * an) / max(am + an, 1e-12);
        let bound = select((*dep).stamp[n] < 0.0, (*dep).stamp[m] < 0.0, am >= an);
        (*dep).amt[m] = am + an; (*dep).stamp[m] = select(t, -t - 1.0, bound);
        if ((*dep).id[m] == id && !bound) { (*dep).amt[n] = 0.0; (*occ)[n] = false; return m; }
        (*dep).id[n] = id; (*dep).amt[n] = 0.0; (*dep).stamp[n] = fr.time;
        return n;
      }
    }
  }
  // Reclaim a slot that holds only a trace of an old layer (not one just
  // started this wetting, which would be stolen back and forth).
  var s = -1;
  for (var m = 0; m < ND; m++) {
    let old = (*dep).stamp[m] < 0.0 || stampTime((*dep).stamp[m]) < fr.time - 1.0;
    if (old && (*dep).id[m] != id && (*dep).amt[m] < 1e-3 && (s < 0 || (*dep).amt[m] < (*dep).amt[s])) { s = m; }
  }
  if (s >= 0) {
    stainDep(dep, (*dep).id[s], (*dep).amt[s]);
    (*dep).id[s] = id; (*dep).amt[s] = 0.0; (*dep).stamp[s] = fr.time;
    return s;
  }
  // When dry: join its own bound layer. (While wet that's a sink: skip.)
  if (!wet) { for (var m = 0; m < ND; m++) { if ((*occ)[m] && (*dep).id[m] == id) { return m; } } }
  // Push the most staining pigment present into the stain layer, once, to
  // make room for a less staining newcomer.
  var e = 0;
  for (var m = 1; m < ND; m++) { if (stainOmega((*dep).id[m]) > stainOmega((*dep).id[e])) { e = m; } }
  if (stainOmega((*dep).id[e]) <= stainOmega(id)) { return -1; }
  stainDep(dep, (*dep).id[e], (*dep).amt[e]);
  (*dep).id[e] = id; (*dep).amt[e] = 0.0; (*dep).stamp[e] = fr.time;
  return e;
}

// ---------------------------------------------------------------- magnets
// |B|^2 at the paper surface from all magnetic charges: B = sum q r / |r|^3.
// The force on a small magnetic particle goes as its susceptibility times
// grad |B|^2, which drives the drift in mixPigments. Charges are normalised
// on the CPU so a disc magnet gives 1 directly above it.
@compute @workgroup_size(16, 16)
fn magField(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
  if (!inb(x, y)) { return; }
  var B = vec3f(0.0);
  let P = vec3f(f32(x) + 0.5, f32(y) + 0.5, 0.0);
  for (var k = 0u; k < min(mag.count, ${MAXQ}u); k++) {
    let c0 = mag.q[2u * k];
    let c1 = mag.q[2u * k + 1u];
    let A = vec3f(c0.x, c0.y, -c0.z);
    let E = vec3f(c1.x, c1.y, -c0.z);
    let L = length(E - A);
    if (L < 1e-3) {
      let r = P - A;
      let R2 = dot(r, r);
      B += c0.w * r / (R2 * sqrt(R2));
    } else {
      // Uniform line charge q/L along A->E: exact field at P.
      let u = (E - A) / L;
      let sP = dot(P - A, u);
      let perp = (P - A) - sP * u;
      let rho = max(length(perp), 1e-3);
      let t1 = -sP; let t2 = L - sP;
      let r1 = sqrt(t1 * t1 + rho * rho); let r2 = sqrt(t2 * t2 + rho * rho);
      let lam = c0.w / L;
      B += lam * ((perp / rho) * (t2 / r2 - t1 / r1) / rho + u * (1.0 / r2 - 1.0 / r1));
    }
  }
  magPhi[ix(x, y)] = dot(B, B);
}

// ---------------------------------------------------------------- flocculation
// Flocculating pigments (ultramarine above all) clump in suspension: their
// particles attract and gather into flocs. On the grid this is a drift of
// each flocculating pigment up a smooth random clumping field at mm scale,
// so while the paint stays wet it gathers into mottles. Flocs form from
// whatever particles meet, so mixed flocculating pigments clump together
// (ultramarine and a red earth into grey flocs, not blue and orange
// specks): the field is mostly shared between pigments (flocTogether),
// with a little of each pigment's own. A non-flocculating pigment in the
// mix still stays smooth while ultramarine mottles. Re-rolled per wetting,
// bucketed by wetting time so a whole wash shares one field.
fn hash2(x: i32, y: i32, seed: u32) -> f32 {
  var h = bitcast<u32>(x) * 374761393u + bitcast<u32>(y) * 668265263u + seed * 2246822519u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h = h ^ (h >> 16u);
  return f32(h & 0xffffffu) / 16777216.0;
}

fn valueNoise(x: f32, y: f32, seed: u32) -> f32 {
  let ix0 = i32(floor(x)); let iy0 = i32(floor(y));
  var fx = x - floor(x); var fy = y - floor(y);
  fx = fx * fx * (3.0 - 2.0 * fx); fy = fy * fy * (3.0 - 2.0 * fy);
  let a = hash2(ix0, iy0, seed);     let b = hash2(ix0 + 1, iy0, seed);
  let c = hash2(ix0, iy0 + 1, seed); let d = hash2(ix0 + 1, iy0 + 1, seed);
  return mix(mix(a, b, fx), mix(c, d, fx), fy);
}

// Clumping field for pigment id at cell (x, y), in [0, 1].
fn flocNoise(fx: f32, fy: f32, seed: u32) -> f32 {
  return 0.65 * valueNoise(fx, fy, seed) + 0.35 * valueNoise(fx * 2.3 + 11.0, fy * 2.3 + 5.0, seed + 1u);
}
// The two parts of the field: each pigment's own, and the joint one all
// pigments share. flocField = mix(own, joint, flocTogether). mixPigments
// evaluates them once per cell and face and reuses them (noise is the
// costliest part of the step).
fn flocOwn(x: i32, y: i32, id: u32, bucket: u32) -> f32 {
  let sc = max(p.flocScale / 0.2, 1.0);   // mm -> cells
  return flocNoise(f32(x) / sc, f32(y) / sc, id * 7919u + bucket * 104729u + 17u);
}
fn flocJoint(x: i32, y: i32, bucket: u32) -> f32 {
  let sc = max(p.flocScale / 0.2, 1.0);
  return flocNoise(f32(x) / sc, f32(y) / sc, bucket * 104729u + 5003u);
}

// ---------------------------------------------------------------- pigment mixing
// Pigment also moves between touching wet cells without net water flow:
//  - diffusion down each pigment's concentration gradient, and
//  - the Marangoni surface current: paint (binder, wetting agents) has lower
//    surface tension than clean water, so the surface layer carrying it
//    slides outward. The rate scales with the total paint concentration (a
//    stand-in for binder), so a fresh charge bursts outward with a defined
//    front and slows as it dilutes. Negative values pull paint into clumps.
// Each pigment's rate is scaled by its mobility: fine organic particles
// travel further than heavy mineral ones.
// Mixing is suppressed near a wet edge (mb falls off there), so it can't undo
// the outward flow that builds edge darkening. Each exchange uses the smaller
// of the two cells' weights and a rate symmetric in the two cells, so it
// conserves pigment. Capped at the explicit-scheme stability limit.
// This cell's own clumping field per pigment, cached across its four faces
// (reset per cell in mixPigments).
var<private> ownId: array<u32, 4>;
var<private> ownB: array<u32, 4>;
var<private> ownV: array<f32, 4>;
var<private> ownN: u32;
fn ownHere(x: i32, y: i32, id: u32, bucket: u32) -> f32 {
  for (var k = 0u; k < ownN; k++) { if (ownId[k] == id && ownB[k] == bucket) { return ownV[k]; } }
  let v = flocOwn(x, y, id, bucket);
  if (ownN < 4u) { ownId[ownN] = id; ownB[ownN] = bucket; ownV[ownN] = v; ownN++; }
  return v;
}

fn mixPigments(x: i32, y: i32, a: vec4f, gi: Comp8,
       aL: vec4f, aR: vec4f, aU: vec4f, aD: vec4f, gL: Comp8, gR: Comp8, gU: Comp8, gD: Comp8) {
  if (a.x <= p.wEps) { return; }
  ownN = 0u;
  let i = ix(x, y);
  let cT = a.y / a.x;
  let wi = smoothstep(p.mixEdgeLo, p.mixEdgeHi, aux[i].y);
  let mixOn = p.mixing > 0.5;
  let magOn = mag.anyMagnet > 0u;
  // Mixing and drift (flocculation + magnetism) share the explicit-scheme
  // stability budget (4 neighbours), half each, so together they can't
  // overdraw a cell.
  let cap = 0.12 / max(p.dt, 1e-6);
  for (var k = 0; k < 4; k++) {
    var nx = x; var ny = y; var n = a; var gn = gi;
    if (k == 0) { nx = x - 1; n = aL; gn = gL; } else if (k == 1) { nx = x + 1; n = aR; gn = gR; }
    else if (k == 2) { ny = y - 1; n = aU; gn = gU; } else { ny = y + 1; n = aD; gn = gD; }
    if (!inb(nx, ny) || n.x <= p.wEps) { continue; }
    let j = ix(nx, ny);
    let face = select(0.0, min(wi, smoothstep(p.mixEdgeLo, p.mixEdgeHi, aux[j].y)), mixOn);
    let wmin = min(a.x, n.x);
    if (face > 0.0) {
      // The Marangoni term acts most where paint meets much cleaner water
      // (high contrast), less across the gentle gradients inside one body
      // of paint.
      let cnT = n.y / n.x;
      let hi = max(cT, cnT);
      let contrast = (hi - min(cT, cnT)) / (hi + 1e-4);
      let base = p.pigmentDiffusion + p.marangoni * hi * pow(contrast, p.marangoniContrast);
      // Pigments present in the neighbour (and possibly here too).
      for (var m = 0; m < NG; m++) {
        if (gn.amt[m] <= 0.0) { continue; }
        let id = gn.id[m];
        let rate = min(base * pig[id].phys2.x, cap);
        addCand(id, p.dt * face * rate * wmin * (gn.amt[m] / n.x - amtOf(gi, id) / a.x));
      }
      // Pigments present here but not in the neighbour.
      for (var m = 0; m < NG; m++) {
        if (gi.amt[m] <= 0.0 || amtOf(gn, gi.id[m]) > 0.0) { continue; }
        let id = gi.id[m];
        let rate = min(base * pig[id].phys2.x, cap);
        addCand(id, -p.dt * face * rate * wmin * gi.amt[m] / a.x);
      }
    }
    if (face <= 0.0 && !magOn) { continue; }
    // Drift: flocculation (up each pigment's clumping field, interior only)
    // plus magnetism (up the gradient of |B|^2, scaled by susceptibility,
    // right up to the wet edge). Upwind in concentration. Both cells compute
    // the same flux, so it conserves pigment.
    let bucket = u32(max(floor(max(aux[i].w, aux[j].w) / 10.0), 0.0));
    let dPhi = magPhi[i] - magPhi[j];   // |B|^2, from magField
    // Joint clumping field at both ends of this face, shared by all
    // pigments; computed only if some pigment here flocculates.
    let together = clamp(p.flocTogether, 0.0, 1.0);
    var jointHere = 0.0; var jointThere = 0.0; var haveJoint = false;
    for (var m = 0; m < 2 * NG; m++) {
      var id = 0u; var here = 0.0; var there = 0.0;
      if (m < NG) {
        if (gi.amt[m] <= 0.0) { continue; }
        id = gi.id[m]; here = gi.amt[m]; there = amtOf(gn, id);
      } else {
        if (gn.amt[m - NG] <= 0.0 || amtOf(gi, gn.id[m - NG]) > 0.0) { continue; }
        id = gn.id[m - NG]; here = 0.0; there = gn.amt[m - NG];
      }
      var v = 0.0;   // drift velocity from the neighbour into this cell
      let chiF = p.flocculation * pig[id].phys.w * p.flocDrift;
      if (face > 0.0 && chiF > 0.0) {
        if (!haveJoint) { jointHere = flocJoint(x, y, bucket); jointThere = flocJoint(nx, ny, bucket); haveJoint = true; }
        let fHere = mix(ownHere(x, y, id, bucket), jointHere, together);
        let fThere = mix(flocOwn(nx, ny, id, bucket), jointThere, together);
        v += face * chiF * (fHere - fThere);
      }
      if (magOn) { v += p.magnetism * pig[id].phys2.w * dPhi; }
      if (v == 0.0) { continue; }
      let cUp = select(here / a.x, there / n.x, v > 0.0);
      addCand(id, p.dt * clamp(v, -cap, cap) * wmin * cUp);
    }
  }
}
`;

const chunks = row => [0, 1, 2, 3].map(j => `vec4f(${row.slice(4 * j, 4 * j + 4).map(v => v.toFixed(7)).join(', ')})`).join(', ');

export const renderWGSL = (MAXP = MAX_PIGMENTS) => /* wgsl */ `
struct R {
  W: u32, H: u32, thickness: f32, wetDarken: f32,
  paperColor: vec4f,
  paperShade: f32, suspendedWeight: f32, fixDeepen: f32, spectral: f32,
  dampDarken: f32, _r1: f32, _r2: f32, _r3: f32,
};
struct Pigment { K: vec4f, S: vec4f, phys: vec4f, phys2: vec4f };
// A cell's suspended pigment: up to NG components (pigment id, amount).
// Eight, so a passage worked with many pigments keeps them all in the water
// (with four, a fifth pigment settled on arrival and diffusion kept feeding
// it in: dark veins where many pigments met).
const NG: i32 = 8;
struct Comp8 { id: array<u32, 8>, amt: array<f32, 8> };
// Stored form (40 bytes, see the sim): the ids packed as bytes into two u32.
struct GP { ids: vec2u, amt: array<f32, 8> };
fn unpackG(g: GP) -> Comp8 {
  var o: Comp8;
  o.amt = g.amt;
  for (var k = 0; k < 8; k++) { o.id[k] = (g.ids[k / 4] >> (8u * u32(k % 4))) & 255u; }
  return o;
}
// A cell's deposited (settled) components, up to ND of them, plus the
// anonymous stain layer. stainK.w = stained amount; stamp = when each
// component last received pigment, so the renderer can stack washes in the
// order they dried (negative: bound, see stampMix). Eight components, so a
// passage worked with many pigments rarely runs out of room (with four,
// overflow went into the stain layer every step and built dark lines).
const ND: i32 = 8;
struct Dep { id: array<u32, 8>, amt: array<f32, 8>, stamp: array<f32, 8>, stainK: vec4f, stainS: vec4f };
// Stored form (112 bytes, see the sim): the ids packed as bytes into two u32.
struct DS { stainK: vec4f, stainS: vec4f, ids: vec2u, amt: array<f32, 8>, stamp: array<f32, 8>, mask: f32 };
fn unpackD(d: DS) -> Dep {
  var o: Dep;
  o.stainK = d.stainK; o.stainS = d.stainS; o.amt = d.amt; o.stamp = d.stamp;
  for (var k = 0; k < 8; k++) { o.id[k] = (d.ids[k / 4] >> (8u * u32(k % 4))) & 255u; }
  return o;
}
@group(0) @binding(0) var<uniform> r: R;
@group(0) @binding(1) var<storage, read> A: array<vec4f>;
@group(0) @binding(2) var<storage, read> aux: array<vec4f>;
@group(0) @binding(3) var<storage, read> G: array<GP>;
@group(0) @binding(4) var<storage, read> D: array<DS>;
@group(0) @binding(5) var<uniform> pig: array<Pigment, ${MAXP}>;
// Spectral table, in vec4 chunks of 4 bands (16 bands, 400-700 nm):
// pigment k's K at [k*8 .. k*8+3], S at [k*8+4 .. k*8+7]; then the ground
// spectrum (4 chunks), then the stain K map and stain S map (3 x 4 chunks
// each: RGB channel c's band weights).
@group(0) @binding(6) var<storage, read> spec: array<vec4f>;
const SPEC_BASE: u32 = ${MAXP * 8}u;
// Reflectance spectrum to linear sRGB (CIE 1931 2-degree, D65).
const TO_R = array<vec4f, 4>(${chunks(TO_RGB[0])});
const TO_G = array<vec4f, 4>(${chunks(TO_RGB[1])});
const TO_B = array<vec4f, 4>(${chunks(TO_RGB[2])});

const LAYER_GAP: f32 = 2.0;

// Composite a Kubelka-Munk layer (absorption Kx and scattering Sx already
// multiplied by thickness) over a ground of reflectance Rg.
fn overLayer(Rg: vec3f, Kx: vec3f, Sx: vec3f, amount: f32) -> vec3f {
  if (amount <= 1e-6) { return Rg; }
  let Sx1 = max(Sx, vec3f(1e-5));
  let aa = 1.0 + Kx / Sx1;
  // b -> 0 for a non-absorbing layer; keep it off zero so c stays finite.
  let b = max(sqrt(aa * aa - 1.0), vec3f(1e-4));
  let bsx = min(b * Sx1, vec3f(20.0));
  let sh = sinh(bsx);
  let c = aa * sh + b * cosh(bsx);
  let Rl = sh / c;
  let T = b / c;
  return Rl + T * T * Rg / (1.0 - Rl * Rg);
}

fn overLayer4(Rg: vec4f, Kx: vec4f, Sx: vec4f, amount: f32) -> vec4f {
  if (amount <= 1e-6) { return Rg; }
  let Sx1 = max(Sx, vec4f(1e-5));
  let aa = 1.0 + Kx / Sx1;
  let b = max(sqrt(aa * aa - 1.0), vec4f(1e-4));
  let bsx = min(b * Sx1, vec4f(20.0));
  let sh = sinh(bsx);
  let c = aa * sh + b * cosh(bsx);
  let Rl = sh / c;
  let T = b / c;
  return Rl + T * T * Rg / (1.0 - Rl * Rg);
}

// Masking fluid: a translucent pale-yellow rubber film over the paint.
fn maskOver(col: vec3f, i: u32) -> vec3f {
  let m = D[i].mask;
  return mix(col, vec3f(0.95, 0.9, 0.62), 0.45 * clamp(m, 0.0, 1.0));
}

fn srgbEncode(v: vec3f) -> vec3f {
  let c = clamp(v, vec3f(0.0), vec3f(1.0));
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, 12.92 * c, c <= vec3f(0.0031308));
}

// The same layering as fs, per wavelength band: the ground spectrum, the
// stain layer, deposited washes oldest first, then wet pigment; then to
// colour. Pigments mix like paint (each absorbs its own part of the
// spectrum) rather than per RGB channel.
fn spectralColour(i: u32, wet: f32, h: f32) -> vec4f {
  let g = unpackG(G[i]);
  let dep = unpackD(D[i]);
  let fixT = aux[i].z;
  let deepK = 1.0 + 0.5 * r.fixDeepen;
  let deepS = 1.0 - r.fixDeepen;
  var R: array<vec4f, 4>;
  for (var j = 0u; j < 4u; j++) { R[j] = spec[SPEC_BASE + j] * (1.0 - r.paperShade * (1.0 - h)); }

  if (dep.stainK.w > 0.0) {
    let fk = select(1.0, deepK, fixT > 0.0);
    let fs = select(1.0, deepS, fixT > 0.0);
    for (var j = 0u; j < 4u; j++) {
      var Ks = vec4f(0.0); var Ss = vec4f(0.0);
      for (var c = 0u; c < 3u; c++) {
        Ks += spec[SPEC_BASE + 4u + c * 4u + j] * dep.stainK[c];
        Ss += spec[SPEC_BASE + 16u + c * 4u + j] * dep.stainS[c];
      }
      R[j] = overLayer4(R[j], max(Ks, vec4f(0.0)) * r.thickness * fk, max(Ss, vec4f(0.0)) * r.thickness * fs, dep.stainK.w);
    }
  }

  var st: array<f32, 8>;
  for (var k = 0; k < ND; k++) { st[k] = select(dep.stamp[k], -dep.stamp[k] - 1.0, dep.stamp[k] < 0.0); }
  var done: array<bool, 8>;
  for (var n = 0; n < ND; n++) {
    var first = -1;
    for (var k = 0; k < ND; k++) {
      if (!done[k] && dep.amt[k] > 0.0 && (first < 0 || st[k] < st[first])) { first = k; }
    }
    if (first < 0) { break; }
    var Kx: array<vec4f, 4>; var Sx: array<vec4f, 4>; var total = 0.0;
    for (var k = 0; k < ND; k++) {
      if (!done[k] && dep.amt[k] > 0.0 && st[k] - st[first] <= LAYER_GAP) {
        done[k] = true;
        let fx = fixT > 0.0 && dep.stamp[k] < 0.0 && st[k] < fixT;
        let ad = dep.amt[k] * r.thickness;
        let pk = dep.id[k] * 8u;
        for (var j = 0u; j < 4u; j++) {
          Kx[j] += spec[pk + j] * ad * select(1.0, deepK, fx);
          Sx[j] += spec[pk + 4u + j] * ad * select(1.0, deepS, fx);
        }
        total += dep.amt[k];
      }
    }
    for (var j = 0u; j < 4u; j++) { R[j] = overLayer4(R[j], Kx[j], Sx[j], total); }
  }

  var Kw: array<vec4f, 4>; var Sw: array<vec4f, 4>; var tw = 0.0;
  for (var k = 0; k < NG; k++) {
    let ag = max(g.amt[k], 0.0) * r.suspendedWeight;
    if (ag > 0.0) {
      let pk = g.id[k] * 8u;
      for (var j = 0u; j < 4u; j++) { Kw[j] += spec[pk + j] * ag * r.thickness; Sw[j] += spec[pk + 4u + j] * ag * r.thickness; }
      tw += ag;
    }
  }
  var lin = vec3f(0.0);
  let darken = (1.0 - clamp(wet * r.wetDarken, 0.0, 0.3)) * (1.0 - clamp(A[i].w * r.dampDarken, 0.0, 0.15));
  for (var j = 0u; j < 4u; j++) {
    let Rj = overLayer4(R[j], Kw[j], Sw[j], tw) * darken;
    lin += vec3f(dot(TO_R[j], Rj), dot(TO_G[j], Rj), dot(TO_B[j], Rj));
  }
  return vec4f(srgbEncode(lin), 1.0);
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let pos = array(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(pos[vi], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let x = min(u32(fc.x), r.W - 1u);
  let y = min(u32(fc.y), r.H - 1u);
  let i = y * r.W + x;
  let a = A[i];
  let h = aux[i].x;
  if (r.spectral > 0.5) { let sc = spectralColour(i, a.x, h); return vec4f(maskOver(sc.rgb, i), 1.0); }

  let Rg = r.paperColor.rgb * (1.0 - r.paperShade * (1.0 - h));

  // Kubelka-Munk layers, composited bottom-up over the paper: the stain
  // layer (oldest), then deposited pigment grouped into washes by when it
  // settled (pigment settling within LAYER_GAP seconds counts as one wash
  // and mixes), then the wet suspended pigment on top. So gouache over dry
  // paint covers it, while gouache mixed into wet paint makes a tint.
  let g = unpackG(G[i]);
  let dep = unpackD(D[i]);
  var col = Rg;
  // Fixative soaks into dried paint and cuts the scattering at its surface
  // (what makes watercolour dry lighter): fixed layers look deeper.
  let fixT = aux[i].z;
  let deepK = 1.0 + 0.5 * r.fixDeepen;
  let deepS = 1.0 - r.fixDeepen;
  let stainFix = select(1.0, 0.0, fixT > 0.0);
  col = overLayer(col, dep.stainK.rgb * r.thickness * mix(deepK, 1.0, stainFix), dep.stainS.rgb * r.thickness * mix(deepS, 1.0, stainFix), dep.stainK.w);

  // Deposited components, oldest first (a stamp's sign marks bound paint;
  // the time is its magnitude, see stampTime in the sim).
  var st: array<f32, 8>;
  for (var k = 0; k < ND; k++) { st[k] = select(dep.stamp[k], -dep.stamp[k] - 1.0, dep.stamp[k] < 0.0); }
  var done: array<bool, 8>;
  for (var n = 0; n < ND; n++) {
    var first = -1;
    for (var k = 0; k < ND; k++) {
      if (!done[k] && dep.amt[k] > 0.0 && (first < 0 || st[k] < st[first])) { first = k; }
    }
    if (first < 0) { break; }
    var Kx = vec3f(0.0); var Sx = vec3f(0.0); var total = 0.0;
    for (var k = 0; k < ND; k++) {
      if (!done[k] && dep.amt[k] > 0.0 && st[k] - st[first] <= LAYER_GAP) {
        done[k] = true;
        let ad = dep.amt[k] * r.thickness;
        let fx = fixT > 0.0 && dep.stamp[k] < 0.0 && st[k] < fixT;
        Kx += pig[dep.id[k]].K.rgb * ad * select(1.0, deepK, fx); Sx += pig[dep.id[k]].S.rgb * ad * select(1.0, deepS, fx); total += dep.amt[k];
      }
    }
    col = overLayer(col, Kx, Sx, total);
  }

  // Wet pigment on top.
  var Kw = vec3f(0.0); var Sw = vec3f(0.0); var tw = 0.0;
  for (var k = 0; k < NG; k++) {
    let ag = max(g.amt[k], 0.0) * r.suspendedWeight;
    if (ag > 0.0) { Kw += pig[g.id[k]].K.rgb * ag * r.thickness; Sw += pig[g.id[k]].S.rgb * ag * r.thickness; tw += ag; }
  }
  col = overLayer(col, Kw, Sw, tw);

  col *= 1.0 - clamp(a.x * r.wetDarken, 0.0, 0.3);
  // Damp paper (water soaked into it) looks a little darker, until it dries.
  col *= 1.0 - clamp(a.w * r.dampDarken, 0.0, 0.15);
  return vec4f(maskOver(clamp(col, vec3f(0.0), vec3f(1.0)), i), 1.0);
}
`;
