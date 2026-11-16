// Geometric simplification of path data already in icon space. The outline is
// sampled densely, Douglas-Peucker picks the points that matter at `tol`
// units and where the corners are, and each run between two corners is
// redrawn the shorter way: as lines through the points kept, or as cubic
// Béziers fitted to every sample of the run. Fitting to the samples rather
// than to the few points kept is what holds a long flat stretch flat.
// 1 unit = 1 px at 1x, so tol=0.05 is a fifth of a pixel at 4x.
import svgpath from 'svgpath';
import simplify from 'simplify-js';
import fitCurve from 'fit-curve';

// Subpaths as point lists: curves sampled every `flatTol` units, lines every
// `gap` units, a closed subpath ending on its first point again.
function sampleSubpaths(d, flatTol, gap) {
  const sp = svgpath(d).abs().unarc().unshort();
  const subs = [];
  let cur = null, x = 0, y = 0, sx = 0, sy = 0;
  const line = (x1, y1) => {
    const n = Math.max(1, Math.min(256, Math.ceil(Math.hypot(x1 - x, y1 - y) / gap)));
    for (let i = 1; i <= n; i++) cur.pts.push({ x: x + (x1 - x) * i / n, y: y + (y1 - y) * i / n });
    x = x1; y = y1;
  };
  sp.iterate((seg) => {
    const c = seg[0];
    if (c === 'M') { cur = { pts: [{ x: seg[1], y: seg[2] }], closed: false }; subs.push(cur); x = sx = seg[1]; y = sy = seg[2]; return; }
    if (!cur || cur.closed) { cur = { pts: [{ x, y }], closed: false }; subs.push(cur); sx = x; sy = y; }   // drawing on after a z
    if (c === 'Z') { if (Math.hypot(sx - x, sy - y) > 1e-9) line(sx, sy); cur.closed = true; return; }
    if (c === 'L') return line(seg[1], seg[2]);
    if (c === 'H') return line(seg[1], y);
    if (c === 'V') return line(x, seg[1]);
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

// The shortest spelling of path data whose points are already on the rounding
// grid: relative coordinates (differences of rounded points, so nothing
// drifts), a command letter only where it changes, h and v for level and
// upright lines, no leading zero, and no separator where a sign or a decimal
// point already separates two numbers.
function spell(subs, precision) {
  const k = 10 ** precision, grid = (p) => [Math.round(p[0] * k), Math.round(p[1] * k)];
  const str = (n) => (n < 0 ? '-' : '') + (Math.abs(n) / k).toFixed(precision).replace(/\.?0+$/, '').replace(/^0\./, '.');
  let out = '', cmd = '', number = false, point = false, x = 0, y = 0;
  const put = (c, ...ns) => {
    if (c !== cmd) { out += c; number = false; }
    for (const n of ns) {
      const s = str(n);
      if (number && s[0] !== '-' && !(s[0] === '.' && point)) out += ' ';
      out += s; number = true; point = s.includes('.');
    }
    cmd = c === 'M' ? 'L' : c === 'm' ? 'l' : c;   // pairs after a moveto are linetos
  };
  for (const { start, segs, closed } of subs) {
    const [sx, sy] = grid(start);
    if (out) put('m', sx - x, sy - y); else put('M', sx, sy);
    x = sx; y = sy;
    segs.forEach((seg, i) => {
      const [ex, ey] = grid(seg[seg.length - 1]);
      if (seg.length === 3) put('c', ...seg.flatMap((p) => { const [px, py] = grid(p); return [px - x, py - y]; }));
      else if (closed && i === segs.length - 1 && ex === sx && ey === sy) return;   // z draws it
      else if (ey === y) { if (ex !== x) put('h', ex - x); }
      else if (ex === x) put('v', ey - y);
      else put('l', ex - x, ey - y);
      x = ex; y = ey;
    });
    if (closed) { out += 'z'; cmd = 'z'; x = sx; y = sy; }
  }
  return out;
}

export function simplifyPath(d, { tol = 0.05, flatTol = 0.01, fitErr = tol / 2, cornerDeg = 35, precision = 2 } = {}) {
  const subs = [];
  for (const sub of sampleSubpaths(d, flatTol, 4 * tol)) {
    sub.pts.forEach((p, i) => { p.i = i; });
    const kept = simplify(sub.pts, tol, true);     // the same point objects, so each knows its place
    if (kept.length < 2) continue;
    // split into runs at corners
    const runs = [[kept[0]]];
    for (let i = 1; i < kept.length; i++) {
      const run = runs[runs.length - 1];
      run.push(kept[i]);
      if (i < kept.length - 1) {
        const a = kept[i - 1], b = kept[i], c = kept[i + 1];
        const v1 = Math.atan2(b.y - a.y, b.x - a.x), v2 = Math.atan2(c.y - b.y, c.x - b.x);
        let ang = Math.abs(v2 - v1) * 180 / Math.PI; if (ang > 180) ang = 360 - ang;
        if (ang > cornerDeg) runs.push([kept[i]]);
      }
    }
    const segs = [];
    for (const run of runs) {
      const lines = run.slice(1).map((p) => [[p.x, p.y]]);
      if (run.length === 2) { segs.push(...lines); continue; }
      const samples = sub.pts.slice(run[0].i, run[run.length - 1].i + 1).map((p) => [p.x, p.y]);
      const curves = fitCurve(samples, fitErr * fitErr).map(([, c1, c2, p3]) => [c1, c2, p3]);   // it takes the squared distance
      segs.push(...(lines.length * 2 < curves.length * 6 ? lines : curves));
    }
    subs.push({ start: [kept[0].x, kept[0].y], segs, closed: sub.closed });
  }
  return spell(subs, precision);
}
