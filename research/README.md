# Research

How the numbers in `tools/style.js` and `tools/color.js` were obtained. Rerun
these to check the fit or to refit after changing the model.

```sh
python3 -m venv .venv && .venv/bin/pip install -r research/requirements.txt
.venv/bin/python research/fit_overlay.py           # gloss, bevel, shade
.venv/bin/python research/fit_frame.py             # the baked frame's colour burn

FAM_COLORS=official npm run build && node research/render_raw.js
.venv/bin/python research/fit_palette.py           # official colours -> Mark's palette
```

`fit_overlay.py` reads the overlay off every original at once. With a white
gloss and a black shade, a channel painted 0 shows `255·w·(1−d)` and a channel
painted 255 shows `255·(1−d)` whatever the flag, so the most common value of
each at every pixel gives the gloss and the shade directly. Profiles along the
47.5° axis fit that map to 0.6/255 RMS. The frame is fitted against the base
colour just inside it. In 0.1.0 the overlay was fitted on the Libya icon
alone, whose gloss sits one pixel off every other flag's; that made the gloss
about 10/255 too strong everywhere and washed colours out.

`fit_frame.py` pairs every frame pixel of the originals whose region
continues inward with the base colour just inside it, and fits the frame
model in the exact form the SVG renders: three gradient stops whose colours
are a colour burn, a black multiply and a little extra grey on neutral
colours. 4.9/255 against 18.2 for the black ramp of 0.1.3; held out by flag,
the same.

`fit_palette.py` fits the smooth transform used for dull and emblem colours.
The saturated colours come from a palette instead; `palette.md` explains where
that palette came from.
