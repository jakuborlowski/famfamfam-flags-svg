// Bake Mark's frame into a finished icon. The frame colour depends on the
// colour underneath (style.js FRAME), so it cannot be one overlay over
// unknown artwork; but the build knows the artwork. Render it alone, read the
// colours along the 1-unit ring, split each edge into runs of one colour and
// paint every run with that colour's frame ramp. Runs are trapezoids between
// the outer and inner line of the ring, so diagonals stay diagonal; within a
// band each run extends to the band's end and later runs paint over it, so
// neighbouring runs never leave an anti-aliased seam.
import { render } from './render.js';
import { frameColor, FRAME, BEVEL, COS, SIN } from './style.js';
import { toHex, parseColor } from './color.js';

// How the ring is read. These are sampling settings, not style: the frame's
// look is FRAME in style.js, and its smallest run is FRAME.minRun.
const S = 32;            // px per icon unit when reading the ring
const TOL = 6;           // max channel difference (/255) within one run
const SNAP = 24;         // a run within this of a colour the artwork declares takes that colour
const MAX_COLOURS = 8;   // distinct frame ramps per icon; rarer colours snap to the nearest
const DEPTH = 0.15;      // the outer line is read this far in, clear of the artwork's own edge

const fmt = (v) => String(+v.toFixed(2));
const near = (a, b, t = TOL) => Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t;

// Split a line of samples into runs [{ rgb, a, b }] in icon units (0..len).
function runs(line, minPx) {
  const raw = [];
  for (let i = 0; i < line.length; i++) {
    const last = raw[raw.length - 1];
    if (last && near(last.rgb, line[i])) { last.n++; last.sum = last.sum.map((s, c) => s + line[i][c]); }
    else raw.push({ rgb: line[i], i, n: 1, sum: [...line[i]] });
  }
  const stable = raw.filter((r) => r.n >= minPx).map((r) => ({ rgb: r.sum.map((s) => s / r.n), i: r.i, n: r.n }));
  if (!stable.length) {   // no flat colour at all (a gradient): one run of the mean
    const m = [0, 1, 2].map((c) => line.reduce((s, p) => s + p[c], 0) / line.length);
    return [{ rgb: m, a: 0, b: line.length / S }];
  }
  // merge neighbouring stable runs of the same colour (a tiny detail between them is dropped)
  const merged = [];
  for (const r of stable) {
    const last = merged[merged.length - 1];
    if (last && near(last.rgb, r.rgb)) last.end = r.i + r.n;
    else merged.push({ rgb: r.rgb, i: r.i, end: r.i + r.n });
  }
  // boundaries: inside a transition, each sample is split by its mix of the two colours
  const out = merged.map((r) => ({ rgb: r.rgb, a: r.i / S, b: r.end / S }));
  out[0].a = 0; out[out.length - 1].b = line.length / S;
  for (let k = 0; k + 1 < merged.length; k++) {
    const A = merged[k].rgb, B = merged[k + 1].rgb, d = B.map((v, c) => v - A[c]);
    const dd = d.reduce((s, v) => s + v * v, 0) || 1;
    let cut = merged[k].end;
    for (let i = merged[k].end; i < merged[k + 1].i; i++) {
      const t = Math.min(1, Math.max(0, line[i].reduce((s, v, c) => s + (v - A[c]) * d[c], 0) / dd));
      cut += 1 - t;
    }
    out[k].b = out[k + 1].a = cut / S;
  }
  return out;
}

// The four bands of the ring: top and bottom span the full width (corners
// included), left and right fill in between. band.at(t, s) maps a position
// t along the band and a depth s into it (0 outer, 1 inner) to icon units.
function bands(W, H) {
  return [
    { at: (t, s) => [t, s], from: 0, len: W, side: 'top' },
    { at: (t, s) => [t, H - s], from: 0, len: W, side: 'bottom' },
    { at: (t, s) => [s, t], from: 1, len: H - 2, side: 'left' },
    { at: (t, s) => [W - s, t], from: 1, len: H - 2, side: 'right' },
  ];
}

// A gradient of frame colours for one base colour, along the overlay's axis.
// Every ramp carries its own coordinates rather than inheriting another's,
// which every SVG renderer understands.
function ramp(id, rgb) {
  const u0 = FRAME.knots[0], u1 = FRAME.knots[FRAME.knots.length - 1];
  const at = (u) => [(u * COS).toFixed(3), (u * SIN).toFixed(3)];
  const [x1, y1] = at(u0), [x2, y2] = at(u1);
  const stops = FRAME.knots.map((u, i) =>
    `<stop offset="${+((u - u0) / (u1 - u0)).toFixed(3)}" stop-color="${toHex(frameColor(rgb, i))}"/>`).join('');
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
}

export function bakeFrame(svg, { p, W, H, outline, minRun = FRAME.minRun }) {
  // A non-rectangular icon (Nepal) keeps the generic frame over its own border.
  if (outline) return svg;
  const minPx = Math.round(minRun * S);
  // The artwork alone: drop the overlay (gloss, bevel, shade, frame).
  const art = svg
    .replace(new RegExp(`<(?:rect|path)[^>]*url\\(#${p}-(?:gloss|shade|edge)\\)[^>]*/>`, 'g'), '')
    .replace(new RegExp(`<(?:rect|path)[^>]*(?:fill|stroke)-opacity="${BEVEL.opacity}"[^>]*/>`, 'g'), '');
  const img = render(art, S);
  const px = (x, y) => {   // icon units -> sampled colour /255
    const i = (Math.min(img.height - 1, Math.floor(y * S)) * img.width + Math.min(img.width - 1, Math.floor(x * S))) * 4;
    // A transparent sample (a gap in the artwork) would read as black; it is
    // left out and filled from its neighbours below. Gaps that show in the
    // finished icon are caught by tools/test.js.
    if (img.pixels[i + 3] < 128) return null;
    return [img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]];
  };
  // The colours the artwork declares: a run close to one of them takes it
  // exactly, so anti-aliasing noise doesn't reach the frame colours.
  const declared = [...new Set([...art.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3,6})"/g)].map((m) => m[1].toLowerCase()))]
    .map((h) => parseColor(h).map((v) => v * 255));
  const sample = (band, s) => {
    const out = [];
    for (let j = 0; j < band.len * S; j++) {
      const t = band.from + (j + 0.5) / S;
      out.push(px(...band.at(t, s)));
    }
    const first = out.findIndex((c) => c);
    if (first < 0) throw new Error(`${p}: an edge of the artwork is entirely transparent`);
    for (let j = 0; j < out.length; j++) if (!out[j]) out[j] = out[j - 1] || out[first];
    return out;
  };
  const colours = [];   // distinct base colours, in order of first use
  const colourOf = (rgb) => {
    const d = declared.find((c) => near(c, rgb, SNAP));
    if (d) rgb = d;
    let k = colours.findIndex((c) => near(c, rgb, 2 * TOL));
    if (k < 0) { colours.push(rgb); k = colours.length - 1; }
    return k;
  };

  let frame;
  {
    // Per band: colours from the outer line (Mark's frame is the colour that
    // touches the edge: Sri Lanka's and Montenegro's borders, not the field
    // inside them); boundaries slant to the inner line's when both agree.
    const all = [];
    for (const band of bands(W, H)) {
      const outer = runs(sample(band, DEPTH), minPx), inner = runs(sample(band, 1 - DEPTH), minPx);
      const trap = inner.length === outer.length && inner.every((x, k) => near(x.rgb, outer[k].rgb, 2 * TOL));
      all.push({ band, runs: outer.map((r, k) => ({ c: colourOf(r.rgb), a0: r.a, a1: trap ? inner[k].a : r.a })) });
    }
    // Snap rare colours to the nearest kept one.
    const len = new Map();
    for (const { band, runs: rs } of all) rs.forEach((r, k) => {
      const b = k + 1 < rs.length ? (rs[k + 1].a0 + rs[k + 1].a1) / 2 : band.len;
      len.set(r.c, (len.get(r.c) || 0) + b - (r.a0 + r.a1) / 2);
    });
    const keep = [...len].sort((a, b) => b[1] - a[1]).slice(0, MAX_COLOURS).map(([c]) => c);
    const d2 = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
    const snap = (c) => (keep.includes(c) ? c : keep.reduce((m, k) => (d2(colours[k], colours[c]) < d2(colours[m], colours[c]) ? k : m), keep[0]));
    for (const b of all) {
      b.runs.forEach((r) => { r.c = snap(r.c); });
      b.runs = b.runs.filter((r, k) => k === 0 || r.c !== b.runs[k - 1].c);
    }
    // Paint order: within a band a run is painted before the one after it.
    // Topological order of colours; a cycle (A B A in one band) falls back to
    // one element per run, painted band by band.
    const used = [...new Set(all.flatMap((b) => b.runs.map((r) => r.c)))];
    const before = new Map(used.map((c) => [c, new Set()]));
    for (const b of all) for (let k = 1; k < b.runs.length; k++) before.get(b.runs[k].c).add(b.runs[k - 1].c);
    const order = [], seen = new Set(), onStack = new Set();
    let cyclic = false;
    const visit = (c) => {
      if (seen.has(c)) return; if (onStack.has(c)) { cyclic = true; return; }
      onStack.add(c); for (const d of before.get(c)) visit(d); onStack.delete(c); seen.add(c); order.push(c);
    };
    used.forEach(visit);
    const sub = (b, r) => {
      // run from its start to the band's end: M start-out, along, across, back to start-in
      const { band } = b, e = fmt(band.from + band.len), s0 = fmt(band.from + r.a0), s1 = fmt(band.from + r.a1);
      const [o, i] = [band.at(0, 0), band.at(0, 1)].map((q) => fmt(band.side === 'top' || band.side === 'bottom' ? q[1] : q[0]));
      return band.side === 'top' || band.side === 'bottom' ? `M${s0} ${o}H${e}V${i}H${s1}z` : `M${o} ${s0}V${e}H${i}V${s1}z`;
    };
    const ring = `M0 0h${W}v${H}H0zM1 1v${H - 2}h${W - 2}V1z`;
    if (!cyclic) {
      // the first colour has no predecessor anywhere: it takes the whole ring
      const [first, ...rest] = order;
      frame = { order, paint: [[first, ring],
        ...rest.map((c) => [c, all.flatMap((b) => b.runs.filter((r) => r.c === c).map((r) => sub(b, r))).join('')])] };
    } else {
      // A colour comes back within a band (red-white-red): paint in layers,
      // the k-th run of every band in layer k, one path per colour and layer.
      // The commonest first colour takes the whole ring.
      const firsts = all.map((b) => b.runs[0].c);
      const base = firsts.sort((x, y) => firsts.filter((c) => c === y).length - firsts.filter((c) => c === x).length)[0];
      const paint = [[base, ring]];
      const depth = Math.max(...all.map((b) => b.runs.length));
      for (let k = 0; k < depth; k++) {
        const layer = new Map();
        for (const b of all) {
          const r = b.runs[k];
          if (!r || (k === 0 && r.c === base)) continue;
          layer.set(r.c, (layer.get(r.c) || '') + sub(b, r));
        }
        for (const [c, d] of layer) paint.push([c, d]);
      }
      frame = { order, paint };
    }
  }
  // One ramp per colour; a colour whose ramp is flat (black) is a plain fill.
  const ramps = new Map(), defs = [];
  for (const c of frame.order) {
    const rgb = colours[c].map((v) => v / 255);
    const stops = FRAME.knots.map((_, i) => toHex(frameColor(rgb, i)));
    if (stops.every((x) => x === stops[0])) { ramps.set(c, stops[0]); continue; }   // black: a plain fill
    const id = `${p}-edge${defs.length || ''}`;
    defs.push(ramp(id, rgb));
    ramps.set(c, `url(#${id})`);
  }
  const body = frame.paint.map(([c, d]) => `<path fill="${ramps.get(c)}" d="${d}"/>`).join('');
  return svg
    .replace(new RegExp(`<linearGradient id="${p}-edge"[^>]*>.*?</linearGradient>`), defs.join(''))
    .replace(new RegExp(`<path[^>]*url\\(#${p}-edge\\)[^>]*/>`), body);
}
