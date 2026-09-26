// Flatten flag artwork into the icon's coordinate space.
//
// Source SVGs carry nested transforms and coordinates in a 640x480 (or larger)
// space with full precision, which is most of the bytes in an emblem flag.
// This walks the tree, multiplies every transform down into the path data,
// converts basic shapes to paths, inlines <use>, re-targets clip paths and
// user-space gradients, scales stroke widths, and rounds coordinates to a
// given precision in the 16x11 space. The caller verifies the result by
// rendering before and after.
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import svgpath from 'svgpath';
import { optimize } from 'svgo';

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const CONTAINERS = new Set(['g', 'a', 'switch']);
const DEFS = new Set(['defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'marker', 'symbol', 'pattern']);
const SKIP = new Set(['title', 'desc', 'metadata', 'style']);

// --- matrices: [a, b, c, d, e, f] ---------------------------------------
const I = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const mstr = (m) => `matrix(${m.join(' ')})`;
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

export function parseTransform(str) {
  let m = I;
  if (!str) return m;
  for (const [, fn, argStr] of str.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = argStr.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let t;
    switch (fn) {
      case 'matrix': t = a; break;
      case 'translate': t = [1, 0, 0, 1, a[0], a[1] || 0]; break;
      case 'scale': t = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0]; break;
      case 'rotate': {
        const r = (a[0] * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
        t = [cos, sin, -sin, cos, 0, 0];
        if (a.length > 1) t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case 'skewX': t = [1, 0, Math.tan((a[0] * Math.PI) / 180), 1, 0, 0]; break;
      case 'skewY': t = [1, Math.tan((a[0] * Math.PI) / 180), 0, 1, 0, 0]; break;
      default: throw new Error('unknown transform ' + fn);
    }
    m = mul(m, t);
  }
  return m;
}

// --- shapes to path data --------------------------------------------------
const num = (el, name, dflt = 0) => { const v = el.getAttribute(name); return v === null || v === '' ? dflt : parseFloat(v); };
function shapeToPath(el) {
  const tag = el.tagName;
  if (tag === 'path') return el.getAttribute('d') || '';
  if (tag === 'rect') {
    const x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height');
    let rx = num(el, 'rx', NaN), ry = num(el, 'ry', NaN);
    if (isNaN(rx) && isNaN(ry)) return `M${x} ${y}h${w}v${h}h${-w}z`;
    if (isNaN(rx)) rx = ry; if (isNaN(ry)) ry = rx;
    rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
    return `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${h - 2 * ry}a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${-(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${-(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${rx} ${-ry}z`;
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = num(el, 'cx'), cy = num(el, 'cy');
    const rx = tag === 'circle' ? num(el, 'r') : num(el, 'rx'), ry = tag === 'circle' ? rx : num(el, 'ry');
    return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;
  }
  if (tag === 'line') return `M${num(el, 'x1')} ${num(el, 'y1')}L${num(el, 'x2')} ${num(el, 'y2')}`;
  if (tag === 'polyline' || tag === 'polygon') {
    const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
    let d = '';
    for (let i = 0; i < pts.length; i += 2) d += (i ? 'L' : 'M') + pts[i] + ' ' + pts[i + 1];
    return d + (tag === 'polygon' ? 'z' : '');
  }
  throw new Error('not a shape: ' + tag);
}

// --- the walk --------------------------------------------------------------
export function flattenSvg(xml, { precision = 2 } = {}) {
  const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
  const root = doc.documentElement;
  const byId = new Map();          // live elements (defs are never mutated in place)
  const pristine = new Map();      // untouched copies, for inlining <use> targets
  const walkIds = (el, map) => { if (el.nodeType !== 1) return; const id = el.getAttribute('id'); if (id) map.set(id, el); for (const c of Array.from(el.childNodes)) walkIds(c, map); };
  walkIds(root, byId);
  walkIds(root.cloneNode(true), pristine);
  const defsHost = (() => { for (const c of Array.from(root.childNodes)) if (c.nodeType === 1 && c.tagName === 'defs') return c; const d = doc.createElement('defs'); root.insertBefore(d, root.firstChild); return d; })();
  const resolved = new Map();   // `${id}|${ctm}` -> new id
  let counter = 0;
  const refOf = (v) => { const m = /url\(#([^)]+)\)/.exec(v || ''); return m ? m[1] : null; };
  const hrefOf = (el) => (el.getAttribute('href') || el.getAttribute('xlink:href') || '').replace(/^#/, '');
  const isUnit = (m) => m.every((v, i) => Math.abs(v - I[i]) < 1e-12);

  // A def (clipPath/mask/gradient) referenced from an element whose ctm has been
  // baked away must itself be moved into the new space. Clone per distinct ctm.
  function resolveDef(id, ctm) {
    const src = byId.get(id);
    if (!src) return id;
    const tag = src.tagName;
    const isGrad = tag === 'linearGradient' || tag === 'radialGradient';
    if (isGrad && (src.getAttribute('gradientUnits') || 'objectBoundingBox') !== 'userSpaceOnUse') return id;
    if (tag === 'pattern') throw new Error('pattern not supported');
    if (isUnit(ctm)) return id;
    const key = id + '|' + ctm.map((v) => v.toFixed(6)).join(',');
    if (resolved.has(key)) return resolved.get(key);
    const clone = src.cloneNode(true);
    const newId = `${id}${++counter}`;
    clone.setAttribute('id', newId);
    if (isGrad) {
      clone.setAttribute('gradientTransform', mstr(mul(ctm, parseTransform(src.getAttribute('gradientTransform')))));
    } else {
      if (tag === 'clipPath' && (src.getAttribute('clipPathUnits') || 'userSpaceOnUse') !== 'userSpaceOnUse') throw new Error('clipPathUnits=objectBoundingBox not supported');
      if (tag === 'mask' && (src.getAttribute('maskContentUnits') || 'userSpaceOnUse') !== 'userSpaceOnUse') throw new Error('maskContentUnits=objectBoundingBox not supported');
      for (const c of Array.from(clone.childNodes)) bake(c, ctm, { sw: 1, stroke: 'none' });
    }
    defsHost.appendChild(clone);
    byId.set(newId, clone);
    resolved.set(key, newId);
    return newId;
  }

  function bakeRefs(el, ctm) {
    for (const attr of ['clip-path', 'mask', 'fill', 'stroke']) {
      const id = refOf(el.getAttribute(attr));
      if (id) el.setAttribute(attr, `url(#${resolveDef(id, ctm)})`);
    }
  }

  // inherited: { sw: stroke-width in local units, stroke: effective stroke paint }
  function bake(el, ctm, inherited) {
    if (el.nodeType !== 1) return;
    const tag = el.tagName;
    if (SKIP.has(tag) || DEFS.has(tag)) return;          // defs are handled via references
    if (tag === 'text' || tag === 'image' || tag === 'filter' || tag === 'foreignObject') throw new Error(tag + ' not supported');
    if (el.hasAttribute('filter')) throw new Error('filter not supported');
    const own = parseTransform(el.getAttribute('transform'));
    const m = mul(ctm, own);
    el.removeAttribute('transform');
    const inh = { ...inherited };
    if (el.hasAttribute('stroke')) inh.stroke = el.getAttribute('stroke');
    if (el.hasAttribute('stroke-width')) { inh.sw = parseFloat(el.getAttribute('stroke-width')); el.removeAttribute('stroke-width'); }
    if (el.hasAttribute('stroke-dasharray')) throw new Error('stroke-dasharray not supported');
    bakeRefs(el, m);                                     // clip-path applies in the element's own space

    if (tag === 'use') {
      const target = pristine.get(hrefOf(el));
      if (!target) throw new Error('use target missing: ' + hrefOf(el));
      const g = doc.createElement('g');
      for (const a of Array.from(el.attributes)) if (!['href', 'xlink:href', 'x', 'y', 'width', 'height', 'id'].includes(a.name)) g.setAttribute(a.name, a.value);
      const clone = target.cloneNode(true);
      const stripIds = (n) => { if (n.nodeType !== 1) return; n.removeAttribute('id'); for (const c of Array.from(n.childNodes)) stripIds(c); };
      stripIds(clone);
      if (clone.tagName === 'symbol') throw new Error('symbol not supported');
      g.appendChild(clone);
      el.parentNode.replaceChild(g, el);
      const useM = mul(m, [1, 0, 0, 1, num(el, 'x'), num(el, 'y')]);
      // the target keeps its own transform; bake() will fold it in
      bake(clone, useM, inh);
      return;
    }
    if (SHAPES.has(tag)) {
      const d = svgpath(shapeToPath(el)).transform(mstr(m)).round(precision).toString();
      for (const a of ['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points']) el.removeAttribute(a);
      const p = tag === 'path' ? el : doc.createElement('path');
      if (p !== el) { for (const a of Array.from(el.attributes)) p.setAttribute(a.name, a.value); el.parentNode.replaceChild(p, el); }
      p.setAttribute('d', d);
      const stroked = (inh.stroke || 'none') !== 'none' || ['marker-start', 'marker-mid', 'marker-end', 'marker'].some((a) => el.hasAttribute(a));
      if (stroked) p.setAttribute('stroke-width', +(inh.sw * scaleOf(m)).toFixed(precision + 1));
      return;
    }
    if (CONTAINERS.has(tag) || tag === 'svg') {
      for (const c of Array.from(el.childNodes)) bake(c, m, inh);
      return;
    }
    throw new Error('unsupported element ' + tag);
  }

  for (const c of Array.from(root.childNodes)) bake(c, I, { sw: 1, stroke: 'none' });

  // drop defs nobody references any more
  const out0 = new XMLSerializer().serializeToString(doc);
  for (const c of Array.from(defsHost.childNodes)) {
    if (c.nodeType !== 1) continue;
    const id = c.getAttribute('id');
    if (id && !out0.includes(`#${id})`) && !out0.includes(`#${id}"`)) defsHost.removeChild(c);
  }
  if (!defsHost.hasChildNodes()) defsHost.parentNode.removeChild(defsHost);
  return new XMLSerializer().serializeToString(doc);
}

// svgo pass: merge paths, relative coordinates, strip defaults. Ids are kept.
export function minify(xml, precision = 2) {
  return optimize(xml, {
    multipass: true,
    plugins: [{ name: 'preset-default', params: { overrides: {
      cleanupIds: false,
      removeUnknownsAndDefaults: { keepRoleAttr: true },
      convertPathData: { floatPrecision: precision },
      cleanupNumericValues: { floatPrecision: precision },
      convertTransform: { floatPrecision: precision + 2 },
    } } }],
  }).data;
}
