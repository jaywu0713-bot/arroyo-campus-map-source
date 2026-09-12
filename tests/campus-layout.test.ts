import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { walkable, moveSafely, type Point } from '../lib/spatial.ts';
import { fenceObstacles } from '../lib/fence-geometry.ts';

const campus = JSON.parse(fs.readFileSync('data/campus.json', 'utf8'));
const fences = JSON.parse(fs.readFileSync('data/fences.json', 'utf8'));
const arrivals = { ...campus.walkSpawns, ...fences.walkArrivalOverrides };
const structuralObstacles: Point[][] = [
  ...JSON.parse(fs.readFileSync('data/entrance-obstacles.json', 'utf8')),
  ...campus.buildings.map((b: { rings: Point[][] }) => b.rings[0]),
  ...campus.posts.map((p: { ring: Point[] }) => p.ring),
  ...campus.landscapeObstacles,
];
const obstacles: Point[][] = [...structuralObstacles, ...fenceObstacles(fences.fences)];
void test('covered links and classroom eaves are clear of walls and columns', () => {
  // User-marked fences can intentionally gate a covered route. Check the
  // underlying corridor structure here; actual access is audited below.
  assert.ok(
    campus.walkways?.some((w: { kind: string }) => w.kind === 'covered'),
  );
  assert.ok(campus.walkways?.some((w: { kind: string }) => w.kind === 'eave'));
  for (const path of campus.walkways) {
    for (let i = 1; i < path.points.length; i++) {
      const a: Point = path.points[i - 1],
        b: Point = path.points[i];
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5);
      for (let j = 0; j <= steps; j++) {
        const p: Point = [
          a[0] + ((b[0] - a[0]) * j) / steps,
          a[1] + ((b[1] - a[1]) * j) / steps,
        ];
        assert.ok(
          walkable(p, campus.boundary, structuralObstacles, 0.6),
          `${path.id} blocked at ${p.join(', ')}`,
        );
      }
      const moved = moveSafely(
        a,
        [b[0] - a[0], b[1] - a[1]],
        campus.boundary,
        structuralObstacles,
      );
      assert.ok(
        Math.hypot(moved[0] - b[0], moved[1] - b[1]) < 0.02,
        `${path.id} cannot be walked end to end`,
      );
    }
  }
});
void test('every listed destination has an outdoor arrival clear of buildings and columns', () => {
  assert.ok(campus.walkSpawns);
  const all = obstacles;
  for (const place of campus.landmarks) {
    const p = arrivals[place.id];
    assert.ok(
      p && walkable(p, campus.boundary, all, 0.6),
      `${place.id} arrival blocked`,
    );
  }
  assert.ok(walkable(arrivals.entrance, campus.boundary, all, 0.6));
});

void test('all destination arrivals are connected to the entrance by outdoor walking', () => {
  // One-metre grid catches enclosed or isolated arrival points. Use local
  // obstacles for the audit, and the actual movement function for each edge.
  const boundary: Point[] = campus.boundary;
  const minX = Math.floor(Math.min(...boundary.map((p) => p[0])));
  const minZ = Math.floor(Math.min(...boundary.map((p) => p[1])));
  const width = Math.ceil(Math.max(...boundary.map((p) => p[0]))) - minX + 1;
  const height = Math.ceil(Math.max(...boundary.map((p) => p[1]))) - minZ + 1;
  const bins = new Map<string, Point[][]>();
  for (const ring of obstacles) {
    for (
      let x = Math.floor((Math.min(...ring.map((p) => p[0])) - 2) / 10);
      x <= Math.floor((Math.max(...ring.map((p) => p[0])) + 2) / 10);
      x++
    )
      for (
        let z = Math.floor((Math.min(...ring.map((p) => p[1])) - 2) / 10);
        z <= Math.floor((Math.max(...ring.map((p) => p[1])) + 2) / 10);
        z++
      ) {
        const key = `${x},${z}`;
        bins.set(key, [...(bins.get(key) || []), ring]);
      }
  }
  const local = (p: Point) =>
    bins.get(`${Math.floor(p[0] / 10)},${Math.floor(p[1] / 10)}`) || [];
  const key = (p: Point) => (p[1] - minZ) * width + p[0] - minX;
  const free = new Int8Array(width * height);
  const isFree = (p: Point) => {
    if (
      p[0] < minX ||
      p[0] >= minX + width ||
      p[1] < minZ ||
      p[1] >= minZ + height
    )
      return false;
    const k = key(p);
    if (!free[k]) free[k] = walkable(p, boundary, local(p)) ? 1 : -1;
    return free[k] === 1;
  };
  const reached = new Uint8Array(width * height);
  const entrance: Point = arrivals.entrance;
  const start: Point = [Math.round(entrance[0]), Math.round(entrance[1])];
  assert.ok(isFree(start));
  const queue: Point[] = [start];
  reached[key(start)] = 1;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next: Point = [p[0] + dx, p[1] + dz];
      if (!isFree(next) || reached[key(next)]) continue;
      const moved = moveSafely(p, [dx, dz], boundary, local(p));
      if (Math.hypot(moved[0] - next[0], moved[1] - next[1]) > 0.01) continue;
      reached[key(next)] = 1;
      queue.push(next);
    }
  }
  for (const [id, value] of Object.entries(arrivals)) {
    const p = value as Point;
    let connected = false;
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const q: Point = [Math.round(p[0]) + dx, Math.round(p[1]) + dz];
        if (!isFree(q) || !reached[key(q)]) continue;
        const moved = moveSafely(
          q,
          [p[0] - q[0], p[1] - q[1]],
          boundary,
          obstacles,
        );
        if (Math.hypot(moved[0] - p[0], moved[1] - p[1]) < 0.01)
          connected = true;
      }
    assert.ok(connected, `${id} has no walking route from the entrance`);
  }
});

void test('music frontage is enclosed at the roadside, not across its yard', () => {
  assert.ok(walkable([227,40],campus.boundary,obstacles),'Hardscape yard should be accessible');
  const moved=moveSafely([204,46],[0,13],campus.boundary,obstacles);
  assert.ok(moved[1]<53,'Annotated closed frontage must block walking');
});

void test('language rear classroom blocks walking while the removed strip is open', () => {
  assert.ok(!walkable([147.8,125],campus.boundary,obstacles), 'Added rear classrooms must have wall collision');
  assert.ok(walkable([141,120],campus.boundary,obstacles), 'Removed building strip must be outdoor space');
  assert.ok(!walkable([203.3,124.8],campus.boundary,obstacles), 'Reference tree trunk must block walking');
  assert.ok(walkable([178,124],campus.boundary,obstacles), 'Middle of language lawn must remain open');
});
