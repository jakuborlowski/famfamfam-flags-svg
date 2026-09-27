// Mark James did not use official flag colours. He picked most of them from the
// Flags of the World (FOTW) reference GIFs of 2005, which were drawn in FOTW's
// 32-colour browser-safe palette: every red #ff0000, every green #009900, every
// yellow #ffff00 unless FOTW coded it dark yellow #ffcc00. Coats of arms and a
// few flags came from elsewhere, in muted golds and shaded colours.
//
// So colours go through two steps. stylize() is a smooth mapping (saturation
// push, hue pull towards the primaries, per-hue brightness) that suits dull and
// emblem colours; palette() then snaps saturated reds, oranges, yellows and
// greens onto their FOTW colour, fading out near family edges so nothing jumps.
// Blues vary too much in the originals to snap. FAM_COLORS=official skips both.

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
// Anchors: red, orange, golden yellow, green, azure, blue, magenta. EDGE is
// where each anchor's catchment ends. These are the midpoints between anchors,
// except that yellow ends at 70 and green reaches 175: lime greens (78) and
// teal greens (164-167, Bulgaria, Cameroon) are greens, and snapping them to the
// nearest anchor turned them mustard and blue in 0.1.0.
const HUES = [0,   22,  52,  120,  205, 235,   300];
const EDGE = [11,  37,  70,  175,  220, 267.5, 330];
const PULL = [0.9, 0.3, 0.8, 1.0,  0.5, 0.45,  0.5];   // how far hue snaps to the anchor
const VTGT = [1.0, 1.0, 1.0, 0.57, 1.0, 1.0,   0.8];   // brightness target
const VK   = [0.9, 0.8, 0.6, 0.35, 0.6, 0.35,  0.3];   // pull strength towards it
const KS   = 0.9;                                      // saturation push

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
  const k = EDGE.findIndex((e) => h <= e);
  const toAnchor = ((h - HUES[k < 0 ? 0 : k] + 540) % 360) - 180;
  const h2 = h - interp(h, PULL) * toAnchor * gate;
  const s2 = s + (1 - s) * KS * gate;
  const v2 = v + (interp(h, VTGT) - v) * interp(h, VK) * gate;
  return hsvToRgb([h2, Math.min(1, s2), Math.min(1, v2)]);
}

// FOTW palette families: up to hue (degrees), min saturation, min value, colour.
// A catalog entry can set "yellow": "#ffcc00" (FOTW's dark yellow) or "soft"
// (keep the smooth transform: the muted golds Mark used for some flags).
const FAMILIES = [
  [12,  0.6,  0.35, (v) => (v < 0.62 ? '#990000' : '#ff0000')],   // red, from 340
  [30,  0.75, 0.85, () => '#ff6600'],
  [42,  0.75, 0.85, () => '#ff9900'],
  [46,  0.6,  0.8,  () => '#ffcc00'],                             // amber
  [70,  0.6,  0.8,  (v, o) => (o.yellow === 'soft' ? null : o.yellow || '#ffff00')],
  [175, 0.45, 0.35, (v) => (v < 0.75 ? '#009900' : '#00cc00')],
];
const ramp = (x) => Math.min(1, Math.max(0, x));

export function palette(rgb, opts = {}) {
  const smooth = stylize(rgb);
  const [h, s, v] = rgbToHsv(rgb);
  const hr = h >= 340 ? h - 360 : h;
  if (hr > 175) return smooth;
  const [, s0, v0, target] = FAMILIES.find(([h1]) => hr < h1);
  const hex = target(v, opts);
  if (!hex) return smooth;
  // fade out over 5 degrees at the blue and magenta ends, and 0.1 below the floors
  const w = ramp((175 - hr) / 5) * ramp((hr + 20) / 5) * ramp((s - s0) / 0.1 + 1) * ramp((v - v0) / 0.1 + 1);
  const t = parseColor(hex);
  return smooth.map((c, i) => c + (t[i] - c) * w);
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
export function stylizeSvg(markup, opts = {}) {
  const conv = (value) => { const c = parseColor(value); return c ? toHex(palette(c, opts)) : value; };
  return markup
    .replace(/\b(fill|stroke|stop-color|color)="([^"]*)"/g, (m, k, v) => `${k}="${conv(v)}"`)
    .replace(/\bstyle="([^"]*)"/g, (m, css) => `style="${css.replace(/(fill|stroke|stop-color|color)\s*:\s*([^;"]+)/g, (mm, k, v) => `${k}:${conv(v)}`)}"`);
}
