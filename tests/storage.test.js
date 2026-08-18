import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeFakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

globalThis.localStorage = makeFakeLocalStorage();
const { loadJSON, saveJSON } = await import('../js/storage.js');

test('saveJSON + loadJSON round-trips a value', () => {
  saveJSON('coins', 42);
  assert.equal(loadJSON('coins', 0), 42);
});

test('loadJSON returns the fallback when nothing is stored', () => {
  assert.deepEqual(loadJSON('never-set', ['yellow']), ['yellow']);
});

test('loadJSON returns the fallback on corrupted JSON instead of throwing', () => {
  globalThis.localStorage.setItem('corridaturbo.broken', '{not json');
  assert.equal(loadJSON('broken', 'fallback'), 'fallback');
});

test('keys are namespaced so they cannot collide with unrelated localStorage entries', () => {
  saveJSON('coins', 7);
  assert.equal(globalThis.localStorage.getItem('coins'), null);
  assert.equal(globalThis.localStorage.getItem('corridaturbo.coins'), '7');
});
