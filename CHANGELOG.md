# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); flag changes are
listed by code so a refresh from upstream reads as a diff.

## [Unreleased]

### Changed
- npm releases come from the release workflow through trusted publishing,
  with provenance; the maintainer approves each staged version.

## [0.1.3] - 2026-10-04

### Fixed
- Emblems are no longer lost to size reduction. The reducer also bounds the
  error in every small area, not only over the whole image, so a small coat
  of arms can't be deleted. Nicaragua's coat of arms, Mexico's eagle, the
  Vatican's red cord and Guatemala's scroll are back. Flags still over 8 KB
  can also keep their source's `<use>` reuse, which brings `eac` from 15 KB
  to 4 KB and `kz` under budget.
- Names: `eu` is "European Union" (was "Europe"), `cz` "Czechia", `mo`
  "Macao", `ax` "Åland Islands".
- Manifest entries for alias files carry the same fields as the canonical
  entry (`aliases`, `iconNative`, `note`), so code looping over `aliases`
  doesn't break on them.

### Changed
- Vertical band edges sit on whole pixels, as in the originals: France,
  Italy, Ireland, Belgium, Peru, Nigeria and the other tricolours, about 25
  flags, lose the blended column beside each band at 1×. Horizontal edges are unchanged,
  since Mark blended those. At 4× the bands become 5:6:5 instead of equal.
- `bv` and `sj` use the pixel-grid Norwegian flag; `sh` shows the flag of
  Saint Helena, as the 2005 icon did, instead of the Union Jack.
- Against the originals: mean error 21.2 → 20.7 inside the icons, 25.5 →
  25.1 on the frame.
- Over the 8 KB budget: 30 files, listed in `src/oversize.json`; nine of them
  by less than 40 bytes.

## [0.1.2] - 2026-09-29

### Changed
- Blues follow Mark's: saturated blues snap to the Flags of the World blues
  (sky `#33CCFF`, light `#3399FF`, azure `#0066CC`, blue `#0033CC`) instead of
  a smooth transform, so navies read as blue at 16 px the way Mark drew them.
  The US canton is royal blue, Ukraine `#0099FF`.
- Catalog `blue` field: `"navy"` for `au`, `ck`, `fk`, `hm`, `io`, `mh`, `ms`,
  `mu`, `nz`, `sh`, `tc`, `tf`, `vg` (coded `#000066` in 2005), and the exact
  2005 colour for `an`, `aw`, `bb`, `cx`, `dj`, `ee`, `ga`, `gs`, `kz`, `ky`,
  `mn`, `ph`, `pn`, `pw`, `ru`, `se`, `th`, `ua`.
- Against the originals: mean error 22.4 → 21.2 inside the icons, 25.6 → 25.5
  on the frame, 28.1 → 16.0 over blue areas.

## [0.1.1] - 2026-09-28

### Changed
- Yellows are punchier: lemon `#FFFF00` by default, `#FFCC00` for `ba`, `bb`,
  `bs`, `bt`, `co`, `mz`, `se`, and the previous golden yellow for `bn`, `bo`,
  `de`, `ec`, `kz`, `lt`, `md`, `nu`, `td`, `va`. Saturated reds, oranges and
  greens snap to the same palette. This follows where Mark's colours came
  from: the 2005 Flags of the World images (`research/palette.md`).
- The gloss, bevel, shade and frame are refitted over all the originals
  instead of the Libya icon alone, whose gloss is one pixel off. Every colour
  gets about 10/255 less white, so colours read stronger and blacks darker.
- Against the originals: mean error 24.3 → 22.4 inside the icons, 27.5 → 25.6
  on the frame.
- `pm` is 48 KB (was 28 KB): the stronger colours need a finer precision to
  flatten within the error bound. `as`, `ec` and `me` grew just over 8 KB.
- The npm package contains only `dist/svg`, the CSS and the manifest; PNGs
  are in the release zip.

### Fixed
- `bg`, `bd`, `cm`, `mo` and `gd` had their greens drawn blue-teal, and lime
  greens (`ni`) turned mustard: colours near a hue boundary snapped to the
  wrong anchor.

## [0.1.0] - 2026-09-26

### Added
- The full famfamfam flag set (249 icons) rebuilt as SVG, under the original
  file names, with legacy aliases `catalonia`, `england`, `scotland`, `wales`,
  `europeanunion`.
- 30 flags not in the original set: `aq`, `arab`, `asean`, `bl`, `bq`, `cefta`,
  `cp`, `cw`, `dg`, `eac`, `es-ga`, `es-pv`, `gb-nir`, `ic`, `im`, `mf`, `pc`,
  `sh-ac`, `sh-hl`, `sh-ta`, `ss`, `sx`, `un`, `xk`, `xx` and the modern codes
  behind the legacy aliases.
- CSS classes, `preview.html`, and PNG renders at 1×, 2×, 4× in the release zip.
- Build pipeline (`tools/`) and the measurement scripts behind the style
  (`research/`).
- `dist/manifest.json`, one entry per file with code, name, size and aliases.
- Size pipeline: transforms baked into icon space, coordinates rounded,
  emblem flags reduced under a render-error bound. Whole set 2.5 MB → 1.1 MB,
  median file 2.1 KB. Spain 81 KB → 7.8 KB, Serbia 179 KB → 11.8 KB,
  Croatia 31 KB → 7.7 KB. 19 flags stay over the 8 KB budget and are listed
  in `src/oversize.json`.
- `npm test` checks the guarantees stated in the README; CI and a tagged
  release workflow that attaches `dist` as a zip.
- Icon-native drawings for `us`, `um`, `lr`, `my`, `gr`, `uy`: one stripe per
  pixel row so they are crisp at 1×, real stars and emblems from 2× up.
  Likewise the Nordic crosses `dk`, `se`, `no`, `fi`, `is`, `fo`, `ax` and the
  Union Jack `gb`, with cross arms on whole pixels as in the originals.

### Changed (relative to the 2005 originals)
- Current designs where the flag changed: `ls`, `ly`, `mm`, `sy`, `mw`, `ge`,
  `mq` (2023 flag), `tk`, `iq` and others as carried by flag-icons 7.5.0.
- `me` is 16×11 (the original was 16×12).
- `gp` uses the widely used black-and-sun local flag; the original used a
  different unofficial variant.
- Colours follow a measured version of Mark's palette applied to official
  artwork rather than his per-flag hand-picked values: near-full saturation,
  reds pushed bright, yellows pulled to golden (about 50°), pale blues
  brightened. Where Mark drew a colour darker than official (Sweden's blue)
  ours stays closer to official.

### Sources
- Artwork: flag-icons 7.5.0 (MIT).
- `an`, `cs`, `gp`, `pm`, `wf`, `yt`: public-domain files from Wikimedia Commons.
- `fam`, `np` outline, and the icon-native drawings: made here.
