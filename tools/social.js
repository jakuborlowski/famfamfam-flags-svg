// docs/social.png: 1280x640 social preview for the GitHub repo page.
// Upload it in Settings -> General -> Social preview.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1280, H = 640, S = 6, gapX = 16, gapY = 18;
const rows = [
  ['us', 'gb', 'de', 'fr', 'jp', 'br', 'ca', 'kr', 'es', 'it'],
  ['no', 'se', 'ch', 'np', 'pl', 'ua', 'in', 'za', 'mx', 'ar'],
  ['au', 'cn', 'gr', 'tr', 'pt', 'nl', 'ie', 'fi', 'dk', 'be'],
];
const cellW = 16 * S, cellH = 11 * S;
const gridW = rows[0].length * cellW + (rows[0].length - 1) * gapX;
const x0 = (W - gridW) / 2, y0 = 262;
const b64 = (s) => Buffer.from(s).toString('base64');

let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">`;
svg += `<rect width="${W}" height="${H}" fill="#fafafa"/>`;
svg += `<text x="${x0}" y="128" font-size="60" font-weight="700" fill="#1d1d1f">famfamfam-flags-svg</text>`;
svg += `<text x="${x0}" y="184" font-size="30" fill="#555">Mark James' 16×11 flag icons, rebuilt as SVG. Same look, any size.</text>`;
rows.forEach((row, r) => row.forEach((c, i) => {
  const w = (c === 'ch' ? 11 : c === 'np' ? 9 : 16) * S;
  const x = x0 + i * (cellW + gapX) + (cellW - w) / 2, y = y0 + r * (cellH + gapY);
  const flag = fs.readFileSync(path.join(ROOT, 'dist/svg', c + '.svg'), 'utf8');
  svg += `<image x="${x}" y="${y}" width="${w}" height="${cellH}" xlink:href="data:image/svg+xml;base64,${b64(flag)}"/>`;
}));
const yb = y0 + 3 * cellH + 2 * gapY + 70;
svg += `<text x="${x0}" y="${yb}" font-size="26" fill="#777">274 flags · crisp at 1×, sharp at 4× · MIT</text>`;
svg += `</svg>`;

const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
fs.writeFileSync(path.join(ROOT, 'docs', 'social.png'), png);
console.log(`docs/social.png ${W}x${H}, ${(png.length / 1024).toFixed(0)} KB`);
