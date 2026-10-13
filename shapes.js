// Turns a shape + size into a "layout": cells with grid positions and neighbour lists.
// Shapes are outlines cut out of a square grid. The engine never sees the shape.
const TAU = Math.PI * 2;
const regular = (n, rot = -Math.PI / 2) =>
  Array.from({ length: n }, (_, k) => [Math.cos(rot + TAU * k / n), Math.sin(rot + TAU * k / n)]);
function star(points, inner) {
  const v = [];
  for (let k = 0; k < points * 2; k++) {
    const r = k % 2 ? inner : 1, a = -Math.PI / 2 + Math.PI * k / points;
    v.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return v;
}

export const SHAPES = {
  rect:     { label: 'Rectangle' },
  triangle: { label: 'Triangle',  poly: regular(3) },
  pentagon: { label: 'Pentagon',  poly: regular(5) },
  hexagon:  { label: 'Hexagon',   poly: regular(6) },
  heptagon: { label: 'Heptagon',  poly: regular(7) },
  star:     { label: 'Star',      poly: star(5, 0.42) },
};

function area(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function inside(x, y, p) { // ray casting
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Grid size that gives roughly `target` cells, so difficulty feels equal across shapes.
export function gridSizeFor(shape, target) {
  const frac = area(SHAPES[shape].poly) / 4; // fraction of the bounding square covered
  return Math.max(7, Math.round(Math.sqrt(target / frac)));
}

function largestComponent(pts) {
  const key = (x, y) => x + ',' + y;
  const left = new Map(pts.map(p => [key(p[0], p[1]), p]));
  let best = [];
  while (left.size) {
    const [k0, p0] = left.entries().next().value;
    left.delete(k0);
    const comp = [p0], st = [p0];
    while (st.length) {
      const [x, y] = st.pop();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = key(x + dx, y + dy), q = left.get(k);
        if (q) { left.delete(k); comp.push(q); st.push(q); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  return best;
}

export function buildLayout(shape, w, h) {
  let pts = [];
  if (shape === 'rect' || !SHAPES[shape]?.poly) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pts.push([x, y]);
  } else {
    const N = w, poly = SHAPES[shape].poly;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
      if (inside((x + .5) / N * 2 - 1, (y + .5) / N * 2 - 1, poly)) pts.push([x, y]);
    pts = largestComponent(pts); // drop stray cells (thin star tips etc.)
  }
  const minX = Math.min(...pts.map(p => p[0])), minY = Math.min(...pts.map(p => p[1]));
  pts = pts.map(([x, y]) => [x - minX, y - minY]);
  const cols = Math.max(...pts.map(p => p[0])) + 1, rows = Math.max(...pts.map(p => p[1])) + 1;
  pts.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const grid = new Int32Array(cols * rows).fill(-1);
  pts.forEach(([x, y], i) => { grid[y * cols + x] = i; });
  const neighbors = pts.map(([x, y]) => {
    const r = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && grid[ny * cols + nx] >= 0) r.push(grid[ny * cols + nx]);
    }
    return r;
  });
  return { cols, rows, cells: pts.map(([x, y]) => ({ x, y })), neighbors };
}
