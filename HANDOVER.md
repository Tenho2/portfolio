# Where we left off

Written at the end of the 2026-10-27/28/29 session. Durable engineering knowledge
belongs in [README.md](README.md); this file is the part that goes stale.

## State

|                |                                                                              |
| -------------- | ---------------------------------------------------------------------------- |
| HEAD           | `585f67f` — commit and push are the user's job (see ground rules below)      |
| Working tree   | code and documentation changes are uncommitted                               |
| Service worker | `v100`                                                                       |
| Build stamp    | `2026-10-29`                                                                 |
| Tests          | all suites pass, 0 failures (`npm run check`); exact total not recorded      |
| Database       | migrations `15-vehicle-baseline` and `16-vehicle-seasonal-baseline` required |

## 2026-10-27–28: retro window manager, station discovery, wallpaper, rebrand

- **Retro desktop window manager.** `retro-desktop` now has a generated taskbar,
  Start menu, per-view title bars, one foreground window and a real
  minimize/restore/close lifecycle. Closing a dirty Add/Favourites/Settings
  window asks through `askConfirm`; minimised windows keep their forms. Hot Dog
  is one shared `retroHotDog` key for `win31` and `retro-desktop`, but its only
  control is now the retro-desktop clock: clicking the clock asks through
  `askConfirm`, while the Start-menu item, the Settings theme field and Win31's
  header toggle are removed or hidden. The layout now boots with no window
  open; `initialView()` skips the Dashboard fallback unless there is a hash,
  while other layouts keep theirs. Handedness comes from the existing
  `data-nav-align` setting; with no stored preference, `retro-desktop` defaults
  to left and every other layout stays right. See
  `test-retro-window-manager.mjs`, `test-retro-window-lifecycle.mjs`,
  `test-nav-align.mjs` and `test-retro-wallpaper.mjs`.
- **Hot Dog dialog copy.** The Finnish prompt now reads naturally: it asks
  whether to take the theme into use and describes it as a piece of PC history,
  rather than literally translating the English toggle wording.
- **Nested-window cleanup.** The outer `.view` is the only window frame; inner
  `.panel` elements are flat content groups. Dialogs remain windows.
- **Nearby pins on the Add-session map.** `numberedPin()` and
  `drawNumberedPins()` are shared by the Stations and session maps. Session-map
  marker clicks go through `useNearbyPlace()`; user dot, bounds and cleanup are
  handled together. See `test-phase4.mjs`.
- **Station filtering and sorting.** Power radios, connector checkboxes,
  operator search/checkboxes and distance/power/operator sorting. The raw
  `stationAll` is separate from `stationFiltered` and the visible page.
  `extractOperator()` recovers brands from messy names and generic operator
  fields. See `test-station-filters.mjs`.
- **Retro wallpaper.** The compressed
  `app/ui/wallpaper/retro-desk-wallpaper-comp.jpg` is a fixed viewport
  pseudo-element (`body::before`) with `cover`/`center bottom`/`pixelated`; Hot
  Dog hides the layer for the solid red desktop. The body also has
  `min-height: 100vh` / `100dvh`. The fixed layer means a tall mobile window
  cannot resize or drag the scene down. Portrait phones switch to
  `retro-desk-wallpaper-2comp.jpg` and anchor toward the car; both compressed
  wallpapers are in the `v100` cache. Content images and canvases reset to
  `auto` rendering. See `test-retro-wallpaper.mjs`.
- **Rebrand to ChargeDesk 3.11.** The PWA name, page titles, meta descriptions,
  Apple/PWA labels, i18n brand strings, diagnostics header, icon titles, archive
  stubs, package name and shell cache prefix now use ChargeDesk 3.11. File names,
  storage keys, the fake auth domain and the `EV_STORAGE`/`EV_I18N` bridge
  names stay unchanged for URL, data and module compatibility. "Etsi laturi"
  remains the Finnish station-search label; it means "Find charger", not the
  product title.
- **Favourite home checkbox.** The favourite form now has "Use as home location".
  It writes the existing `locDefaults.loc` default-place state rather than a
  per-favourite flag, refreshes the Settings picker, clears the default when the
  current home is unchecked, and marks the saved row with the existing Home tag.
  Covered by `test-favourite-home.mjs`.
- **Edit Session and Sync are managed retro windows.** Both sheets have real
  minimize and close controls in their title bars. Minimize releases the modal
  lock and leaves a taskbar button; restore re-locks it; close and sign-out
  remove the button. They are deliberately not in `RETRO_VIEW_ORDER` because
  they are sheets, not themed page views.
- **Filter UI reaches HUD as well.** The shared station panel and
  `tools/hud-body.html` both carry the filter controls.

## 2026-10-22: archive, contrast, seasonal baselines, scanline levels, Win 3.1

- **Wide and Glass are archived, not deleted.** Their pages, stylesheets and the
  wide test live under `archive/` (see `archive/README.md`). They are gone from
  `LAYOUTS`, `LAYOUT_PAGES`, `SHELL`/`PAGES`, the manifest shortcut, the home-page
  link and every test fixture. Stored preferences are rewritten at boot:
  `wide → classic`, `glass → hud`. Transitional redirect stubs at the old URLs are
  the next deployment step; they are not in the active layout lists.
- **The false footer text is gone.** The `foot` key claimed data stayed in the
  browser although sync exists. The footer element, its three translations and
  its now-dead CSS were removed.
- **Restore/Clear are readable.** Both are `.btn.warn`; the shared `.btn` gives
  white ink and `.btn.warn` only set an amber fill (1.9:1). `app.css` now gives it
  dark ink, and `hud.css` gives it warning-coloured ink on the tint, the same
  pattern as `.btn.dgr`.
- **Seasonal baselines.** Migration 16 adds summer/winter consumption columns.
  The vehicle editor keeps the all-year figure and adds two seasonal fields that
  share `baseline_distance_km`. The winter/summer tiles anchor to their own value
  and fall back to the all-year one; the headline stays on the all-year anchor.
- **Scanlines are adjustable.** The HUD checkbox became Off / 10 / 20 / 30 / 40%.
  The level is stored in the existing `scanlines` key (`"on"` maps to 20) and
  drives `--scan-alpha` through `data-scanlines`. Labels are relative intensity:
  the alphas are 2/3/5/8%, not literal percentages.
- **Windows 3.1 theme.** New shared-markup UI theme (`app/ui/win31.css`): teal
  desktop, gray windows, hard inset/outset bevels, navy title bars, black text,
  square controls, dotted focus, plus a charcoal dark variant. No body override;
  `test-win31-theme.mjs` pins the palette/bevels and `test-layouts` pins the id
  contract.
- **Mobile navigation and theme modes.** The shared UI-theme phone bar now has
  five shrinkable tabs (Favourites/Bin hidden) and Settings carries direct
  shortcuts to both views, so Settings cannot be clipped off-screen. Focus has
  a warm light palette plus the original dark one; Editorial and Brutal gained
  dark token blocks; light surfaces are warm paper instead of raw white.
  Editorial's `.sheet-box/.confirm-box/.auth-box` are opaque again, which fixes
  the invisible `#syncPanel`. `test-theme-modes.mjs` pins the contracts.
  Win31's phone rail is now a dedicated full-width gray bottom bar with five
  equal push-button tabs, no title bar and no active-state bleed; its desktop
  window styling is untouched.
- **Test fixtures** that used `ev-tracker-wide.html` as the second shared page now
  use `ev-tracker-focus.html`. `test-sw-bump.mjs` now lists every active shell
  file instead of only classic/wide, closing a stale-cache blind spot.

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
  `location.replace` + hash and skips its own boot. A first-time visitor with no
  stored preference lands on `retro-desktop`. Direct links to non-classic layout
  pages are honoured and do not rewrite the preference. `tools/test-guard.mjs`
  was updated: the picker is now _expected_ to remember.
- **Appearance is restored in one place.** `bootClasses()` + `restoreAppearance()`
  toggle `dark`, `red-mode` and `show-scanlines` independently with
  `classList.toggle`. Assigning `className` is what would wipe one preference
  while setting another.
- **Retro scanlines are opt-in and off by default.** The HUD checkbox writes a
  global `scanlines` preference; `hud.css` draws `body::before` only under
  `body.show-scanlines`. The enabled wash is 3% ink on a 1px/3px line so the
  toggle is perceptible; at 1.2%/4px it was indistinguishable from off.
- **A Settings checkbox no longer blocks the update reload.** The
  `controllerchange` guard postpones reload only for controls holding
  unsubmitted text (`isTypingTarget`). Previously any focused input - including
  a checkbox just ticked - skipped the reload, leaving the page on the previous
  `app.js` and `hud.css` while the new HTML was already loaded. That presents as
  a checkbox that appears inert and scanlines that will not turn off.
- **HUD destructive buttons are readable.** `hud.css` replaced `base.css`'s red
  fill with `--tint` but inherited its dark ink (`#2a0808`), so delete buttons
  were dark red on near-black. A later `.btn.dgr` rule now uses `--danger` as ink
  on the tint.
- **HUD bottom bar is Dashboard, Log, Add, Stations, Settings.** Log precedes
  Add on the phone bar; the flex `order` rules encode it, not source order.
- **Docs.** README's layout section now describes eight pages, the migration
  table lists every file incl. 15, and `## To do` records this feedback round and
  moves the three finished items (mobile log, payer split, `focus`) to Done.
- **ESLint is in the build** (`eslint.config.mjs`, `npm run lint:code`, run by
  `npm run check` with `--max-warnings=0`). Deliberately narrow: logic rules
  only, style rules explicitly off. The first pass removed real dead code
  (`otherLayout`, `lastUsedAt`, `shareTableReady`, `delFav`, `doDeleteFav`), a
  duplicated share-code cache, a write-only `codesAvailable`, an unused import
  counter, a dead station page variable and duplicate `toast.geoDenied` keys in
  all three complete languages. `setPayerDraft` and `payerTotals` are test-only;
  they carry an explicit disable comment rather than a blanket exclusion.
  A later full-recommended audit, including `sw.js`, found one stray `U+FEFF`
  BOM in `tools/test-ui.mjs`; it is fixed, `no-irregular-whitespace` is now on,
  and `sw.js` is in the lint scope. The style profile would add ~1,797 warnings
  (1,590 `no-var`, 189 `no-console`), so those rules stay deliberately off.

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

- **Eight active pages**, all generated: `classic`, `focus`, `modern`, `hud`,
  `brutal`, `editorial`, `win31`, `retro-desktop`. `wide` and `glass` are
  archived in `archive/` and are not built.
- `app/shell.mjs` holds `LAYOUTS` and `linkLinesFor(layout)`; `tools/emit-pages.mjs`
  writes every page. Never hand-edit a generated `ev-tracker-*.html`.
- The chosen layout is a **global device key** (`layout`), written by the picker.
  `ev-tracker.html` (the manifest `start_url`) redirects to it at boot; with no
  stored preference it sends a first-time visitor to `retro-desktop`. Any other
  page boots as itself. See `layoutRedirectTarget()` / `restoreLayout()`.
  `RETIRED_LAYOUTS` maps archived names: `wide -> classic`, `glass -> hud`.
- Shared markup lives in `ev-tracker.html`; the **HUD overrides its body** from
  `tools/hud-body.html` (`BODY_OVERRIDE` in `emit-pages.mjs`). A change that
  should appear on the HUD goes in `hud-body.html`, not `ev-tracker.html`.
- `app/ui/base.css` is the shared base for the five experimental themes; a theme
  file must not depend on `app/app.css`.
- `tools/test-layouts.mjs` treats the two families differently: the **shared-markup
  pages** must be byte-identical to each other, while the **experimental pages**
  may restructure but must keep every id `app.js` looks up.
- Old URLs for archived layouts need a transitional redirect stub for one release;
  they are not part of `LAYOUTS`/`PAGES`, so a missing stub is a 404, not a fallback.

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
`hud`, `brutal`, `editorial` and `win31` are the active experiments. Wide and Glass
are already archived. Once the user picks a keeper, the rest can be archived the
same way; do not prune them unprompted.

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

- **Run migrations 15 and 16 before deploying.** The client writes the baseline
  columns on every vehicle save; without them that is `42703`.
- **Delete the archived-layout stubs after one release.** `ev-tracker-wide.html`
  and `ev-tracker-glass.html` currently redirect to `ev-tracker.html`; the real
  archived copies live under `archive/`.
- **Pick the keeper UI** from HUD/Brutal/Editorial/Win31. Do not prune unprompted.
- **Empty-bin ownership/cascade bug** — still unfixed, separate from detached
  shared-car rows. Verify before starting; it may have moved.
- **Human eyes on the new themes.** The warning-button inks, scanline levels and
  Windows 3.1 palette were judged by code and contrast maths, not on a device.
- **Visual review of the retro desktop.** Check the wallpaper against Hot Dog,
  the taskbar/Start menu at both handedness settings, and the flat inner panels.
  Automated tests cannot judge whether the wallpaper crop looks right.
- **Station filtering against live data.** The pure filters are tested, but the
  operator extraction patterns should be checked against real Digitraffic and
  Overpass rows from several Finnish/Nordic regions.
- **Hot Dog is now a discoverability question, not a bug.** Confirm on a device
  that the clock looks clickable enough to find without advertising the secret.

## Traps worth knowing

- **Generated pages.** Edit `ev-tracker.html` (shared) or `tools/hud-body.html`
  (HUD), then `node tools/emit-pages.mjs`. `test-layouts.mjs` also runs the
  generator and asserts it is a no-op, so an unstable generator fails the suite.
- **Retro chrome is generated, not hand-written.** The taskbar and Start menu
  come from `bodyExtrasFor()` in `app/shell.mjs`; title bars are created only at
  runtime on the retro page. Do not add a separate retro HTML body.
- **`isRetroLayout()` is not `isRetroDesktop()`.** The former includes `win31`
  for the shared Hot Dog preference; taskbar/window behaviour must use the
  latter.
- **Hot Dog has exactly one control.** It is the retro-desktop clock. The Start
  menu has no theme item, the shared `#themeField` is hidden on both retro
  layouts, and `#themeBtn` is hidden on Win31. Do not wire any of them back.
- **An inferred handedness is not a preference.** `navAlignFor()` returns the
  layout default, but `applyNavAlign()` writes only an explicit left/right to
  storage; otherwise visiting retro-desktop would leak left alignment into
  every other layout.
- **Hot Dog owns the retro desktop background.** The wallpaper is on the fixed
  `body[data-layout="retro-desktop"]::before` layer; Hot Dog must hide that layer
  (`display: none`) and keep the body's solid colour.
- **Session and station pins share one factory.** `numberedPin()` /
  `drawNumberedPins()` are the only marker creators; only the click handler and
  slot key differ. Do not fork the visual marker again.
- **Station filters have three lists.** `stationAll` is raw, `stationFiltered`
  is after filters/sort, and `stationResults` is the visible page. Status,
  `stationMore`, detail lookup and map pins must all read the filtered result.
- **`test-sw-bump.mjs` knows CSS-referenced assets.** Both wallpapers are
  referenced from `retro-desktop.css` (one base, one portrait), so a new asset
  must be referenced before it counts as shell content.
- **Layout memory only redirects `classic`.** `layoutRedirectTarget()` refuses
  every other current layout, so a direct link to any layout page is honoured.
  The classic start page sends a new visitor to `retro-desktop`; a stored
  `classic` preference keeps it on classic. The preference is written by the
  picker, not by every page load. `location.replace` keeps Back sane.
- **Appearance classes are independent.** `restoreAppearance()` uses
  `classList.toggle` once per class. Never assign `className` there: it drops
  `dark`, `red-mode` or `show-scanlines` while setting another, and the loss is
  invisible until the next reload.
- **`hud.css` `.btn.dgr` and `.btn.warn` must stay after `.btn:not(.ghost)`.** Both
  generic rules have the same specificity as the variant; the tint rule replaces
  `base.css`'s fill but the variant ink still applies. `.btn.dgr` was dark red on
  near-black; `.btn.warn` was dark on dark. The shared `.btn.warn` also needed its
  own dark ink because `.btn` supplies white.
- **A consumption baseline is a pair.** A consumption figure without the distance
  it covered cannot be weighted, so `posOrNull` keeps each half nullable and the
  arithmetic ignores an incomplete pair. Zero is invalid, not "unset".
- **Seasonal baselines share `baseline_distance_km`.** Summer/winter values fall
  back to the all-year figure; the headline stays on the all-year anchor. The
  seasonal tile's `anchored` flag drives a provenance note.
- **Baseline columns are written on every vehicle save.** Run migrations 15 and 16
  before shipping the client; a missing column is `42703` on every write.
- **Scanline levels are relative.** `--scan-alpha` is 2/3/5/8% for the 10/20/30/40
  labels. The old `"on"` value maps to 20; `applyScanlines` writes the level to
  `data-scanlines` and the class is only present when it is non-zero.
- **Windows 3.1 is a CSS-only UI theme.** It uses the shared markup and must not
  load `app/app.css`. `test-win31-theme.mjs` pins palette/bevels; `test-layouts`
  pins the id contract. Generic `.btn` rules must not erase `.warn`/`.dgr` ink.
- **Wide fixtures are gone.** Tests that used `ev-tracker-wide.html` as the second
  shared page now use `ev-tracker-focus.html`; the archived page is a redirect stub.
  `test-sw-bump.mjs` lists every active shell file, not just classic/wide.
- **Theme sheets load after `base.css`.** A theme's `.side` or `.side-nav button`
  rule wins on source order, even inside a mobile layout the base sheet just
  arranged. Win31 needed its own ≤820px reset for the fixed rail width and 13px
  labels; new themes need the same. The base contract is five shrinkable tabs.
- **Every non-HUD UI theme needs both token sets.** Focus now has a light default
  and `body.dark[data-layout="focus"]`; Editorial and Brutal have dark blocks;
  Win31 already did. `test-theme-modes.mjs` fails when one is missing.
- **Editorial dialogs are not editorial panels.** Keep `.sheet-box`,
  `.confirm-box` and `.auth-box` opaque; making them transparent for the print
  look is what made `#syncPanel` appear as floating text.
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
- **The update reload is guarded by typing, not by focus.** `isTypingTarget()`
  returns true only for text-like inputs and textareas. A checkbox, radio,
  button or select has already committed, so it must not postpone the
  `controllerchange` reload; doing so left a page mixing new HTML with old
  cached `app.js`/`hud.css`, which looks exactly like a broken setting.
- **ESLint is deliberately narrow.** `eslint.config.mjs` turns style rules
  (`eqeqeq`, `no-var`, `prefer-const`, `no-console`) explicitly off; enabling
  them would bury the logic findings in 14k lines of deliberate ES5. Add a rule
  only when it catches a class of real bug, and keep `--max-warnings=0` honest
  by annotating genuine exceptions with a reason.

## Current shape of the data model

- `vehicles.battery_capacity_kwh numeric null` — **usable** capacity, the only
  figure the maths reads. `null` means "not set" and is deliberately different
  from `0`.
- `vehicles.baseline_consumption_kwh_100km` and `baseline_distance_km`, both
  `numeric null` (migration 15) - the driver's own figure and the distance it
  covers. They are only used as a pair, as a weighted anchor on the headline
  consumption. `null` means no baseline; the measured figures are unchanged.
- `vehicles.baseline_summer_kwh_100km` and `baseline_winter_kwh_100km`, both
  `numeric null` (migration 16) - seasonal anchors for the summer/winter tiles,
  sharing `baseline_distance_km`. They fall back to the all-year figure. The
  headline remains on the all-year anchor, so a mixed history is never assigned a
  season.
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
