const NS = 'corridaturbo.';

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

export function saveJSON(key, value) {
  localStorage.setItem(NS + key, JSON.stringify(value));
}
