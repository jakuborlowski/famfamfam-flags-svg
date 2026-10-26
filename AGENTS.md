# famfamfam-flags-svg

Generated SVG rebuild of Mark James' famfamfam flag icons. Instructions for
anyone, human or agent, working on this repo. Read `README.md`
for what it is and `ROADMAP.md` for where it is going.

## Rules

- `dist/` is generated. Never edit it by hand; change `src/` or `tools/` and rebuild.
- Every icon is `style(source artwork, icon box)`. Style lives in `tools/style.js`
  and `tools/color.js` only; do not add per-flag tweaks to the overlay.
- Style numbers were measured from the originals (`research/`). Changing them
  needs a re-measurement or a stated reason, and a run of `npm run compare`.
- Every file in `src/flags/` needs a source and license line in `LICENSE`.
  Only public-domain, CC0 or MIT-compatible inputs.
- Current flags win over 2005 fidelity. When there is no official flag, use the
  most widely used one and say so in the catalog entry's `note`.
- Every file has a size budget (`tools/test.js`). The build flattens and
  reduces automatically with a render-error bound; if a flag still exceeds
  the budget, add its code to `src/oversize.json`, or draw a
  simplified emblem in `src/flags/`. Never raise the error bound to pass a test.
- `dist/svg`, `dist/manifest.json`, the CSS and the JS entry are committed
  and canonical; `dist/png` is not (the release builds it). Rebuilds on
  another CPU may differ by a byte or two because reduction decisions key on
  rendered pixels; CI reports that, it does not fail on it.
- The docs are the API: agents copy snippets verbatim. The pinned version and
  SRI hash in every snippet of `README.md` and `examples/`, the figures in its
  `<!-- name -->` spans and all of `llms.txt` come from `npm run pack`; edit
  the prose, never those. `npm test` fails when they are stale or link to a
  file the npm package doesn't ship.
- Every recipe in `examples/` must pass `npm run examples`: every flag request
  a 200 under the README's CSP, every flag drawn at its size, axe clean.
- Never commit `tmp/`, `node_modules/`.

## Commands

```sh
npm ci
npm run build        # src -> dist/svg (FAM_COLORS=official keeps official colours,
                     #   FAM_ONLY=pl,jp builds a subset without clearing dist/svg)
npm run pack         # dist/famfamfam-flags.css, manifest.json, index.js + index.d.ts, preview.html,
                     #   llms.txt; pins version, SRI hash and figures in README.md and examples/
npm test             # well-formed, titled, prefixed ids, no scripts/aria/external refs, size budget,
                     #   1× crispness, every ISO 3166-1 country, generated docs current, CDN links shipped
npm run examples     # examples/ in headless Chrome + axe, React recipe through tsc (Node 22.12+,
                     #   Chrome or CHROME_PATH, Python with Jinja2 or PYTHON)
npm run png          # dist/png at 1×, 2×, 4× (gitignored; the release workflow builds it)
node tools/hero.js   # docs/hero.png for the README
node tools/social.js # docs/social.png, the repo's social preview (upload by hand in Settings)
npm run compare      # error vs originals + tmp/compare.png side-by-side sheet
                     #   baseline: interior 20.4, border 18.8 (mean abs diff /255; artwork differences dominate)
npm run compare pl,jp,us   # subset
```

## Layout

- `src/catalog.json`: one entry per flag: `code`, `name`, optional `from`
  (flag-icons code), `source` (file in `src/flags/`), `aliases`, `shape`
  (`4x3` default, `1x1` for 11×11), `width`, `outline` (clip path in icon
  units for non-rectangular flags), `colors: "keep"` (skip the palette
  transform, for artwork already in the famfamfam palette), `yellow`
  (`"#ffcc00"` for flags Flags of the World coded dark yellow in 2005,
  `"soft"` for the muted golds Mark used; default lemon `#ffff00`, see
  `research/palette.md`), `blue` (`"navy"` for flags Flags of the World coded
  `#000066` in 2005, or an exact colour where Mark used the 2005 colour
  unchanged; default: the blue rule in `tools/color.js`), `note`, `legacy`
  (was in the original set).
- `src/flags/`: artwork flag-icons does not carry.
- `examples/`: copyable recipes (plain HTML, email, Jinja, React), linked from
  the README and run by `tools/examples.js`.
- `llms.txt`: the README's Use and Rules sections (between `<!-- llms -->`
  markers) with absolute links; generated, shipped in the npm package and
  served by Pages.
- `ref/png/`: the original icons, ground truth for `compare`.
- `tools/`: build pipeline. `build.js` composes; `style.js`/`color.js` are the
  look; `flatten.js` bakes transforms into icon space; `simplify.js` and
  `reduce.js` shrink emblem flags under a render-error bound (whole image and
  every 8×8 window at 4×, so emblems can't vanish); `snap.js` puts vertical
  band edges on whole pixels and `thin.js` makes no stripe thinner than a
  pixel and no border thinner than the frame, as Mark did (each rule is
  skipped for a flag where it would open a gap); `frame.js` bakes the frame
  by repainting the artwork's own shapes, cut to the ring by `ring.js`, in
  Mark's frame colours, and the artwork is painted three times against
  seams; `render.js` is
  the one rasterizer call; `pack.js` writes everything downstream of
  `dist/svg` (stylesheet, manifest, JS entry, `llms.txt`, the docs' pins);
  `test.js` is the contract; `examples.js` runs the recipes in a browser.
  `research/`: how the style was measured.
- `src/oversize.json`: codes allowed over the size budget (complex coats of
  arms the automatic reduction cannot bring under 8 KB within the error bound).

## Icon-native artwork

When scaled artwork turns to mush at 16×11 (fine repeated stripes, dense
star fields), draw the flag on the icon grid instead: `src/flags/<code>.svg`
with `viewBox="0 0 16 11"`, stripes one unit tall on integer rows, small
elements centred on pixel centres (x.5, y.5) and sized about one unit so
they read as a single pixel at 1× and as the real shape at 4×. Keep the
real structure (canton covering the right number of stripes, correct
colours) and set `note` to `icon-native ...` in the catalog. `us.svg` is the
reference example. This is what the original set did by hand.

## Adding or updating a flag

1. Prefer flag-icons; else fetch a public-domain SVG (check the license on Commons),
   drop it in `src/flags/`, make sure it has a `viewBox`, no `<text>`, `<image>`
   or `<filter>`.
2. Add or edit the catalog entry.
3. `npm run build && npm run pack && npm test`, then `npm run png` and look at
   the 4× PNG. The build prints flags that were reduced or kept unflattened.
4. Add a line to `CHANGELOG.md` under Unreleased, and to `LICENSE` if a new source.

## Releasing

Versions: patch for changes that bring flags closer to the intended look
(Mark's style, current flags) and fixes; minor for new flags, a changed flag
design, new outputs or a change of direction; major for anything that can
break a consumer (renamed or removed files, changed dimensions, a dropped
guarantee, a changed manifest format). Before 1.0, breaking changes bump
the minor.

1. Move the changelog's Unreleased entries under `## [x.y.z] - date`; bump
   `package.json` and run `npm run pack`, which pins every snippet in the
   README, `llms.txt` and `examples/` to the new version and hash.
2. Commit, then push an annotated tag `vx.y.z`. Release tags are protected:
   they can't be moved or deleted, so check before pushing.
3. The release workflow checks the tag against `package.json`, attaches the
   zip to the GitHub release and stages the npm package (trusted publishing,
   with provenance). The maintainer approves it on npmjs.com, where it goes
   live.
4. Re-upload `docs/social.png` in the repo settings if it changed.

Around each minor release, test the docs with a fresh agent: give one with
no context of this repo only the package name and the task "show each
order's country as a flag" in three small projects (plain HTML, Flask,
React with Vite). Before the release is live, hand it the new `README.md`
and `llms.txt` as what it fetched. Compare its code with the README's
answers; every difference is a documentation bug.

## Refreshing from upstream

`npm update flag-icons`, rebuild, then diff `dist/png/16@4x` against the
previous build to list changed flags; record them in the changelog with the
reason (upstream change, real-world flag change).
