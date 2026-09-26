// Geometric simplification of path data already in icon space.
// Curves are flattened to points, points that move the outline by less than
// `tol` units are dropped (Douglas-Peucker), corners are kept, and the runs in
// between are refitted with cubic Béziers. 1 unit = 1 px at 1x, so tol=0.05
// is a fifth of a pixel at 4x.
import svgpath from 'svgpath';
import simplify from 'simplify-js';
import fitCurve from 'fit-curve';

const fmt = (n, p) => { const s = n.toFixed(p); return s.replace(/\.?0+$/, '') || '0'; };

function flattenSubpaths(d, flatTol) {
  const sp = svgpath(d).abs().unarc().unshort();
  const subs = [];
  let cur = null, x = 0, y = 0, sx = 0, sy = 0;
  sp.iterate((seg) => {
    const c = seg[0];
    if (c === 'M') { cur = { pts: [{ x: seg[1], y: seg[2] }], closed: false }; subs.push(cur); x = sx = seg[1]; y = sy = seg[2]; return; }
    if (c === 'Z') { if (cur) cur.closed = true; x = sx; y = sy; return; }
    if (c === 'L') { cur.pts.push({ x: seg[1], y: seg[2] }); x = seg[1]; y = seg[2]; return; }
    if (c === 'H') { cur.pts.push({ x: seg[1], y }); x = seg[1]; return; }
    if (c === 'V') { cur.pts.push({ x, y: seg[1] }); y = seg[1]; return; }
    let p1, p2, p3;
    if (c === 'C') { p1 = [seg[1], seg[2]]; p2 = [seg[3], seg[4]]; p3 = [seg[5], seg[6]]; }
    else if (c === 'Q') { const q = [seg[1], seg[2]]; p3 = [seg[3], seg[4]]; p1 = [x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y)]; p2 = [p3[0] + 2 / 3 * (q[0] - p3[0]), p3[1] + 2 / 3 * (q[1] - p3[1])]; }
    else throw new Error('unexpected segment ' + c);
    const len = Math.hypot(p1[0] - x, p1[1] - y) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
    const n = Math.max(1, Math.min(64, Math.ceil(len / flatTol)));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      cur.pts.push({ x: u * u * u * x + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                     y: u * u * u * y + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1] });
    }
    x = p3[0]; y = p3[1];
  });
  return subs;
}

export function simplifyPath(d, { tol = 0.05, flatTol = 0.01, fitErr = 0.02, cornerDeg = 35, precision = 2 } = {}) {
  let out = '';
  for (const sub of flattenSubpaths(d, flatTol)) {
    let pts = sub.pts;
    if (sub.closed && pts.length > 2) {
      const a = pts[0], b = pts[pts.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-9) pts = pts.slice(0, -1);
      pts = [...pts, pts[0]];                       // explicit closing point for DP
    }
    pts = simplify(pts, tol, true);
    if (pts.length < 2) continue;
    // split into runs at corners
    const runs = [[pts[0]]];
    for (let i = 1; i < pts.length; i++) {
      const run = runs[runs.length - 1];
      run.push(pts[i]);
      if (i < pts.length - 1) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1];
        const v1 = Math.atan2(b.y - a.y, b.x - a.x), v2 = Math.atan2(c.y - b.y, c.x - b.x);
        let ang = Math.abs(v2 - v1) * 180 / Math.PI; if (ang > 180) ang = 360 - ang;
        if (ang > cornerDeg) runs.push([pts[i]]);
      }
    }
    out += 'M' + fmt(pts[0].x, precision) + ' ' + fmt(pts[0].y, precision);
    for (const run of runs) {
      if (run.length === 2) { out += 'L' + fmt(run[1].x, precision) + ' ' + fmt(run[1].y, precision); continue; }
      const curves = fitCurve(run.map((p) => [p.x, p.y]), fitErr);
      for (const [, c1, c2, p3] of curves) out += 'C' + [c1, c2, p3].map((p) => fmt(p[0], precision) + ' ' + fmt(p[1], precision)).join(' ');
    }
    if (sub.closed) out += 'z';
  }
  return out;
}
