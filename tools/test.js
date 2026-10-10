// The guarantees stated in the README, checked on dist/svg.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { render } from './render.js';
import { BUDGET } from './build.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG = path.join(ROOT, 'dist', 'svg');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'catalog.json'), 'utf8'));
const oversize = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'oversize.json'), 'utf8')));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'manifest.json'), 'utf8'));

const failures = [];
const fail = (msg) => failures.push(msg);
const expected = new Set(catalog.flatMap((e) => [e.code, ...(e.aliases || [])]));
const files = fs.readdirSync(SVG).filter((f) => f.endsWith('.svg'));
for (const code of expected) if (!files.includes(code + '.svg')) fail(`missing ${code}.svg`);
for (const f of files) if (!expected.has(f.replace(/\.svg$/, ''))) fail(`${f} is not in the catalog`);
if (manifest.length !== files.length) fail(`manifest has ${manifest.length} entries for ${files.length} files`);
for (const m of manifest) if (!expected.has(m.code)) fail(`manifest has unknown ${m.code}`);

const allIds = new Map();
for (const f of files) {
  const code = f.replace(/\.svg$/, '');
  const svg = fs.readFileSync(path.join(SVG, f), 'utf8');
  const errors = [];
  new DOMParser({ onError: (level, msg) => { if (level !== 'warning') errors.push(msg); } }).parseFromString(svg, 'image/svg+xml');
  if (errors.length) fail(`${f}: not well-formed: ${errors[0]}`);
  if (!/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) fail(`${f}: unexpected root`);
  if (!/<title>[^<]+<\/title>/.test(svg)) fail(`${f}: no <title>`);
  if (/<script|<foreignObject|<image|<text|<filter|<style/.test(svg)) fail(`${f}: forbidden element`);
  if (/\s(?:on[a-z]+|aria-[a-z]+|role)=/i.test(svg)) fail(`${f}: event handler or accessibility attribute`);
  for (const [, ref] of svg.matchAll(/href="([^"]*)"/g)) if (!ref.startsWith('#')) fail(`${f}: external reference ${ref}`);
  if (/url\((?!#)/.test(svg)) fail(`${f}: external url()`);
  const prefix = 'f' + code.replace(/[^a-z0-9]/gi, '') + '-';
  for (const [, id] of svg.matchAll(/\bid="([^"]+)"/g)) {
    if (!id.startsWith(prefix)) fail(`${f}: id "${id}" not prefixed with ${prefix}`);
    if (allIds.has(id)) fail(`${f}: id "${id}" also in ${allIds.get(id)}`);
    allIds.set(id, f);
  }
  const bytes = Buffer.byteLength(svg);
  if (bytes > BUDGET && !oversize.has(code)) fail(`${f}: ${(bytes / 1024).toFixed(1)} KB over the ${BUDGET / 1024} KB budget (add to src/oversize.json)`);
  if (bytes <= BUDGET && oversize.has(code)) fail(`${f}: in src/oversize.json but within budget, remove it`);
  // No gaps: every pixel of a rectangular icon is opaque at 1x, 2x and 4x
  // (seams between shapes, painted three times, stay above 240).
  try {
    const rect = /<clipPath id="[^"]+"><rect /.test(svg);
    for (const scale of rect ? [1, 2, 4] : [1]) {
      const r = render(svg, scale);
      if (!rect) continue;
      let worst = 255, at = null;
      for (let i = 3; i < r.pixels.length; i += 4) if (r.pixels[i] < worst) { worst = r.pixels[i]; at = (i - 3) / 4; }
      if (worst < 240) fail(`${f}: transparent pixel (alpha ${worst}) at ${at % r.width},${Math.floor(at / r.width)} at ${scale}x`);
    }
  } catch (e) { fail(`${f}: does not render: ${e.message}`); }
}

// The frame and bevel must land on whole pixels at 1x. On the red half of the
// Polish flag the bevel row is visibly lighter than the body row above it,
// and the frame row below it is darker than both.
{
  const r = render(fs.readFileSync(path.join(SVG, 'pl.svg'), 'utf8'), 1);
  const green = (x, y) => r.pixels[(y * r.width + x) * 4 + 1];
  const body = green(8, 8), bevel = green(8, 9), frame = green(8, 10);
  if (!(bevel > body + 20 && frame < bevel - 20)) fail(`pl.svg: frame/bevel not crisp at 1x (green channel body ${body}, bevel ${bevel}, frame ${frame})`);
}

if (failures.length) { console.error(failures.join('\n')); console.error(`\n${failures.length} failures`); process.exit(1); }
console.log(`${files.length} files ok: well-formed, titled, prefixed ids, no scripts, aria or external refs, within budget, no gaps, crisp at 1x`);
