// src/catalog.json + artwork -> dist/svg/<code>.svg
//
// For each flag: take the source artwork, restyle its colours, stretch it to
// the icon box, lay the famfamfam overlay on top, then flatten the artwork
// into icon coordinates and, if the file is over budget, reduce it under a
// render-error bound. FAM_COLORS=official keeps official colours;
// FAM_ONLY=pl,jp builds a subset.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradient, GLOSS, BEVEL, SHADE, EDGE, FRAME } from './style.js';
import { stylizeSvg } from './color.js';
import { flattenSvg, minify } from './flatten.js';
import { reduce } from './reduce.js';
import { render, mae } from './render.js';
import { snapEdges } from './snap.js';
import { thinBands, thinDiagonals } from './thin.js';
import { bakeFrame } from './frame.js';

export const BUDGET = 8 * 1024;         // bytes per flag
const CHECK_SCALE = 4;                  // every geometry change is verified at this zoom
const PRECISION = [2, 3];               // decimals in icon units (0.01 = 1/25 px at 4x); 3 if 2 is too coarse
const MAX_FLATTEN_ERR = 0.9;            // mean abs pixel error allowed for flattening alone
const MAX_REDUCE_ERR = [1.0, 1.5, 2.0]; // ... and for reducing oversize flags, tried in turn

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FI = path.join(ROOT, 'node_modules', 'flag-icons', 'flags');
const OUT = path.join(ROOT, 'dist', 'svg');
const OFFICIAL = process.env.FAM_COLORS === 'official';
const ONLY = process.env.FAM_ONLY ? new Set(process.env.FAM_ONLY.split(',')) : null;
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'catalog.json'), 'utf8'));

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const bytes = (s) => Buffer.byteLength(s);

// Root viewBox and inner markup of a source SVG.
function loadSource(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const open = xml.match(/<svg\b[^>]*>/);
  const vb = open && open[0].match(/viewBox="([^"]+)"/);
  if (!vb) throw new Error('no <svg viewBox> in ' + file);
  const [x, y, w, h] = vb[1].trim().split(/[\s,]+/).map(Number);
  const inner = xml.slice(open.index + open[0].length, xml.lastIndexOf('</svg>')).trim();
  return { x, y, w, h, inner, xlink: /xlink:/.test(inner) };
}

// Prefix every id and reference so many flags can share one document, and
// drop accessibility attributes that upstream artwork sometimes carries.
function cleanArt(inner, prefix) {
  let out = inner.replace(/\s(?:aria-[a-z]+|role)="[^"]*"/g, '');
  for (const id of new Set([...out.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`\\bid="${esc}"`, 'g'), `id="${prefix}-${id}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${prefix}-${id})`)
      .replace(new RegExp(`href="#${esc}"`, 'g'), `href="#${prefix}-${id}"`);
  }
  return out;
}

// The overlay on top of the artwork. A non-rectangular icon (Nepal) gives an
// outline path; the frame, bevel and gloss then follow it.
function overlay(p, W, H, outline) {
  if (outline) {
    // Strokes sit on the outline and are clipped to it, so 2 units of stroke = 1 unit inside.
    return `<path d="${outline}" fill="url(#${p}-gloss)"/>` +
      `<path d="${outline}" fill="none" stroke="${BEVEL.color}" stroke-opacity="${BEVEL.opacity}" stroke-width="4"/>` +
      `<path d="${outline}" fill="url(#${p}-shade)"/>` +
      `<path d="${outline}" fill="none" stroke="url(#${p}-edge)" stroke-width="2"/>`;
  }
  const iw = W - 2, ih = H - 2;
  return `<rect x="1" y="1" width="${iw}" height="${ih}" fill="url(#${p}-gloss)"/>` +
    `<path d="M1 1h${iw}v${ih}H1zM2 2v${ih - 2}h${iw - 2}V2z" fill="${BEVEL.color}" fill-opacity="${BEVEL.opacity}" fill-rule="evenodd"/>` +
    `<rect x="1" y="1" width="${iw}" height="${ih}" fill="url(#${p}-shade)"/>` +
    `<path d="M0 0h${W}v${H}H0zM1 1v${ih}h${iw}V1z" fill="url(#${p}-edge)" fill-rule="evenodd"/>`;
}

// Shapes that abut at a fractional pixel each cover part of it, and
// antialiasing composites those partial coverages as if independent, so a
// little of the page shows through: a hairline seam, faint on light pages and
// dark on dark ones, at whatever zoom puts an edge between pixels. Painting
// the artwork three times takes a seam pixel's alpha from 1-c to 1-c^3
// (75% -> 98%) and changes nothing where the artwork already covers.
const PAINTS = 3;
// xlink:href rather than href: SVG 1.1 renderers (librsvg before 2.50,
// Inkscape before 1.3, Batik) only read that, and SVG 2 ones read both.
const artUse = (p) => `<use xlink:href="#${p}-art"/>`.repeat(PAINTS - 1);
export function paintArt(svg, p) {
  const open = `<g clip-path="url(#${p}-clip)">`;
  const start = svg.indexOf(open) + open.length;
  const gloss = svg.indexOf(`url(#${p}-gloss)`, start);
  if (start < open.length || gloss < 0) throw new Error('paintArt: no clip group or overlay in ' + p);
  const end = svg.lastIndexOf('<', gloss);
  return svg.slice(0, start) + `<g id="${p}-art">` + svg.slice(start, end) + '</g>' + artUse(p) + svg.slice(end);
}

export function compose({ code, source, width: W, title, outline, keepColors, yellow, blue, native }) {
  const H = 11;
  const src = loadSource(source);
  const p = 'f' + code.replace(/[^a-z0-9]/gi, '');
  let art = cleanArt(src.inner, p);
  if (!OFFICIAL && !keepColors) art = stylizeSvg(art, { yellow, blue });
  const sx = W / src.w, sy = H / src.h;
  const xlink = ' xmlns:xlink="http://www.w3.org/1999/xlink"';   // the extra paints use xlink:href
  const clip = outline ? `<path d="${outline}"/>` : `<rect width="${W}" height="${H}"/>`;
  const wrap = (artMarkup) =>
    `<svg xmlns="http://www.w3.org/2000/svg"${xlink} width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<title>${escapeXml(title)}</title>` +
    `<defs>${gradient(`${p}-gloss`, GLOSS)}${gradient(`${p}-shade`, SHADE)}${gradient(`${p}-edge`, EDGE)}<clipPath id="${p}-clip">${clip}</clipPath></defs>` +
    `<g clip-path="url(#${p}-clip)">${artMarkup}${overlay(p, W, H, outline)}</g></svg>\n`;

  const raw = wrap(`<g transform="matrix(${sx.toPrecision(6)} 0 0 ${sy.toPrecision(6)} ${(-src.x * sx).toFixed(3)} ${(-src.y * sy).toFixed(3)})">${art}</g>`);
  const ref = render(raw, CHECK_SCALE);
  let best = { svg: raw, note: 'unflattened' };
  // Bake only the uniform part of the icon scale into the paths; the residual
  // stretch stays on a wrapper so stroke widths stretch correctly.
  const u = Math.sqrt(sx * sy);
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}">` +
    `<g transform="matrix(${u} 0 0 ${u} ${(-src.x * u).toFixed(4)} ${(-src.y * u).toFixed(4)})">${art}</g></svg>`;
  const residual = Math.abs(sx - sy) < 1e-9 ? '' : ` transform="scale(${(sx / u).toFixed(5)} ${(sy / u).toFixed(5)})"`;
  for (const precision of PRECISION) {
    try {
      const flat = minify(flattenSvg(doc, { precision }), precision);
      const candidate = wrap(`<g${residual}>${flat.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</g>`);
      const err = mae(ref, render(candidate, CHECK_SCALE));
      if (err <= MAX_FLATTEN_ERR) { best = { svg: candidate, note: `flattened, error ${err.toFixed(2)}`, flat: true }; break; }
      best = { svg: raw, note: `kept unflattened, error ${err.toFixed(2)}` };
    } catch (e) {
      best = { svg: raw, note: `kept unflattened: ${e.message}` };
      break;
    }
  }
  // Mark's pixel rules for flattened artwork, whose coordinates are final:
  // nothing thinner than a pixel, vertical band edges on whole pixels. They
  // are intended changes, so reduction then measures against the result.
  // A rule that would open a gap in the artwork (as the 0.1.3 snap did in
  // Canada) is skipped for that flag.
  let target = ref;
  if (best.flat) {
    const opacity = (svg) => { const px = render(svg, CHECK_SCALE).pixels; let m = 255; for (let i = 3; i < px.length; i += 4) m = Math.min(m, px[i]); return m; };
    const floor = Math.min(240, opacity(best.svg));
    let adjusted = best.svg;
    for (const rule of native ? [snapEdges] : [thinDiagonals, thinBands, snapEdges]) {
      const next = rule(adjusted);
      if (next !== adjusted && opacity(next) >= floor) adjusted = next;
    }
    if (adjusted !== best.svg) { best = { ...best, svg: adjusted }; target = render(adjusted, CHECK_SCALE); }
  }
  // Bytes added after reduction (the baked frame, the extra paints) come out
  // of the budget it aims for.
  // Only the coarse frame's cost is reserved: frame detail gives way before
  // emblem detail.
  const frame = (svg, minRun) => bakeFrame(svg, { p, W, H, outline, minRun });
  const budget = BUDGET - bytes(`<g id="${p}-art"></g>${artUse(p)}`) - (bytes(frame(best.svg, FRAME.minRunTight)) - bytes(best.svg));
  // Shrink a candidate under the reduction bounds.
  const shrink = (b, against) => {
    for (const maxErr of MAX_REDUCE_ERR) {
      if (b.svg === raw || bytes(b.svg) <= budget) break;
      const r = reduce(b.svg, { budget, ref: against, scale: CHECK_SCALE, maxErr });
      if (r.bytes < bytes(b.svg)) b = { svg: r.svg, note: `${r.label}, error ${r.err.toFixed(2)}` };
    }
    return b;
  };
  best = { ...shrink(best, target), flat: best.flat };
  // Second candidate for flags still over budget: svgo on the unflattened
  // document, which keeps <use> and source-space precision. Keep whichever ends smaller.
  if (bytes(best.svg) > budget) {
    for (const precision of PRECISION) {
      let m;
      try { m = minify(raw, precision); } catch { break; }
      const err = mae(ref, render(m, CHECK_SCALE));
      if (err > MAX_FLATTEN_ERR) continue;
      const alt = shrink({ svg: m, note: `minified unflattened, error ${err.toFixed(2)}` }, ref);
      if (bytes(alt.svg) < bytes(best.svg)) best = { ...alt, note: alt.note + ' (unflattened)', flat: false };
      break;
    }
  }
  let svg = paintArt(frame(best.svg), p);
  if (bytes(svg) > BUDGET) {
    const tight = paintArt(frame(best.svg, FRAME.minRunTight), p);
    if (bytes(tight) < bytes(svg)) svg = tight;
  }
  return { ...best, svg };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!ONLY) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const report = [];
  for (const e of catalog) {
    if (ONLY && !ONLY.has(e.code)) continue;
    const width = e.width || (e.shape === '1x1' ? 11 : 16);
    const source = e.source ? path.join(ROOT, 'src', 'flags', e.source) : path.join(FI, e.shape || '4x3', (e.from || e.code) + '.svg');
    for (const code of [e.code, ...(e.aliases || [])]) {
      const { svg, note } = compose({ code, source, width, title: e.name, outline: e.outline, keepColors: e.colors === 'keep', yellow: e.yellow, blue: e.blue, native: /^icon-native/.test(e.note || '') });
      fs.writeFileSync(path.join(OUT, code + '.svg'), svg);
      report.push({ code, bytes: bytes(svg), kb: (bytes(svg) / 1024).toFixed(1), note });
    }
  }
  console.log(`wrote ${report.length} flags to dist/svg`);
  for (const r of report.filter((r) => /unflattened/.test(r.note))) console.log(`  ${r.code}: ${r.note}`);
  const reduced = report.filter((r) => /geometry|pruned/.test(r.note));
  if (reduced.length) console.log(`reduced ${reduced.length}: ${reduced.map((r) => `${r.code} ${r.kb}K`).join(', ')}`);
  const over = report.filter((r) => r.bytes > BUDGET).sort((a, b) => b.bytes - a.bytes);
  console.log(`over ${BUDGET / 1024} KB: ${over.length}${over.length ? ' -> ' + over.map((r) => `${r.code} ${r.kb}K`).join(', ') : ''}`);
}
