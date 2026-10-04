// Snap vertical edges of rectangular artwork to whole pixel columns, as Mark
// did for tricolours. Runs on a finished icon whose artwork was flattened into
// icon space (so a path's coordinates are final up to the optional residual
// scale on the artwork group). Only paths made entirely of horizontal and
// vertical segments are touched, and only if every piece stays at least a
// pixel wide; curves, diagonals and emblems are left alone.
import { SNAP_X } from './style.js';

function parse(d) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const subs = [];
  let cur = null, x = 0, y = 0, sx = 0, sy = 0, cmd = null, i = 0;
  const n = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) {
      cmd = toks[i++];
      if (cmd === 'z' || cmd === 'Z') { x = sx; y = sy; cur = null; continue; }
    }
    if (!cur && cmd !== 'M' && cmd !== 'm') { cur = [[x, y]]; subs.push(cur); }
    switch (cmd) {
      case 'M': x = n(); y = n(); sx = x; sy = y; cur = [[x, y]]; subs.push(cur); cmd = 'L'; break;
      case 'm': x += n(); y += n(); sx = x; sy = y; cur = [[x, y]]; subs.push(cur); cmd = 'l'; break;
      case 'H': x = n(); cur.push([x, y]); break;
      case 'h': x += n(); cur.push([x, y]); break;
      case 'V': y = n(); cur.push([x, y]); break;
      case 'v': y += n(); cur.push([x, y]); break;
      case 'L': x = n(); y = n(); cur.push([x, y]); break;
      case 'l': x += n(); y += n(); cur.push([x, y]); break;
      default: return null;                       // curves and arcs: not rectangular
    }
  }
  for (const s of subs) for (let k = 1; k <= s.length; k++) {
    const a = s[k - 1], b = s[k % s.length];
    if (Math.abs(a[0] - b[0]) > 1e-6 && Math.abs(a[1] - b[1]) > 1e-6) return null;
  }
  return subs;
}

const fmt = (v) => String(+v.toFixed(4));

export function snapEdges(svg) {
  // The artwork group may carry the residual horizontal/vertical stretch.
  const m = svg.match(/<g clip-path="url\(#[^"]+\)"><g(?: transform="scale\(([^)]*)\)")?>/);
  if (!m) return svg;
  const [a = 1] = m[1] ? m[1].trim().split(/[\s,]+/).map(Number) : [];
  return svg.replace(/<path ([^>]*?)d="([^"]+)"([^>]*)\/>/g, (all, pre, d, post) => {
    if (/fill="url|fill-opacity|fill-rule/.test(pre + post)) return all;   // the overlay
    const subs = parse(d);
    if (!subs) return all;
    const snap = (x) => { const X = x * a, r = Math.round(X); return Math.abs(X - r) <= SNAP_X ? r / a : x; };
    const out = subs.map((s) => s.map(([x, y]) => [snap(x), y]));
    for (let k = 0; k < subs.length; k++) {
      const w = (pts) => (Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))) * a;
      if (w(subs[k]) < 1.5 || w(out[k]) < 1) return all;               // small piece: leave it
    }
    if (out.every((s, k) => s.every((p, j) => p[0] === subs[k][j][0]))) return all;
    return `<path ${pre}d="${out.map((s) => 'M' + s.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L') + 'z').join('')}"${post}/>`;
  });
}
