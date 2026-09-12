export type Point = [number, number];
export function project(lon: number, lat: number, origin: Point): Point {
  return [
    (lon - origin[0]) * 111320 * Math.cos((origin[1] * Math.PI) / 180),
    -(lat - origin[1]) * 111320,
  ];
}
export function inside([x, z]: Point, ring: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i],
      [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
      hit = !hit;
  }
  return hit;
}
export function distanceToEdge(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
export function walkable(
  p: Point,
  boundary: Point[],
  obstacles: Point[][],
  radius = 0.6,
): boolean {
  if (!inside(p, boundary)) return false;
  const nearEdge = (ring: Point[]) =>
    ring.some(
      (a, i) => distanceToEdge(p, a, ring[(i + 1) % ring.length]) < radius,
    );
  return (
    !nearEdge(boundary) &&
    !obstacles.some((ring) => inside(p, ring) || nearEdge(ring))
  );
}
export function moveSafely(
  from: Point,
  delta: Point,
  boundary: Point[],
  obstacles: Point[][],
  radius = 0.6,
): Point {
  // One broad-phase query per movement keeps long collision substeps local.
  const minX = Math.min(from[0], from[0] + delta[0]) - radius;
  const maxX = Math.max(from[0], from[0] + delta[0]) + radius;
  const minZ = Math.min(from[1], from[1] + delta[1]) - radius;
  const maxZ = Math.max(from[1], from[1] + delta[1]) + radius;
  const nearby = obstacles.filter((ring) => {
    const b = boundsFor(ring);
    return b[0] <= maxX && b[2] >= minX && b[1] <= maxZ && b[3] >= minZ;
  });
  const n = Math.max(1, Math.ceil(Math.hypot(...delta) / 0.25));
  let p: Point = [...from];
  for (let i = 0; i < n; i++) {
    const nextX: Point = [p[0] + delta[0] / n, p[1]];
    if (walkable(nextX, boundary, nearby, radius)) p = nextX;
    const nextZ: Point = [p[0], p[1] + delta[1] / n];
    if (walkable(nextZ, boundary, nearby, radius)) p = nextZ;
  }
  return p;
}

const cachedBounds = new WeakMap<Point[], [number, number, number, number]>();
function boundsFor(ring: Point[]) {
  let bounds = cachedBounds.get(ring);
  if (!bounds) {
    bounds = [
      Math.min(...ring.map((p) => p[0])),
      Math.min(...ring.map((p) => p[1])),
      Math.max(...ring.map((p) => p[0])),
      Math.max(...ring.map((p) => p[1])),
    ];
    cachedBounds.set(ring, bounds);
  }
  return bounds;
}
