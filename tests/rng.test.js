import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedFromString, mulberry32, todayStr } from '../js/rng.js';

test('seedFromString is deterministic for the same input', () => {
  assert.equal(seedFromString('daily-2026-08-17'), seedFromString('daily-2026-08-17'));
});

test('seedFromString differs for different inputs', () => {
  assert.notEqual(seedFromString('daily-2026-08-17'), seedFromString('daily-2026-08-18'));
});

test('mulberry32 produces the same sequence for the same seed (daily challenge determinism)', () => {
  const seed = seedFromString('daily-2026-08-17');
  const seqA = Array.from({ length: 20 }, mulberry32(seed));
  const seqB = Array.from({ length: 20 }, mulberry32(seed));
  assert.deepEqual(seqA, seqB);
});

test('mulberry32 stays within [0, 1)', () => {
  const rand = mulberry32(12345);
  for (let i = 0; i < 500; i++) {
    const v = rand();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('todayStr formats a fixed date as YYYY-MM-DD', () => {
  assert.equal(todayStr(new Date(2026, 7, 17)), '2026-08-17');
  assert.equal(todayStr(new Date(2026, 0, 5)), '2026-01-05');
});
