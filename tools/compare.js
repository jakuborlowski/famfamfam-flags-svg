// Rasterize each legacy flag at 1x and compare with Mark James' original PNG.
// Writes a side-by-side sheet (original | ours, 4x nearest) plus per-flag error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { render } from './render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = path.join(ROOT, 'ref', 'png');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'catalog.json'), 'utf8'));
const only = process.argv[2] ? process.argv[2].split(',') : null;

const rows = [];
for (const e of catalog) {
  if (!e.legacy) continue;
  const legacyName = (e.aliases || []).find((a) => fs.existsSync(path.join(REF, a + '.png'))) || e.code;
  if (only && !only.includes(e.code) && !only.includes(legacyName)) continue;
  const refFile = path.join(REF, legacyName + '.png');
  if (!fs.existsSync(refFile)) continue;
  const ref = PNG.sync.read(fs.readFileSync(refFile));
  const svg = fs.readFileSync(path.join(ROOT, 'dist', 'svg', e.code + '.svg'), 'utf8');
  const ours = PNG.sync.read(render(svg, 1).png());
  let err = 0, n = 0, ringErr = 0, ringN = 0;
  const w = Math.min(ref.width, ours.width), h = Math.min(ref.height, ours.height);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * ref.width + x) * 4, j = (y * ours.width + x) * 4;
    if (ref.data[i + 3] < 128) continue;
    const d = Math.abs(ref.data[i] - ours.data[j]) + Math.abs(ref.data[i + 1] - ours.data[j + 1]) + Math.abs(ref.data[i + 2] - ours.data[j + 2]);
    const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    if (border) { ringErr += d; ringN++; } else { err += d; n++; }
  }
  rows.push({ code: e.code, name: legacyName, ref, ours, mae: err / n / 3, ringMae: ringErr / ringN / 3 });
}
rows.sort((a, b) => b.mae - a.mae);
const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
console.log(`flags ${rows.length}  interior MAE ${avg('mae').toFixed(2)}  border MAE ${avg('ringMae').toFixed(2)}`);
console.log('worst:', rows.slice(0, 15).map((r) => `${r.name}:${r.mae.toFixed(1)}`).join(' '));
console.log('best:', rows.slice(-10).map((r) => `${r.name}:${r.mae.toFixed(1)}`).join(' '));

// Sheet: each cell = original (4x) | ours (4x)
const S = 4, cols = 8, cw = 40 * S, ch = 14 * S;
const nrows = Math.ceil(rows.length / cols);
const sheet = new PNG({ width: cols * cw, height: nrows * ch });
sheet.data.fill(255);
const blit = (png, ox, oy) => {
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4; const a = png.data[i + 3] / 255;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const j = ((oy + y * S + dy) * sheet.width + ox + x * S + dx) * 4;
      for (let c = 0; c < 3; c++) sheet.data[j + c] = Math.round(png.data[i + c] * a + 255 * (1 - a));
    }
  }
};
rows.sort((a, b) => a.name.localeCompare(b.name));
rows.forEach((r, i) => {
  const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
  blit(r.ref, ox + 2 * S, oy + S);
  blit(r.ours, ox + 20 * S, oy + S);
});
fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tmp', 'compare.png'), PNG.sync.write(sheet));
fs.writeFileSync(path.join(ROOT, 'tmp', 'compare.json'), JSON.stringify(rows.map(({ code, name, mae, ringMae }) => ({ code, name, mae, ringMae })), null, 1));
console.log('sheet -> tmp/compare.png');
