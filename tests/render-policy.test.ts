import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPixelRatio, needsFrame } from '../lib/render-policy.ts';
void test('high DPI touch screens do not multiply the GPU workload without limit', () => {
  assert.equal(renderPixelRatio(3, true), 1.25);
  assert.equal(renderPixelRatio(1, true), 1);
  assert.equal(renderPixelRatio(3, false), 1.5);
});
void test('idle and hidden scenes sleep while movement and recent interaction keep rendering', () => {
  assert.equal(needsFrame(2000, 0, false, true), false);
  assert.equal(needsFrame(2000, 0, true, true), true);
  assert.equal(needsFrame(2100, 2000, false, true), true);
  assert.equal(needsFrame(2100, 2000, true, false), false);
});
