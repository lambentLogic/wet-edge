import { paramStructWGSL } from './params.js';

// Cell state, two ping-pong buffers each:
//   A = (w, g, d, s)  surface water depth, suspended pigment,
//                     deposited pigment, paper saturation (capillary layer)
//   B = (u, v, -, -)  staggered face velocities: u on the cell's right face,
//                     v on its bottom face (y points down)
// Plus mb, a blurred wet mask used for edge effects (Curtis's M').

export const simWGSL = () => /* wgsl */ `
${paramStructWGSL()}

struct Frame {
  W: u32, H: u32, mode: u32, brushOn: u32,
  bx0: f32, by0: f32, bx1: f32, by1: f32,
  pressure: f32, brushScale: f32, dryMul: f32, charge: f32,
};

@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<uniform> fr: Frame;
@group(0) @binding(2) var<storage, read> paper: array<f32>;
@group(0) @binding(3) var<storage, read> Ain: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> Aout: array<vec4f>;
@group(0) @binding(5) var<storage, read> Bin: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> Bout: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> mb: array<f32>;
@group(0) @binding(8) var<storage, read_write> tmp: array<f32>;

fn W() -> i32 { return i32(fr.W); }
fn H() -> i32 { return i32(fr.H); }
fn ix(x: i32, y: i32) -> i32 { return y * W() + x; }
fn inb(x: i32, y: i32) -> bool { return x >= 0 && y >= 0 && x < W() && y < H(); }
fn finite(v: f32) -> f32 { return select(0.0, v, v == v && abs(v) < 1e30); }

// ---------------------------------------------------------------- wet mask blur
const BR: i32 = 8;

fn wetInd(i: i32) -> f32 { return select(0.0, 1.0, Ain[i].x > p.wEps); }

@compute @workgroup_size(16, 16)
fn blurH(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
  if (!inb(x, y)) { return; }
  var acc = 0.0;
  for (var k = -BR; k <= BR; k++) { acc += wetInd(ix(clamp(x + k, 0, W() - 1), y)); }
  tmp[ix(x, y)] = acc / f32(2 * BR + 1);
}

@compute @workgroup_size(16, 16)
fn blurV(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
  if (!inb(x, y)) { return; }
  var acc = 0.0;
  for (var k = -BR; k <= BR; k++) { acc += tmp[ix(x, clamp(y + k, 0, H() - 1))]; }
  mb[ix(x, y)] = acc / f32(2 * BR + 1);
}

// ---------------------------------------------------------------- velocity
fn isWet(i: i32) -> bool { return Ain[i].x > p.wEps; }
// Surface water may only enter paper that is already wet or damp enough.
fn isOpen(i: i32) -> bool { let a = Ain[i]; return a.x > p.wEps || a.w > p.dampThreshold; }

fn pres(i: i32) -> f32 {
  let a = Ain[i];
  let wet = select(0.0, 1.0, a.x > p.wEps);
  // Lowering pressure near the wet edge draws water (and pigment) outward:
  // the coffee-ring edge darkening.
  return p.gravity * (a.x + p.paperRelief * paper[i]) - p.edgePull * (1.0 - mb[i]) * wet;
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

fn uAt(x: i32, y: i32) -> f32 { if (!inb(x, y)) { return 0.0; } return Bin[ix(x, y)].x; }
fn vAt(x: i32, y: i32) -> f32 { if (!inb(x, y)) { return 0.0; } return Bin[ix(x, y)].y; }

@compute @workgroup_size(16, 16)
fn velocity(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
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
      let acc = -(pres(j) - pres(i)) + p.viscosity * lap + p.tiltX;
      u = (u0 + p.dt * acc) / (1.0 + p.dt * dragAt(i, j));
    }
  }
  if (y < H() - 1) {
    let j = ix(x, y + 1);
    if ((isWet(i) || isWet(j)) && isOpen(i) && isOpen(j) && !pinned(i, j)) {
      let v0 = Bin[i].y;
      let lap = vAt(x - 1, y) + vAt(x + 1, y) + vAt(x, y - 1) + vAt(x, y + 1) - 4.0 * v0;
      let acc = -(pres(j) - pres(i)) + p.viscosity * lap + p.tiltY;
      v = (v0 + p.dt * acc) / (1.0 + p.dt * dragAt(i, j));
    }
  }
  Bout[i] = vec4f(clamp(finite(u), -vmax, vmax), clamp(finite(v), -vmax, vmax), 0.0, 0.0);
}

// ---------------------------------------------------------------- transport + paper
@compute @workgroup_size(16, 16)
fn transport(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y);
  if (!inb(x, y)) { return; }
  let i = ix(x, y);
  let a = Ain[i];

  // Upwind finite-volume flux of water and suspended pigment together,
  // so pigment rides the water at its local concentration.
  let uR = Bout[i].x;
  let vD = Bout[i].y;
  var uL = 0.0; var vU = 0.0;
  var aL = a; var aR = a; var aU = a; var aD = a;
  if (x > 0)       { uL = Bout[ix(x - 1, y)].x; aL = Ain[ix(x - 1, y)]; }
  if (x < W() - 1) { aR = Ain[ix(x + 1, y)]; }
  if (y > 0)       { vU = Bout[ix(x, y - 1)].y; aU = Ain[ix(x, y - 1)]; }
  if (y < H() - 1) { aD = Ain[ix(x, y + 1)]; }

  let FR = uR * select(aR.xy, a.xy, uR > 0.0);
  let FL = uL * select(a.xy, aL.xy, uL > 0.0);
  let FD = vD * select(aD.xy, a.xy, vD > 0.0);
  let FU = vU * select(a.xy, aU.xy, vU > 0.0);
  let wg = a.xy - p.dt * (FR - FL + FD - FU);
  var w = wg.x;
  var g = wg.y;

  // Pigment also moves between touching wet cells without net water flow:
  //  - diffusion down its concentration gradient, and
  //  - the Marangoni surface current: paint (binder, wetting agents) has
  //    lower surface tension than clean water, so the surface layer carrying
  //    it slides outward. The rate scales with concentration, so a fresh
  //    charge bursts outward with a defined front and slows as it dilutes.
  //    Negative values pull paint into clumps.
  // Mixing is suppressed near a wet edge (mb falls off there), so it can't
  // undo the outward flow that builds edge darkening. Each exchange uses the
  // smaller of the two cells' weights, so it stays symmetric and conserves
  // pigment.
  if (a.x > p.wEps) {
    let c = a.y / a.x;
    let wi = smoothstep(p.mixEdgeLo, p.mixEdgeHi, mb[i]);
    var dg = 0.0;
    for (var k = 0; k < 4; k++) {
      var nx = x; var ny = y; var n = a;
      if (k == 0) { nx = x - 1; n = aL; } else if (k == 1) { nx = x + 1; n = aR; }
      else if (k == 2) { ny = y - 1; n = aU; } else { ny = y + 1; n = aD; }
      if (!inb(nx, ny) || n.x <= p.wEps) { continue; }
      let face = min(wi, smoothstep(p.mixEdgeLo, p.mixEdgeHi, mb[ix(nx, ny)]));
      if (face <= 0.0) { continue; }
      let cn = n.y / n.x;
      // The Marangoni term only acts where paint meets much cleaner water
      // (high contrast), not across the gentle gradients inside one body of
      // paint. Capped at the explicit-scheme stability limit (4 neighbours).
      let hi = max(c, cn);
      let contrast = (hi - min(c, cn)) / (hi + 1e-4);
      let rate = min(p.pigmentDiffusion + p.marangoni * hi * contrast * contrast, 0.24 / max(p.dt, 1e-6));
      dg += face * rate * min(a.x, n.x) * (cn - c);
    }
    g += p.dt * dg;
  }
  var d = a.z;
  var s = a.w;

  // Brush: stamped along the segment the pointer travelled this frame.
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
      let c0 = select(0.0, g / w, w > p.wEps);
      w = max(w, mix(w, p.brushWater, k)) + charge;
      g = max(g, mix(g, p.brushWater * p.brushPigment, k)) + charge * max(p.brushPigment - c0, 0.0);
    } else if (fr.mode == 1u) {
      w = max(w, mix(w, p.brushWater, k)) + charge;
    } else {
      let kl = clamp(p.liftStrength * amt * 8.0, 0.0, 1.0);
      w *= 1.0 - kl;
      g *= 1.0 - kl;
      s *= 1.0 - kl;
    }
  }

  // Settled pigment fills the paper's valleys, so granulation fades as a
  // wash gets dense: pale washes speckle, masstone goes flat.
  let h = min(paper[i] + d * p.valleyFill, 1.0);

  // Pigment adsorption / desorption (Curtis §4.5). Valleys (low h) catch
  // more pigment when granulation is high. Unlike Curtis, settling also
  // scales with 1/depth: pigment in a deep pool mostly stays suspended and
  // drops out as the water thins, which concentrates it at drying edges.
  if (w > p.wEps) {
    let thin = p.settleDepth / (w + 0.01);
    let down = max(g * (1.0 - h * p.granulation), 0.0) * p.density * thin * p.dt;
    let up = max(d * (1.0 + (h - 1.0) * p.granulation), 0.0) * p.density / max(p.staining, 1e-4) * p.dt;
    let dn = min(down, max(g, 0.0));
    let upc = min(up, max(d, 0.0));
    g += upc - dn;
    d += dn - upc;
  }

  // Evaporation, faster where the wet area is thin (near its edge).
  let edge = 1.0 - mb[i];
  if (w > 0.0) { w -= p.evaporation * fr.dryMul * p.dt * (1.0 + p.edgeEvaporation * edge); }
  w = max(w, 0.0);

  // Paper drinks surface water up to its capacity (more in valleys).
  // Sizing slows the drinking and evens it out across the texture; unsized
  // paper absorbs fast and blotchily. Past 1, sized paper pushes water back up.
  let texture = mix(1.0 - paper[i], 0.5, clamp(p.sizing, 0.0, 1.0));
  let capI = mix(p.capacityMin, p.capacityMax, texture);
  let drink = clamp(p.absorption * (1.0 - p.sizing) * p.dt * max(capI - s, 0.0), -s, w);
  w -= drink;
  s += drink;

  // Capillary diffusion through the fibers, only where saturated enough to wick.
  var ds = 0.0;
  let sMin = p.capillaryMin;
  if (aL.w > sMin || a.w > sMin) { ds += aL.w - a.w; }
  if (aR.w > sMin || a.w > sMin) { ds += aR.w - a.w; }
  if (aU.w > sMin || a.w > sMin) { ds += aU.w - a.w; }
  if (aD.w > sMin || a.w > sMin) { ds += aD.w - a.w; }
  s += p.capillarySpread * p.dt * ds;
  // Paper only dries once no standing water covers it.
  if (w <= p.wEps) { s = max(s - p.paperEvaporation * fr.dryMul * p.dt, 0.0); }

  // Once the surface water is gone, whatever pigment it carried settles.
  if (w <= p.wEps) { d += max(g, 0.0); g = 0.0; }

  Aout[i] = vec4f(finite(w), finite(max(g, 0.0)), finite(max(d, 0.0)), finite(s));
}
`;

export const renderWGSL = /* wgsl */ `
struct R {
  W: u32, H: u32, thickness: f32, wetDarken: f32,
  K: vec4f, S: vec4f, paperColor: vec4f,
  paperShade: f32, suspendedWeight: f32, _a: f32, _b: f32,
};
@group(0) @binding(0) var<uniform> r: R;
@group(0) @binding(1) var<storage, read> A: array<vec4f>;
@group(0) @binding(2) var<storage, read> paper: array<f32>;

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
  let h = paper[i];

  let Rg = r.paperColor.rgb * (1.0 - r.paperShade * (1.0 - h));

  // Kubelka-Munk reflectance and transmittance of the pigment layer,
  // composited over the paper.
  let thick = max(r.thickness * (a.z + r.suspendedWeight * a.y), 0.0);
  let K = r.K.rgb;
  let S = max(r.S.rgb, vec3f(1e-4));
  let aa = 1.0 + K / S;
  let b = sqrt(aa * aa - 1.0);
  let bsx = min(b * S * thick, vec3f(20.0));
  let sh = sinh(bsx);
  let ch = cosh(bsx);
  let c = aa * sh + b * ch;
  let Rl = sh / c;
  let T = b / c;
  var col = Rl + T * T * Rg / (1.0 - Rl * Rg);

  col *= 1.0 - clamp(a.x * r.wetDarken, 0.0, 0.3);
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;
