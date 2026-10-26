// The guarantees stated in the README, checked on dist/svg, and the docs
// checked against the package.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { render } from './render.js';
import { BUDGET } from './build.js';
import { pack, pkg, packaged, examples, CDN, ISO } from './pack.js';

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
for (const code of ISO) if (!files.includes(code + '.svg')) fail(`no flag for ISO 3166-1 code ${code}`);

// Non-rectangular icons (Nepal) are transparent outside their outline.
const outlined = new Set(catalog.filter((e) => e.outline).flatMap((e) => [e.code, ...(e.aliases || [])]));

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
    const rect = !outlined.has(code);
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

// Generated files are current: the stylesheet, manifest, JS entry, llms.txt,
// and the version, SRI hash and figures in README.md and examples/. Agents
// copy snippets verbatim, so a stale one is a broken page.
let packed = {};
try { packed = pack(); } catch (e) { fail(`npm run pack fails: ${e.message}`); }
for (const [file, text] of Object.entries(packed)) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== text) fail(`${file} is out of date: run npm run pack`);
}

// Every CDN link in the docs is to this version and to a file the npm package
// ships.
for (const doc of ['README.md', 'llms.txt', ...examples()]) {
  const text = fs.readFileSync(path.join(ROOT, doc), 'utf8');
  for (const [url, version, rel] of text.matchAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/famfamfam-flags-svg@([^/\s"'`)]*)\/?([\w./@-]*)/g)) {
    if (version !== pkg.version) fail(`${doc}: ${url} is not version ${pkg.version}`);
    if (!rel) continue;
    if (!fs.existsSync(path.join(ROOT, rel)) || !packaged(rel.replace(/\/$/, ''))) fail(`${doc}: ${url} is not in the npm package`);
  }
}

// Package entry points resolve to files it ships; a pattern, to a folder of them.
for (const [key, target] of Object.entries({ main: pkg.main, types: pkg.types, ...pkg.exports })) {
  for (const t of typeof target === 'string' ? [target] : Object.values(target)) {
    const rel = t.replace(/^\.\//, '');
    const ok = rel.endsWith('*') ? pkg.files.some((f) => (f + '/').startsWith(rel.slice(0, -1)))
      : packaged(rel) && fs.existsSync(path.join(ROOT, rel));
    if (!ok) fail(`package.json ${key}: ${t} is not in the package`);
  }
}

// The JS entry: either case, unknown codes as xx, a base for self-hosting.
const entry = await import(pathToFileURL(path.join(ROOT, 'dist', 'index.js')));
for (const [what, got, want] of [
  ['flagUrl("pl")', entry.flagUrl('pl'), `${CDN}dist/svg/pl.svg`],
  ['flagUrl("GB-SCT")', entry.flagUrl('GB-SCT'), `${CDN}dist/svg/gb-sct.svg`],
  ['flagUrl("en")', entry.flagUrl('en'), `${CDN}dist/svg/xx.svg`],
  ['flagUrl("Pl")', entry.flagUrl('Pl'), `${CDN}dist/svg/xx.svg`],
  ['flagUrl("pl", "/flags/")', entry.flagUrl('pl', '/flags/'), '/flags/pl.svg'],
  ['isFlagCode("UK")', entry.isFlagCode('UK'), true],
  ['isFlagCode("Pl")', entry.isFlagCode('Pl'), false],
  ['isFlagCode("toString")', entry.isFlagCode('toString'), false],
  ['isFlagCode(undefined)', entry.isFlagCode(undefined), false],
  ['flags.toString', entry.flags.toString, undefined],
  ['flags', Object.keys(entry.flags).length, files.length],
]) if (got !== want) fail(`dist/index.js: ${what} is ${got}, expected ${want}`);

if (failures.length) { console.error(failures.join('\n')); console.error(`\n${failures.length} failures`); process.exit(1); }
console.log(`${files.length} files ok: well-formed, titled, prefixed ids, no scripts, aria or external refs, within budget, no gaps, crisp at 1x, ` +
  `every ISO 3166-1 country; docs, snippets and JS entry current`);
