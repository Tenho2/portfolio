# Where we left off

Written at the end of the 2026-10-11 session, so the next session can start
without reconstructing the thread. Durable engineering knowledge belongs in
[README.md](README.md); this file is the part that goes stale.

## State

|                |                                                                   |
| -------------- | ----------------------------------------------------------------- |
| HEAD           | `03e1ff5` — **pushed** to `origin/main`                           |
| Working tree   | clean at time of writing                                          |
| Service worker | `v47`                                                             |
| Build stamp    | `2026-10-11`                                                      |
| Tests          | 1380 assertions, 0 failures, across 22 suites                     |
| Database       | migrations `10-leave-share` and `12-vehicle-capacity` **applied** |

Everything committed is on GitHub. If the machine is shut down, nothing is lost.

## Just finished

1. **Consumption (`ed5cee9`).** Efficiency was total charged kWh ÷ total km,
   which is wrong by exactly one charge's worth of energy — the newest charge has
   no kilometres behind it yet. A reported log went from 678.6 to 357.1
   kWh/100km. Added usable battery capacity, SoC-derived consumption, and tiles
   that name which method produced the figure.

2. **Cross-account leak (`03e1ff5`).** Deleted favourites — names and street
   addresses — could appear in the next account's bin on a shared device. Root
   cause was in-memory state outliving a key change, not the key scheme.

3. **Station bugs (`03e1ff5`).** Unreadable station names in dark mode; map pins
   not updating the panel below the map.

4. Removed `supabase/11-probe-logging.sql`.

## Open questions — these need the user, not more code

**1. Are the two test rows inconsistent?** The 14 km log now reports
357.1 kWh/100km. No road car does that; a real EV is 15–25. The maths is
verified correct, so one of the inputs is wrong. Most likely the two sessions'
mileage readings or their charge energies do not describe the same real drives.
**Do not "fix" this in the app** — the app is right and the data is the question.

**2. What was in the bin that leaked?** The user saw "deleted data entries"
without saying whether they were _favourites_ or _charge sessions_. Vehicles and
sessions bins are reset correctly on an account switch, so the fix only covers
favourites. If sessions were visible, there is a second bug that has not been
found yet.

**3. Does dark mode have more contrast failures?** `--surface-2: #1e40af` and
`--surface-3: #3b82f6` are the _light_ theme's values, unchanged in the dark
block — brighter in dark mode than the surface behind them. They are used in 24
places. They were deliberately **not** repainted: the consequence could not be
previewed, and guessing at a 24-site palette change is how other things break.
Only the one station row that measurably failed was fixed. This needs eyes on a
real device.

## Next task, green-lit: mobile-readable charge log

The charge log is an 11-column table with `min-width: 760px` and `nowrap`, so on
a phone it is a horizontal scroll. Planned treatment, agreed:

- **One DOM**, styled two ways. Not two renderers — they drift, and the sort,
  select and edit actions would have to be written twice.
- `data-label` attributes on the cells, shown as labels via `::before` in card
  layout below ~700px.
- `display: block` on the table parts under that breakpoint only, so the desktop
  table keeps its semantics and screen readers are not fed a broken grid.
- Sorting, row selection and the edit affordance must survive.

Constraints that shaped it and will shape the implementation:

- Both pages are **generated** — edit `ev-tracker.html`, then
  `node tools/emit-pages.mjs`. Never hand-edit `ev-tracker-wide.html`.
- Shared `app/app.css`; layout-only rules go in `app/layout-classic.css` /
  `app/layout-wide.css`.
- Dependency-free, classic scripts, `file://` must keep working.
- Any new user-facing string needs English, Finnish **and** Swedish.
- Bump `VERSION` in `sw.js` — a pre-commit hook enforces this, and it is right:
  a phone keeps the cached shell until the worker's own file changes.
- Run `npm run verify` before committing.

## After that

- Shared-charge payer split — migration `13-session-payers.sql` (numbering:
  `11` was deliberately removed rather than renumbered, so it is free).
- The `focus` layout — deep indigo-slate, mint `#10B981`, hairline borders, no
  gradients or glass, inline SVG icons. Only `classic` and `wide` exist today;
  `tools/emit-pages.mjs` and `tools/test-layouts.mjs` both need to learn a third.
- Empty-bin ownership/cascade bug — still unfixed, separate from detached
  shared-car rows.
- README `## To do` — written, but review it.

## Traps worth knowing

- **`sorted()` is newest-first.** Anything walking history must reverse it.
  Forgetting this yields silent zeros, not errors.
- `splitBinned(list, into)` **appends** to `into`. Callers must zero the array
  first. This exact omission was the account leak.
- A loader that resets state must do so **before any early `return`**. A regex
  test over its source text cannot see this.
- `test-ui.mjs` asserts source text, so it passes through control-flow bugs. The
  behavioural suites (`test-consumption`, `test-account-isolation`,
  `test-station-ui`) exist to cover that gap.
- Any new test must be checked against the _unfixed_ code (`git stash push` the
  app file, run it, confirm it fails, `git stash pop`). Two suites written here
  passed against broken code on first draft and proved nothing.
- `node --check` does not catch a duplicated closing brace when the file is
  mostly balanced — it did once today. The real check is `npm run check`.

## Current shape of the data model

- `vehicles.battery_capacity_kwh numeric null` — **usable** capacity, the only
  figure the maths reads. `null` means "not set" and is deliberately different
  from `0`.
- Capacity mode (gross/usable) is **not stored**, so no flag can disagree with
  the number it produced. Gross pre-fills usable at 95% in the editor.
- Consumption is reported two ways — from charging energy, and from battery
  level when a usable capacity is set. They are independent and routinely
  disagree; the tile says so rather than picking a winner.
