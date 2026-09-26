// Magnet shapes, as magnetic charges (the pole model) at the paper's grid
// scale (1 cell = 0.2 mm). A magnet is { shape, x, y, angle, moment }:
// position in cells, angle in radians, moment's sign = polarity (which pole
// faces up, or which end is north for a bar). Each shape returns charges
// [x, y, depth, q] with depth measured below the paper surface in cells.

const MM = 5;   // cells per mm

// Sizes (mm) chosen to look like common hobby magnets.
export const SHAPES = {
  disc:      { name: 'Disc',          radius: 4,  thick: 3 },
  bar:       { name: 'Bar (flat)',    length: 25, width: 6 },
  horseshoe: { name: 'Horseshoe',     gap: 10,    poleR: 3 },
  ring:      { name: 'Ring',          radius: 8,  thick: 3 },
  strip:     { name: 'Rod / strip',   length: 30, thick: 3 },
  sheet:     { name: 'Fridge sheet',  w: 30, h: 20, pitch: 2, gap: 0.4 },
};

// Rotate a local offset (u along the magnet, v across) into grid cells.
function place(mg, u, v) {
  const c = Math.cos(mg.angle ?? 0), s = Math.sin(mg.angle ?? 0);
  return [mg.x + (u * c - v * s) * MM, mg.y + (u * s + v * c) * MM];
}

// Charges for one magnet, with depth = distance (mm) from paper to its top.
// Each charge is a horizontal segment [ax, ay, bx, by, depth, q] (a point
// charge has a == b), so stripes, rods and rings are continuous.
export function magnetCharges(mg, depth) {
  const sign = Math.sign(mg.moment || 1);
  // A fridge sheet is laid directly against the back of the paper: its
  // stripe field decays within about one stripe pitch, so any real gap
  // would wash the stripes out entirely.
  const d = (mg.shape === 'sheet' ? Math.min(depth, SHAPES.sheet.gap) : depth) * MM;
  const out = [];
  const seg = (u1, v1, u2, v2, dz, q) => {
    const [ax, ay] = place(mg, u1, v1), [bx, by] = place(mg, u2, v2);
    out.push([ax, ay, bx, by, d + dz * MM, q * sign]);
  };
  const pt = (u, v, dz, q) => seg(u, v, u, v, dz, q);
  const loop = (cu, cv, r, n, dz, q) => {
    for (let k = 0; k < n; k++) {
      const a1 = k / n * Math.PI * 2, a2 = (k + 1) / n * Math.PI * 2;
      seg(cu + r * Math.cos(a1), cv + r * Math.sin(a1), cu + r * Math.cos(a2), cv + r * Math.sin(a2), dz, q / n);
    }
  };
  const S = SHAPES[mg.shape] ?? SHAPES.disc;
  switch (mg.shape) {
    case 'bar':
      // Magnetised along its length, lying flat: each end face a line of
      // charge across the bar's width, north at one end, south at the other.
      seg(S.length / 2, -S.width / 2, S.length / 2, S.width / 2, S.width / 2, 1);
      seg(-S.length / 2, -S.width / 2, -S.length / 2, S.width / 2, S.width / 2, -1);
      break;
    case 'horseshoe':
      // Both poles face up, a gap apart; the yoke carries the return path.
      loop(S.gap / 2, 0, S.poleR * 0.6, 8, 0, 0.7); pt(S.gap / 2, 0, 0, 0.3);
      loop(-S.gap / 2, 0, S.poleR * 0.6, 8, 0, -0.7); pt(-S.gap / 2, 0, 0, -0.3);
      break;
    case 'ring':
      // Axially magnetised ring: north face on top, south face below.
      loop(0, 0, S.radius, 24, 0, 1);
      loop(0, 0, S.radius, 24, S.thick, -1);
      break;
    case 'strip':
      // A rod lying flat, magnetised through its thickness (top face north).
      seg(-S.length / 2, 0, S.length / 2, 0, 0, 1);
      seg(-S.length / 2, 0, S.length / 2, 0, S.thick, -1);
      break;
    case 'sheet': {
      // Flexible fridge magnet: stripes of alternating poles on one face.
      const stripes = Math.round(S.w / S.pitch);
      for (let k = 0; k < stripes; k++) {
        const u = (k + 0.5) * S.pitch - S.w / 2;
        seg(u, -S.h / 2, u, S.h / 2, 0, k % 2 ? -1 : 1);
      }
      break;
    }
    default:
      // Disc standing on its face: north face on top, south face below,
      // each a centre charge plus a ring for a finite face.
      pt(0, 0, 0, 0.4); loop(0, 0, S.radius * 0.6, 8, 0, 0.6);
      pt(0, 0, S.thick, -0.4); loop(0, 0, S.radius * 0.6, 8, S.thick, -0.6);
  }
  return out;
}

// |B|^2 at a surface point from a list of segment charges (same formula as
// the shader's magField).
function phiAt(charges, x, y) {
  let B = [0, 0, 0];
  for (const [ax, ay, bx, by, z, q] of charges) {
    const A = [ax, ay, -z], E = [bx, by, -z], P = [x, y, 0];
    const AE = [E[0] - A[0], E[1] - A[1], 0], L = Math.hypot(AE[0], AE[1]);
    const PA = [P[0] - A[0], P[1] - A[1], P[2] - A[2]];
    if (L < 1e-3) {
      const R2 = PA[0] ** 2 + PA[1] ** 2 + PA[2] ** 2, f = q / (R2 * Math.sqrt(R2));
      B = B.map((b, i) => b + f * PA[i]);
    } else {
      const u = AE.map(v => v / L), sP = PA[0] * u[0] + PA[1] * u[1];
      const perp = [PA[0] - sP * u[0], PA[1] - sP * u[1], PA[2]];
      const rho = Math.max(Math.hypot(...perp), 1e-3), t1 = -sP, t2 = L - sP;
      const r1 = Math.hypot(t1, rho), r2 = Math.hypot(t2, rho), lam = q / L;
      const a = (t2 / r2 - t1 / r1) / rho / rho, b = 1 / r2 - 1 / r1;
      B = B.map((v, i) => v + lam * (perp[i] * a + u[i] * b));
    }
  }
  return B[0] ** 2 + B[1] ** 2 + B[2] ** 2;
}

// All charges for a set of magnets, scaled so a disc magnet gives |B|^2 = 1
// directly above its centre at this depth.
export function buildCharges(magnets, depth, max) {
  const ref = phiAt(magnetCharges({ shape: 'disc', x: 0, y: 0, moment: 1 }, depth), 0, 0);
  const k = 1 / Math.sqrt(ref || 1);
  const out = [];
  for (const mg of magnets) for (const c of magnetCharges(mg, depth)) {
    if (out.length >= max) break;
    out.push([c[0], c[1], c[2], c[3], c[4], c[5] * k]);
  }
  return out;
}

// Overlay outline of a magnet, drawn in grid coordinates.
export function drawMagnet(g, mg) {
  const north = (mg.moment ?? 1) > 0;
  const red = 'rgba(210, 70, 60, 0.9)', blue = 'rgba(60, 100, 210, 0.9)';
  const col = north ? red : blue, other = north ? blue : red;
  const S = SHAPES[mg.shape] ?? SHAPES.disc;
  g.save();
  g.translate(mg.x, mg.y);
  g.rotate(mg.angle ?? 0);
  g.lineWidth = 2;
  g.setLineDash([4, 3]);
  g.font = 'bold 13px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const label = (t, x, y, c) => { g.fillStyle = c; g.fillText(t, x, y); };
  switch (mg.shape) {
    case 'bar': {
      const L = S.length * MM, Wd = S.width * MM;
      g.strokeStyle = col; g.strokeRect(0, -Wd / 2, L / 2, Wd);
      g.strokeStyle = other; g.strokeRect(-L / 2, -Wd / 2, L / 2, Wd);
      label(north ? 'N' : 'S', L / 2 - 10, 0, col); label(north ? 'S' : 'N', -L / 2 + 10, 0, other);
      break;
    }
    case 'horseshoe': {
      const gp = S.gap * MM / 2, r = S.poleR * MM;
      g.strokeStyle = col; g.beginPath(); g.arc(gp, 0, r, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = other; g.beginPath(); g.arc(-gp, 0, r, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(120,120,120,0.6)'; g.beginPath(); g.arc(0, 0, gp, 0, Math.PI, false); g.stroke();
      label(north ? 'N' : 'S', gp, 0, col); label(north ? 'S' : 'N', -gp, 0, other);
      break;
    }
    case 'ring': {
      g.strokeStyle = col;
      g.beginPath(); g.arc(0, 0, S.radius * MM, 0, Math.PI * 2); g.stroke();
      label(north ? 'N' : 'S', S.radius * MM + 12, -12, col);
      break;
    }
    case 'strip': {
      const L = S.length * MM;
      g.strokeStyle = col; g.strokeRect(-L / 2, -6, L, 12);
      label(north ? 'N' : 'S', L / 2 + 12, -12, col);
      break;
    }
    case 'sheet': {
      const w = S.w * MM, h = S.h * MM, n = Math.round(S.w / S.pitch);
      for (let k = 0; k < n; k++) {
        g.strokeStyle = (k % 2 ? other : col).replace('0.9', '0.45');
        const u = -w / 2 + k * S.pitch * MM;
        g.strokeRect(u, -h / 2, S.pitch * MM, h);
      }
      break;
    }
    default: {
      g.strokeStyle = col;
      g.beginPath(); g.arc(0, 0, S.radius * MM, 0, Math.PI * 2); g.stroke();
      label(north ? 'N' : 'S', S.radius * MM + 10, -S.radius * MM, col);
    }
  }
  g.restore();
}

// Is grid point (x, y) on this magnet (for picking)?
export function hitMagnet(mg, x, y) {
  const c = Math.cos(-(mg.angle ?? 0)), s = Math.sin(-(mg.angle ?? 0));
  const dx = x - mg.x, dy = y - mg.y;
  const u = (dx * c - dy * s) / MM, v = (dx * s + dy * c) / MM;
  const S = SHAPES[mg.shape] ?? SHAPES.disc;
  switch (mg.shape) {
    case 'bar': return Math.abs(u) < S.length / 2 && Math.abs(v) < S.width / 2 + 1;
    case 'horseshoe': return Math.abs(u) < S.gap / 2 + S.poleR && Math.abs(v) < S.poleR + 1;
    case 'ring': return Math.abs(Math.hypot(u, v) - S.radius) < 2.5;
    case 'strip': return Math.abs(u) < S.length / 2 && Math.abs(v) < 2;
    case 'sheet': return Math.abs(u) < S.w / 2 && Math.abs(v) < S.h / 2;
    default: return Math.hypot(u, v) < S.radius + 1;
  }
}
