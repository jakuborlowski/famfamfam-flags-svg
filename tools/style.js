// The famfamfam flag look, reverse-engineered from the original 16x11 PNGs.
//
// Every layer is a function of position in the 16x11 icon space (1 unit = 1
// original pixel). Positions are projected onto a diagonal axis
//   u = x*cos(theta) + y*sin(theta)
// and each layer is a piecewise-linear profile along u. The numbers were fitted
// by least squares against Mark James' original icons: the overlay map is the
// per-pixel mode, over all the originals, of a channel painted 0 and one painted
// 255 (Libya alone was used in 0.1.0; its gloss sits one pixel down-right of
// every other flag's). RMSE 0.6/255 over the interior. See research/fit_overlay.py.

export const THETA = 0.8293;                 // 47.5 degrees
export const COS = Math.cos(THETA);
export const SIN = Math.sin(THETA);

// White gloss over the interior: strong at the top-left, fading to bottom-right.
export const GLOSS = { color: '#fff', knots: [
  [2.002, 0.3996], [6.583, 0.3142], [14.711, 0.0613], [16.855, 0.0206],
]};

// The 1px ring just inside the border: a constant extra white ("convex" bevel).
export const BEVEL = { color: '#fff', opacity: 0.164 };

// Faint darkening towards the bottom-right.
export const SHADE = { color: '#000', knots: [[4.056, 0], [17, 0.0600]] };

// The 1px frame: the flag's own edge colours, darkened with black along the
// diagonal, fitted on the frame pixels of all the originals. Mark's frame
// darkens mid channels harder than bright ones (closer to a colour burn);
// only blend modes can do that, and those need a style attribute that strict
// Content Security Policies strip, so the frame stays a plain black fill.
export const EDGE = { color: '#000', knots: [[3.886, 0.048], [7.892, 0.094], [17.474, 0.217]] };

// Build a <linearGradient> whose stops follow a profile along u.
export function gradient(id, layer) {
  const k = layer.knots;
  const u0 = k[0][0], u1 = k[k.length - 1][0];
  const p = (u) => [ (u * COS).toFixed(3), (u * SIN).toFixed(3) ];
  const [x1, y1] = p(u0), [x2, y2] = p(u1);
  const stops = k.map(([u, a]) =>
    `<stop offset="${((u - u0) / (u1 - u0)).toFixed(3)}" stop-color="${layer.color}" stop-opacity="${a.toFixed(3)}"/>`
  ).join('');
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
}

// Mark put the edges of vertical bands on whole pixel columns (France,
// Italy, Ireland, Nigeria and other tricolours split 5/6/5 with no blended
// column), but not horizontal ones (Russia, Germany and Ukraine have blended
// rows). Vertical edges of rectangular artwork within this distance of a whole
// pixel are moved onto it; measured on the originals, 0.35 leaves true
// half-pixel edges alone.
export const SNAP_X = 0.35;
