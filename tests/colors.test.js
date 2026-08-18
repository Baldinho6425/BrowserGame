import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, shadeColor, lerpColor } from '../js/colors.js';

test('hexToRgb parses a hex color into [r, g, b]', () => {
  assert.deepEqual(hexToRgb('#ffcc00'), [255, 204, 0]);
  assert.deepEqual(hexToRgb('#000000'), [0, 0, 0]);
});

test('shadeColor lightens/darkens and clamps to the 0-255 range', () => {
  assert.equal(shadeColor('#000000', -50), 'rgb(0,0,0)');
  assert.equal(shadeColor('#ffffff', 50), 'rgb(255,255,255)');
  assert.equal(shadeColor('#808080', 10), 'rgb(138,138,138)');
});

test('lerpColor interpolates between two colors (day/night cycle)', () => {
  assert.equal(lerpColor('#000000', '#ffffff', 0), 'rgb(0,0,0)');
  assert.equal(lerpColor('#000000', '#ffffff', 1), 'rgb(255,255,255)');
  assert.equal(lerpColor('#000000', '#ffffff', 0.5), 'rgb(128,128,128)');
});
