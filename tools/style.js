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

// The 1px frame: the flag's own edge colours, darkened along the diagonal.
// Mark's frame darkens mid channels much harder than bright ones (a colour
// burn: 255 stays, 150 nearly vanishes), which keeps his frames saturated:
// deep red, forest green, navy. No plain fill can do that over unknown
// artwork, and blend modes need a style attribute that strict Content
// Security Policies strip; but the build knows the artwork. It reads the
// colours along the edge and paints each run with its own frame ramp, a
// gradient whose stops are frameColor() at the knots below (tools/frame.js).
// Per channel: colour burn by BURN, then BLACK multiply; then GREY of the
// colour's neutral part comes off, since Mark's white frames are greyer than
// his reds are dark. Fitted on the frame pixels of the originals against the
// base colour just inside, in this exact form: research/fit_frame.py.
export const FRAME = {
  knots: [3.54, 9.49, 16.4],
  burn: [0.84, 0.634, 0.481],
  black: [-0.009, 0.052, 0.134],
  grey: 0.052,
  // Runs of one edge colour shorter than this (icon units) merge into their
  // neighbours: a wavy or ornamented edge reads as its main colours, not as
  // "piano keys". minRunTight is the coarser frame a file over budget falls
  // back to, so frame detail gives way before emblem detail.
  minRun: 0.5,
  minRunTight: 1,
};
export function frameColor(rgb, i) {
  const c = FRAME.burn[i], k = FRAME.black[i], g = FRAME.grey * Math.min(...rgb);
  return rgb.map((v) => Math.min(1, Math.max(0, (1 - k) * Math.max(0, 1 - (1 - v) / c) - g)));
}
// The generic frame the build starts from, before the frame is baked: black
// along the diagonal, the best a single overlay can do. Also Nepal's.
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

// Stripes and fimbriations thinner than this (in pixels at 1x) get whole-pixel
// edges and at least one pixel, as Mark drew them; see thin.js.
export const THIN = 1.5;
// Diagonal fimbriations narrower than this (in pixels, across the band) are
// widened to it; see thin.js.
export const THIN_DIAG = 1.0;
