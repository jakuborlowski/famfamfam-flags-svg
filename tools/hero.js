// docs/hero.png for the README: the 2005 originals next to this set.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codes = ['pl', 'us', 'gb', 'jp', 'br', 'es', 'no', 'ua', 'za', 'ch', 'np', 'kr'];
const S = 4, gap = 10, x0 = 10, labelW = 140;
const cell = (c) => (c === 'ch' ? 11 : c === 'np' ? 9 : 16) * S;
let x = x0 + labelW, items = [];
for (const c of codes) { items.push({ c, x, w: cell(c) }); x += cell(c) + gap; }
const W = x - gap + x0, rowH = 11 * S, H = 10 + rowH + 18 + rowH + 10;
const b64 = (f) => fs.readFileSync(f).toString('base64');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#555">`;
svg += `<rect width="${W}" height="${H}" fill="#fff"/>`;
svg += `<text x="${x0}" y="${10 + rowH / 2 + 4}">2005, 16 px PNG, ×4</text>`;
svg += `<text x="${x0}" y="${10 + rowH + 18 + rowH / 2 + 4}">now, SVG at 64 px</text>`;
for (const { c, x, w } of items) {
  const legacy = fs.existsSync(path.join(ROOT, 'ref/png', c + '.png')) ? c : null;
  if (legacy) svg += `<image x="${x}" y="10" width="${w}" height="${rowH}" image-rendering="optimizeSpeed" style="image-rendering:pixelated" xlink:href="data:image/png;base64,${b64(path.join(ROOT, 'ref/png', c + '.png'))}"/>`;
  const flag = fs.readFileSync(path.join(ROOT, 'dist/svg', c + '.svg'), 'utf8');
  svg += `<image x="${x}" y="${10 + rowH + 18}" width="${w}" height="${rowH}" xlink:href="data:image/svg+xml;base64,${Buffer.from(flag).toString('base64')}"/>`;
}
svg += `</svg>`;
const out = new (await import('@resvg/resvg-js')).Resvg(svg, { fitTo: { mode: 'zoom', value: 2 }, font: { loadSystemFonts: true } }).render().asPng();
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'hero.png'), out);
console.log(`docs/hero.png ${W * 2}x${H * 2}`);
