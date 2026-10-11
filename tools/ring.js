// Cut path data down to its parts inside the icon's 1-unit ring, curves kept
// as curves. The ring is four rectangles (top and bottom the full width, left
// and right between them), and the path is clipped to each the
// Sutherland-Hodgman way: walk every contour, keep the pieces inside, join
// each exit to the next entry along the edge. Against a convex region that
// keeps every point's winding number, so either fill rule still holds; the
// rectangles don't overlap, so the four results make one seamless path.
import svgpath from 'svgpath';

const EPS = 1e-7;
const same = (a, b) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// A segment is its points: [p0, p1] a line, [p0, c1, c2, p1] a cubic.
function contours(d) {
  const out = [];
  let cur = null, start = null, pt = [0, 0];
  const close = () => {
    if (cur && cur.length) { if (!same(pt, start)) cur.push([pt, start]); out.push(cur); }
    cur = null;
  };
  svgpath(d).abs().unshort().unarc().iterate((s) => {
    if (s[0] === 'M') { close(); cur = []; start = pt = [s[1], s[2]]; return; }
    if (s[0] === 'Z') { close(); pt = start; return; }
    if (!cur) { cur = []; start = pt; }
    let next;
    if (s[0] === 'L') { next = [s[1], s[2]]; cur.push([pt, next]); }
    else if (s[0] === 'H') { next = [s[1], pt[1]]; cur.push([pt, next]); }
    else if (s[0] === 'V') { next = [pt[0], s[1]]; cur.push([pt, next]); }
    else if (s[0] === 'C') { next = [s[5], s[6]]; cur.push([pt, [s[1], s[2]], [s[3], s[4]], next]); }
    else if (s[0] === 'Q') { next = [s[3], s[4]]; const q = [s[1], s[2]]; cur.push([pt, lerp(pt, q, 2 / 3), lerp(next, q, 2 / 3), next]); }
    pt = next;
  });
  close();
  return out;
}

// de Casteljau: the part of a segment between t0 and t1.
function part(seg, t0, t1) {
  if (seg.length === 2) return [lerp(seg[0], seg[1], t0), lerp(seg[0], seg[1], t1)];
  const head = (s, t) => {   // the part of a cubic from 0 to t
    const ab = lerp(s[0], s[1], t), bc = lerp(s[1], s[2], t), cd = lerp(s[2], s[3], t);
    const abc = lerp(ab, bc, t), bcd = lerp(bc, cd, t);
    return [s[0], ab, abc, lerp(abc, bcd, t)];
  };
  const rev = (s) => [...s].reverse();
  const a = t1 < 1 ? head(seg, t1) : seg;                     // 0..t1
  return t0 > 0 ? rev(head(rev(a), 1 - t0 / t1)) : a;         // t0..t1
}
const point = (seg, t) => part(seg, 0, t).at(-1);

// Where coordinate k of a segment crosses v, as sorted t in (0, 1).
function crossings(seg, k, v) {
  const f = (t) => point(seg, t)[k] - v;
  let cuts = [0, 1];
  if (seg.length === 4) {   // split at the extrema, so each piece is monotone
    const [p0, p1, p2, p3] = seg.map((q) => q[k]);
    const a = -p0 + 3 * p1 - 3 * p2 + p3, b = p0 - 2 * p1 + p2, c = p1 - p0;   // derivative / 3: a t² + 2b t + c
    const roots = Math.abs(a) < 1e-12 ? (Math.abs(b) < 1e-12 ? [] : [-c / (2 * b)])
      : ((disc) => (disc < 0 ? [] : [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a]))(b * b - a * c);
    cuts = [0, ...roots.filter((t) => t > 0 && t < 1).sort((x, y) => x - y), 1];
  }
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    let lo = cuts[i], hi = cuts[i + 1], flo = f(lo), fhi = f(hi);
    if (flo * fhi >= 0) continue;
    for (let n = 0; n < 60; n++) { const mid = (lo + hi) / 2, fm = f(mid); if (fm * flo > 0) { lo = mid; flo = fm; } else hi = mid; }
    out.push((lo + hi) / 2);
  }
  return out;
}

// Keep the half-plane s * (p[k] - v) <= 0.
function halfPlane(contour, k, v, s) {
  const pieces = [];
  for (const seg of contour) {
    let t0 = 0;
    for (const t of [...crossings(seg, k, v), 1]) {
      const pc = part(seg, t0, t).map((q) => [...q]);
      if (t0 > 0) pc[0][k] = v;
      if (t < 1) pc[pc.length - 1][k] = v;
      pieces.push(pc);
      t0 = t;
    }
  }
  const out = [];
  let last = null;
  for (const pc of pieces) {
    if (s * (point(pc, 0.5)[k] - v) > EPS) continue;
    if (last && !same(last, pc[0])) out.push([last, pc[0]]);   // along the edge
    out.push(pc);
    last = pc.at(-1);
  }
  if (out.length && !same(last, out[0][0])) out.push([last, out[0][0]]);
  return out;
}

const fmt = (q) => `${+q[0].toFixed(3)} ${+q[1].toFixed(3)}`;

// Area of a contour (cubics sampled), for leaving out specks.
function area(contour) {
  let a = 0;
  for (const seg of contour) {
    const pts = seg.length === 2 ? seg : Array.from({ length: 9 }, (_, i) => point(seg, i / 8));
    for (let i = 0; i + 1 < pts.length; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  return Math.abs(a / 2);
}

// Pieces smaller than minArea (square units) are left out.
export function clipToRing(d, W, H, { minArea = 0 } = {}) {
  const rects = [[0, 0, W, 1], [0, H - 1, W, H], [0, 1, 1, H - 1], [W - 1, 1, W, H - 1]];
  let out = '';
  for (const c of contours(d)) {
    for (const [x0, y0, x1, y1] of rects) {
      let r = c;
      for (const [k, v, s] of [[0, x0, -1], [0, x1, 1], [1, y0, -1], [1, y1, 1]]) if (r.length) r = halfPlane(r, k, v, s);
      if (!r.length) continue;
      const xs = r.flat().map((q) => q[0]), ys = r.flat().map((q) => q[1]);
      if (Math.max(...xs) - Math.min(...xs) < 1e-3 || Math.max(...ys) - Math.min(...ys) < 1e-3 || area(r) < minArea) continue;   // an edge or a speck
      out += `M${fmt(r[0][0])}` + r.map((seg) => (seg.length === 2 ? `L${fmt(seg[1])}` : `C${seg.slice(1).map(fmt).join(' ')}`)).join('') + 'Z';
    }
  }
  return out && svgpath(out).rel().round(2).toString();
}
