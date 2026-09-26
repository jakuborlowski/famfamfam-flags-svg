// Mark James did not use official flag colours: measured against the originals,
// reds land on #ff0000, greens on #009900, yellows on golden yellow and blues get
// brighter, whatever the official shade. This transform reproduces that palette
// smoothly instead of snapping, so unusual colours (teal, maroon, sky blue)
// keep their identity. Set FAM_COLORS=official to skip it.

const NAMED = {
  red: '#ff0000', white: '#ffffff', black: '#000000', gold: '#ffd700', green: '#008000',
  blue: '#0000ff', yellow: '#ffff00', navy: '#000080', orange: '#ffa500', silver: '#c0c0c0',
  gray: '#808080', grey: '#808080', maroon: '#800000', purple: '#800080', lime: '#00ff00',
  olive: '#808000', teal: '#008080', aqua: '#00ffff', cyan: '#00ffff', fuchsia: '#ff00ff',
  magenta: '#ff00ff', brown: '#a52a2a', tan: '#d2b48c', khaki: '#f0e68c', crimson: '#dc143c',
  darkred: '#8b0000', darkgreen: '#006400', darkblue: '#00008b', royalblue: '#4169e1',
  dodgerblue: '#1e90ff', skyblue: '#87ceeb', lightblue: '#add8e6', firebrick: '#b22222',
  forestgreen: '#228b22', goldenrod: '#daa520', chocolate: '#d2691e', coral: '#ff7f50',
  ivory: '#fffff0', beige: '#f5f5dc', wheat: '#f5deb3', pink: '#ffc0cb', tomato: '#ff6347',
  orangered: '#ff4500', indigo: '#4b0082', violet: '#ee82ee', sienna: '#a0522d',
};

// Piecewise-linear parameter curves over hue (degrees), interpolated circularly.
// Anchors: red, orange, golden yellow (Mark's yellows sit near 50, not 60),
// green, azure, blue, magenta.
const HUES = [0,   22,  52,  120,  205, 235,  300];
const PULL = [0.9, 0.3, 0.8, 1.0,  0.5, 0.45, 0.5];   // how far hue snaps to the anchor
const VTGT = [1.0, 1.0, 1.0, 0.57, 1.0, 1.0,  0.8];   // brightness target
const VK   = [0.9, 0.8, 0.6, 0.35, 0.6, 0.35, 0.3];   // pull strength towards it
const KS   = 0.9;                                     // saturation push

function interp(h, ys) {
  const xs = [...HUES, 360], vs = [...ys, ys[0]];
  let i = 0; while (i < xs.length - 2 && h > xs[i + 1]) i++;
  const t = (h - xs[i]) / (xs[i + 1] - xs[i]);
  return vs[i] + (vs[i + 1] - vs[i]) * t;
}

export function rgbToHsv([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-9) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, mx > 1e-9 ? d / mx : 0, mx];
}
export function hsvToRgb([h, s, v]) {
  h = ((h % 360) + 360) % 360 / 60;
  const i = Math.floor(h), f = h - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
}

export function stylize([r, g, b]) {
  let [h, s, v] = rgbToHsv([r, g, b]);
  const gate = Math.min(1, Math.max(0, (s - 0.2) / 0.4)) * Math.min(1, Math.max(0, (v - 0.1) / 0.2));
  if (gate <= 0) return [r, g, b];
  let best = 0, bestD = 999;
  for (const a of HUES) { const d = ((h - a + 540) % 360) - 180; if (Math.abs(d) < Math.abs(bestD)) { bestD = d; best = a; } }
  const h2 = h - interp(h, PULL) * bestD * gate;
  const s2 = s + (1 - s) * KS * gate;
  const v2 = v + (interp(h, VTGT) - v) * interp(h, VK) * gate;
  return hsvToRgb([h2, Math.min(1, s2), Math.min(1, v2)]);
}

export function parseColor(str) {
  const s = str.trim().toLowerCase();
  if (s === 'none' || s === 'transparent' || s === 'currentcolor' || s.startsWith('url(')) return null;
  let hex = s.startsWith('#') ? s.slice(1) : NAMED[s];
  if (!hex) { if (/^rgb/.test(s) || /^hsl/.test(s)) throw new Error('unsupported colour ' + str); return null; }
  hex = hex.replace('#', '');
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
  if (hex.length !== 6 && hex.length !== 8) throw new Error('bad colour ' + str);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
export function toHex([r, g, b]) {
  return '#' + [r, g, b].map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');
}

// Rewrite every colour in an SVG fragment (fill/stroke/stop-color attributes and style props).
export function stylizeSvg(markup) {
  const conv = (value) => { const c = parseColor(value); return c ? toHex(stylize(c)) : value; };
  return markup
    .replace(/\b(fill|stroke|stop-color|color)="([^"]*)"/g, (m, k, v) => `${k}="${conv(v)}"`)
    .replace(/\bstyle="([^"]*)"/g, (m, css) => `style="${css.replace(/(fill|stroke|stop-color|color)\s*:\s*([^;"]+)/g, (mm, k, v) => `${k}:${conv(v)}`)}"`);
}
