import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fenceObstacles } from '../lib/fence-geometry.ts';
import { moveSafely, type Point } from '../lib/spatial.ts';

const boundary: Point[] = [[-20, -20], [20, -20], [20, 20], [-20, 20]];

void test('fences stop walkers while a deliberate entrance stays open', () => {
  const obstacles = fenceObstacles([
    { points: [[0, -10], [0, -2]] },
    { points: [[0, 2], [0, 10]] },
  ]);
  assert.ok(moveSafely([-3, 6], [6, 0], boundary, obstacles)[0] < 0);
  assert.deepEqual(moveSafely([-3, 0], [6, 0], boundary, obstacles), [3, 0]);
});

void test('a closed enclosure blocks its final edge without filling the courtyard', () => {
  const obstacles = fenceObstacles([
    { points: [[0, 0], [8, 0], [8, 8], [0, 8]], closed: true },
  ]);
  assert.ok(moveSafely([-3, 4], [6, 0], boundary, obstacles)[0] < 0);
  assert.deepEqual(moveSafely([2, 4], [4, 0], boundary, obstacles), [6, 4]);
});

void test('removing a fence leaves no invisible collision at its former position', () => {
  const obstacles = fenceObstacles([]);
  assert.deepEqual(moveSafely([-3, 6], [6, 0], boundary, obstacles), [3, 6]);
});
