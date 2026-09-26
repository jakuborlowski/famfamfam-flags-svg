"""Measure how Mark James' colours relate to official flag colours.

For every flat region that both our overlay-free render (official colours)
and the original PNG agree on, invert the overlay to recover the colour Mark
painted with, then print the pairs and fit the smooth HSV transform used in
tools/color.js.

    FAM_COLORS=official npm run build && node research/render_raw.js
    python research/fit_palette.py
"""
import collections
import colorsys
import re
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.optimize import least_squares

ROOT = Path(__file__).resolve().parent.parent
# Overlay numbers come from tools/style.js so the two never drift apart.
_STYLE = (ROOT / 'tools/style.js').read_text()
TH = float(re.search(r'THETA = ([\d.]+)', _STYLE).group(1))
COS, SIN = np.cos(TH), np.sin(TH)
GLOSS = [(float(a), float(b)) for a, b in re.findall(r'\[([\d.]+), ([\d.]+)\]', _STYLE.split('GLOSS')[1].split(']}')[0])]
_SH = [(float(a), float(b)) for a, b in re.findall(r'\[([\d.]+), ([\d.]+)\]', _STYLE.split('SHADE')[1].split(']}')[0])]
SKIP = {'ch', 'ly', 'fr', 'de', 'ls', 'mm', 'cs'}   # different design, or known oddballs


def gloss(u):
    return np.interp(u, [k[0] for k in GLOSS], [k[1] for k in GLOSS])


def shade(u):
    return np.interp(u, [k[0] for k in _SH], [k[1] for k in _SH])


groups = collections.defaultdict(list)
for f in sorted((ROOT / 'tmp/raw').glob('*.png')):
    code = f.stem
    if code in SKIP:
        continue
    raw = np.array(Image.open(f).convert('RGB')).astype(float)
    ref = np.array(Image.open(ROOT / f'ref/png/{code}.png').convert('RGB')).astype(float)
    if raw.shape != ref.shape:
        continue
    H, W, _ = raw.shape
    for y in range(2, H - 2):
        for x in range(2, W - 2):
            if np.abs(raw[y - 1:y + 2, x - 1:x + 2] - raw[y, x]).max() > 2:
                continue          # not a flat region in the artwork
            if np.abs(ref[y - 1:y + 2, x - 1:x + 2] - ref[y, x]).max() > 14:
                continue          # not smooth in the original either
            u = (x + .5) * COS + (y + .5) * SIN
            w, d = gloss(u), shade(u)
            base = np.clip((ref[y, x] / (1 - d) - 255 * w) / (1 - w), 0, 255)
            groups[(code, tuple(raw[y, x].astype(int)))].append(base)

rows = []
for (code, o), v in groups.items():
    if len(v) < 3:
        continue
    m = np.mean(v, axis=0)
    h1, s1, _ = colorsys.rgb_to_hsv(*(np.array(o) / 255))
    h2, s2, _ = colorsys.rgb_to_hsv(*(m / 255))
    if s1 > 0.3 and s2 > 0.3 and abs((h1 - h2 + 0.5) % 1 - 0.5) * 360 > 45:
        continue                  # a different colour, not a palette shift
    rows.append((code, np.array(o, float), m, len(v)))

print(f'{len(rows)} colour pairs (official -> Mark), sorted by hue:')
for code, o, m, n in sorted(rows, key=lambda r: colorsys.rgb_to_hsv(*(r[1] / 255))[0]):
    if n >= 5:
        print(f'  {code:>9} {tuple(o.astype(int))!s:>16} -> {tuple(m.astype(int))!s:>16}  n={n}')

# Fit the transform in tools/color.js: anchors over hue with hue pull,
# brightness target and strength, plus a global saturation push.
O = np.array([r[1] for r in rows]) / 255
M = np.array([r[2] for r in rows]) / 255
Wt = np.sqrt([r[3] for r in rows])
HUES = np.array([0, 30, 60, 120, 205, 235, 300], float)


def rgb2hsv(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx, mn = c.max(-1), c.min(-1)
    d = mx - mn
    m = d > 1e-9
    dd = np.where(m, d, 1)
    h = np.where(r == mx, (g - b) / dd, np.where(g == mx, 2 + (b - r) / dd, 4 + (r - g) / dd))
    h = np.where(m, (h / 6.0) % 1.0, 0)
    s = np.where(mx > 1e-9, d / np.where(mx > 1e-9, mx, 1), 0)
    return h * 360, s, mx


def hsv2rgb(h, s, v):
    h = (h % 360) / 60
    i = np.floor(h).astype(int)
    f = h - i
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    sel = [i == k for k in range(6)]
    return np.stack([np.select(sel, [v, q, p, p, t, v]), np.select(sel, [t, v, v, q, p, p]),
                     np.select(sel, [p, p, t, v, v, q])], -1)


def interp_circ(h, vals):
    return np.interp(h, np.concatenate([HUES, [360]]), np.concatenate([vals, [vals[0]]]))


def transform(p, c):
    n = len(HUES)
    pull, vt, vk, ks = p[:n], p[n:2 * n], p[2 * n:3 * n], p[3 * n]
    h, s, v = rgb2hsv(c)
    g = np.clip((s - 0.2) / 0.4, 0, 1)
    d = (h[:, None] - HUES[None, :] + 180) % 360 - 180
    dn = d[np.arange(len(h)), np.argmin(np.abs(d), axis=1)]
    return hsv2rgb(h - interp_circ(h, pull) * dn * g,
                   np.clip(s + (1 - s) * ks * g, 0, 1),
                   np.clip(v + (interp_circ(h, vt) - v) * interp_circ(h, vk) * g, 0, 1))


n = len(HUES)
p0 = np.concatenate([np.full(n, 0.5), [1, 1, 1, 0.58, 0.95, 0.75, 0.6], np.full(n, 0.6), [0.7]])
res = least_squares(lambda p: ((transform(p, O) - M) * Wt[:, None]).ravel(), p0,
                    bounds=(np.zeros(3 * n + 1), np.ones(3 * n + 1)))
rms = lambda X: np.sqrt(np.mean(((X - M) * Wt[:, None]) ** 2)) / np.sqrt(np.mean(Wt ** 2)) * 255
print(f'\nRMS official vs Mark: {rms(O):.1f}; after fitted transform: {rms(transform(res.x, O)):.1f}')
names = ['red', 'orange', 'yellow', 'green', 'azure', 'blue', 'magenta']
print('fitted PULL', dict(zip(names, [round(float(v), 2) for v in res.x[:n]])))
print('fitted VTGT', dict(zip(names, [round(float(v), 2) for v in res.x[n:2 * n]])))
print('fitted VK  ', dict(zip(names, [round(float(v), 2) for v in res.x[2 * n:3 * n]])))
print('fitted KS  ', round(res.x[3 * n], 3))
print('tools/color.js uses hand-smoothed values in the same spirit; Mark picked colours')
print('per flag, so the fit is noisy and the exact numbers are a matter of taste.')
