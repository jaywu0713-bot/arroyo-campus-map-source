import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, inside, moveSafely, type Point } from '../lib/spatial.ts';

const boundary: Point[] = [
  [-20, -20],
  [20, -20],
  [20, 20],
  [-20, 20],
];
const building: Point[] = [
  [0, -4],
  [4, -4],
  [4, 4],
  [0, 4],
];

void test('projection keeps east positive and north negative in a meter-based ground plane', () => {
  const east = project(-118.022, 34.094, [-118.023, 34.094]);
  const north = project(-118.023, 34.095, [-118.023, 34.094]);
  assert.ok(east[0] > 90 && east[0] < 94);
  assert.ok(Math.abs(east[1]) < 0.01);
  assert.ok(north[1] < -110 && north[1] > -112);
});
void test('concave footprints do not block the open courtyard', () => {
  const courtyard: Point[] = [
    [0, 0],
    [8, 0],
    [8, 8],
    [6, 8],
    [6, 2],
    [2, 2],
    [2, 8],
    [0, 8],
  ];
  assert.equal(inside([1, 5], courtyard), true);
  assert.equal(inside([4, 5], courtyard), false);
});
void test('walking stays outside buildings, even with a step crossing the whole footprint', () => {
  const moved = moveSafely([-5, 0], [15, 0], boundary, [building]);
  assert.ok(moved[0] <= -0.59 && moved[0] > -5);
});
void test('walking slides along walls and stays inside the campus', () => {
  const moved = moveSafely([-1, 0], [3, 3], boundary, [building]);
  assert.ok(moved[0] <= -0.59);
  assert.ok(moved[1] > 2.5);
  assert.ok(moveSafely([19, 0], [5, 0], boundary, [])[0] < 20);
});
void test('a thin corridor column blocks a long step but the open aisle stays usable', () => {
  const column: Point[] = [
    [0.85, -0.15],
    [1.15, -0.15],
    [1.15, 0.15],
    [0.85, 0.15],
  ];
  assert.ok(moveSafely([-5, 0], [15, 0], boundary, [column])[0] < 0.26);
  const along = moveSafely([-5, 2], [15, 0], boundary, [column]);
  assert.ok(along[0] > 9.99);
});
