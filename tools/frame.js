// Bake Mark's frame into a finished icon. The frame colour depends on the
// colour underneath (style.js FRAME), so it cannot be one overlay over
// unknown artwork; but the build knows the artwork. The frame is the
// artwork's own edge, repainted: the shapes that reach the 1-unit ring are
// copied into icon space, every colour is swapped for its frame ramp, and the
// copy is clipped to the ring. A diagonal stays a diagonal and a wave a wave
// at any size, and at 1× each frame pixel is the darkened pixel it covers.
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import svgpath from 'svgpath';
import { flattenSvg, minify } from './flatten.js';
import { clipToRing } from './ring.js';
import { simplifyPath } from './simplify.js';
import { frameColor, FRAME, COS, SIN } from './style.js';
import { toHex, parseColor } from './color.js';

const PAINTS = ['fill', 'stroke'];
const HAIRLINE = 0.05;
// Pieces of the copy smaller than a hundredth of a pixel are left out. The
// tight frame a file over budget falls back to keeps every shape but draws
// it coarser, within TIGHT units, so frame detail gives way before emblem
// detail without anything in the frame being cut off.
const SPECK = 0.01, TIGHT = 0.05;

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

// Bounding box of path data, control points included (so never too small).
function bbox(d) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x, y) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); };
  svgpath(d).abs().unarc().iterate((seg, i, x, y) => {
    if (seg[0] === 'H') add(seg[1], y);
    else if (seg[0] === 'V') add(x, seg[1]);
    else for (let k = 1; k + 1 < seg.length; k += 2) add(seg[k], seg[k + 1]);
  });
  return b;
}

const elements = (n) => Array.from(n.childNodes).filter((c) => c.nodeType === 1);
const markup = (els) => els.map((e) => new XMLSerializer().serializeToString(e).replace(/ xmlns(?::xlink)?="[^"]*"/g, '')).join('');

export function bakeFrame(svg, { p, W, H, outline, tight = false }) {
  // A non-rectangular icon (Nepal) keeps the generic frame over its own border.
  if (outline) return svg;
  const open = `<g clip-path="url(#${p}-clip)">`;
  const start = svg.indexOf(open) + open.length;
  const art = svg.slice(start, svg.lastIndexOf('<', svg.indexOf(`url(#${p}-gloss)`, start)));

  // The artwork in icon units, every shape a path, every transform baked in.
  let flat;
  const shared = (svg.match(/<defs>(.*?)<\/defs>/s) || [])[1] || '';   // svgo may have moved the artwork's defs up
  try { flat = minify(flattenSvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}"><defs>${shared}</defs>${art}</svg>`, { precision: 2 }), 2); }
  catch (e) { console.log(`  ${p}: generic frame (${e.message})`); return svg; }
  const doc = new DOMParser().parseFromString(flat, 'image/svg+xml');
  const root = doc.documentElement;
  const defs = elements(root).filter((e) => e.tagName === 'defs');
  const byId = new Map();
  for (const d of defs) for (const e of d.getElementsByTagName('*')) if (e.getAttribute('id')) byId.set(e.getAttribute('id'), e);

  // Cut every shape down to its part inside the ring; drop what has none, and
  // groups left empty. A stroked shape is kept whole if it reaches the ring,
  // and then the ring clips the copy; a hairline (under HAIRLINE units, a
  // twentieth of a pixel at 1×) is left out of the frame.
  let stroked = false;
  const reaches = (d, m) => {
    const [x0, y0, x1, y1] = bbox(d);
    return x1 + m > 0 && y1 + m > 0 && x0 - m < W && y0 - m < H && (x0 - m < 1 || y0 - m < 1 || x1 + m > W - 1 || y1 + m > H - 1);
  };
  const cut = (n, inh) => {
    for (const el of elements(n)) {
      if (el.tagName === 'defs') continue;
      const own = { fill: el.getAttribute('fill') || inh.fill, stroke: el.getAttribute('stroke') || inh.stroke, sw: +(el.getAttribute('stroke-width') || inh.sw) };
      if (el.tagName !== 'path') { cut(el, own); if (!elements(el).length) n.removeChild(el); continue; }
      const d = el.getAttribute('d') || '';
      if (own.stroke !== 'none' && own.sw < HAIRLINE) {
        if (own.fill === 'none') { n.removeChild(el); continue; }
        el.setAttribute('stroke', 'none');
      } else if (own.stroke !== 'none') {
        if (reaches(d, own.sw)) stroked = true; else n.removeChild(el);
        continue;
      }
      let inRing = clipToRing(d, W, H, { minArea: SPECK });
      if (inRing && tight) { try { inRing = simplifyPath(inRing, { tol: TIGHT }); } catch { /* keep */ } }
      if (inRing) el.setAttribute('d', inRing); else n.removeChild(el);
    }
  };
  cut(root, { fill: '#000', stroke: 'none', sw: 1 });

  // Every paint becomes its colour's frame ramp; a gradient in the artwork
  // takes the ramp of its mean colour. Mask contents keep their colours.
  const colours = new Map();   // hex -> paint
  const rampOf = (rgb) => {
    const hex = toHex(rgb);
    if (!colours.has(hex)) {
      const stops = FRAME.knots.map((_, i) => toHex(frameColor(rgb, i)));
      colours.set(hex, stops.every((s) => s === stops[0]) ? { paint: stops[0] } : { paint: `url(#${p}-edge${colours.size || ''})`, def: ramp(`${p}-edge${colours.size || ''}`, rgb) });
    }
    return colours.get(hex).paint;
  };
  const meanOf = (grad) => {
    let g = grad, stops = [];
    while (g && !(stops = elements(g).filter((s) => s.tagName === 'stop')).length) g = byId.get((g.getAttribute('xlink:href') || g.getAttribute('href') || '').slice(1));
    const rgbs = stops.map((s) => parseColor(s.getAttribute('stop-color') || '#000')).filter(Boolean);
    return rgbs.length ? [0, 1, 2].map((c) => rgbs.reduce((sum, v) => sum + v[c], 0) / rgbs.length) : null;
  };
  const recolour = (n) => {
    for (const el of elements(n)) {
      if (el.tagName === 'defs') continue;
      for (const a of PAINTS) {
        const v = el.getAttribute(a);
        if (!v) continue;
        const ref = /^url\(#([^)]+)\)/.exec(v);
        const rgb = ref ? meanOf(byId.get(ref[1])) : parseColor(v);
        if (rgb) el.setAttribute(a, rampOf(rgb));
      }
      recolour(el);
    }
  };
  recolour(root);

  // The copy's ids: the ones it refers to (its clip paths, masks) get new
  // names, the rest go. svgo then compacts it and drops unused defs.
  let copyDefs = markup(defs.flatMap(elements)), copy = markup(elements(root).filter((e) => e.tagName !== 'defs'));
  for (const [, id] of [...copyDefs.matchAll(/\bid="([^"]+)"/g), ...copy.matchAll(/\bid="([^"]+)"/g)]) {
    const used = (s) => s.includes(`#${id})`) || s.includes(`href="#${id}"`);
    const to = used(copyDefs) || used(copy) ? `id="${id}-f"` : '';
    const rename = (s) => s.replaceAll(` id="${id}"`, to && ` ${to}`).replaceAll(`#${id})`, `#${id}-f)`).replaceAll(`href="#${id}"`, `href="#${id}-f"`);
    copyDefs = rename(copyDefs); copy = rename(copy);
  }
  const ramps = [...colours.values()].filter((c) => c.def).map((c) => c.def).join('');
  const ring = stroked ? `<clipPath id="${p}-ring"><path d="M0 0h${W}v${H}H0zM1 1v${H - 2}h${W - 2}V1z"/></clipPath>` : '';
  const [, newDefs, body] = minify(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
    `<defs>${ramps}${ring}${copyDefs}</defs><g${stroked ? ` clip-path="url(#${p}-ring)"` : ''}>${copy}</g></svg>`, 2)
    .match(/^<svg[^>]*>(?:<defs>(.*?)<\/defs>)?(.*)<\/svg>$/s) || [];
  if (!body) return svg;   // nothing reaches the ring: the generic frame stays
  // The ramps and the copy take the place of the generic frame.
  return svg
    .replace(new RegExp(`<linearGradient id="${p}-edge"[^>]*>.*?</linearGradient>`), newDefs || '')
    .replace(new RegExp(`<path[^>]*url\\(#${p}-edge\\)[^>]*/>`), body);
}
