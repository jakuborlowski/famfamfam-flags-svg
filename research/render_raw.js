// Render every legacy flag at 1x WITHOUT the overlay layers, into tmp/raw/.
// fit_palette.py compares these (official colours) against the originals.
//   node research/render_raw.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../tools/render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/catalog.json'), 'utf8'));
const out = path.join(ROOT, 'tmp/raw');
fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const e of catalog) {
  if (!e.legacy || e.outline) continue;
  let svg = fs.readFileSync(path.join(ROOT, 'dist/svg', e.code + '.svg'), 'utf8');
  svg = svg.replace(/<rect x="1" y="1"[^>]*gloss\)"\/>/, '').replace(/<path d="M1 1h[^>]*\/>/, '')
    .replace(/<rect x="1" y="1"[^>]*shade\)"\/>/, '').replace(/<path d="M0 0h[^>]*edge\)"[^>]*\/>/, '');
  const name = (e.aliases || []).find((a) => fs.existsSync(path.join(ROOT, 'ref/png', a + '.png'))) || e.code;
  fs.writeFileSync(path.join(out, name + '.png'), render(svg, 1).png());
  n++;
}
console.log(`${n} overlay-free renders -> tmp/raw (build with FAM_COLORS=official first)`);
