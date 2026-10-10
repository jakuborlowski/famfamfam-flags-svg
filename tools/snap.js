// Snap vertical edges of rectangular artwork to whole pixel columns, as Mark
// did for tricolours. Runs on a finished icon whose artwork was flattened into
// icon space (so a path's coordinates are final up to the optional residual
// scale on the artwork group). Only paths made entirely of horizontal and
// vertical segments are touched, and only if every piece stays at least a
// pixel wide; curves, diagonals and emblems are left alone.
import svgpath from 'svgpath';
import { SNAP_X } from './style.js';

// Subpaths of a path in absolute coordinates: a rectilinear one as its list
// of corner points, anything with curves or diagonals as its segments, kept
// verbatim. A path that mixes the two (Canada's red bands and maple leaf) can
// then have its bands snapped together with the white they abut; snapping the
// white alone opened a transparent gap beside it.
const fmt = (v) => String(+v.toFixed(4)).replace(/^(-?)0\./, '$1.');
const EPS = 0.02;   // twice the flattening precision: 4.07 out, 4.06 back is still a rectangle
function parse(d) {
  const subs = [];
  let cur = null;
  svgpath(d).abs().unshort().iterate((seg, i, x, y) => {
    const c = seg[0];
    if (c === 'M') { cur = { pts: [[seg[1], seg[2]]], segs: [seg], rect: true }; subs.push(cur); return; }
    if (!cur) return;
    cur.segs.push(seg);
    if (cur.closed) cur.rect = false;                 // drawing on after z
    if (c === 'Z') { cur.closed = true; return; }
    let nx = x, ny = y;
    if (c === 'H') nx = seg[1]; else if (c === 'V') ny = seg[1];
    else if (c === 'L') { nx = seg[1]; ny = seg[2]; } else { cur.rect = false; return; }
    if (Math.abs(nx - x) > EPS && Math.abs(ny - y) > EPS) cur.rect = false;
    cur.pts.push([nx, ny]);
  });
  for (const s of subs) if (s.rect) {
    if (!s.closed) { s.rect = false; continue; }      // an open outline is not an area
    const a = s.pts[0], b = s.pts[s.pts.length - 1];
    if (Math.abs(a[0] - b[0]) > EPS && Math.abs(a[1] - b[1]) > EPS) s.rect = false;   // closing edge
  }
  // The original text of each subpath, to keep curved ones byte for byte.
  const texts = d.split(/(?=[Mm])/).filter((t) => t.trim());
  if (texts.length !== subs.length) return null;
  subs.forEach((s, k) => { s.text = texts[k]; });
  return subs.some((s) => s.rect) ? subs : null;
}

// A curved subpath kept verbatim, except that its opening moveto becomes
// absolute: a relative one would follow an earlier subpath that moved.
function keep(s) {
  const [, cmd, args, rest] = s.text.match(/^\s*([Mm])([^a-zA-Z]*)(.*)$/s);
  const nums = args.match(/-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi) || [];
  const more = nums.length > 2 ? (cmd === 'm' ? 'l' : 'L') + nums.slice(2).join(' ') : '';
  return `M${fmt(s.segs[0][1])} ${fmt(s.segs[0][2])}${more}${rest}`;
}


export function snapEdges(svg) {
  // The artwork group may carry the residual horizontal/vertical stretch.
  const m = svg.match(/<g clip-path="url\(#[^"]+\)"><g(?: transform="scale\(([^)]*)\)")?>/);
  if (!m) return svg;
  const [a = 1] = m[1] ? m[1].trim().split(/[\s,]+/).map(Number) : [];
  return svg.replace(/<path ([^>]*?)d="([^"]+)"([^>]*)\/>/g, (all, pre, d, post) => {
    if (/fill="url|fill-opacity|fill-rule/.test(pre + post)) return all;   // the overlay
    if (/stroke="(?!none)/.test(pre + post)) return all;                    // outlines keep their shape
    const subs = parse(d);
    if (!subs) return all;
    const snap = (x) => { const X = x * a, r = Math.round(X); return Math.abs(X - r) <= SNAP_X ? r / a : x; };
    const w = (pts) => (Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))) * a;
    let moved = false;
    for (const s of subs) if (s.rect) {
      s.out = s.pts.map(([x, y]) => [snap(x), y]);
      if (w(s.pts) < 1.5 || w(s.out) < 1) return all;                  // small piece: leave the path
      if (s.out.some((p, j) => Math.abs(p[0] - s.pts[j][0]) * a > EPS)) moved = true;
      for (let j = 0; j < s.pts.length; j++) for (let k = 0; k < j; k++)       // no two edges merged
        if (Math.abs(s.pts[j][0] - s.pts[k][0]) * a > EPS && s.out[j][0] === s.out[k][0]) return all;
    }
    if (!moved) return all;
    const out = subs.map((s) => s.rect
      ? 'M' + s.out.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L') + 'z'
      : keep(s));
    return `<path ${pre}d="${out.join('')}"${post}/>`;
  });
}
