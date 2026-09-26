// The famfamfam flag look, reverse-engineered from the original 16x11 PNGs.
//
// Every layer is a function of position in the 16x11 icon space (1 unit = 1
// original pixel). Positions are projected onto a diagonal axis
//   u = x*cos(theta) + y*sin(theta)
// and each layer is a piecewise-linear profile along u. The numbers below were
// fitted by least squares against Mark James' original icons (the solid-green
// Libya icon gives the overlay map directly); interior RMSE is 0.6/255.
// See research/fit_overlay.py.

export const THETA = 0.8293;                 // 47.5 degrees
export const COS = Math.cos(THETA);
export const SIN = Math.sin(THETA);

// White gloss over the interior: strong at the top-left, fading to bottom-right.
export const GLOSS = { color: '#fff', knots: [
  [1.488, 0.4393], [6.7284, 0.3473], [13.36, 0.1499], [15.9358, 0.0821],
]};

// The 1px ring just inside the border: a constant extra white ("convex" bevel).
export const BEVEL = { color: '#fff', opacity: 0.166 };

// Faint darkening towards the bottom-right.
export const SHADE = { color: '#000', knots: [[4.942, 0], [17, 0.0538]] };

// The 1px frame: the flag's own edge colours, darkened along the diagonal.
export const EDGE = { color: '#000', knots: [[3.45, 0.03], [7.16, 0.105], [16.92, 0.28]] };

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
