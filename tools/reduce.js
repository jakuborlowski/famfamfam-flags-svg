// Size reduction for emblem-heavy flags, applied to artwork already flattened
// into icon space. Three passes, each verified by rendering:
//   1. drop subpaths whose extent is below a fraction of a pixel at 4x,
//   2. thin points along each path (Douglas-Peucker) and refit curves,
//   3. render-guided pruning: remove whole paths whose absence changes the
//      4x render the least, until the file is within budget or the error
//      bound is reached.
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

export function reduce(svg, { budget, ref, scale = 4, maxErr = 1.0, minExtent = 0.12, tol = 0.04 }) {
  const render = (s) => rasterize(s, scale);
  const ser = new XMLSerializer();
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  ref = ref || render(svg);
  let best = { svg, bytes: Buffer.byteLength(svg), err: mae(ref, render(svg)) };
  const consider = (label) => {
    const out = ser.serializeToString(doc);
    const err = mae(ref, render(out));
    if (err <= maxErr) best = { svg: out, bytes: Buffer.byteLength(out), err, label };
    return err <= maxErr;
  };

  // 1 + 2: geometry per path, most aggressive setting that stays within the bound
  const original = new Map(artPaths(doc).map((p) => [p, p.getAttribute('d')]));
  for (const [ext, t] of [[minExtent, tol], [minExtent / 2, tol / 2], [0, 0]]) {
    for (const [p, d] of original) {
      if (!d || d.length < 40) continue;
      let nd = ext > 0 ? dropTinySubpaths(d, ext) : d;
      if (t > 0) { try { nd = simplifyPath(nd, { tol: t }); } catch { /* keep */ } }
      if (nd === '') nd = 'M0 0';
      p.setAttribute('d', nd.length < d.length ? nd : d);
    }
    if (consider('geometry')) break;
    for (const [p, d] of original) p.setAttribute('d', d);       // revert and try gentler
  }
  if (best.bytes <= budget) return best;

  // 3: render-guided pruning
  const paths = artPaths(doc);
  const base = render(ser.serializeToString(doc));
  const scored = [];
  for (const p of paths) {
    const parent = p.parentNode, next = p.nextSibling;
    parent.removeChild(p);
    const d = mae(base, render(ser.serializeToString(doc)));
    parent.insertBefore(p, next);
    scored.push({ p, d, bytes: (p.getAttribute('d') || '').length });
  }
  scored.sort((a, b) => a.d - b.d || b.bytes - a.bytes);
  for (const { p } of scored) {
    const parent = p.parentNode, next = p.nextSibling;
    parent.removeChild(p);
    const out = ser.serializeToString(doc);
    const err = mae(ref, render(out));
    if (err > maxErr) { parent.insertBefore(p, next); continue; }
    best = { svg: out, bytes: Buffer.byteLength(out), err, label: 'pruned' };
    if (best.bytes <= budget) break;
  }
  return best;
}
