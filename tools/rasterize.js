// Render dist/svg/*.svg to PNG at 1x, 2x and 4x.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG = path.join(ROOT, 'dist', 'svg');
const scales = (process.argv[2] || '1,2,4').split(',').map(Number);

for (const scale of scales) {
  const out = path.join(ROOT, 'dist', 'png', scale === 1 ? '16' : `16@${scale}x`);
  fs.mkdirSync(out, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(SVG).filter((f) => f.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(SVG, f), 'utf8');
    const png = render(svg, scale).png();
    fs.writeFileSync(path.join(out, f.replace(/\.svg$/, '.png')), png);
    n++;
  }
  console.log(`${n} PNGs at ${scale}x -> ${path.relative(ROOT, out)}`);
}
