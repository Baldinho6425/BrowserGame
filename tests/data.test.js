import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARS, THEMES, ACHIEVEMENTS, carById, themeById, upgradeCost, UPGRADE_MAX_LEVEL } from '../js/data.js';

test('carById returns the matching car', () => {
  assert.equal(carById('red').name, 'Vermelho Veloz');
});

test('carById falls back to the first car for an unknown id', () => {
  assert.equal(carById('does-not-exist'), CARS[0]);
});

test('themeById returns the matching theme', () => {
  assert.equal(themeById('desert').name, 'Deserto');
});

test('themeById falls back to the first theme for an unknown id', () => {
  assert.equal(themeById('does-not-exist'), THEMES[0]);
});

test('upgradeCost increases with level', () => {
  const costs = Array.from({ length: UPGRADE_MAX_LEVEL }, (_, level) => upgradeCost(level));
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i] > costs[i - 1]);
  assert.equal(upgradeCost(0), 120);
});

test('every achievement has a unique id', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every car and theme has a unique id', () => {
  assert.equal(new Set(CARS.map((c) => c.id)).size, CARS.length);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
});
