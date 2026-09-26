# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); flag changes are
listed by code so a refresh from upstream reads as a diff.

## [Unreleased]

### Changed
- The npm package contains only `dist/svg`, the CSS and the manifest; PNGs
  are in the release zip.

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
