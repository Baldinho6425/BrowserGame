export function hexToRgb(hex) {
  const num = parseInt(hex.slice(1), 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

export function shadeColor(hex, percent) {
  const [r0, g0, b0] = hexToRgb(hex);
  const r = Math.min(255, Math.max(0, r0 + percent));
  const g = Math.min(255, Math.max(0, g0 + percent));
  const b = Math.min(255, Math.max(0, b0 + percent));
  return `rgb(${r},${g},${b})`;
}

export function lerpColor(hexA, hexB, f) {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const r = Math.round(r1 + (r2 - r1) * f);
  const g = Math.round(g1 + (g2 - g1) * f);
  const b = Math.round(b1 + (b2 - b1) * f);
  return `rgb(${r},${g},${b})`;
}
