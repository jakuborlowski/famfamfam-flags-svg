"""Measure the famfamfam overlay (gloss, bevel, shade, frame) from the original PNGs.

Every original is the same overlay pasted over a different flag, so the overlay
can be read off the whole set at once. With a white gloss w and a black shade d,
a channel painted 0 shows 255*w*(1-d) and a channel painted 255 shows 255*(1-d),
whatever the flag. So at each pixel:

    P0 = most common raw value of channels painted 0     ->  w = P0 / P1
    P1 = most common raw value of channels painted 255   ->  d = 1 - P1 / 255

Which channels were painted 0 or 255 is decided with the current estimate of
the overlay, starting from the 0.1.0 overlay (fitted on the Libya icon alone)
and iterating until the map stops changing.
Parametric profiles are then fitted to w and d, and the 1 px frame is fitted
against the base colour just inside it. Prints the numbers used in tools/style.js.

    python research/fit_overlay.py
"""
from collections import Counter
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.optimize import least_squares

ROOT = Path(__file__).resolve().parent.parent
THETA = 0.8293                                  # the gloss axis, 47.5 degrees
H, W = 11, 16
ys, xs = np.mgrid[0:H, 0:W]
U = (xs + .5) * np.cos(THETA) + (ys + .5) * np.sin(THETA)
frame = (xs == 0) | (ys == 0) | (xs == W - 1) | (ys == H - 1)
ring = ~frame & ((xs == 1) | (ys == 1) | (xs == W - 2) | (ys == H - 2))
body = ~frame & ~ring

flags = {}
for f in sorted((ROOT / 'ref/png').glob('*.png')):
    im = Image.open(f).convert('RGB')
    if im.size == (W, H) and f.stem != 'fam':
        flags[f.stem] = np.array(im).astype(float)

# 1. The overlay map, by iteration, starting from the 0.1.0 (Libya-only) fit.
g0 = np.interp(U, [1.488, 6.7284, 13.36, 15.9358], [0.4393, 0.3473, 0.1499, 0.0821])
w = np.where(frame, 0, np.where(ring, 1 - (1 - g0) * (1 - 0.166), g0))
d = np.where(frame, 0, np.clip(0.0538 * (U - 4.942) / (17 - 4.942), 0, 1))
for it in range(6):
    zero, full = [[Counter() for _ in range(W)] for _ in range(H)], [[Counter() for _ in range(W)] for _ in range(H)]
    for a in flags.values():
        base = (a / (1 - d)[..., None] - 255 * w[..., None]) / (1 - w)[..., None]
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                for c in range(3):
                    if base[y, x, c] < 20: zero[y][x][a[y, x, c]] += 1
                    elif base[y, x, c] > 235: full[y][x][a[y, x, c]] += 1
    P0 = np.array([[zero[y][x].most_common(1)[0][0] if zero[y][x] else np.nan for x in range(W)] for y in range(H)])
    P1 = np.array([[full[y][x].most_common(1)[0][0] if full[y][x] else np.nan for x in range(W)] for y in range(H)])
    if np.isnan(P0[~frame]).any() or np.isnan(P1[~frame]).any(): raise SystemExit('a pixel has no samples')
    w_new, d_new = np.where(frame, 0, P0 / P1), np.where(frame, 0, 1 - P1 / 255)
    change = np.abs(w_new - w)[~frame].max() * 255
    w, d = w_new, d_new
    if change < 0.5: break
print(f'overlay map converged after {it + 1} passes')

# 2. Parametric fit: 4-knot gloss along U, a constant white bevel on the ring
#    (composited over the gloss), and a linear shade from u0.
def model(p):
    us = np.cumsum(p[0:4])                      # knot positions as increments: always in order
    ws, bevel, slope, u0 = p[4:8], p[8], p[9], p[10]
    g = np.interp(U, us, ws)
    return np.where(ring, 1 - (1 - g) * (1 - bevel), g), np.clip(slope * (U - u0), 0, 1)

def resid(p):
    mw, md = model(p)
    return np.concatenate([255 * (mw - w)[~frame], 255 * (md - d)[~frame]])

fit = least_squares(resid, [2, 4.6, 8.1, 2.1, .4, .31, .06, .02, .166, .004, 4],
                    bounds=([1.5, .1, .1, .1] + [0] * 4 + [0, 0, -5], [17.5] * 4 + [1] * 4 + [1, .1, 17]))
p = fit.x.copy(); p[0:4] = np.cumsum(p[0:4])
mw, md = model(fit.x)
rms = lambda m: np.sqrt(np.mean((255 * m) ** 2))
print('GLOSS knots  ', [[round(float(u), 3), round(float(a), 4)] for u, a in zip(p[0:4], p[4:8])])
print(f'BEVEL opacity  {p[8]:.3f}')
print(f'SHADE knots   [[{p[10]:.3f}, 0], [17, {p[9] * (17 - p[10]):.4f}]]')
print(f'fit RMS /255: gloss body {rms((mw - w)[body]):.2f}, ring {rms((mw - w)[ring]):.2f}, shade {rms((md - d)[~frame]):.2f}')

# 3. Frame: black at an opacity that grows along U, fitted on frame pixels whose
#    region continues inward (the pixel two steps in has the same base as the
#    ring pixel between them), against that base.
inv = lambda a, y, x: (a[y, x] / (1 - md[y, x]) - 255 * mw[y, x]) / (1 - mw[y, x])
Uf, B, R = [], [], []
for a in flags.values():
    for y in range(H):
        for x in range(W):
            if not frame[y, x]: continue
            dy, dx = (1 if y == 0 else -1 if y == H - 1 else 0), (1 if x == 0 else -1 if x == W - 1 else 0)
            y1, x1, y2, x2 = y + dy, x + dx, y + 2 * dy, x + 2 * dx
            if not (0 <= y2 < H and 0 <= x2 < W) or frame[y2, x2]: continue
            b1, b2 = inv(a, y1, x1), inv(a, y2, x2)
            if np.abs(b1 - b2).max() > 8 or (b2 < -10).any() or (b2 > 265).any(): continue
            for c in range(3):
                Uf.append(U[y, x]); B.append(np.clip(b2[c], 0, 255)); R.append(a[y, x, c])
Uf, B, R = map(np.array, (Uf, B, R))
edge = lambda q: B * (1 - np.interp(Uf, q[:3], q[3:]))
ef = least_squares(lambda q: edge(q) - R, [5, 8, 17, .04, .08, .2], bounds=([0] * 6, [19] * 3 + [1] * 3), loss='soft_l1', f_scale=5)
q = ef.x
print('EDGE knots   ', [[round(float(u), 3), round(float(a), 3)] for u, a in zip(q[:3], q[3:])])
print(f'frame mean abs error /255: {np.abs(edge(q) - R).mean():.1f} over {len(R)} channel samples')
print('Mark\'s frame darkens mid channels harder than bright ones (closer to a colour burn);')
print('a black fill is the best that plain SVG fills can do, see tools/style.js.')
