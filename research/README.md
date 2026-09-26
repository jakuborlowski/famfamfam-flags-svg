# Research

How the numbers in `tools/style.js` and `tools/color.js` were obtained. Rerun
these to check the fit or to refit after changing the model.

```sh
python3 -m venv .venv && .venv/bin/pip install -r research/requirements.txt
.venv/bin/python research/fit_overlay.py           # gloss, bevel, shade, frame

FAM_COLORS=official npm run build && node research/render_raw.js
.venv/bin/python research/fit_palette.py           # official colours -> Mark's palette
```

`fit_overlay.py` needs only `ref/png/ly.png`. The pre-2011 Libya flag is one
solid green, so that icon is the overlay itself; a 12-parameter model fits its
interior to 0.6/255 RMS.

`fit_palette.py` compares overlay-free renders of our artwork (official
colours) with the originals on flat regions, inverts the overlay to recover
the colour Mark actually painted with, and fits a hue-dependent transform.
The result is what makes the set look punchy rather than official.
