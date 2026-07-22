// Geometry for group outlines: a rounded outline that encloses a set of points.
//
// The outline is the convex hull of the points offset outward by `pad`, with
// circular arcs at the corners (the Minkowski sum of the hull with a disk).
// Degenerate cases fall out naturally:
//   - 1 point  -> a circle
//   - collinear points -> the hull is a segment, giving a capsule/stadium
//   - 3+ points -> a rounded convex polygon

export interface Pt {
  x: number;
  y: number;
}

function dedupe(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    if (!out.some((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01)) out.push(p);
  }
  return out;
}

function convexHull(pts: Pt[]): Pt[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length <= 2) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0)
      lower.pop();
    lower.push(pt);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0)
      upper.pop();
    upper.push(pt);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function circlePath(c: Pt, r: number): string {
  return (
    `M ${c.x - r} ${c.y} ` +
    `a ${r} ${r} 0 1 0 ${2 * r} 0 ` +
    `a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`
  );
}

function centroid(pts: Pt[]): Pt {
  const c = { x: 0, y: 0 };
  for (const p of pts) {
    c.x += p.x;
    c.y += p.y;
  }
  return { x: c.x / pts.length, y: c.y / pts.length };
}

/** SVG path `d` for an outline enclosing `points`, offset outward by `pad`. */
export function groupOutlinePath(points: Pt[], pad: number): string {
  const uniq = dedupe(points);
  if (uniq.length === 0) return "";
  if (uniq.length === 1) return circlePath(uniq[0], pad);

  const hull = convexHull(uniq);
  if (hull.length === 1) return circlePath(hull[0], pad);

  const h = hull.length;
  const cen = centroid(hull);

  // Outward unit normal for each edge (perpendicular pointing away from centroid).
  const normals: Pt[] = [];
  for (let i = 0; i < h; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % h];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    let nx = dy;
    let ny = -dx;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    // Flip if it points toward the centroid.
    if ((mx + nx - cen.x) ** 2 + (my + ny - cen.y) ** 2 < (mx - cen.x) ** 2 + (my - cen.y) ** 2) {
      nx = -nx;
      ny = -ny;
    }
    normals.push({ x: nx, y: ny });
  }

  // Sweep direction so corner arcs bulge outward: derived from the turn sign.
  const turn =
    normals[0].x * normals[1 % h].y - normals[0].y * normals[1 % h].x;
  const sweep = turn <= 0 ? 1 : 0;

  let d = "";
  for (let i = 0; i < h; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % h];
    const n = normals[i];
    const nNext = normals[(i + 1) % h];
    const sx = a.x + n.x * pad;
    const sy = a.y + n.y * pad;
    const ex = b.x + n.x * pad;
    const ey = b.y + n.y * pad;
    const nextStartX = b.x + nNext.x * pad;
    const nextStartY = b.y + nNext.y * pad;
    if (i === 0) d += `M ${round(sx)} ${round(sy)} `;
    d += `L ${round(ex)} ${round(ey)} `;
    d += `A ${pad} ${pad} 0 0 ${sweep} ${round(nextStartX)} ${round(nextStartY)} `;
  }
  return `${d}Z`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
