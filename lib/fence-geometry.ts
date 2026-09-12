import type { Point } from './spatial.ts';

export type FencePath = { points: number[][]; closed?: boolean };

export function fenceObstacles(records: FencePath[]): Point[][] {
  const obstacles: Point[][] = [];
  for (const record of records) {
    const points = record.points;
    const count = points.length - 1 + (record.closed ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if (!a || !b) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const length = Math.hypot(dx, dz);
      if (length < 0.001) continue;
      const ox = -dz / length * 0.09, oz = dx / length * 0.09;
      obstacles.push([
        [a[0] + ox, a[1] + oz], [b[0] + ox, b[1] + oz],
        [b[0] - ox, b[1] - oz], [a[0] - ox, a[1] - oz],
      ]);
    }
  }
  return obstacles;
}
