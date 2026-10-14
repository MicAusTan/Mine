// Small polygon helpers shared by the tilings and the SVG renderer (no DOM).
export function signedArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function centroid(p) {
  const A = signedArea(p);
  if (Math.abs(A) < 1e-12) return [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length];
  let cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    const c = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * c; cy += (y1 + y2) * c;
  }
  return [cx / (6 * A), cy / (6 * A)];
}

export function distToPolyline(pt, p) {
  let best = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    let t = l2 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(a[0] + t * dx - pt[0], a[1] + t * dy - pt[1]));
  }
  return best;
}

export function inPolygon(x, y, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Classic bevel for any polygon: an inset outline split into "lit" edges (facing
// up-left) and "shadow" edges. Returns segments as [x1,y1,x2,y2].
const LIGHT = [-0.5, -0.85];
export function bevel(pts, d) {
  const n = pts.length, sgn = signedArea(pts) > 0 ? 1 : -1;
  const nin = new Array(n);
  let prev = [0, 0];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < 1e-12) { nin[i] = prev; continue; }
    const tx = dx / len, ty = dy / len;
    nin[i] = sgn > 0 ? [-ty, tx] : [ty, -tx]; // inward normal
    prev = nin[i];
  }
  const ins = pts.map((p, i) => {
    const a = nin[(i - 1 + n) % n], b = nin[i];
    const k = d / Math.max(1 + a[0] * b[0] + a[1] * b[1], 0.3);
    return [p[0] + (a[0] + b[0]) * k, p[1] + (a[1] + b[1]) * k];
  });
  const light = [], dark = [];
  for (let i = 0; i < n; i++) {
    const a = ins[i], b = ins[(i + 1) % n], o = nin[i];
    (-(o[0] * LIGHT[0] + o[1] * LIGHT[1]) > 0 ? light : dark).push([a[0], a[1], b[0], b[1]]);
  }
  return { light, dark };
}
