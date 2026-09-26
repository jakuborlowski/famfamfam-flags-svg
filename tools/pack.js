// dist/svg -> dist/famfamfam-flags.css, dist/manifest.json, preview.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG = path.join(ROOT, 'dist', 'svg');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'catalog.json'), 'utf8'));

const files = fs.readdirSync(SVG).filter((f) => f.endsWith('.svg')).sort();
const size = (svg) => svg.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1, 3).map(Number);

// CSS: <span class="famfamfam-flag famfamfam-flag-pl"></span>
let css = `/* famfamfam-flags-svg. Usage: <span class="famfamfam-flag famfamfam-flag-pl"></span> */\n` +
  `.famfamfam-flag{display:inline-block;width:16px;height:11px;vertical-align:middle;background-repeat:no-repeat;background-position:center;background-size:contain}\n`;
for (const f of files) {
  const code = f.replace(/\.svg$/, '');
  const svg = fs.readFileSync(path.join(SVG, f), 'utf8');
  const [w, h] = size(svg);
  css += `.famfamfam-flag-${code}{background-image:url("svg/${f}")${w !== 16 ? `;width:${w}px` : ''}}\n`;
}
fs.writeFileSync(path.join(ROOT, 'dist', 'famfamfam-flags.css'), css);

// Manifest: one record per file, so consumers can generate alt text and test coverage.
const manifest = [];
for (const e of catalog) {
  const svg = fs.readFileSync(path.join(SVG, e.code + '.svg'), 'utf8');
  const [w, h] = size(svg);
  manifest.push({ code: e.code, name: e.name, width: w, height: h, aliases: e.aliases || [], legacy: !!e.legacy, iconNative: /^icon-native/.test(e.note || ''), ...(e.note ? { note: e.note } : {}) });
  for (const alias of e.aliases || []) manifest.push({ code: alias, name: e.name, width: w, height: h, aliasOf: e.code, legacy: true });
}
manifest.sort((a, b) => a.code.localeCompare(b.code));
fs.writeFileSync(path.join(ROOT, 'dist', 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

// Preview page.
const rows = catalog.map((e) => {
  const names = [e.code, ...(e.aliases || [])].join(', ');
  return `<tr><td><img src="dist/svg/${e.code}.svg" alt=""></td><td><img src="dist/svg/${e.code}.svg" width="32" alt=""></td><td><img src="dist/svg/${e.code}.svg" width="64" alt=""></td><td><img src="dist/svg/${e.code}.svg" width="160" alt=""></td><td><code>${names}</code></td><td>${e.name}${e.legacy ? '' : ' <small>(new)</small>'}</td></tr>`;
}).join('\n');
const html = `<!doctype html><meta charset="utf-8"><title>famfamfam-flags-svg</title>
<style>body{font:14px/1.4 system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse}td{padding:4px 12px;vertical-align:middle;border-bottom:1px solid #eee}img{vertical-align:middle;image-rendering:auto}small{color:#888}h1{font-weight:600}</style>
<h1>famfamfam-flags-svg</h1>
<p>${catalog.length} flags at 1x, 2x, 4x and 10x. Original pixel icons by Mark James; vector rebuild on top of flag-icons.</p>
<table>${rows}</table>`;
fs.writeFileSync(path.join(ROOT, 'preview.html'), html);
console.log(`css + manifest for ${files.length} flags, preview.html`);
