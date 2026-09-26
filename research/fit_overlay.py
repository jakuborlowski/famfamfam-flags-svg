"""Measure the famfamfam overlay (gloss, bevel, shade, frame) from the original PNGs.

The original Libya icon (pre-2011 flag) is a single solid green, so every pixel
is base colour times the overlay. That gives the overlay map directly; this
script fits a parametric model to it and prints the numbers used in
tools/style.js.

    python research/fit_overlay.py
"""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.optimize import least_squares

ROOT = Path(__file__).resolve().parent.parent
a = np.array(Image.open(ROOT / 'ref/png/ly.png').convert('RGB')).astype(float)
R, G = a[:, :, 0], a[:, :, 1]
H, W = a.shape[:2]
ys, xs = np.mgrid[0:H, 0:W]
cx, cy = xs + 0.5, ys + 0.5
interior = (xs >= 1) & (xs <= W - 2) & (ys >= 1) & (ys <= H - 2)
body = (xs >= 2) & (xs <= W - 3) & (ys >= 2) & (ys <= H - 3)
ring = interior & ~body
border = ~interior


def clamp(v):
    return np.clip(v, 0, 1)


# Layers are piecewise-linear profiles along u = x cos(theta) + y sin(theta).
# pixel = base -> white gloss w -> extra white wr on the ring -> black shade d
# border pixels: base -> black db (fitted separately below)
def interior_model(p, gb):
    th, u0, u1, u2, u3, w0, w1, w2, w3, wr, d_s, d_u0 = p
    u = cx * np.cos(th) + cy * np.sin(th)
    w = np.interp(u, [u0, u1, u2, u3], [w0, w1, w2, w3])
    w = np.where(ring, w + wr * (1 - w), w)
    d = clamp(d_s * (u - d_u0))
    out = np.zeros((H, W, 3))
    for c, base in enumerate([0, gb, 0]):
        out[:, :, c] = (base * (1 - w) + 255 * w) * (1 - d)
    return out


def interior_resid(q):
    m = interior_model(q[:-1], q[-1])
    return np.concatenate([(m[:, :, 0] - R)[interior], (m[:, :, 1] - G)[interior]])


p0 = [np.pi / 4, 2, 6, 13, 16, 0.45, 0.33, 0.2, 0.09, 0.16, 0.004, 4, 168]
lb = [0.3, -5, -5, -5, -5, 0, 0, 0, 0, 0, 0, -10, 100]
ub = [1.3, 30, 30, 30, 30, 1, 1, 1, 1, 1, 0.1, 20, 255]
res = least_squares(interior_resid, p0, bounds=(lb, ub))
th, u0, u1, u2, u3, w0, w1, w2, w3, wr, d_s, d_u0, gb = res.x
print(f'theta            {th:.4f} rad ({np.degrees(th):.1f} deg)')
print(f'GLOSS knots      {[(round(float(u), 4), round(float(w), 4)) for u, w in zip([u0, u1, u2, u3], [w0, w1, w2, w3])]}')
print(f'BEVEL opacity    {wr:.3f}')
print(f'SHADE            0 at u={d_u0:.3f}, slope {d_s:.4f}/u  -> {d_s * (17 - d_u0):.4f} at u=17')
print(f'base green       {gb:.1f}')
print(f'interior RMSE    {np.sqrt(np.mean(res.fun ** 2)):.2f} / 255')

# Frame: base darkened by a black profile along the same axis.
u = cx * np.cos(th) + cy * np.sin(th)


def border_resid(p):
    db = np.interp(u, p[:3], p[3:])
    return (gb * (1 - db) - G)[border]


bres = least_squares(border_resid, [2, 8, 17, 0.06, 0.25, 0.6], bounds=([0] * 6, [25] * 3 + [1] * 3))
print(f'EDGE knots       {[(round(float(u), 2), round(float(a), 3)) for u, a in zip(bres.x[:3], bres.x[3:])]}')
print(f'border RMSE      {np.sqrt(np.mean(bres.fun ** 2)):.2f} / 255')
print('Note: the frame darkening in the originals is not linear per colour (saturated')
print('bright channels darken ~12%, mid-tones ~55%); tools/style.js uses a milder ramp.')
