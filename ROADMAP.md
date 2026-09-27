# Roadmap

Where this could go, in rough order. Apart from what section 3 marks done,
nothing below is started; the point is to know which decisions today keep
these doors open.

## Principle

The set is *generated*, never hand-edited. Every icon is
`style(source artwork, icon box)`. That is what makes everything below cheap:
new flags, changed flags and whole new collections are catalog entries plus a
rebuild, and the style stays byte-for-byte consistent across all of them.

## 1. Keeping the country set current

flag-icons tracks real-world flag changes (Syria 2025, Martinique 2023, ...),
so refreshing is mostly `npm update flag-icons && npm run build`. What is
missing is knowing *what* changed:

* **Render diff.** Keep the previous `dist/png/16@4x` and image-diff against
  the new build; list every flag whose pixels moved. Turns a silent upstream
  change into a reviewable list.
* **Changelog from the diff.** Each release notes which flags changed and why
  (upstream commit or catalog edit).
* **Scheduled check.** A monthly CI job that bumps flag-icons, builds, and
  opens a PR only if the render diff is non-empty.
* **Pin everything.** flag-icons is pinned by package-lock; the Wikimedia
  files in `src/flags` should carry their Commons revision id so a refresh
  can check for newer uploads too.

## 2. Collections beyond countries

German Länder, Polish województwa, Swiss cantons, US states, cities. The
pipeline does not care, but four things need deciding once:

**Naming.** ISO 3166-2 already gives subdivision codes and flag-icons already
uses the `cc-sub` shape (`es-ct`, `gb-sct`), so: `de-by` Bavaria, `us-oh` Ohio,
`ch-zh` Zürich. Polish voivodeships are numeric in ISO (`pl-14` is
Mazowieckie), which nobody will remember, so entries get aliases:
`pl-14` plus `pl-mazowieckie`. Cities have no ISO codes; use
`cc-slug` (`pl-warszawa`, `de-hamburg`; note Hamburg is both a state and a
city, `de-hh` vs `de-hamburg`). Aliases are free, so be generous.

**Catalog per collection.** `src/catalog.json` becomes
`src/collections/countries.json`, `de-states.json`, ... Each entry keeps the
same fields (`code`, `name`, `source`, `aliases`, `shape`). A collection also
declares its default shape policy and its license notes. Output can be
one flat `dist/svg` (codes are unique by construction) with per-collection
CSS and sprite files so nobody has to ship 2 000 flags to get 16.

**Shape policy.** Countries are stretched to 16×11 because the original did
that. Subnational flags are wilder: Swiss cantons are square (11×11, already
supported), many German municipal flags are vertical banners, Ohio is a
swallowtail. Options per entry: `4x3` (stretch), `1x1`, `tall` (a 9×11 or
8×11 box for banners), or `outline` (Nepal-style clip path, already
supported). The rule should be "what would Mark have done", i.e. keep the
icon recognisable at 16 px over geometric fidelity.

**Sources.** flag-icons stops at countries. For the rest:

* *Wikimedia Commons* has nearly everything, but quality varies wildly:
  multi-megabyte coats of arms, `<text>` needing fonts, embedded bitmaps,
  filters. Needs a fetch script (`tools/fetch.js <Commons title>`) that
  records URL, revision and license, then a **lint** that rejects `<image>`,
  `<text>`, `<filter>`, external refs, and files over a size budget, and runs
  svgo on the rest.
* *Licence policy.* Only public domain / CC0 / MIT-compatible inputs go into
  the MIT set. Many Commons vector drawings of arms are CC BY-SA even when
  the arms themselves are official works; those either get redrawn, replaced
  by a simpler version, or go into a separate clearly-labelled collection.
  Every `src/flags` file gets a line in `LICENSE`.
* *Unofficial flags.* Guadeloupe already raised this: when there is no
  official flag, pick the most widely used one and say so in the catalog
  (`note` field). Never silently.

**Heavy emblems.** A 200 KB coat of arms is invisible at 16 px and expensive
at any size. Two escape hatches worth building: a per-entry `simplified`
source (hand-reduced emblem) used for the icon, and a size budget in the
lint so the problem is visible.

## 3. Quality gates

Done: `npm test` checks well-formedness, titles, prefixed ids, no scripts or
external references, a per-file size budget with an explicit exception list,
and 1× crispness; CI reports when a rebuild differs from `dist/`. Still worth doing:

* Regression vs the originals: `tools/compare.js` MAE per flag with a
  threshold, so a style tweak that drifts from Mark's look fails loudly.
* Visual review sheet (`tmp/compare.png`) attached to every refresh PR.
* Hand-simplified emblems for the flags still listed in `src/oversize.json`.
  The automatic reduction gets most coats of arms under budget; the rest
  need a drawn simplification, which is design work, not tooling.
* A pixel-grid Union Jack canton shared by the ensigns (`au`, `nz`, `fj`,
  `tv`, `ky`, `vg`, `fk`, ...), whose cantons blur at 1×.
* Mark's frame darkens mid-tone channels much harder than bright ones, which
  keeps his frames saturated (deep red, forest green, gold on yellow). Only a
  colour-burn blend reproduces it, halving the frame error, but blend modes
  need a `style` attribute that strict Content Security Policies strip. Worth
  revisiting if a filter- and style-free way appears.
* Hairline seams where upstream artwork butts stripes together at
  fractional coordinates: invisible on light backgrounds, a faint line on
  dark ones. Overlapping stripes by a hair in the flatten step would remove it.

## 4. Packaging and site

* Publish to npm as `famfamfam-flags-svg` (checked free; `famfamfam-flags`
  is the legacy PNG package), with `dist` only.
* GitHub Pages from `preview.html`, grown into a gallery with search,
  collection filter, size toggle and a copy-the-snippet button.
* A subset builder: `npm run pack -- pl,de,fr` producing CSS (and optionally
  an SVG sprite) with only those flags, so a site with twenty countries ships
  tens of KB rather than the whole set.
* Optional: `.ico`/`.icns`-style multi-size PNG bundles for desktop apps
  that still want bitmaps.

## 5. Other famfamfam sets

Silk already has a vector edition: [famfamfam-silk-svg](https://github.com/Simandara/famfamfam-silk-svg),
all thousand icons redrawn by hand in Figma. That is the right way to do a
set with no vector source, and there is no plan to duplicate it. What this
project's method could add to Silk or Mini is the measuring half: fit the
original shading and palette numerically and check redrawn icons against the
originals the way `tools/compare.js` does here.

## Not planned

* Pixel-identical reproduction of the originals. The artwork differs where
  the world changed, and the frame darkening is a single ramp rather than
  Mark's per-colour hand-picking. The measurable fit is close enough that
  the difference is taste, not style.
