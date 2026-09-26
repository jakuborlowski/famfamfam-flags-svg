// One place to rasterize: no text in any flag, so never scan system fonts
// (that alone made a full build take minutes instead of seconds).
import { Resvg } from '@resvg/resvg-js';

export function render(svg, scale = 1) {
  const out = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale }, font: { loadSystemFonts: false } }).render();
  return { width: out.width, height: out.height, pixels: out.pixels, png: () => out.asPng() };
}

// Mean absolute difference per channel between two renders of the same size.
export function mae(a, b) {
  if (a.pixels.length !== b.pixels.length) throw new Error('render size mismatch');
  let s = 0;
  for (let i = 0; i < a.pixels.length; i++) s += Math.abs(a.pixels[i] - b.pixels[i]);
  return s / a.pixels.length;
}
