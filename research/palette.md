# Where Mark's colours came from

Measured on the flat regions of the 2005 icons, with the overlay inverted to
recover the colour each region was painted with.

**Web-safe, far beyond chance.** Of the middle channel values (0 and 255 fit
any grid, so they are excluded), 34% sit within 2 levels of a multiple of 51
against 10% for random colours and 16% for the official colours. 65% of the
coloured regions are exactly web-safe.

**From Flags of the World.** In 2005 the Flags of the World site drew its
flags in a 32-colour browser-safe palette
([colour guide](https://www.fotw.info/flags/fotwcols.html)) with two yellows:
Y `#FFFF00` and "dark yellow" Y+ `#FFCC00`. Archived copies of those images
([Wayback Machine](https://web.archive.org/); for Ukraine, Belgium, Spain,
Romania, Cameroon, Sweden, Bosnia, Bhutan and Colombia the same file was
already archived before the icons were released on 29 August 2005) match
Mark's colours within 5/255 for 26 of 53 flags checked, and give the same
yellow on every flag where Mark used a web-safe one: lemon for Ukraine, Belgium, Spain, Romania, Cameroon, Ghana and
others, dark yellow for Sweden, Colombia, the Bahamas, Bhutan and Bosnia.
No rule on the official colours reproduces that split; the reference images do.

**Not export snapping.** The GIFs in Mark's original zip use adaptive palettes
and never contain `#FFFF00` or `#FFCC00`, and the web-safe colours sit under
the gloss, where only a colour picker could have chosen them.

**A second source.** About a third of the flags, mostly coats of arms
(Germany, the Vatican, Chad, Bolivia, Ecuador and others), use muted golds and
slightly darkened reds that match neither Flags of the World nor the CIA World
Factbook of the time. Those keep the smooth transform (`"yellow": "soft"` in
the catalog).

**What this means for the rebuild.** Saturated reds, oranges, yellows and
greens snap to the palette; blues vary too much in the originals to snap.
Against the originals this lowered the mean error from 24.3 to 22.4 inside
the icons and from 27.5 to 25.6 on the frame, with the largest gains on the
lemon-yellow flags.
