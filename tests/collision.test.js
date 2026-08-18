import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rectsOverlap } from '../js/collision.js';

test('detects overlapping rectangles', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 5, y: 5, w: 10, h: 10 };
  assert.equal(rectsOverlap(a, b), true);
});

test('detects non-overlapping rectangles', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 20, y: 20, w: 10, h: 10 };
  assert.equal(rectsOverlap(a, b), false);
});

test('rectangles that only touch at the edge do not count as overlap', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 10, y: 0, w: 10, h: 10 };
  assert.equal(rectsOverlap(a, b), false);
});

test('a rectangle fully inside another overlaps', () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };
  const b = { x: 40, y: 40, w: 10, h: 10 };
  assert.equal(rectsOverlap(a, b), true);
});
