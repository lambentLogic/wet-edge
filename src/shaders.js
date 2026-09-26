import { paramStructWGSL } from './params.js';

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

export const simWGSL = (NTILES, MAXP = MAX_PIGMENTS) => /* wgsl */ `
${paramStructWGSL()}

struct Frame {
  W: u32, H: u32, mode: u32, brushOn: u32,
  bx0: f32, by0: f32, bx1: f32, by1: f32,
  pressure: f32, brushScale: f32, dryMul: f32, charge: f32,
  time: f32,          // simulated seconds, for deposit timestamps
  _b: u32, _c: u32, _d: u32,
  brushId: vec4u,     // the brush's load: up to 4 pigments ...
  brushFrac: vec4f,   // ... and their fractions of the load (sum 1)
};

// Per-pigment physical properties, each relative to French ultramarine (1).
//   phys  = (density, staining, granulation, flocculation)
//   phys2 = (mobility, wick, -, -)
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
struct Comp4 { id: vec4u, amt: vec4f };
// stainK.w = stained amount; stamp = when each component last received
// pigment, so the renderer can stack washes in the order they dried.
struct Dep { id: vec4u, amt: vec4f, stainK: vec4f, stainS: vec4f, stamp: vec4f };
@group(0) @binding(9) var<storage, read> Gin: array<Comp4>;
@group(0) @binding(10) var<storage, read_write> Gout: array<Comp4>;
@group(0) @binding(11) var<storage, read_write> D: array<Dep>;
@group(0) @binding(12) var<uniform> pig: array<Pigment, ${MAXP}>;
struct Tiles {
  args: array<atomic<u32>, 4>,        // indirect dispatch (x, y, z) + pad
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
      let r = p.brushRadius * 1.5 + 2.0;
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

fn wetInd(i: i32) -> f32 { return select(0.0, 1.0, Ain[i].x > p.wEps); }

@compute @workgroup_size(16, 16)
fn blurH(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
  if (!inb(x, y)) { return; }
  var acc = 0.0;
  for (var k = -BR; k <= BR; k++) { acc += wetInd(ix(clamp(x + k, 0, W() - 1), y)); }
  aux[ix(x, y)].z = acc / f32(2 * BR + 1);
}

@compute @workgroup_size(16, 16)
fn blurV(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
  if (!inb(x, y)) { return; }
  var acc = 0.0;
  for (var k = -BR; k <= BR; k++) { acc += aux[ix(x, clamp(y + k, 0, H() - 1))].z; }
  aux[ix(x, y)].y = acc / f32(2 * BR + 1);
}

// ---------------------------------------------------------------- velocity
fn isWet(i: i32) -> bool { return Ain[i].x > p.wEps; }
// Surface water may only enter paper that is already wet or damp enough.
fn isOpen(i: i32) -> bool { let a = Ain[i]; return a.x > p.wEps || a.w > p.dampThreshold; }

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
fn amtOf(c: Comp4, id: u32) -> f32 {
  var a = 0.0;
  for (var k = 0; k < 4; k++) { if (c.amt[k] > 0.0 && c.id[k] == id) { a += c.amt[k]; } }
  return a;
}

// Candidate list for this cell's suspended pigment: everything that ends up
// here this step (own pigment that stays, inflow from neighbours, brush),
// merged by id before the 4 largest are kept.
const MAXC: u32 = 8u;
var<private> cid: array<u32, 8>;
var<private> camt: array<f32, 8>;
var<private> cn: u32;
// Pigment fixed into the stain layer this step (KM totals and amount).
var<private> stK: vec3f;
var<private> stS: vec3f;
var<private> stA: f32;

fn stainAdd(id: u32, a: f32) {
  if (!(a > 0.0)) { return; }
  stK += pig[id].K.rgb * a; stS += pig[id].S.rgb * a; stA += a;
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
  stainAdd(id, a);   // nine or more pigments meeting in one cell: fix it
}

@compute @workgroup_size(16, 16)
fn transport(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let c = tileCell(wid, lid);
  let x = c.x; let y = c.y;
  if (!inb(x, y)) { return; }
  let i = ix(x, y);
  let a = Ain[i];
  let gi = Gin[i];
  cn = 0u; stK = vec3f(0.0); stS = vec3f(0.0); stA = 0.0;

  // Upwind finite-volume flux of water and suspended pigment together,
  // so each pigment rides the water at its local concentration.
  let uR = Bout[i].x;
  let vD = Bout[i].y;
  var uL = 0.0; var vU = 0.0;
  var aL = a; var aR = a; var aU = a; var aD = a;
  var gL = gi; var gR = gi; var gU = gi; var gD = gi;
  if (x > 0)       { let j = ix(x - 1, y); uL = Bout[j].x; aL = Ain[j]; gL = Gin[j]; }
  if (x < W() - 1) { let j = ix(x + 1, y); aR = Ain[j]; gR = Gin[j]; }
  if (y > 0)       { let j = ix(x, y - 1); vU = Bout[j].y; aU = Ain[j]; gU = Gin[j]; }
  if (y < H() - 1) { let j = ix(x, y + 1); aD = Ain[j]; gD = Gin[j]; }

  let fwR = uR * select(aR.x, a.x, uR > 0.0);
  let fwL = uL * select(a.x, aL.x, uL > 0.0);
  let fwD = vD * select(aD.x, a.x, vD > 0.0);
  let fwU = vU * select(a.x, aU.x, vU > 0.0);
  var w = a.x - p.dt * (fwR - fwL + fwD - fwU);

  // Own pigment keeps the fraction that doesn't flow out; neighbours' flows
  // in carry their components.
  let keep = 1.0 - p.dt * (max(uR, 0.0) + max(-uL, 0.0) + max(vD, 0.0) + max(-vU, 0.0));
  for (var k = 0; k < 4; k++) { if (gi.amt[k] > 0.0) { addCand(gi.id[k], gi.amt[k] * keep); } }
  for (var k = 0; k < 4; k++) {
    if (uR < 0.0 && gR.amt[k] > 0.0) { addCand(gR.id[k], -p.dt * uR * gR.amt[k]); }
    if (uL > 0.0 && gL.amt[k] > 0.0) { addCand(gL.id[k],  p.dt * uL * gL.amt[k]); }
    if (vD < 0.0 && gD.amt[k] > 0.0) { addCand(gD.id[k], -p.dt * vD * gD.amt[k]); }
    if (vU > 0.0 && gU.amt[k] > 0.0) { addCand(gU.id[k],  p.dt * vU * gU.amt[k]); }
  }

  if (p.mixing > 0.5) { mixPigments(x, y, a, gi, aL, aR, aU, aD, gL, gR, gU, gD); }

  var s = a.w;

  // Brush: stamped along the segment the pointer travelled this frame. Its
  // load can hold up to 4 pigments (a palette mix).
  if (fr.brushOn == 1u) {
    let P = vec2f(f32(x) + 0.5, f32(y) + 0.5);
    let A = vec2f(fr.bx0, fr.by0);
    let AB = vec2f(fr.bx1, fr.by1) - A;
    let t = clamp(dot(P - A, AB) / max(dot(AB, AB), 1e-6), 0.0, 1.0);
    let dist = length(P - (A + AB * t));
    let r = p.brushRadius;
    var fall = clamp((r - dist) / max(r * p.brushSoftness, 1e-3), 0.0, 1.0);
    fall = fall * fall * (3.0 - 2.0 * fall);
    let amt = fall * fr.brushScale * fr.pressure;
    // The brush tops the paper up toward its own water level and
    // pigment concentration rather than adding a fixed amount per frame.
    let k = clamp(p.brushRate * amt, 0.0, 1.0);
    // Touching an already-wet surface, a freshly loaded brush also releases a
    // charge of extra water, which pushes outward: the wet-in-wet burst.
    // fr.charge decays after touchdown (the brush's reservoir is finite), so
    // dragging a stroke through its own wet trail doesn't keep flooding.
    let charge = select(0.0, p.brushCharge * fr.charge * k, a.x > p.wEps);
    if (fr.mode == 0u) {
      for (var b = 0; b < 4; b++) {
        let frac = fr.brushFrac[b];
        if (frac <= 0.0) { continue; }
        let id = fr.brushId[b];
        let ci = candIndex(id);
        let cur = select(0.0, camt[max(ci, 0)], ci >= 0);
        let conc = p.brushPigment * frac;
        let c0 = select(0.0, cur / w, w > p.wEps);
        let next = max(cur, mix(cur, p.brushWater * conc, k)) + charge * max(conc - c0, 0.0);
        addCand(id, next - cur);
      }
      w = max(w, mix(w, p.brushWater, k)) + charge;
    } else if (fr.mode == 1u) {
      w = max(w, mix(w, p.brushWater, k)) + charge;
    } else {
      let kl = clamp(p.liftStrength * amt * 8.0, 0.0, 1.0);
      w *= 1.0 - kl;
      for (var j = 0u; j < cn; j++) { camt[j] *= 1.0 - kl; }
      s *= 1.0 - kl;
    }
  }

  // When this cell's current wetting began: pigment deposited before then
  // has dried and is bound.
  var wetStart = aux[i].w;
  if (a.x <= p.wEps && w > p.wEps) { wetStart = fr.time; aux[i].w = wetStart; }

  // Keep the 4 largest candidates in suspension; the rest settle out.
  var gId = vec4u(0u); var gAmt = vec4f(0.0); var gOcc = vec4<bool>(false);
  var taken: array<bool, 8>;
  for (var slot = 0; slot < 4; slot++) {
    var best = -1; var bestA = 0.0;
    for (var j = 0u; j < cn; j++) {
      if (!taken[j] && camt[j] > bestA) { best = i32(j); bestA = camt[j]; }
    }
    if (best < 0) { break; }
    taken[best] = true;
    gId[slot] = cid[best]; gAmt[slot] = bestA; gOcc[slot] = true;
  }

  var dep = D[i];
  var dOcc = vec4<bool>(dep.amt.x > 0.0, dep.amt.y > 0.0, dep.amt.z > 0.0, dep.amt.w > 0.0);
  for (var j = 0u; j < cn; j++) {
    if (!taken[j] && camt[j] > 0.0) { depositInto(&dep, &dOcc, cid[j], camt[j]); }
  }

  // Settled pigment fills the paper's valleys, so granulation fades as a
  // wash gets dense: pale washes speckle, masstone goes flat.
  let h = min(aux[i].x + (sum4(dep.amt) + dep.stainK.w) * p.valleyFill, 1.0);

  // Pigment adsorption / desorption (Curtis §4.5), per pigment. Valleys
  // (low h) catch more pigment when granulation is high. Unlike Curtis,
  // settling also scales with 1/depth: pigment in a deep pool mostly stays
  // suspended and drops out as the water thins, which concentrates it at
  // drying edges. Global knobs multiply each pigment's own properties.
  if (w > p.wEps) {
    // Deposited pigment can go back into suspension when there's room.
    for (var j = 0; j < 4; j++) {
      if (!dOcc[j]) { continue; }
      var found = false;
      for (var k = 0; k < 4; k++) { if (gOcc[k] && gId[k] == dep.id[j]) { found = true; } }
      if (!found) {
        for (var k = 0; k < 4; k++) {
          if (!gOcc[k]) { gOcc[k] = true; gId[k] = dep.id[j]; gAmt[k] = 0.0; found = true; break; }
        }
      }
    }
    let thin = p.settleDepth / (w + 0.01);
    for (var k = 0; k < 4; k++) {
      if (!gOcc[k]) { continue; }
      let id = gId[k];
      // Matching deposited component (allocate one if there's room).
      var j = -1;
      for (var m = 0; m < 4; m++) { if (dOcc[m] && dep.id[m] == id) { j = m; } }
      if (j < 0) {
        for (var m = 0; m < 4; m++) { if (!dOcc[m]) { j = m; dOcc[m] = true; dep.id[m] = id; dep.amt[m] = 0.0; dep.stamp[m] = fr.time; break; } }
      }
      let rho = p.density * pig[id].phys.x;
      let omega = max(p.staining * pig[id].phys.y, 1e-4);
      let gam = p.granulation * pig[id].phys.z;
      let down = min(max(gAmt[k] * (1.0 - h * gam), 0.0) * rho * thin * p.dt, gAmt[k]);
      if (j < 0) {
        // Nowhere to put it as a liftable deposit: it stains.
        gAmt[k] -= down; stainAdd(id, down);
        continue;
      }
      // Pigment that dried before this wetting began is bound by its gum
      // arabic and rewets slowly: only a fraction goes back into suspension.
      let bound = select(1.0, p.rewetLift, dep.stamp[j] < wetStart);
      let up = min(max(dep.amt[j] * (1.0 + (h - 1.0) * gam), 0.0) * rho / omega * bound * p.dt, dep.amt[j]);
      gAmt[k] += up - down;
      dep.stamp[j] = stampMix(dep.stamp[j], dep.amt[j], down);
      dep.amt[j] += down - up;
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
  let drink = clamp(p.absorption * (1.0 - p.sizing) * p.dt * max(capI - s, 0.0), -s, w);
  w -= drink;
  s += drink;

  // Capillary diffusion through the fibers, only where saturated enough to
  // wick. Sizing makes fibres water-repellent, so it slows sideways wicking
  // too: unsized washi feathers, sized cotton barely wicks past a wash. Too
  // much wicking out from under a wash's edge drew water (and pigment)
  // edgeward all through drying, leaving a dark frame and a crisp inner
  // tide line.
  let wickRate = p.capillarySpread * (1.0 - clamp(p.sizing, 0.0, 1.0));
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
    for (var k = 0; k < 4; k++) {
      if (gOcc[k] && gAmt[k] > 0.0) { depositInto(&dep, &dOcc, gId[k], gAmt[k]); }
      gAmt[k] = 0.0; gOcc[k] = false;
    }
  }

  // Write back; empty components get amount 0.
  var gOut: Comp4;
  for (var k = 0; k < 4; k++) {
    let am = finite(select(0.0, gAmt[k], gOcc[k] && gAmt[k] > 1e-12));
    gOut.id[k] = gId[k]; gOut.amt[k] = am;
  }
  for (var k = 0; k < 4; k++) {
    dep.amt[k] = finite(select(0.0, dep.amt[k], dOcc[k] && dep.amt[k] > 1e-12));
  }
  dep.stainK += vec4f(stK, stA);
  dep.stainS += vec4f(stS, 0.0);
  Gout[i] = gOut;
  D[i] = dep;
  Aout[i] = vec4f(finite(w), sum4(gOut.amt), sum4(dep.amt) + dep.stainK.w, finite(s));
}

// A deposited component's timestamp is the amount-weighted mean time its
// pigment settled, so a little old paint lifting and resettling under a new
// wash doesn't drag the whole old layer up into it.
fn stampMix(stamp: f32, amt: f32, added: f32) -> f32 {
  if (added <= 0.0) { return stamp; }
  return (stamp * max(amt, 0.0) + fr.time * added) / (max(amt, 0.0) + added);
}

// Put pigment into a cell's deposited components: same pigment, else an
// empty component, else the permanent stain layer.
fn depositInto(dep: ptr<function, Dep>, occ: ptr<function, vec4<bool>>, id: u32, a: f32) {
  if (!(a > 0.0)) { return; }
  for (var m = 0; m < 4; m++) { if ((*occ)[m] && (*dep).id[m] == id) { (*dep).stamp[m] = stampMix((*dep).stamp[m], (*dep).amt[m], a); (*dep).amt[m] += a; return; } }
  for (var m = 0; m < 4; m++) {
    if (!(*occ)[m]) { (*occ)[m] = true; (*dep).id[m] = id; (*dep).amt[m] = a; (*dep).stamp[m] = fr.time; return; }
  }
  (*dep).stainK += vec4f(pig[id].K.rgb * a, a);
  (*dep).stainS += vec4f(pig[id].S.rgb * a, 0.0);
}

// ---------------------------------------------------------------- flocculation
// Flocculating pigments (ultramarine above all) clump in suspension: their
// particles attract and gather into flocs. On the grid this is a drift of
// each flocculating pigment up a smooth random clumping field at mm scale,
// so while the paint stays wet it gathers into mottles. The field differs
// per pigment (in a mix, ultramarine mottles on its own pattern while a
// non-flocculating pigment stays smooth) and is re-rolled per wetting,
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
fn flocField(x: i32, y: i32, id: u32, bucket: u32) -> f32 {
  let seed = id * 7919u + bucket * 104729u + 17u;
  let sc = max(p.flocScale / 0.2, 1.0);   // mm -> cells
  let fx = f32(x) / sc; let fy = f32(y) / sc;
  return 0.65 * valueNoise(fx, fy, seed) + 0.35 * valueNoise(fx * 2.3 + 11.0, fy * 2.3 + 5.0, seed + 1u);
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
fn mixPigments(x: i32, y: i32, a: vec4f, gi: Comp4,
       aL: vec4f, aR: vec4f, aU: vec4f, aD: vec4f, gL: Comp4, gR: Comp4, gU: Comp4, gD: Comp4) {
  if (a.x <= p.wEps) { return; }
  let i = ix(x, y);
  let cT = a.y / a.x;
  let wi = smoothstep(p.mixEdgeLo, p.mixEdgeHi, aux[i].y);
  // Mixing and flocculation drift share the explicit-scheme stability budget
  // (4 neighbours), half each, so together they can't overdraw a cell.
  let cap = 0.12 / max(p.dt, 1e-6);
  for (var k = 0; k < 4; k++) {
    var nx = x; var ny = y; var n = a; var gn = gi;
    if (k == 0) { nx = x - 1; n = aL; gn = gL; } else if (k == 1) { nx = x + 1; n = aR; gn = gR; }
    else if (k == 2) { ny = y - 1; n = aU; gn = gU; } else { ny = y + 1; n = aD; gn = gD; }
    if (!inb(nx, ny) || n.x <= p.wEps) { continue; }
    let face = min(wi, smoothstep(p.mixEdgeLo, p.mixEdgeHi, aux[ix(nx, ny)].y));
    if (face <= 0.0) { continue; }
    // The Marangoni term acts most where paint meets much cleaner water
    // (high contrast), less across the gentle gradients inside one body of
    // paint.
    let cnT = n.y / n.x;
    let hi = max(cT, cnT);
    let contrast = (hi - min(cT, cnT)) / (hi + 1e-4);
    let base = p.pigmentDiffusion + p.marangoni * hi * pow(contrast, p.marangoniContrast);
    let wmin = min(a.x, n.x);
    // Pigments present in the neighbour (and possibly here too).
    for (var m = 0; m < 4; m++) {
      if (gn.amt[m] <= 0.0) { continue; }
      let id = gn.id[m];
      let rate = min(base * pig[id].phys2.x, cap);
      addCand(id, p.dt * face * rate * wmin * (gn.amt[m] / n.x - amtOf(gi, id) / a.x));
    }
    // Pigments present here but not in the neighbour.
    for (var m = 0; m < 4; m++) {
      if (gi.amt[m] <= 0.0 || amtOf(gn, gi.id[m]) > 0.0) { continue; }
      let id = gi.id[m];
      let rate = min(base * pig[id].phys2.x, cap);
      addCand(id, -p.dt * face * rate * wmin * gi.amt[m] / a.x);
    }
    // Flocculation drift up each pigment's clumping field, upwind in
    // concentration. Both cells compute the same flux (same bucket, same
    // field values), so it conserves pigment.
    let bucket = u32(max(floor(max(aux[i].w, aux[ix(nx, ny)].w) / 10.0), 0.0));
    for (var m = 0; m < 8; m++) {
      var id = 0u; var here = 0.0; var there = 0.0;
      if (m < 4) {
        if (gi.amt[m] <= 0.0) { continue; }
        id = gi.id[m]; here = gi.amt[m]; there = amtOf(gn, id);
      } else {
        if (gn.amt[m - 4] <= 0.0 || amtOf(gi, gn.id[m - 4]) > 0.0) { continue; }
        id = gn.id[m - 4]; here = 0.0; there = gn.amt[m - 4];
      }
      let chi = p.flocculation * pig[id].phys.w * p.flocDrift;
      if (chi <= 0.0) { continue; }
      let dn = flocField(x, y, id, bucket) - flocField(nx, ny, id, bucket);
      let cUp = select(here / a.x, there / n.x, dn > 0.0);
      let drift = min(chi * abs(dn), cap);
      addCand(id, p.dt * face * drift * sign(dn) * wmin * cUp);
    }
  }
}
`;

export const renderWGSL = (MAXP = MAX_PIGMENTS) => /* wgsl */ `
struct R {
  W: u32, H: u32, thickness: f32, wetDarken: f32,
  paperColor: vec4f,
  paperShade: f32, suspendedWeight: f32, _a: f32, _b: f32,
};
struct Pigment { K: vec4f, S: vec4f, phys: vec4f, phys2: vec4f };
struct Comp4 { id: vec4u, amt: vec4f };
struct Dep { id: vec4u, amt: vec4f, stainK: vec4f, stainS: vec4f, stamp: vec4f };
@group(0) @binding(0) var<uniform> r: R;
@group(0) @binding(1) var<storage, read> A: array<vec4f>;
@group(0) @binding(2) var<storage, read> aux: array<vec4f>;
@group(0) @binding(3) var<storage, read> G: array<Comp4>;
@group(0) @binding(4) var<storage, read> D: array<Dep>;
@group(0) @binding(5) var<uniform> pig: array<Pigment, ${MAXP}>;

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

  let Rg = r.paperColor.rgb * (1.0 - r.paperShade * (1.0 - h));

  // Kubelka-Munk layers, composited bottom-up over the paper: the stain
  // layer (oldest), then deposited pigment grouped into washes by when it
  // settled (pigment settling within LAYER_GAP seconds counts as one wash
  // and mixes), then the wet suspended pigment on top. So gouache over dry
  // paint covers it, while gouache mixed into wet paint makes a tint.
  let g = G[i];
  let dep = D[i];
  var col = Rg;
  col = overLayer(col, dep.stainK.rgb * r.thickness, dep.stainS.rgb * r.thickness, dep.stainK.w);

  // Deposited components, oldest first.
  var done = vec4<bool>(false);
  for (var n = 0; n < 4; n++) {
    var first = -1;
    for (var k = 0; k < 4; k++) {
      if (!done[k] && dep.amt[k] > 0.0 && (first < 0 || dep.stamp[k] < dep.stamp[first])) { first = k; }
    }
    if (first < 0) { break; }
    var Kx = vec3f(0.0); var Sx = vec3f(0.0); var total = 0.0;
    for (var k = 0; k < 4; k++) {
      if (!done[k] && dep.amt[k] > 0.0 && dep.stamp[k] - dep.stamp[first] <= LAYER_GAP) {
        done[k] = true;
        let ad = dep.amt[k] * r.thickness;
        Kx += pig[dep.id[k]].K.rgb * ad; Sx += pig[dep.id[k]].S.rgb * ad; total += dep.amt[k];
      }
    }
    col = overLayer(col, Kx, Sx, total);
  }

  // Wet pigment on top.
  var Kw = vec3f(0.0); var Sw = vec3f(0.0); var tw = 0.0;
  for (var k = 0; k < 4; k++) {
    let ag = max(g.amt[k], 0.0) * r.suspendedWeight;
    if (ag > 0.0) { Kw += pig[g.id[k]].K.rgb * ag * r.thickness; Sw += pig[g.id[k]].S.rgb * ag * r.thickness; tw += ag; }
  }
  col = overLayer(col, Kw, Sw, tw);

  col *= 1.0 - clamp(a.x * r.wetDarken, 0.0, 0.3);
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;
