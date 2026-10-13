// Constructional drawing in 3D, for scripts (window.__draw): a camera, simple
// forms (boxes, ellipsoids, sausages), and the lines a draughtsperson would
// draw for them: each form's silhouette as seen from the eye, its contour
// lines (cross-sections that wrap it, showing which way it turns), and
// nothing a nearer form hides. Drawn with the Pencil tool.
//
// Why: drawn from a flat grid of coordinates, limbs came out detached and
// segments as swipes (the painter, on the beach crab: "practice drawing").
// Construction (after drawabox.com's lessons: boxes, organic forms with
// contours, form intersections, insects built from masses and sausage legs)
// makes a drawing answer where each form is in space and how it meets the
// next one.
//
//   const D = window.__draw;
//   const cam = D.camera({ eye: [0, 300, 900], target: [0, 0, 0] });
//   const forms = [D.box({ at: [0, 0, 0], size: [200, 120, 160], turn: [0, 30, 0] }),
//                  D.sausage({ spine: [[-200, 0, 0], [0, 80, 40], [200, 0, 0]], radius: [30, 50, 20] })];
//   await D.pencil(D.lines(forms, cam));
//
// World units are arbitrary (think millimetres); y is up. The camera's
// `focal` sets how strong the perspective is for the distance: a far eye with
// a long focal is nearly flat, a near eye with a short one is dramatic.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// A rotation from degrees about x, then y, then z, as a 3x3 (columns are the turned axes).
function rotation([ax = 0, ay = 0, az = 0] = []) {
  const [x, y, z] = [ax, ay, az].map(d => d * Math.PI / 180);
  const Rx = [[1, 0, 0], [0, Math.cos(x), -Math.sin(x)], [0, Math.sin(x), Math.cos(x)]];
  const Ry = [[Math.cos(y), 0, Math.sin(y)], [0, 1, 0], [-Math.sin(y), 0, Math.cos(y)]];
  const Rz = [[Math.cos(z), -Math.sin(z), 0], [Math.sin(z), Math.cos(z), 0], [0, 0, 1]];
  const m = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
  return m(Rz, m(Ry, Rx));
}
const apply = (R, v) => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
// Catmull-Rom through spine points, `n` samples per span: a smooth spine.
function smoothPath(pts, n = 12) {
  if (pts.length < 3) { const out = []; for (let k = 0; k <= n; k++) out.push(add(pts[0], mul(sub(pts[pts.length - 1], pts[0]), k / n))); return out; }
  const P = [sub(mul(pts[0], 2), pts[1]), ...pts, sub(mul(pts[pts.length - 1], 2), pts[pts.length - 2])], out = [];
  for (let i = 1; i < P.length - 2; i++) for (let k = 0; k < n; k++) {
    const t = k / n, t2 = t * t, t3 = t2 * t;
    out.push([0, 1, 2].map(c => 0.5 * (2 * P[i][c] + (-P[i - 1][c] + P[i + 1][c]) * t + (2 * P[i - 1][c] - 5 * P[i][c] + 4 * P[i + 1][c] - P[i + 2][c]) * t2 + (-P[i - 1][c] + 3 * P[i][c] - 3 * P[i + 1][c] + P[i + 2][c]) * t3)));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function makeDrawing(sim) {
  const W = 1024, H = 768;

  // ---- the camera ----
  // eye looks at target; focal is the projection's scale (cells per unit at
  // unit depth); center is where the target lands on the sheet.
  function camera({ eye = [0, 0, 1000], target = [0, 0, 0], up = [0, 1, 0], focal = 1000, center = [W / 2, H / 2] } = {}) {
    const f = norm(sub(target, eye)), r = norm(cross(f, up)), u = cross(r, f);
    return {
      eye, f, r, u, focal, center,
      // [x, y] on the sheet and depth along the view (larger is farther)
      project(p) { const d = sub(p, eye), z = dot(d, f); return [center[0] + focal * dot(d, r) / z, center[1] - focal * dot(d, u) / z, z]; },
      // which side of a surface the eye is on: > 0 when the normal faces it
      facing(p, n) { return dot(n, sub(eye, p)); },
      // back from the sheet: the point at sheet (x, y) that lies at height
      // `y0` (on the plane y = y0), so a point measured off a photo can be
      // put in 3D by saying how high above the ground it is
      unproject(x, y, y0 = 0) {
        const dir = norm(add(f, add(mul(r, (x - center[0]) / focal), mul(u, -(y - center[1]) / focal))));
        const t = (y0 - eye[1]) / dir[1]; return add(eye, mul(dir, t));
      },
    };
  }

  // ---- forms ----
  // Each form can: sample its surface (for the depth buffer), give its
  // silhouette from an eye, and its contour lines; lines are lists of
  // { p: point, n: surface normal or null } so a form hides its own far side.
  function box({ at = [0, 0, 0], size = [100, 100, 100], turn = [0, 0, 0] } = {}) {
    const R = rotation(turn), h = mul(size, 0.5);
    const corner = (sx, sy, sz) => add(at, apply(R, [sx * h[0], sy * h[1], sz * h[2]]));
    const faces = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]].map(([ax, s]) => { const n = [0, 0, 0]; n[ax] = s; return apply(R, n); });
    const edges = [];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
      // an edge along axis c, at the given signs on the other two axes
      const c = 3 - a - b, from = [0, 0, 0], to = [0, 0, 0];
      from[a] = to[a] = s1; from[b] = to[b] = s2; from[c] = -1; to[c] = 1;
      const nA = [0, 0, 0], nB = [0, 0, 0]; nA[a] = s1; nB[b] = s2;
      edges.push({ from: corner(...from), to: corner(...to), faces: [apply(R, nA), apply(R, nB)] });
    }
    const Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
    return {
      kind: 'box',
      field(p) { const l = apply(Rt, sub(p, at)); return Math.max(Math.abs(l[0]) - h[0], Math.abs(l[1]) - h[1], Math.abs(l[2]) - h[2]); },
      sample(step) {
        const pts = [];
        for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
          const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3, n1 = Math.ceil(size[a1] / step), n2 = Math.ceil(size[a2] / step);
          for (let i = 0; i <= n1; i++) for (let j = 0; j <= n2; j++) { const v = [0, 0, 0]; v[ax] = s; v[a1] = -1 + 2 * i / n1; v[a2] = -1 + 2 * j / n2; pts.push(corner(...v)); }
        }
        return pts;
      },
      // edges: visible when either face beside it faces the eye (an outline edge has one of each)
      lines(cam) {
        return edges.map(e => {
          const front = e.faces.map(n => cam.facing(e.from, n) > 0);
          const kind = front[0] && front[1] ? 'edge' : front[0] || front[1] ? 'silhouette' : 'hidden';
          const pts = []; for (let k = 0; k <= 24; k++) pts.push({ p: add(e.from, mul(sub(e.to, e.from), k / 24)), n: null });
          return { kind, pts };
        });
      },
    };
  }

  // An ellipsoid: radii along its own (turned) axes. contours: how many
  // cross-section rings around which local axis (0 x, 1 y, 2 z).
  // Or give `axes`: three vectors from the centre to the surface along its
  // own axes (their lengths are the radii; they needn't be exactly square:
  // the first is kept, the others squared to it), e.g. measured off a photo.
  function ellipsoid({ at = [0, 0, 0], radii = [100, 60, 60], turn = [0, 0, 0], axes = null, contours = 3, around = 0 } = {}) {
    let R = rotation(turn);
    if (axes) {
      const ex = norm(axes[0]), ez0 = norm(cross(ex, axes[1])), ey = norm(cross(ez0, ex)), ez = dot(ez0, axes[2]) < 0 ? mul(ez0, -1) : ez0, ey2 = dot(ey, axes[1]) < 0 ? mul(ey, -1) : ey;
      R = [[ex[0], ey2[0], ez[0]], [ex[1], ey2[1], ez[1]], [ex[2], ey2[2], ez[2]]];
      radii = axes.map(len);
    }
    const point = (u, v) => add(at, apply(R, [radii[0] * Math.cos(v) * Math.cos(u), radii[1] * Math.cos(v) * Math.sin(u), radii[2] * Math.sin(v)]));
    const normal = p => { const l = apply([[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]], sub(p, at)); return norm(apply(R, [l[0] / radii[0] ** 2, l[1] / radii[1] ** 2, l[2] / radii[2] ** 2])); };
    const Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
    return {
      kind: 'ellipsoid',
      // inside < 0 (roughly a distance near the surface)
      field(p) { const l = apply(Rt, sub(p, at)); return (Math.hypot(l[0] / radii[0], l[1] / radii[1], l[2] / radii[2]) - 1) * Math.min(...radii); },
      grid() { const rows = []; for (let j = 0; j <= 48; j++) { const v = -Math.PI / 2 + Math.PI * j / 48, row = []; for (let i = 0; i < 96; i++) { const p = point(2 * Math.PI * i / 96, v); row.push({ p, n: normal(p) }); } rows.push(row); } return { rows, wrap: true }; },
      sample(step) {
        const n = Math.ceil(2 * Math.PI * Math.max(...radii) / step), pts = [];
        for (let i = 0; i < n; i++) for (let j = 0; j <= n / 2; j++) pts.push(point(2 * Math.PI * i / n, -Math.PI / 2 + Math.PI * j / (n / 2)));
        return pts;
      },
      lines(cam) {
        const out = [];
        // silhouette: on the unit sphere in the ellipsoid's own space, the
        // circle where the eye's lines graze it; then back out to the ellipsoid
        const Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
        const e = apply(Rt, sub(cam.eye, at)), eu = [e[0] / radii[0], e[1] / radii[1], e[2] / radii[2]], d = len(eu);
        if (d > 1) {
          const w = norm(eu), cc = mul(w, 1 / d), rc = Math.sqrt(1 - 1 / (d * d));
          const a = norm(cross(w, Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), b = cross(w, a), pts = [];
          for (let k = 0; k <= 96; k++) { const t = 2 * Math.PI * k / 96, q = add(cc, add(mul(a, rc * Math.cos(t)), mul(b, rc * Math.sin(t)))); pts.push({ p: add(at, apply(R, [q[0] * radii[0], q[1] * radii[1], q[2] * radii[2]])), n: null }); }
          out.push({ kind: 'silhouette', pts });
        }
        for (let c = 1; c <= contours; c++) {
          const s = -1 + 2 * c / (contours + 1), pts = [];
          for (let k = 0; k <= 96; k++) {
            const t = 2 * Math.PI * k / 96, rr = Math.sqrt(1 - s * s), v = [0, 0, 0];
            v[around] = s; v[(around + 1) % 3] = rr * Math.cos(t); v[(around + 2) % 3] = rr * Math.sin(t);
            const p = add(at, apply(R, [v[0] * radii[0], v[1] * radii[1], v[2] * radii[2]]));
            pts.push({ p, n: normal(p) });
          }
          out.push({ kind: 'contour', pts });
        }
        return out;
      },
    };
  }

  // A sausage: a tube along a smooth spine through `spine` points, its radius
  // eased between the values in `radius` (one per spine point, or one for
  // all), rounded at both ends. contours: cross-section rings along it (how
  // many), which show its direction and how it turns toward or away.
  function sausage({ spine, radius = 20, contours = 5, ends = true } = {}) {
    const C = smoothPath(spine, 16), radii = Array.isArray(radius) ? radius : spine.map(() => radius);
    const rAt = i => { const t = i / (C.length - 1) * (radii.length - 1), k = Math.min(radii.length - 2, Math.floor(t)), f = t - k; return radii.length === 1 ? radii[0] : radii[k] + (radii[k + 1] - radii[k]) * (f * f * (3 - 2 * f)); };
    const tan = i => norm(sub(C[Math.min(i + 1, C.length - 1)], C[Math.max(i - 1, 0)]));
    // a frame along the spine that doesn't twist (each step turns the last one as little as possible)
    const frames = []; { let n0 = norm(cross(tan(0), Math.abs(tan(0)[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])); for (let i = 0; i < C.length; i++) { const t = tan(i); n0 = norm(sub(n0, mul(t, dot(n0, t)))); frames.push([n0, cross(t, n0)]); } }
    // how fast the radius changes along the spine: a tapering tube's surface
    // (and so its outline) tilts toward the narrow end
    const slope = i => { const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, C.length - 1), ds = len(sub(C[i1], C[i0])) || 1; return (rAt(i1) - rAt(i0)) / ds; };
    const ring = (i, a) => { const [n, b] = frames[i], r = rAt(i), dir = add(mul(n, Math.cos(a)), mul(b, Math.sin(a))); return { p: add(C[i], mul(dir, r)), n: norm(sub(dir, mul(tan(i), slope(i)))) }; };
    const cap = (i, sign) => {   // the hemisphere at an end, as sample points
      const t = mul(tan(i), sign), r = rAt(i), [n, b] = frames[i], pts = [];
      for (let j = 0; j <= 8; j++) for (let k = 0; k < 24; k++) { const v = j / 8 * Math.PI / 2, a = 2 * Math.PI * k / 24, dir = add(mul(t, Math.sin(v)), mul(add(mul(n, Math.cos(a)), mul(b, Math.sin(a))), Math.cos(v))); pts.push({ p: add(C[i], mul(dir, r)), n: dir }); }
      return pts;
    };
    return {
      kind: 'sausage', spine: C, radiusAt: rAt,
      field(p) { let best = Infinity; for (let i = 0; i < C.length; i++) best = Math.min(best, len(sub(p, C[i])) - rAt(i)); return best; },
      grid() { const rows = []; for (let i = 0; i < C.length; i++) { const row = []; for (let k = 0; k < 64; k++) row.push(ring(i, 2 * Math.PI * k / 64)); rows.push(row); } return { rows, wrap: true }; },
      sample(step) {
        const pts = [];
        for (let i = 0; i < C.length; i++) { const m = Math.ceil(2 * Math.PI * rAt(i) / step); for (let k = 0; k < m; k++) pts.push(ring(i, 2 * Math.PI * k / m).p); }
        // fill between rings too, so the depth buffer has no gaps on a long span
        for (let i = 0; i < C.length - 1; i++) { const gap = len(sub(C[i + 1], C[i])), steps = Math.ceil(gap / step); for (let s = 1; s < steps; s++) { const m = Math.ceil(2 * Math.PI * rAt(i) / step); for (let k = 0; k < m; k++) { const a = ring(i, 2 * Math.PI * k / m).p, b = ring(i + 1, 2 * Math.PI * k / m).p; pts.push(add(a, mul(sub(b, a), s / steps))); } } }
        if (ends) for (const [i, s] of [[0, -1], [C.length - 1, 1]]) for (const q of cap(i, s)) pts.push(q.p);
        return pts;
      },
      lines(cam) {
        const out = [];
        // silhouette: on each ring, the two points whose normal is square to
        // the eye's line (normal ⟂ spine tangent and ⟂ the view)
        const sides = [[], []];
        // on a tapering tube the normal is (d - t r') for ring direction d, so
        // the outline is where d·v = r' (t·v): the ring angle from v's own
        // component across the tube is acos(r' (t·v) / |v across|)
        for (let i = 0; i < C.length; i++) {
          const t = tan(i), v = sub(C[i], cam.eye), vt = dot(v, t), vp = sub(v, mul(t, vt)), lp = len(vp), r = rAt(i);
          const n1 = mul(vp, 1 / (lp || 1)), n2 = cross(t, n1), c = Math.max(-1, Math.min(1, slope(i) * vt / (lp || 1))), sn = Math.sqrt(1 - c * c);
          for (const [k, sgn] of [[0, 1], [1, -1]]) { const d = add(mul(n1, c), mul(n2, sgn * sn)); sides[k].push({ p: add(C[i], mul(d, r)), n: null }); }
        }
        out.push({ kind: 'silhouette', pts: sides[0] }, { kind: 'silhouette', pts: sides[1] });
        // the ends: each cap's own silhouette (a sphere's grazing circle), the half beyond the tube
        if (ends) for (const [i, s] of [[0, -1], [C.length - 1, 1]]) {
          const c = C[i], r = rAt(i), w = sub(cam.eye, c), dd = len(w);
          if (dd <= r) continue;
          const wn = norm(w), cc = add(c, mul(wn, r * r / dd)), rc = r * Math.sqrt(1 - r * r / (dd * dd));
          const a = norm(cross(wn, Math.abs(wn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), b = cross(wn, a), pts = [];
          for (let k = 0; k <= 64; k++) { const t = 2 * Math.PI * k / 64, p = add(cc, add(mul(a, rc * Math.cos(t)), mul(b, rc * Math.sin(t)))); pts.push({ p, n: null, cap: dot(sub(p, c), mul(tan(i), s)) }); }
          out.push({ kind: 'silhouette', pts: pts.filter(q => q.cap > -0.01 * r) });
        }
        for (let c = 1; c <= contours; c++) {
          const i = Math.round(c / (contours + 1) * (C.length - 1)), pts = [];
          for (let k = 0; k <= 48; k++) pts.push(ring(i, 2 * Math.PI * k / 48));
          out.push({ kind: 'contour', pts });
        }
        return out;
      },
    };
  }

  // A prism: a polygon cross-section swept along a smooth spine, its width
  // and thickness eased between the values given per spine point: hard,
  // faceted things (a crab's palm, an arm with ridges), where sausages read
  // soft. The section is in (across, up) units; the default is a flat
  // hexagon (a ridge along each side, a face above and below). `up` keeps
  // the section's up side toward that direction along the spine. The ridges
  // are drawn as edges (outline where one face turns away), the ends capped.
  function prism({ spine, width = 40, thick = 20, section = [[1, 0], [0.5, 1], [-0.5, 1], [-1, 0], [-0.5, -1], [0.5, -1]], up = [0, 1, 0], rings = 2, caps = [true, true] } = {}) {
    const C = smoothPath(spine, 16), n = C.length, m = section.length;
    const ease = vals => { const v = Array.isArray(vals) ? vals : spine.map(() => vals); return i => { const t = i / (n - 1) * (v.length - 1), k = Math.min(v.length - 2, Math.floor(t)), f = t - k; return v.length === 1 ? v[0] : v[k] + (v[k + 1] - v[k]) * (f * f * (3 - 2 * f)); }; };
    const hw = ease(width), ht = ease(thick);
    const tan = i => norm(sub(C[Math.min(i + 1, n - 1)], C[Math.max(i - 1, 0)]));
    const frame = i => { const t = tan(i), sd = norm(cross(t, up)), vv = cross(sd, t); return [sd, vv, t]; };
    const F = C.map((_, i) => frame(i));
    const V = C.map((c, i) => section.map(([u, v]) => add(c, add(mul(F[i][0], u * hw(i) / 2), mul(F[i][1], v * ht(i) / 2)))));
    // outward normal of the side face between section corners k and k+1, at spine sample i
    const faceN = (i, k) => { const i1 = Math.min(i + 1, n - 1), i0 = i1 - 1, k1 = (k + 1) % m; const a = V[i0][k], b = V[i1][k], c = V[i0][k1]; let nn = norm(cross(sub(b, a), sub(c, a))); const mid = mul(add(add(V[i0][k], V[i0][k1]), add(V[i1][k], V[i1][k1])), 0.25); if (dot(nn, sub(mid, C[i0])) < 0) nn = mul(nn, -1); return { n: nn, p: mid }; };
    const capN = [mul(tan(0), -1), tan(n - 1)];
    const runs = (pts, kinds) => { const out = []; let cur = null; pts.forEach((p, j) => { const k = kinds[j]; if (!cur || cur.kind !== k) { if (cur && cur.pts.length) cur.pts.push({ p, n: null }); cur = { kind: k, pts: [] }; out.push(cur); } cur.pts.push({ p, n: null }); }); return out.filter(r => r.pts.length > 1); };
    const cls = (fa, fb) => fa && fb ? 'edge' : fa || fb ? 'silhouette' : 'hidden';
    return {
      kind: 'prism', spine: C,
      field(p) {
        let bi = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = len(sub(p, C[i])); if (d < bd) { bd = d; bi = i; } }
        const d = sub(p, C[bi]), [sd, vv, t] = F[bi], u = dot(d, sd) / (hw(bi) / 2), v = dot(d, vv) / (ht(bi) / 2);
        const beyond = bi === 0 ? -dot(d, t) : bi === n - 1 ? dot(d, t) : -1;
        return Math.max((Math.max(Math.abs(v), Math.abs(u) + 0.5 * Math.abs(v)) - 1) * Math.min(hw(bi), ht(bi)) / 2, beyond);
      },
      grid() { const rows = []; for (let i = 0; i < n; i++) { const row = []; for (let k = 0; k < m; k++) for (let s2 = 0; s2 < 4; s2++) { const a = V[i][k], b = V[i][(k + 1) % m]; row.push({ p: add(a, mul(sub(b, a), s2 / 4)), n: faceN(i, k).n }); } rows.push(row); } return { rows, wrap: true }; },
      sample(step) {
        const pts = [];
        for (let i = 0; i < n - 1; i++) for (let k = 0; k < m; k++) {
          const a = V[i][k], b = V[i + 1][k], c = V[i][(k + 1) % m], d = V[i + 1][(k + 1) % m];
          const nu = Math.ceil(len(sub(c, a)) / step), nv = Math.ceil(len(sub(b, a)) / step);
          for (let x = 0; x <= nu; x++) for (let y = 0; y <= nv; y++) { const p = add(mul(add(mul(a, 1 - x / nu), mul(c, x / nu)), 1 - y / nv), mul(add(mul(b, 1 - x / nu), mul(d, x / nu)), y / nv)); pts.push(p); }
        }
        for (const [i, on] of [[0, caps[0]], [n - 1, caps[1]]]) if (on) for (let s2 = 0; s2 <= 10; s2++) for (const q of V[i]) pts.push(add(C[i], mul(sub(q, C[i]), s2 / 10)));
        return pts;
      },
      lines(cam) {
        const out = [];
        // the ridges along it: each between face k-1 and face k
        for (let k = 0; k < m; k++) {
          const pts = C.map((_, i) => V[i][k]), kinds = C.map((_, i) => cls(cam.facing(faceN(i, (k + m - 1) % m).p, faceN(i, (k + m - 1) % m).n) > 0, cam.facing(faceN(i, k).p, faceN(i, k).n) > 0));
          out.push(...runs(pts, kinds));
        }
        // the ends: each rim edge between its side face and the cap
        for (const [e, i] of [[0, 0], [1, n - 1]]) {
          const capFront = caps[e] && cam.facing(C[i], capN[e]) > 0;
          // (an uncapped end is open: it goes under something, into shadow; nothing drawn across it)
          if (!caps[e]) continue;
          for (let k = 0; k < m; k++) { const f = faceN(i, k), side = cam.facing(f.p, f.n) > 0, kind = cls(side, capFront); out.push({ kind, pts: [{ p: V[i][k], n: null }, { p: V[i][(k + 1) % m], n: null }] }); }
        }
        // cross-section contours along it
        for (let r = 1; r <= rings; r++) {
          const i = Math.round(r / (rings + 1) * (n - 1));
          for (let k = 0; k < m; k++) { const f = faceN(i, k); out.push({ kind: cam.facing(f.p, f.n) > 0 ? 'contour' : 'hidden', pts: [{ p: V[i][k], n: null }, { p: V[i][(k + 1) % m], n: null }] }); }
        }
        return out;
      },
    };
  }

  // A mass: several forms blended into one smooth surface (their fields'
  // smooth union: where two meet they flow together with a fillet `blend`
  // wide, instead of a seam), for the organic masses that wrap around the
  // simple forms and fill the spaces between them (a swelling, a knuckle, a
  // joint). Made into a mesh (marching tetrahedra on a `cell`-sized grid);
  // drawn as its outline (where the smoothed surface turns away from the
  // eye), contour loops (slices across `axis`, `loops` of them; or with
  // `along`, points down its middle, slices square to that line as it bends), and creases
  // where the surface folds sharper than `crease` degrees. `cut`: forms
  // carved out of it.
  // `ridges`: draw the ridges of any prisms among the parts, wherever they lie
  // on the finished surface (a blended mass keeps its planes: the meshing
  // rounds a ridge off, so it's taken from the prism itself).
  function mass({ parts, cut = [], blend = 4, cell = null, axis = null, along = null, loops = 4, crease = 50, ridges = true } = {}) {
    const smin = (a, b, k) => { const hh = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - hh * hh * k * 0.25; };
    const field = p => { let v = Infinity; for (const f of parts) v = v === Infinity ? f.field(p) : smin(v, f.field(p), blend); for (const c of cut) v = Math.max(v, -c.field(p)); return v; };
    // the box it lives in
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const f of parts) for (const q of f.sample(3)) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], q[c]); hi[c] = Math.max(hi[c], q[c]); }
    const ext = sub(hi, lo), h0 = cell ?? Math.max(...ext) / 70, pad = blend + 2 * h0;
    for (let c = 0; c < 3; c++) { lo[c] -= pad; hi[c] += pad; }
    const N = [0, 1, 2].map(c => Math.ceil((hi[c] - lo[c]) / h0) + 1);
    const at = (i, j, k) => [lo[0] + i * h0, lo[1] + j * h0, lo[2] + k * h0];
    const F = new Float32Array(N[0] * N[1] * N[2]), idx = (i, j, k) => (k * N[1] + j) * N[0] + i;
    for (let k = 0; k < N[2]; k++) for (let j = 0; j < N[1]; j++) for (let i = 0; i < N[0]; i++) F[idx(i, j, k)] = field(at(i, j, k));
    // marching tetrahedra: each cube in six tetrahedra, each giving 0-2 triangles
    const verts = [], vkey = new Map(), tris = [];
    const vert = (a, b) => { // the surface crossing on grid edge a-b (shared between neighbours)
      const key = a < b ? a * 1e8 + b : b * 1e8 + a; if (vkey.has(key)) return vkey.get(key);
      const ka = Math.floor(a / (N[0] * N[1])), ja = Math.floor(a / N[0]) % N[1], ia = a % N[0], kb = Math.floor(b / (N[0] * N[1])), jb = Math.floor(b / N[0]) % N[1], ib = b % N[0];
      const t = F[a] / (F[a] - F[b]), pa = at(ia, ja, ka), pb = at(ib, jb, kb);
      verts.push(add(pa, mul(sub(pb, pa), t))); vkey.set(key, verts.length - 1); return verts.length - 1;
    };
    const TET = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
    const corner = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
    for (let k = 0; k < N[2] - 1; k++) for (let j = 0; j < N[1] - 1; j++) for (let i = 0; i < N[0] - 1; i++) {
      const g = corner.map(([a, b, c]) => idx(i + a, j + b, k + c));
      let anyIn = false, anyOut = false; for (const q of g) { if (F[q] < 0) anyIn = true; else anyOut = true; } if (!anyIn || !anyOut) continue;
      for (const T of TET) {
        const q = T.map(t => g[t]), inside = q.filter(x => F[x] < 0), outside = q.filter(x => F[x] >= 0);
        if (inside.length === 1) tris.push(outside.map(o => vert(inside[0], o)));
        else if (inside.length === 3) tris.push(inside.map(o => vert(outside[0], o)));
        else if (inside.length === 2) { const [a, b] = inside, [c, d] = outside; const v1 = vert(a, c), v2 = vert(a, d), v3 = vert(b, c), v4 = vert(b, d); tris.push([v1, v2, v4], [v1, v4, v3]); }
      }
    }
    // outward normals: the field's gradient (smooth across the mesh); triangles wound to match
    const grad = p => { const e = h0 * 0.5; return norm([field(add(p, [e, 0, 0])) - field(sub(p, [e, 0, 0])), field(add(p, [0, e, 0])) - field(sub(p, [0, e, 0])), field(add(p, [0, 0, e])) - field(sub(p, [0, 0, e]))]); };
    const VN = verts.map(grad);
    const triN = tris.map(t => { let nn = norm(cross(sub(verts[t[1]], verts[t[0]]), sub(verts[t[2]], verts[t[0]]))); if (dot(nn, add(add(VN[t[0]], VN[t[1]]), VN[t[2]])) < 0) { nn = mul(nn, -1); t.reverse(); } return nn; });
    const centre = mul(add(lo, hi), 0.5);
    // the zero set of a per-vertex value over the triangles, chained into lines
    const levelLines = (val, kindOf) => {
      const segs = [];
      for (const t of tris) {
        const pts = [];
        for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3], fa = val[a], fb = val[b]; if ((fa < 0) !== (fb < 0)) { const s2 = fa / (fa - fb); pts.push({ p: add(verts[a], mul(sub(verts[b], verts[a]), s2)), n: norm(add(mul(VN[a], 1 - s2), mul(VN[b], s2))) }); } }
        if (pts.length === 2) segs.push(pts);
      }
      return chain(segs).map(line => ({ kind: kindOf, pts: line }));
    };
    const edgeMap = new Map();
    tris.forEach((t, ti) => { for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3], key = a < b ? a * 1e8 + b : b * 1e8 + a; (edgeMap.get(key) ?? edgeMap.set(key, []).get(key)).push(ti); } });
    return {
      kind: 'mass', field, mesh: { verts, tris, normals: VN },
      sample(step) {
        const pts = [];
        for (const t of tris) { const [a, b, c] = t.map(v => verts[v]), m = Math.max(1, Math.ceil(Math.max(len(sub(b, a)), len(sub(c, a))) / step)); for (let x = 0; x <= m; x++) for (let y = 0; y <= m - x; y++) pts.push(add(a, add(mul(sub(b, a), x / m), mul(sub(c, a), y / m)))); }
        return pts;
      },
      tris: { verts, tris, normals: VN },
      lines(cam) {
        // outline: where the smoothed normal turns square to the eye (interpolated, so it's a smooth line, not the mesh's stair-steps)
        const out = levelLines(verts.map((v, i) => dot(VN[i], norm(sub(cam.eye, v)))), 'silhouette').map(l => ({ ...l, pts: l.pts.map(q => ({ p: q.p, n: null })) }));
        // contour loops: slices across the main axis (or the given one)
        let dv;
        if (along) {
          // how far along the middle line each vertex lies (by its nearest point on the line)
          const Lp = smoothPath(along, 12), cum = [0]; for (let i = 1; i < Lp.length; i++) cum.push(cum[i - 1] + len(sub(Lp[i], Lp[i - 1])));
          dv = verts.map(v => { let best = Infinity, bt = 0; for (let i = 0; i < Lp.length - 1; i++) { const a = Lp[i], ab = sub(Lp[i + 1], a), t = Math.max(0, Math.min(1, dot(sub(v, a), ab) / (dot(ab, ab) || 1))), d = len(sub(v, add(a, mul(ab, t)))); if (d < best) { best = d; bt = cum[i] + t * (cum[i + 1] - cum[i]); } } return bt; });
        } else {
          const ax = norm(axis ?? (ext[0] >= ext[1] && ext[0] >= ext[2] ? [1, 0, 0] : ext[2] >= ext[1] ? [0, 0, 1] : [0, 1, 0]));
          dv = verts.map(v => dot(sub(v, centre), ax));
        }
        const dmin = Math.min(...dv), dmax = Math.max(...dv);
        for (let r = 1; r <= loops; r++) { const s0 = dmin + (dmax - dmin) * r / (loops + 1); out.push(...levelLines(dv.map(d => d - s0), 'contour')); }
        // ridges of the prisms inside, kept where they're on the surface
        if (ridges) for (const f of parts) if (f.kind === 'prism') {
          for (const ln of f.lines(cam)) {
            if (ln.kind !== 'edge' && ln.kind !== 'silhouette') continue;
            let run = [];
            const flush = () => { if (run.length > 1) out.push({ kind: 'edge', pts: run }); run = []; };
            for (let k = 0; k < ln.pts.length - 1; k++) for (let s2 = 0; s2 < 6; s2++) {
              const p = add(ln.pts[k].p, mul(sub(ln.pts[k + 1].p, ln.pts[k].p), s2 / 6));
              if (Math.abs(field(p)) < h0 * 0.9) run.push({ p, n: grad(p) }); else flush();
            }
            flush();
          }
        }
        // creases: mesh edges where the surface folds sharply, between faces both toward the eye
        const cz = Math.cos(crease * Math.PI / 180);
        for (const [key, ts] of edgeMap) {
          if (ts.length !== 2 || dot(triN[ts[0]], triN[ts[1]]) > cz) continue;
          const a = Math.floor(key / 1e8), b = key % 1e8;
          out.push({ kind: 'edge', pts: [{ p: verts[a], n: VN[a] }, { p: verts[b], n: VN[b] }] });
        }
        return out;
      },
    };
  }
  // chain little segments [[q, q], ...] into polylines (by matching end points)
  function chain(segs) {
    const key = q => q.p.map(v => Math.round(v * 50)).join(','), ends = new Map(), used = new Uint8Array(segs.length), out = [];
    segs.forEach((sg, i) => sg.forEach(q => { const kq = key(q); if (!ends.has(kq)) ends.set(kq, []); ends.get(kq).push(i); }));
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue; used[i] = 1; const line = [segs[i][0], segs[i][1]];
      for (const fwd of [true, false]) for (;;) {
        const tip = fwd ? line[line.length - 1] : line[0], j = (ends.get(key(tip)) ?? []).find(x => !used[x]);
        if (j === undefined) break; used[j] = 1; const nxt = key(segs[j][0]) === key(tip) ? segs[j][1] : segs[j][0];
        if (fwd) line.push(nxt); else line.unshift(nxt);
      }
      out.push(line);
    }
    return out;
  }

  // ---- where two forms meet ----
  // The curve where form b goes into form a: b's inside/outside field
  // contoured over a's surface (marching squares on a's grid). Put it in the
  // list of forms like any other; it's drawn as kind 'meet', hidden only by
  // forms other than a and b. (Drawing this line is what makes one form read
  // as attached to another: a leg going into a body, rather than laid on it.)
  function meet(a, b) {
    return {
      kind: 'meet', owners: [a, b],
      sample() { return []; },
      lines() {
        if (a.tris) {   // a mass: b's field contoured over a's triangles
          const { verts, tris, normals } = a.tris, fv = verts.map(v => b.field(v)), segs = [];
          for (const t of tris) { const pts = []; for (let e = 0; e < 3; e++) { const i = t[e], j = t[(e + 1) % 3]; if ((fv[i] < 0) !== (fv[j] < 0)) { const s2 = fv[i] / (fv[i] - fv[j]); pts.push({ p: add(verts[i], mul(sub(verts[j], verts[i]), s2)), n: norm(add(mul(normals[i], 1 - s2), mul(normals[j], s2))) }); } } if (pts.length === 2) segs.push(pts); }
          return chain(segs).map(line => ({ kind: 'meet', pts: line }));
        }
        const { rows, wrap } = a.grid(), f = rows.map(r => r.map(q => b.field(q.p))), segs = [];
        const cut = (q0, q1, f0, f1) => { const t = f0 / (f0 - f1); return { p: add(q0.p, mul(sub(q1.p, q0.p), t)), n: norm(add(mul(q0.n, 1 - t), mul(q1.n, t))) }; };
        for (let i = 0; i < rows.length - 1; i++) for (let k = 0; k < rows[i].length - (wrap ? 0 : 1); k++) {
          const k1 = (k + 1) % rows[i].length;
          const c = [[i, k], [i, k1], [i + 1, k1], [i + 1, k]], pts = [];
          for (let e = 0; e < 4; e++) { const [ia, ka] = c[e], [ib, kb] = c[(e + 1) % 4]; if ((f[ia][ka] < 0) !== (f[ib][kb] < 0)) pts.push(cut(rows[ia][ka], rows[ib][kb], f[ia][ka], f[ib][kb])); }
          if (pts.length >= 2) segs.push([pts[0], pts[1]]);
          if (pts.length === 4) segs.push([pts[2], pts[3]]);
        }
        // chain the little segments into lines
        const key = q => q.p.map(v => Math.round(v * 20)).join(','), ends = new Map(), used = new Uint8Array(segs.length), out = [];
        segs.forEach((sg, i) => sg.forEach(q => { const kq = key(q); if (!ends.has(kq)) ends.set(kq, []); ends.get(kq).push(i); }));
        for (let i = 0; i < segs.length; i++) {
          if (used[i]) continue; used[i] = 1; const line = [segs[i][0], segs[i][1]];
          for (const fwd of [true, false]) for (;;) {
            const tip = fwd ? line[line.length - 1] : line[0], j = (ends.get(key(tip)) ?? []).find(x => !used[x]);
            if (j === undefined) break; used[j] = 1; const nxt = key(segs[j][0]) === key(tip) ? segs[j][1] : segs[j][0];
            if (fwd) line.push(nxt); else line.unshift(nxt);
          }
          out.push({ kind: 'meet', pts: line });
        }
        return out;
      },
    };
  }

  // ---- seeing: a depth buffer of every form, then each line cut where hidden ----
  // Returns polylines [{ kind, form, pts: [[x, y], ...] }] on the sheet: only
  // the visible runs (or, with { hidden: true }, the hidden runs as kind
  // 'hidden' too, for a construction drawing that shows its far side).
  function lines(forms, cam, { hidden = false, step = 1.2 } = {}) {
    const zbuf = new Float32Array(W * H).fill(Infinity), owner = new Int16Array(W * H).fill(-1);
    forms.forEach((f, id) => {
      // sample spacing in world units for about `step` cells on the sheet at this form's depth
      // (a fixed spacing left holes in the depth buffer when zoomed in, and hidden lines leaked through as dashes)
      const probe = f.sample(1e9)[0] ?? [0, 0, 0], zf = Math.max(1e-3, cam.project(probe)[2]);
      for (const p of f.sample(step * 0.8 * zf / cam.focal)) {
        const [x, y, z] = cam.project(p);
        if (z <= 0) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xi = Math.round(x) + dx, yi = Math.round(y) + dy;
          if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
          const c = yi * W + xi; if (z < zbuf[c]) { zbuf[c] = z; owner[c] = id; }
        }
      }
    });
    const out = [];
    forms.forEach((f, id) => {
      const mine = (f.owners ?? []).map(o => forms.indexOf(o));
      for (const ln of f.lines(cam)) {
        let run = [], runKind = null;
        const flush = () => { if (run.length > 1) out.push({ kind: runKind, form: id, pts: run }); run = []; };
        // resample so a run can stop and start anywhere along the line
        const fine = [];
        for (let k = 0; k < ln.pts.length - 1; k++) {
          const a = ln.pts[k], b = ln.pts[k + 1], pa = cam.project(a.p), pb = cam.project(b.p), m = Math.max(1, Math.ceil(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / step));
          for (let s = 0; s < m; s++) { const t = s / m; fine.push({ p: add(a.p, mul(sub(b.p, a.p), t)), n: a.n && b.n ? norm(add(mul(a.n, 1 - t), mul(b.n, t))) : null }); }
        }
        if (ln.pts.length) fine.push(ln.pts[ln.pts.length - 1]);
        for (const q of fine) {
          const [x, y, z] = cam.project(q.p);
          let seen = ln.kind !== 'hidden' && (!q.n || cam.facing(q.p, q.n) > 0);
          // a form with a clip box [x0, y0, x1, y1] on the sheet draws only there (still hiding
          // what's behind it everywhere): context, like the edge of a shell a limb goes under
          if (seen && f.clip && (x < f.clip[0] || y < f.clip[1] || x > f.clip[2] || y > f.clip[3])) seen = false;
          if (seen) {
            // hidden by another, nearer form here?
            const xi = Math.round(x), yi = Math.round(y);
            if (xi >= 0 && yi >= 0 && xi < W && yi < H) { const c = yi * W + xi, o = owner[c]; if (o !== id && o >= 0 && !mine.includes(o) && zbuf[c] < z - 0.5 - z * 0.002) seen = false; }
          }
          let k = seen ? ln.kind : 'hidden';
          // an outline where this form passes in front of another reads heavier
          if (seen && k === 'silhouette') {
            const xi = Math.round(x), yi = Math.round(y);
            for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3]]) { const xx = xi + dx, yy = yi + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const c = yy * W + xx, o = owner[c]; if (o >= 0 && o !== id && !mine.includes(o) && zbuf[c] > z + 2 + z * 0.004) { k = 'overlap'; break; } }
          }
          if (k !== runKind) { const last = run[run.length - 1]; flush(); runKind = k; if (last) run.push(last); }
          run.push([x, y]);
        }
        flush();
      }
    });
    // (specks: a run a couple of cells long where a line just grazes another form)
    const long = l => { let t = 0; for (let k = 1; k < l.pts.length; k++) t += Math.hypot(l.pts[k][0] - l.pts[k - 1][0], l.pts[k][1] - l.pts[k - 1][1]); return t > 4; };
    return out.filter(l => (l.kind !== 'hidden' || hidden) && long(l));
  }

  // ---- drawing it with the pencil ----
  // weight: pencil pressure for each kind of line (silhouettes firmest,
  // contours lighter, hidden lines faint). Each line one stroke.
  async function pencil(polylines, { weight = { overlap: 0.95, silhouette: 0.65, edge: 0.45, meet: 0.6, contour: 0.28, hidden: 0.12, gesture: 0.25 }, framesPerSeg = 1, every = 3 } = {}) {
    const S = sim, V = S.values;
    S.tool('pencil');
    for (const l of polylines) {
      const w = weight[l.kind] ?? 0.4, pts = l.pts.filter((_, k) => k % every === 0 || k === l.pts.length - 1);
      if (pts.length < 2) continue;
      // ease in and out over the first and last few points, as a drawn line does
      await S.path(pts.map(([x, y], k) => [x, y, w * Math.min(1, 0.4 + 0.6 * Math.min(k, pts.length - 1 - k) / 3)]), framesPerSeg);
    }
  }

  // A gesture: one quick line through points on the sheet, for the first
  // pass of a drawing (where the body goes and how each limb sweeps).
  const gestureLine = pts => ({ kind: 'gesture', pts: smoothPath(pts.map(p => [p[0], p[1], 0]), 10).map(p => [p[0], p[1]]) });

  return { camera, box, ellipsoid, sausage, prism, mass, meet, lines, pencil, gesture: gestureLine, rotation, smoothPath, math: { add, sub, mul, dot, cross, len, norm } };
}
