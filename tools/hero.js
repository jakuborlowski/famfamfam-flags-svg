// The README's pictures: docs/hero.png, the 2005 originals next to this set,
// and docs/anatomy.png, one icon built up layer by layer.
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
const { Resvg } = await import('@resvg/resvg-js');
const png = (markup) => new Resvg(markup, { fitTo: { mode: 'zoom', value: 2 }, font: { loadSystemFonts: true } }).render().asPng();
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'hero.png'), png(svg));
console.log(`docs/hero.png ${W * 2}x${H * 2}`);

// Anatomy: Sweden cut off after each layer of the overlay, in paint order.
{
  const flag = fs.readFileSync(path.join(ROOT, 'dist/svg/se.svg'), 'utf8');
  const before = (mark) => flag.lastIndexOf('<', flag.indexOf(mark));
  const shade = flag.indexOf('fill="url(#fse-shade)"');
  const cuts = [
    ['artwork', before('fill="url(#fse-gloss)"')],
    ['+ gloss', before('fill-opacity=')],
    ['+ bevel', before('fill="url(#fse-shade)"')],
    ['+ shade', flag.indexOf('>', shade) + 1],
    ['+ frame', flag.lastIndexOf('</g></svg>')],
  ];
  const K = 9, cw = 16 * K, ch = 11 * K, gap = 28, AW = 2 * x0 + cuts.length * cw + (cuts.length - 1) * gap, AH = 10 + ch + 30;
  let a = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${AW}" height="${AH}" viewBox="0 0 ${AW} ${AH}" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#555" text-anchor="middle">`;
  a += `<rect width="${AW}" height="${AH}" fill="#fff"/>`;
  cuts.forEach(([label, end], i) => {
    const x = x0 + i * (cw + gap), layer = flag.slice(0, end) + '</g></svg>';
    a += `<image x="${x}" y="10" width="${cw}" height="${ch}" xlink:href="data:image/svg+xml;base64,${Buffer.from(layer).toString('base64')}"/>`;
    a += `<text x="${x + cw / 2}" y="${10 + ch + 20}">${label}</text>`;
  });
  fs.writeFileSync(path.join(ROOT, 'docs', 'anatomy.png'), png(a + '</svg>'));
  console.log(`docs/anatomy.png ${AW * 2}x${AH * 2}`);
}
