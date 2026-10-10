// Mark's rule for thin lines: nothing thinner than a pixel. He drew every
// stripe and fimbriation narrower than about a pixel and a half as at least
// one whole pixel, so it reads at 16 px; drawn to scale it vanishes into its
// neighbours. Runs on flattened artwork, before size reduction.
import svgpath from 'svgpath';
import { THIN, THIN_DIAG } from './style.js';

// Thin stripes. Mark drew every stripe and fimbriation thinner than about a
// pixel and a half as whole pixel rows, at least one row wide: the white
// lines of Botswana, the Gambia, Mozambique and Suriname, the red lines of
// Uzbekistan, the thin stripes of Cape Verde and Aruba. Drawn to scale they
// are a fraction of a pixel and vanish into their neighbours at 16 px.
// Full-width (or full-height) rectangles are read as bands along y (or x);
// if a visible band is thinner than THIN, its edges move to whole pixels,
// every band at least a pixel wide, with the least total movement. The move
// is a piecewise-linear warp of that axis applied to every band edge, so
// edges hidden under other bands keep their order and no gap opens.

function bandsOf(stripes, H) {
  const cuts = [...new Set(stripes.flatMap((s) => [s.lo, s.hi]).concat([0, H]).map((v) => Math.min(H, Math.max(0, v))))].sort((p, q) => p - q);
  let out = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const lo = cuts[k], hi = cuts[k + 1];
    if (hi - lo < 1e-6) continue;
    const mid = (lo + hi) / 2;
    let top = null;
    for (const s of stripes) if (s.lo <= mid && s.hi >= mid) top = s;   // later paints over earlier
    out.push({ lo, hi, key: top ? top.fill : null });
  }
  // slivers (rounding gaps and overlaps in the source) join a neighbour
  out = out.filter((b, i) => { if (b.hi - b.lo >= 0.05) return true; if (i > 0) out[i - 1].hi = b.hi; else if (out[1]) out[1].lo = b.lo; return false; });
  const merged = [];
  for (const b of out) { const l = merged[merged.length - 1]; if (l && l.key === b.key) l.hi = b.hi; else merged.push({ ...b }); }
  return merged;
}

// Integer positions for the boundaries that touch a thin band; the rest stay.
function solve(bands, H) {
  const b = bands.slice(1).map((x) => x.lo);
  const thin = bands.map((x) => x.hi - x.lo < THIN);
  const snap = b.map((_, i) => thin[i] || thin[i + 1]);
  if (!snap.some(Boolean)) return null;
  const cand = b.map((v, i) => (snap[i] ? [...new Set([Math.floor(v) - 1, Math.floor(v), Math.ceil(v), Math.ceil(v) + 1])].filter((c) => c >= 0 && c <= H) : [v]));
  const minw = (i) => (thin[i] || (i < b.length && snap[i]) || (i > 0 && snap[i - 1]) ? 1 : Math.min(1, bands[i].hi - bands[i].lo));
  let best = null;
  const pick = new Array(b.length);
  const rec = (i, prev, cost) => {
    if (best && cost >= best.cost) return;
    if (i === b.length) { if (H - prev >= minw(i) - 1e-9) best = { cost, p: pick.slice() }; return; }
    for (const c of cand[i]) {
      if (c - prev < minw(i) - 1e-9) continue;
      pick[i] = c; rec(i + 1, c, cost + Math.abs(c - b[i]));
    }
  };
  rec(0, 0, 0);
  if (!best || best.cost < 1e-9) return null;
  return { from: [0, ...b, H], to: [0, ...best.p, H] };
}

const warp = ({ from, to }) => (v) => {
  if (v <= 0 || v >= from[from.length - 1]) return v;
  let k = 0; while (from[k + 1] < v) k++;
  const t = (v - from[k]) / (from[k + 1] - from[k] || 1);
  return to[k] + (to[k + 1] - to[k]) * t;
};

// Absolute subpaths: [{ segs, pts|null }], pts set when the subpath is a rectangle.
function subpaths(d) {
  const subs = [];
  let cur = null, x = 0, y = 0;
  try {
    svgpath(d).abs().iterate((seg) => {
      const c = seg[0];
      if (c === 'M') { cur = { segs: [], pts: [] }; subs.push(cur); }
      if (!cur) { cur = { segs: [], pts: [[x, y]] }; subs.push(cur); }
      cur.segs.push(seg);
      if (c === 'M' || c === 'L') { x = seg[1]; y = seg[2]; cur.pts && cur.pts.push([x, y]); }
      else if (c === 'H') { x = seg[1]; cur.pts && cur.pts.push([x, y]); }
      else if (c === 'V') { y = seg[1]; cur.pts && cur.pts.push([x, y]); }
      else if (c !== 'Z') cur.pts = null;
    });
  } catch { return null; }
  for (const s of subs) {
    if (!s.pts || s.pts.length < 4) { s.pts = null; continue; }
    const xs = s.pts.map((q) => q[0]), ys = s.pts.map((q) => q[1]);
    const bx = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const on = (v, a, b) => Math.abs(v - a) < 1e-6 || Math.abs(v - b) < 1e-6;
    if (!s.pts.every(([px, py]) => on(px, bx[0], bx[1]) && on(py, bx[2], bx[3]))) s.pts = null; else s.box = bx;
  }
  return subs;
}

export function thinBands(svg) {
  const m = svg.match(/<g clip-path="url\(#[^"]+\)"><g(?: transform="scale\(([^)]*)\)")?>/);
  if (!m) return svg;
  const [a = 1, b0] = m[1] ? m[1].trim().split(/[\s,]+/).map(Number) : [];
  const sc = [a, b0 ?? a];
  const [W, H] = svg.match(/viewBox="0 0 (\S+) (\S+)"/).slice(1, 3).map(Number);
  const start = m.index + m[0].length, end = svg.indexOf(`<rect x="1" y="1" width="${W - 2}"`, start);
  if (end < 0) return svg;
  let art = svg.slice(start, end);
  const defs = [...art.matchAll(/<defs>[\s\S]*?<\/defs>/g)].map((d) => [d.index, d.index + d[0].length]);
  const paths = [];
  for (const p of art.matchAll(/<path ([^>]*?)d="([^"]+)"([^>]*)\/>/g)) {
    if (defs.some(([i, j]) => p.index >= i && p.index < j)) continue;
    const attrs = p[1] + p[3];
    if (/fill="none"|fill="url|opacity|transform/.test(attrs)) continue;
    const subs = subpaths(p[2]);
    if (!subs || !subs.some((s) => s.box)) continue;
    paths.push({ index: p.index, len: p[0].length, pre: p[1], post: p[3], subs, fill: (attrs.match(/fill="([^"]*)"/) || [, ''])[1] });
  }
  const moved = new Set();
  for (const axis of [1, 0]) {                         // 1: horizontal bands (along y), 0: vertical
    const L = axis ? H : W, span = axis ? W : H;
    const stripes = [];
    for (const p of paths) p.subs.forEach((s) => {
      if (!s.box) return;
      const bx = s.box.map((v, i) => v * sc[i >> 1]);
      const [lo0, hi0] = axis ? [bx[0], bx[1]] : [bx[2], bx[3]];
      if (lo0 <= 0.05 && hi0 >= span - 0.05) stripes.push({ p, s, lo: axis ? bx[2] : bx[0], hi: axis ? bx[3] : bx[1], fill: p.fill });
    });
    if (stripes.length < 2) continue;
    const sol = solve(bandsOf(stripes, L), L);
    if (!sol) continue;
    const f = warp(sol);
    for (const st of stripes) { st.s.pts = st.s.pts.map((q) => { const r = q.slice(); r[axis] = f(q[axis] * sc[axis]) / sc[axis]; return r; }); moved.add(st.p); }
  }
  if (!moved.size) return svg;
  for (const p of [...moved].sort((u, v) => v.index - u.index)) {
    const d = p.subs.map((s) => (s.box ? 'M' + s.pts.filter((q, i, a) => i < a.length - 1 || q[0] !== a[0][0] || q[1] !== a[0][1]).map(([x, y]) => `${fmt2(x)} ${fmt2(y)}`).join('L') + 'z' : s.segs.map((g) => g[0] + g.slice(1).map((v) => fmt2(v)).join(' ')).join(''))).join('');
    art = art.slice(0, p.index) + `<path ${p.pre}d="${d}"${p.post}/>` + art.slice(p.index + p.len);
  }
  return svg.slice(0, start) + art + svg.slice(end);
}

// Thin diagonal bands: the fimbriations of Trinidad and Tobago, Tanzania,
// Saint Kitts and Nevis, Namibia, Guyana, Saint Lucia, the stripe of the
// Solomon Islands. Mark drew them a pixel wide; to scale they are half that
// and vanish at 16 px. Where two long parallel edges are closer than
// THIN_DIAG and the strip between them shows its own colour, the strip is
// widened to THIN_DIAG: a thin shape grows on both sides, otherwise the edge
// of the shape painted first moves away, so the shape on top keeps its size.
const MIN_RUN = 6;      // a band across the flag, not a detail (an ensign's canton is shorter)
const fmt2 = (v) => String(+v.toFixed(2));

function polygons(d, sc) {
  const subs = [];
  let cur = null, x = 0, y = 0;
  try {
    svgpath(d).abs().unshort().iterate((seg) => {
      const c = seg[0];
      if (c === 'M') { cur = { pts: [], segs: [] }; subs.push(cur); }
      if (!cur) { cur = { pts: [[x, y]], segs: [] }; subs.push(cur); }
      cur.segs.push(seg);
      if (c === 'M' || c === 'L') { x = seg[1]; y = seg[2]; }
      else if (c === 'H') x = seg[1];
      else if (c === 'V') y = seg[1];
      else if (c === 'C') {
        // a cubic that is a straight line in disguise
        const [x1, y1, x2, y2, x3, y3] = seg.slice(1);
        const len = Math.hypot(x3 - x, y3 - y) || 1;
        const off = (px, py) => Math.abs((x3 - x) * (py - y) - (y3 - y) * (px - x)) / len;
        if (off(x1, y1) > 0.12 || off(x2, y2) > 0.12) cur.pts = null;
        x = x3; y = y3;
      } else if (c !== 'Z') cur.pts = null;
      if (cur.pts && c !== 'Z') cur.pts.push([x, y]);
    });
  } catch { return null; }
  for (const s of subs) if (s.pts) {
    const p = s.pts; if (p.length > 1 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 1e-6) p.pop();
    if (p.length < 3) s.pts = null; else s.pts = p.map(([px, py]) => [px * sc[0], py * sc[1]]);
  }
  return subs;
}

const inside = (pt, pts) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};

export function thinDiagonals(svg) {
  const m = svg.match(/<g clip-path="url\(#[^"]+\)"><g(?: transform="scale\(([^)]*)\)")?>/);
  if (!m) return svg;
  const [a = 1, b0] = m[1] ? m[1].trim().split(/[\s,]+/).map(Number) : [];
  const sc = [a, b0 ?? a];
  const [W] = svg.match(/viewBox="0 0 (\S+) (\S+)"/).slice(1, 3).map(Number);
  const start = m.index + m[0].length, end = svg.indexOf(`<rect x="1" y="1" width="${W - 2}"`, start);
  if (end < 0) return svg;
  let art = svg.slice(start, end);
  const defs = [...art.matchAll(/<defs>[\s\S]*?<\/defs>/g)].map((d) => [d.index, d.index + d[0].length]);
  const shapes = [];
  for (const p of art.matchAll(/<path ([^>]*?)d="([^"]+)"([^>]*)\/>/g)) {
    if (defs.some(([i, j]) => p.index >= i && p.index < j)) continue;
    const attrs = p[1] + p[3];
    if (/fill="none"|fill="url|opacity|transform|stroke=/.test(attrs)) continue;
    const subs = polygons(p[2], sc);
    if (!subs) continue;
    shapes.push({ order: shapes.length, index: p.index, len: p[0].length, pre: p[1], post: p[3], subs, fill: (attrs.match(/fill="([^"]*)"/) || [, '#000'])[1] });
  }
  const colourAt = (pt) => { let f = null; for (const s of shapes) { let inn = false; for (const sub of s.subs) if (sub.pts && inside(pt, sub.pts)) inn = !inn; if (inn) f = s; } return f; };
  const edges = [];
  for (const s of shapes) s.subs.forEach((sub, k) => {
    if (!sub.pts) return;
    const n = sub.pts.length;
    for (let i = 0; i < n; i++) {
      const p = sub.pts[i], q = sub.pts[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
      if (len < 3 || Math.abs(dx) < 0.05 * len || Math.abs(dy) < 0.05 * len) continue;   // short or axis-aligned
      edges.push({ s, k, i, p, q, u: [dx / len, dy / len], len });
    }
  });
  const shift = new Map();                                // "order|k|i" -> [nx, ny] offset
  const add = (e, v) => { const key = `${e.s.order}|${e.k}|${e.i}`, o = shift.get(key); if (!o || Math.hypot(...v) > Math.hypot(...o)) shift.set(key, v); };
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const A = edges[i], B = edges[j];
    if (Math.abs(A.u[0] * B.u[1] - A.u[1] * B.u[0]) > 0.035) continue;          // not parallel (2 degrees)
    const nrm = [-A.u[1], A.u[0]];
    const dist = (B.p[0] - A.p[0]) * nrm[0] + (B.p[1] - A.p[1]) * nrm[1];     // signed, along A's normal
    const d = Math.abs(dist);
    if (d < 0.05 || d >= THIN_DIAG) continue;
    const t = (pt) => (pt[0] - A.p[0]) * A.u[0] + (pt[1] - A.p[1]) * A.u[1];
    const lo = Math.max(0, Math.min(t(B.p), t(B.q))), hi = Math.min(A.len, Math.max(t(B.p), t(B.q)));
    if (hi - lo < MIN_RUN) continue;
    const tm = (lo + hi) / 2, side = Math.sign(dist);
    const at = (h) => [A.p[0] + A.u[0] * tm + nrm[0] * h * side, A.p[1] + A.u[1] * tm + nrm[1] * h * side];
    const mid = colourAt(at(d / 2)), outA = colourAt(at(-0.3)), outB = colourAt(at(d + 0.3));
    if (!mid || mid === outA || mid === outB || mid.fill === outA?.fill || mid.fill === outB?.fill) continue;
    const grow = THIN_DIAG - d;
    if (A.s === B.s && A.k === B.k && mid === A.s) {                              // a thin shape: grow both sides
      add(A, [-nrm[0] * side * grow / 2, -nrm[1] * side * grow / 2]);
      add(B, [nrm[0] * side * grow / 2, nrm[1] * side * grow / 2]);
      continue;
    }
    const [E, dir] = A.s.order <= B.s.order ? [A, -1] : [B, 1];               // the edge painted first moves away
    const later = E === A ? B.s : A.s;
    if (mid === later) continue;
    add(E, [nrm[0] * side * dir * grow, nrm[1] * side * dir * grow]);
  }
  if (!shift.size) return svg;
  const touched = new Set();
  for (const key of shift.keys()) touched.add(+key.split('|')[0]);
  for (const s of [...shapes].filter((x) => touched.has(x.order)).sort((u, v) => v.index - u.index)) {
    const out = s.subs.map((sub, k) => {
      if (!sub.pts) return sub.segs.map((g) => g[0] + g.slice(1).map((v) => fmt2(v)).join(' ')).join('');
      const n = sub.pts.length;
      const line = (i) => { const o = shift.get(`${s.order}|${k}|${i}`) || [0, 0]; const p = sub.pts[i], q = sub.pts[(i + 1) % n]; return { p: [p[0] + o[0], p[1] + o[1]], q: [q[0] + o[0], q[1] + o[1]], moved: !!shift.get(`${s.order}|${k}|${i}`) }; };
      const pts = sub.pts.map((pt, i) => {
        const L1 = line((i - 1 + n) % n), L2 = line(i);
        if (!L1.moved && !L2.moved) return pt;
        const d1 = [L1.q[0] - L1.p[0], L1.q[1] - L1.p[1]], d2 = [L2.q[0] - L2.p[0], L2.q[1] - L2.p[1]];
        const den = d1[0] * d2[1] - d1[1] * d2[0];
        if (Math.abs(den) < 1e-9) return L2.p;
        const tt = ((L2.p[0] - L1.p[0]) * d2[1] - (L2.p[1] - L1.p[1]) * d2[0]) / den;
        return [L1.p[0] + d1[0] * tt, L1.p[1] + d1[1] * tt];
      });
      return 'M' + pts.map(([x, y]) => `${fmt2(x / sc[0])} ${fmt2(y / sc[1])}`).join('L') + 'z';
    }).join('');
    art = art.slice(0, s.index) + `<path ${s.pre}d="${out}"${s.post}/>` + art.slice(s.index + s.len);
  }
  return svg.slice(0, start) + art + svg.slice(end);
}
