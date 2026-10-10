"""Fit the baked frame (tools/style.js FRAME) on the frame pixels of the originals.

For every frame pixel whose region continues inward (the ring pixel and the
pixel two steps in agree once the overlay is taken off), pair Mark's frame
colour with the base colour just inside it. The model is the exact form the
SVG renders: a gradient along the 47.5 degree axis with three stops; the stop
colour at knot i is, per channel,

    (1 - black_i) * max(0, 1 - (1 - b) / burn_i) - grey * min(r, g, b)

i.e. a colour burn by a grey that deepens along the diagonal, a black
multiply, and a little extra darkening of the colour's neutral part (Mark's
white frames are greyer than his reds are dark).

    python research/fit_frame.py
"""
import re
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.optimize import least_squares

ROOT = Path(__file__).resolve().parent.parent
H, W = 11, 16
# The overlay numbers come from tools/style.js so the two never drift apart.
_STYLE = (ROOT / 'tools/style.js').read_text()
_knots = lambda name: [[float(a), float(b)] for a, b in re.findall(r'\[([\d.]+), ([\d.]+)\]', _STYLE.split(f'const {name} =')[1].split(';')[0])]
TH = float(re.search(r'THETA = ([\d.]+)', _STYLE).group(1))
GLOSS, SHADE, EDGE = _knots('GLOSS'), _knots('SHADE'), _knots('EDGE')
BEVEL = float(re.search(r'BEVEL = \{[^}]*opacity: ([\d.]+)', _STYLE).group(1))
prof = lambda u, k: np.interp(u, [a for a, _ in k], [b for _, b in k])
ys, xs = np.mgrid[0:H, 0:W]
U = (xs + .5) * np.cos(TH) + (ys + .5) * np.sin(TH)
frame = (xs == 0) | (ys == 0) | (xs == W - 1) | (ys == H - 1)
ring = ~frame & ((xs == 1) | (ys == 1) | (xs == W - 2) | (ys == H - 2))
g, d = prof(U, GLOSS), prof(U, SHADE)

def base(a, y, x):
    v = a[y, x] / (1 - d[y, x])
    if ring[y, x]: v = (v - 255 * BEVEL) / (1 - BEVEL)
    return (v - 255 * g[y, x]) / (1 - g[y, x])

Uf, B, R = [], [], []
for f in sorted((ROOT / 'ref/png').glob('*.png')):
    a = np.array(Image.open(f).convert('RGBA')).astype(float)
    if a.shape[:2] != (H, W) or f.stem == 'fam' or a[..., 3].min() < 128: continue
    a = a[..., :3]
    for y, x in zip(*np.nonzero(frame)):
        dy, dx = (1 if y == 0 else -1 if y == H - 1 else 0), (1 if x == 0 else -1 if x == W - 1 else 0)
        b1, b2 = base(a, y + dy, x + dx), base(a, y + 2 * dy, x + 2 * dx)
        if np.abs(b1 - b2).max() > 8 or (b1 < -10).any() or (b1 > 265).any(): continue
        Uf.append(U[y, x]); B.append(np.clip(b1, 0, 255) / 255); R.append(a[y, x] / 255)
Uf, B, R = np.array(Uf), np.array(B), np.array(R)

def stop(B, k, c, w):
    return np.clip((1 - k) * np.maximum(0, 1 - (1 - B) / c) - w * B.min(1, keepdims=True), 0, 1)

def model(p):
    us, k, c, w = p[0:3], p[3:6], p[6:9], p[9]
    st = np.stack([stop(B, k[i], c[i], w) for i in range(3)])
    i = np.clip(np.searchsorted(us, Uf) - 1, 0, 1); t = np.clip((Uf - us[i]) / (us[i + 1] - us[i]), 0, 1)
    n = np.arange(len(Uf))
    return st[i, n] * (1 - t)[:, None] + st[i + 1, n] * t[:, None]

fit = least_squares(lambda p: (255 * (model(p) - R)).ravel(), [3.5, 9.4, 16.4, 0, .05, .13, .84, .64, .48, .05],
                    bounds=([.5, 4, 10] + [-.2] * 3 + [.1] * 3 + [-.3], [6, 12, 19.5] + [1] * 3 + [1.5] * 3 + [.5]),
                    loss='soft_l1', f_scale=5 / 255 * 255, x_scale='jac')
p = fit.x
print('FRAME knots', np.round(p[0:3], 2).tolist(), 'burn', np.round(p[6:9], 3).tolist(), 'black', np.round(p[3:6], 3).tolist(), 'grey', round(float(p[9]), 3))
black = B * (1 - prof(Uf, EDGE))[:, None]
print(f'frame mean abs error /255 over {R.size} channel samples: baked {255 * np.abs(model(p) - R).mean():.2f}, black ramp {255 * np.abs(black - R).mean():.2f}')
