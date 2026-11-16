// Size reduction for emblem-heavy flags, applied to artwork already flattened
// into icon space. Every path can be drawn with fewer bytes in several ways:
// with its smallest subpaths dropped and its outline redrawn coarser
// (simplify.js) at one of a few tolerances, or left out altogether. Each of those
// moves is measured on its own by rendering at 4x, and they are applied
// cheapest first, by error added per byte saved, until the file is within
// budget or the next one would break the error bound. So a path nobody sees
// goes before one that carries the emblem, and a big outline is drawn a
// little coarser before a small detail is lost.
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import svgpath from 'svgpath';
import { render as rasterize, mae } from './render.js';
import { simplifyPath } from './simplify.js';

function dropTinySubpaths(d, minExtent) {
  const subs = [];
  let cur = null;
  svgpath(d).abs().iterate((seg) => {
    if (seg[0] === 'M') { cur = { segs: [], minx: Infinity, maxx: -Infinity, miny: Infinity, maxy: -Infinity }; subs.push(cur); }
    if (!cur) return;
    cur.segs.push(seg);
    const c = seg[0];
    if (c === 'H') { cur.minx = Math.min(cur.minx, seg[1]); cur.maxx = Math.max(cur.maxx, seg[1]); return; }
    if (c === 'V') { cur.miny = Math.min(cur.miny, seg[1]); cur.maxy = Math.max(cur.maxy, seg[1]); return; }
    const start = c === 'A' ? 6 : 1;
    for (let k = start; k + 1 < seg.length; k += 2) {
      cur.minx = Math.min(cur.minx, seg[k]); cur.maxx = Math.max(cur.maxx, seg[k]);
      cur.miny = Math.min(cur.miny, seg[k + 1]); cur.maxy = Math.max(cur.maxy, seg[k + 1]);
    }
  });
  const keep = subs.filter((s) => Math.max(s.maxx - s.minx, s.maxy - s.miny) >= minExtent);
  if (keep.length === subs.length) return d;
  return keep.map((s) => s.segs.map((seg) => seg[0] + seg.slice(1).join(' ')).join('')).join('');
}

// Only the artwork is reducible: the first element inside the clip group.
// Everything after it is the overlay (gloss, bevel, shade, frame).
const artPaths = (doc) => {
  const out = [];
  let clipGroup = null;
  for (const c of Array.from(doc.documentElement.childNodes)) if (c.nodeType === 1 && c.getAttribute('clip-path')) { clipGroup = c; break; }
  if (!clipGroup) throw new Error('no clip group');
  let artRoot = null;
  for (const c of Array.from(clipGroup.childNodes)) if (c.nodeType === 1) { artRoot = c; break; }
  const walk = (el) => {
    if (el.nodeType !== 1) return;
    if (el.tagName === 'path') out.push(el);
    for (const c of Array.from(el.childNodes)) walk(c);
  };
  if (artRoot) walk(artRoot);
  return out;
};

// Worst mean error over any 8x8 window (2x2 icon pixels at 4x): a whole-image
// mean lets a small emblem vanish entirely, this does not.
const LOCAL_MAX = 24;   // mean error /255 allowed in any 8x8 window at 4x
export function localErr(a, b, blk = 8) {
  const W = a.width, H = a.height; let worst = 0;
  for (let by = 0; by + blk <= H; by += blk / 2) for (let bx = 0; bx + blk <= W; bx += blk / 2) {
    let s = 0;
    for (let y = by; y < by + blk; y++) for (let x = bx; x < bx + blk; x++) { const i = (y * W + x) * 4; for (let c = 0; c < 3; c++) s += Math.abs(a.pixels[i + c] - b.pixels[i + c]); }
    worst = Math.max(worst, s / (blk * blk * 3));
  }
  return worst;
}
const ok = (ref, r, maxErr) => { const e = mae(ref, r); return { e, pass: e <= maxErr && localErr(ref, r) <= LOCAL_MAX }; };

// How a path may be simplified, gentlest first: subpaths smaller than `ext`
// units dropped, the outline redrawn within `tol` units (1 unit = 1 px at 1x).
const LEVELS = [[0.03, 0.01], [0.06, 0.02], [0.12, 0.04], [0.16, 0.06], [0.2, 0.08]];
const GONE = LEVELS.length;   // one past the coarsest level: the path removed

// `geometry: false` only removes paths: for artwork still in source units,
// where a tolerance in icon units means nothing.
export function reduce(svg, { budget, ref, scale = 4, maxErr = 1.0, geometry = true }) {
  const render = (s) => rasterize(s, scale);
  const ser = new XMLSerializer();
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const write = () => { const out = ser.serializeToString(doc); return { svg: out, bytes: Buffer.byteLength(out) }; };
  ref = ref || render(svg);
  let best = { svg, bytes: Buffer.byteLength(svg), err: mae(ref, render(svg)) };
  if (best.bytes <= budget) return best;

  // Each path at each level: `draw` puts it in the document that way.
  // A path put back goes before the next of its siblings still there.
  const paths = artPaths(doc).map((el) => ({ el, parent: el.parentNode, after: [], forms: [], level: -1 }));
  for (const p of paths) for (let n = p.el.nextSibling; n; n = n.nextSibling) p.after.push(n);
  const draw = (p, level) => {
    if (level === GONE) return p.parent.removeChild(p.el);
    if (!p.el.parentNode) p.parent.insertBefore(p.el, p.after.find((n) => n.parentNode === p.parent) || null);
    p.el.setAttribute('d', level < 0 ? p.d : p.forms[level]);
  };
  // Every move, measured alone against the document as it came.
  const whole = write().bytes, moves = [];
  for (const p of paths) {
    p.d = p.el.getAttribute('d') || '';
    let shortest = p.d.length;
    if (geometry && shortest >= 40) LEVELS.forEach(([ext, tol], level) => {
      let d;
      try { d = simplifyPath(dropTinySubpaths(p.d, ext), { tol }) || 'M0 0'; } catch { return; }
      if (d.length < shortest) { shortest = d.length; p.forms[level] = d; }
    });
    for (const level of [...p.forms.keys(), GONE]) {
      if (level < GONE && !p.forms[level]) continue;
      draw(p, level);
      const out = write();
      if (out.bytes < whole) moves.push({ p, level, saved: whole - out.bytes, cost: Math.max(0, mae(ref, render(out.svg)) - best.err) });
    }
    draw(p, -1);
  }
  // Cheapest first, and each kept only if the whole still passes.
  moves.sort((a, b) => a.cost / a.saved - b.cost / b.saved || b.saved - a.saved);
  for (const { p, level } of moves) {
    if (level <= p.level) continue;   // already drawn coarser, or gone
    draw(p, level);
    const out = write();
    const { e: err, pass } = out.bytes < best.bytes ? ok(ref, render(out.svg), maxErr) : { pass: false };
    if (!pass) { draw(p, p.level); continue; }
    p.level = level;
    best = { ...out, err, label: paths.some((q) => q.level === GONE) ? 'pruned' : 'geometry' };
    if (best.bytes <= budget) break;
  }
  return best;
}
