# Where we left off

Written at the end of the 2026-10-21 session. Durable engineering knowledge
belongs in [README.md](README.md); this file is the part that goes stale.

## State

|                |                                                                             |
| -------------- | --------------------------------------------------------------------------- |
| HEAD           | `91fb55e` — commit and push are the user's job (see ground rules below)     |
| Working tree   | **dirty on purpose**: 2026-10-21 work is uncommitted                        |
| Service worker | `v71`                                                                       |
| Build stamp    | `2026-10-21`                                                                |
| Tests          | 2001 assertions, 0 failures, across 30 suites (`npm run check`)             |
| Database       | migration `15-vehicle-baseline` **must be run before deploying this build** |

The assertion total is the sum of the per-suite counts; `tools/test-i18n-markup.mjs`
reports by group rather than printing a number, so it is not in that figure.

## Since the last handover (2026-10-18 → 2026-10-21)

The 2026-10-21 feedback round touched the vehicle model and the HUD, and
reversed one deliberate design decision.

- **Consumption baseline** (`supabase/15-vehicle-baseline.sql`). The vehicle
  editor takes an optional baseline consumption and the distance it covered.
  `anchoredConsumption()` blends that with measured data as a weighted mean, so a
  sparse log no longer reports four-figure kWh/100 km. The baseline is never
  mixed into the raw figures used for the "methods disagree" warning, and the
  tile says when the headline is anchored or baseline-only. Migration 15 must be
  applied **before** the client ships: `vehicleRow()` writes both columns, and a
  database without them answers `42703` on every vehicle save.
- **Layout is now remembered.** This reverses the earlier "deliberately not
  remembered" decision, because the manifest `start_url` is always
  `ev-tracker.html`, so an installed PWA launched back into classic. The picker
  stores the choice; the canonical start page redirects to it with
  `location.replace` + hash and skips its own boot. Direct links to a layout page
  are honoured and do not rewrite the preference. `tools/test-guard.mjs` was
  updated: the picker is now _expected_ to remember.
- **Appearance is restored in one place.** `bootClasses()` + `restoreAppearance()`
  toggle `dark`, `red-mode` and `show-scanlines` independently with
  `classList.toggle`. Assigning `className` is what would wipe one preference
  while setting another.
- **Retro scanlines are opt-in and off by default.** The HUD checkbox writes a
  global `scanlines` preference; `hud.css` draws `body::before` only under
  `body.show-scanlines`.
- **HUD destructive buttons are readable.** `hud.css` replaced `base.css`'s red
  fill with `--tint` but inherited its dark ink (`#2a0808`), so delete buttons
  were dark red on near-black. A later `.btn.dgr` rule now uses `--danger` as ink
  on the tint.
- **HUD bottom bar is Dashboard, Log, Add, Stations, Settings.** Log precedes
  Add on the phone bar; the flex `order` rules encode it, not source order.
- **Docs.** README's layout section now describes eight pages, the migration
  table lists every file incl. 15, and `## To do` records this feedback round and
  moves the three finished items (mobile log, payer split, `focus`) to Done.

## The week before (2026-10-11 → 2026-10-18, 22 commits)

The one week between the previous handover and this one was dense: the layout
system went from **two** pages to **eight**, and the whole app was split into a
shared design system plus independent UI themes.

- **More layouts.** `classic`, `wide`, `focus` and `modern` were joined by four
  experimental UIs: **`hud`, `brutal`, `editorial`, `glass`** (`e2646d0`). The
  first four share `app/app.css` + a `layout-*.css` sheet; the four new ones load
  `app/ui/base.css` + their own theme and share **no** styling with `app.css`.
- **HUD became a real layout, not a recolour** (`8317b28`). It has its own body
  (`tools/hud-body.html`), a cockpit deck, a night-vision **red-mode** switch
  backed by a device-global `K_REDMODE` key, and its own test suite
  (`tools/test-hud-theme.mjs`, `3947838`).
- **Modern layout** got a warm palette, `DD.MM.YYYY` log dates, numbered station
  map badges, automatic station cameras within 10 km, a true-nearest "Near me",
  a dashboard charger button, and a fixed bottom bar with five centred tabs
  (`3f9eac3`, `63c6ca3`, `f8a437f`, `d811ddb`).
- **Stations.** Full-row hitbox and inline detail/cameras under the tapped row
  (`63c6ca3`); a "you are here" dot on the map, drawn on every branch including
  the empty-results one (`b100714`); and a typed **city/address search** on the
  stations view (`9f16e4a`).
- **Favourites.** Per-place pricing (`8317b28`); the submit button no longer gets
  stuck on "Update favourite" for a new address — the label is derived from
  `editFav` and the form resets after a save (`9f16e4a`).
- **Data/analytics** (`3f99540`). Fixed a `P0001` sync blocker and added seasonal
  tracking, SOH and new dashboard tiles. The payer split (`13-session-payers`)
  and the exclude-me / payer picker landed just before this span (`63a719a`,
  `8a05b69`).
- **HUD polish** (`d33002e`, `9f16e4a`): mobile nav moved to a fixed bottom bar,
  reordered to five tabs (Favourites/Bin hidden), a legible `--text-muted`, a
  faint fill + hairline on clickables, and a single price field (the Euro mirror
  hidden).

## Layouts & the generator

- **Eight pages**, all generated: `classic`, `wide`, `focus`, `modern`, `hud`,
  `brutal`, `editorial`, `glass`.
- `app/shell.mjs` holds `LAYOUTS` and `linkLinesFor(layout)`; `tools/emit-pages.mjs`
  writes every page. Never hand-edit a generated `ev-tracker-*.html`.
- The chosen layout is a **global device key** (`layout`), written by the picker.
  `ev-tracker.html` (the manifest `start_url`) redirects to it at boot; any other
  page boots as itself. See `layoutRedirectTarget()` / `restoreLayout()`.
- Shared markup lives in `ev-tracker.html`; the **HUD overrides its body** from
  `tools/hud-body.html` (`BODY_OVERRIDE` in `emit-pages.mjs`). A change that
  should appear on the HUD goes in `hud-body.html`, not `ev-tracker.html`.
- `app/ui/base.css` is the shared base for the four experimental themes; a theme
  file must not depend on `app/app.css`.
- `tools/test-layouts.mjs` treats the two families differently: the **shared-markup
  pages** must be byte-identical to each other, while the **experimental pages**
  may restructure but must keep every id `app.js` looks up.

## Ground rules — read before touching git

Set by the user on 2026-10-11; still in force:

- **Do not run `git push`.** Not ever, unless explicitly asked in that session.
- **Do not run `git commit`** unless there is a long queue of tasks and work
  genuinely needs committing partway through to keep it safe.
- Normal workflow: leave the changes **in the working tree**, and hand over a
  summary plus a suggested commit message. The user commits and pushes.

A dirty working tree at the end of a session is the expected outcome, not an
oversight.

## Open questions

**1. Which experimental UI stays? — OPEN.**
`hud`, `brutal`, `editorial` and `glass` were built as four options to compare.
Once the user picks one, the other three (page + theme) are deleted. Do not prune
them unprompted.

**2. HUD red mode — a deliberate divergence.**
The HUD header button is not the light/dark toggle; it is a night-vision red
switch, and the palette re-skins by token (`body.red-mode`). `K_REDMODE` is
global (shared across accounts on one device), like the theme. Do not "fix" it
back to the shared sun/moon behaviour.

**3. Dark-mode contrast — mostly superseded.**
The old `--surface-2`/`--surface-3` dark-mode concern applied to the classic
family. The modern layout is now a warm light canvas, and the experimental UIs
carry their own palettes, so the original note no longer drives anything. If a
specific component measurably fails, fix that component — do not repaint tokens
wholesale.

## Next

- **Run migration 15 before deploying.** The client writes the two baseline
  columns on every vehicle save; without the migration that is `42703`.
- **Pick the keeper UI** from the four experimental layouts and delete the rest.
  Do not prune unprompted.
- **Empty-bin ownership/cascade bug** — still unfixed, separate from detached
  shared-car rows. Verify before starting; it may have moved.
- **Human eyes on the HUD.** The new destructive-button colour and the
  scanlines-off default were judged by code and contrast maths, not on a device.

## Traps worth knowing

- **Generated pages.** Edit `ev-tracker.html` (shared) or `tools/hud-body.html`
  (HUD), then `node tools/emit-pages.mjs`. `test-layouts.mjs` also runs the
  generator and asserts it is a no-op, so an unstable generator fails the suite.
- **Layout memory only redirects `classic`.** `layoutRedirectTarget()` refuses
  every other current layout, so a direct link to any layout page is honoured
  (otherwise that page becomes unreachable by URL). The preference is written by
  the picker, not by every page load. `location.replace` keeps Back sane.
- **Appearance classes are independent.** `restoreAppearance()` uses
  `classList.toggle` once per class. Never assign `className` there: it drops
  `dark`, `red-mode` or `show-scanlines` while setting another, and the loss is
  invisible until the next reload.
- **`hud.css` `.btn.dgr` must stay after `.btn:not(.ghost)`.** Both rules have
  the same specificity; the tint rule replaces `base.css`'s red fill but the dark
  ink from `.btn.dgr` still applies, which is exactly the invisible delete button.
- **A consumption baseline is a pair.** A consumption figure without the distance
  it covered cannot be weighted, so `posOrNull` keeps each half nullable and the
  arithmetic ignores an incomplete pair. Zero is invalid, not "unset".
- **Baseline columns are written on every vehicle save.** Run migration 15 before
  shipping the client; a missing column is `42703` on every write.
- **HUD is a separate DOM and stylesheet family.** `app/ui/*` never reads a token
  from `app/app.css`; a change meant for the HUD goes in `hud-body.html` +
  `app/ui/hud.css`.
- **Line endings.** `app/ui/*.css` and `tools/hud-body.html` are LF; the rest of
  the repo is CRLF. Git warns on these; keep diffs addition-only so the warning
  does not become a whole-file rewrite.
- **`#stationDetail` moves.** `parkDetail()` / `inlineDetail()` relocate it under
  the active `.station-row`. It must stay in the document, or `$("stationDetail")`
  returns null and the panel silently stops updating.
- **The favourite submit label derives from state.** Use `syncFavSaveLabel()`
  (it reads `editFav`) rather than setting `#fSave` text directly; it is also
  re-synced on every `renderBody`, so a language switch cannot desync it.
- **A test helper can pass the wrong type invisibly.** The `nearbyChargers`
  helper passed the origin _object_ as `lat`/`lng`, so `dist` was always `NaN` —
  harmless until a distance filter read it. Behavioural assertions beat source
  assertions for exactly this reason.
- **Some tests encode intended behaviour, not bugs.** Behaviour-change work had
  to update `test-phase4`, `test-layout-focus`, `test-session-payers`,
  `test-payer-breakdown`, `test-hud-theme` and `test-stations`. Check whether an
  assertion encodes a bug before changing code to satisfy it.
- **`sorted()` is newest-first.** Anything walking history must reverse it.
  Forgetting this yields silent zeros, not errors.
- `splitBinned(list, into)` **appends** to `into`. Callers must zero the array
  first. This exact omission was an account leak.
- A loader that resets state must do so **before any early `return`**. A regex
  test over its source text cannot see this.
- `node --check` does not catch a duplicated closing brace when the file is
  mostly balanced. The real check is `npm run check`.
- Bump `VERSION` in `sw.js` on every shell change; `tools/test-sw-bump.mjs` and a
  pre-commit hook both enforce it.

## Current shape of the data model

- `vehicles.battery_capacity_kwh numeric null` — **usable** capacity, the only
  figure the maths reads. `null` means "not set" and is deliberately different
  from `0`.
- `vehicles.baseline_consumption_kwh_100km` and `baseline_distance_km`, both
  `numeric null` (migration 15) — the driver's own figure and the distance it
  covers. They are only used as a pair, as a weighted anchor on the headline
  consumption. `null` means no baseline; the measured figures are unchanged.
- Capacity mode (gross/usable) is **not stored**, so no flag can disagree with the
  number it produced. Gross pre-fills usable at 95% in the editor.
- Consumption is reported two ways — from charging energy, and from battery level
  when a usable capacity is set. They are independent and routinely disagree; the
  tile says so rather than picking a winner.
- `session_payers` (migration `13`) records who paid what on a charge. It **copies
  the payer's name** rather than referencing a friends row, so a split survives
  the payer leaving.
- Dashboard analytics now include seasonal (winter/summer) figures and SOH, in
  addition to the energy/distance/cost/time/efficiency/speed tiles.
