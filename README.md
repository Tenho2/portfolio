# portfolio

> **Resuming work:** see [HANDOVER.md](HANDOVER.md) for current state and open
> questions, and the [To do](#to-do) section at the end of this file for the
> backlog.

Personal projects. Two pages, no build step: `index.html` is the home page and
`ev-tracker.html` is an EV charging tracker that runs straight from the file.

## Layout

| Path                      | What it is                                                                      |
| ------------------------- | ------------------------------------------------------------------------------- |
| `index.html`              | Home page. Served at the domain root, so it has to stay here.                   |
| `ev-tracker.html`         | The tracker in the classic layout. See "The two layouts".                       |
| `ev-tracker-wide.html`    | The same tracker in the wide layout.                                            |
| `app/`                    | Shared by both layouts: logic, design system, i18n, storage.                    |
| `sw.js`                   | Service worker. Caches the app shell; Supabase and map tiles stay network-only. |
| `manifest.json`, `icons/` | PWA install metadata.                                                           |
| `i18n/`                   | Northern Sámi translation template. The app's other languages are inline.       |
| `supabase/`               | Database migrations. Not run automatically — see below.                         |
| `tools/`                  | Test harnesses, the page generator and the syntax checks.                       |

The five web files at the root reference each other by relative path and
`index.html` has to be at the branch root for GitHub Pages, so they stay flat.

## Development

```sh
npm install       # prettier, html-validate, jsdom — devDependencies only
npm run check     # tests, formatting, HTML validity, inline JS syntax
npm test          # 204 assertions
npm run fmt       # format *.json and *.md
npm run fmt:html  # reformat the HTML: rewrites ~480 lines, so opt-in
```

There is no bundler and no build output. `ev-tracker.html` is served as-is.

A pre-commit hook runs `npm run check` and also refuses a commit that changes
`ev-tracker.html` without bumping `VERSION` in `sw.js`. Enable it once per
clone:

```sh
git config core.hooksPath .githooks
```

### What the tests cover, and why each exists

`tools/test-roles.mjs`
: The permission ladder, extracted from the page and run against stub state.

`tools/test-storage.mjs`
: Per-account storage isolation. Guards the bug where signing out of one
account carried its vehicles into another.

`tools/test-bin.mjs`
: The split between live and binned rows. A deleted row must never reappear in
the live arrays, and no row may be lost in the process.

`tools/test-sync-status.mjs`
: Refusal classification. A row held for pending approval must never offer
Discard, because discarding it would delete real data to fix a permission
that resolves on its own.

Also covers `pushableVehicle`. Every account gets a default vehicle, so the one
a device invents at load time collides with the row already on the server and
its insert is refused with `42501`. A device-created vehicle is therefore marked
provisional and never pushed until a pull confirms the account is genuinely
empty. Rows saved before the flag existed have no property at all, so the check
tests for the flag's absence rather than `=== false`.

`tools/test-location.mjs`
: Distance maths and the GPS accuracy gate.

`tools/test-ui.mjs`
: Markup, CSS and call-order rules that no function-level test can see. Every
one of these bugs produced no error at all.

An element that should have been invisible was on screen permanently (any
author `display` beats the user-agent `[hidden]` rule, which is why the red
sync banner was always there); two accounts shared one storage key, because
`favs`, `locDefaults` and `shareNames` were read once at boot when the bucket
still pointed at signed-out; a dialog could not be closed with Escape; a
restored backup duplicated a charge; and a CSV header matching two column lists
threw inside `FileReader.onload`, which has no try/catch, so the file appeared
to do nothing.

Also covers the CSS specificity bug that kept the bin count invisible on every
phone despite a comment saying it was fixed, and a check that `fi` and `sv`
translate every key — a missing one renders as English with no error.

`tools/test-dom.mjs`
: Renders the real page in jsdom and asks whether anything a person needs is
: actually there: no blank translated text, no empty placeholders, no
: unlabelled field, no dangling `label[for]`, no duplicate ids. This is the
: suite that would have caught the missing-text reports.

`tools/test-wiring.mjs`
: Every id the script looks up exists, ids are unique, the file is valid UTF-8
: with no BOM, non-English text is intact, line endings are consistent, the
: precache list names files that exist, and the app script never references a
: private of the i18n module — the cause of the `lang` and `LANGS` bugs.

Since the page was split it also discovers every `<script src>` from the
markup and checks each one: that the file exists, that it is loaded before
the application script, and that remote ones are absolute URLs. Adding a file
to the page therefore brings it under test automatically.

`tools/test-i18n-markup.mjs`
: Every `data-i18n*` key in the markup has English text. A missing one renders
: as a blank element with no error anywhere.

`tools/check-inline-js.mjs`
: Compiles each inline `<script>` block, because all the JavaScript is inline
: and `node --check` has nothing to look at otherwise.

`tools/check-sql.mjs`
: Static checks for the migrations, because there is no PostgreSQL on the
development machine and nothing else can tell whether one parses. Catches
standalone `DROP CONSTRAINT` (not a PostgreSQL statement at all), `regprocedure`
casts without parens, columns read from `auth.users` that do not exist,
lowercase comparisons against `pg_policies.cmd` (which silently match nothing
and report "no policies" when they are all there), reserved words used as
column names, unbalanced `$$` quoting, unbalanced `begin`/`commit`, and
references to migrations that are not in the folder.

Verified by planting each of those defects and confirming it is reported. Five
migrations shipped broken while `npm run check` was green; all five are caught
here now.

`tools/test-sw-bump.mjs`
: Fails when the app shell changed but `VERSION` in `sw.js` did not. Devices
serve the cached shell, so a change that is not accompanied by a version bump
never reaches a phone — which is how a whole feature went missing while it
looked present locally. It compares the `VERSION` value rather than merely
noticing that `sw.js` was touched, since editing its comment is not a bump.

### A note on file size

`ev-tracker.html` started as one 12,800-line file: ~1,500 CSS, ~1,900 i18n data
and ~9,400 application logic, all sharing one lexical scope. The size was never
the problem — 119 KB gzipped is small. The problem was that nothing enforced
the boundary between modules, which is how `LANGS is not defined` and then
`lang is not defined` both reached production as blank panels.

The split is complete. Nothing is generated into `dist/`; the pages are plain
files that a static host can serve as they are.

| File                     | Lines | Contents                            |
| ------------------------ | ----- | ----------------------------------- |
| `ev-tracker.html`        | 1,508 | markup, classic layout              |
| `ev-tracker-wide.html`   | 1,508 | markup, wide layout                 |
| `app/app.js`             | 9,259 | application logic                   |
| `app/app.css`            | 1,616 | the shared design system            |
| `app/layout-classic.css` | 17    | the classic navigation shell        |
| `app/layout-wide.css`    | 182   | the wide navigation shell           |
| `app/i18n.js`            | 2,177 | translations for all four languages |
| `app/storage.js`         | 173   | per-account local storage keys      |
| `app/shell.mjs`          | 79    | how the two pages are assembled     |

Classic `<script src>` rather than ES modules on purpose: it keeps the page
working from `file://` with no build step, and each file gets its own scope, so
the i18n module's privates are unreachable from the application script rather
than merely untested. `tools/test-wiring.mjs` asserts the load order, since
loading a module after the app would leave its global undefined at boot, and it
covers every `<script src>` the markup lists rather than a hard-coded pair.

`app/storage.js` owns key naming and bucket selection only. It never touches the
vehicles or sessions arrays and never renders anything, which is what keeps the
boundary real — there is no state in it to reach back into. Its tests run the
real file in a sandbox with a fake `localStorage`, rather than re-assembling
functions out of the HTML, so the module's own wiring is exercised too.

The remaining slice is the sync engine, which is still inline in `app/app.js`.
The upgrade to `type="module"` — which would turn a cross-module reference into a
load-time error instead of a separate scope — is a separate change and needs
`file://` to stop working.

### The two layouts

`ev-tracker.html` is the original: a fixed 250 px rail on the left, which becomes
a sticky strip of icons below 820 px and a single bar below 560 px.
`ev-tracker-wide.html` is the same application arranged differently — a permanent
top bar with the navigation labels always visible, and a content column capped so
a line of text never runs the width of a large display. It suits a tablet, a desk
or a head unit read from further away than a phone.

**They are the same application, not two builds.** Identical markup, the same
`app/app.js`, the same storage keys and the same account; only the arrangement
differs, and only in CSS. That matters because `app/app.js` looks up roughly 170
element ids while wiring its handlers with no per-page guard, so a layout with its
own markup would have to reproduce every one of them exactly — and any divergence
would be a page that throws before the application starts.

Switch with **Settings → Data → Layout**, or from the home page. It is a
navigation, not a migration: nothing is moved, re-imported or copied, and your
data and account are the same either way. The current view is carried in the
fragment, so switching from the middle of the log lands you in the log.

The choice is deliberately **not remembered** between the two pages. Whichever
one you are on when you close the tab is the one you return to, because a stored
preference would need one page to override the other — and the picker is on both
pages, so there is nothing to remember it for.

`npm run build:pages` regenerates both pages from `app/shell.mjs` and the checked-in
markup. Run it after editing the `<head>` or the shared markup; it is idempotent,
and it refuses to leave a page half-written if its output is not stable.
`tools/test-layouts.mjs` asserts the two markups stay byte-identical apart from
the `<body>` attribute and the layout `href`, that neither page re-inlines CSS or
JS, and that the generator is a no-op on a second run. `tools/test-layout-wide.mjs`
checks the wide shell is doing the arranging it claims to, and that it never
restyles a shared component or hides content — a layout that silently drops
information is a bug, not a preference.

## Charging stations

**Find station**, on the dashboard directly after Add session, lists the real
chargers near you. The data layer is `app/stations.js`; the screen is in
`app/app.js`.

### Two sources, chosen by where you are

| Where           | Source                                                       | Why                                                                                                                                              |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inside Finland  | **Digitraffic** (Fintraffic), the official national registry | 3,840 stations, operator-fed, every EVSE with connector type and power, plus live status. OpenStreetMap has thin coverage inside Finnish cities. |
| Outside Finland | **Overpass**                                                 | Digitraffic is Finnish only.                                                                                                                     |

Both return the same row shape, so nothing in the UI knows which one answered.

### What the Digitraffic API actually does

Every one of these was established by calling the endpoint, not by reading its
documentation, and each differs from what the documentation implies:

- **`limit` accepts only `500` or `ALL`.** `?limit=2` is a 400, not a short page.
- **The payload is GeoJSON** — `features[]`, not `result[]` — and coordinates are
  **`[lng, lat]`**. The other order drops every Finnish station into the Baltic
  and returns an empty map with no error anywhere.
- **`maxElectricPower` is in watts.** 12800 is a 12.8 kW charger; read as kilowatts
  the app would advertise a 12.8 MW one.
- **Status lives at `locations/statuses`**, not `statuses` (a 404). Tariffs are
  top-level at `tariffs`.
- **`evseStatus=AVAILABLE` is accepted and then ignored.** The response still
  contains everything, so filtering has to be done locally or not at all.
- **Tariffs mix five kinds of price component.** Only `ENERGY` is a price per kWh;
  `PARKING_TIME` is per hour of standing still and is 8× higher. `stepSize` is the
  unit the operator quotes in — 1000 means per MWh, which must be divided before
  display. The feed carries **nine currencies**, so the currency travels with the
  price rather than being assumed to be euros.

The raw response is 23.5 MB. Status is 20,000 rows that changes by the minute, and
tariffs 4,000 — so **only the station list is cached**, and status and tariffs are
fetched when a station is opened.

### The cache is packed and compressed, because the quota is shared

The station cache lives in `localStorage` beside the user's own sessions, vehicles
and favourites. If it tips the quota over, the write that fails is somebody's
charge history — not the station list. Measured for the full registry:

| Form                             | Size       |
| -------------------------------- | ---------- |
| one named JSON object per pole   | 2,125 KB   |
| packed positional rows           | 1,511 KB   |
| **packed and gzipped (shipped)** | **441 KB** |

Poles are stored positionally rather than by name, with a per-station plug lookup
instead of a repeated string per pole. `CompressionStream` is a browser built-in,
so this costs no library; a browser without it falls back to packed JSON under a
different marker, and a cache written by either version is readable by the other.

A site with 219 poles is real, and 219 rows of connector detail is not information
anyone can use. Only the first 12 poles keep their detail, and the panel says how
many were not listed — but **every EVSE id is kept**, because live status is
counted from it, and a truncated list would report "3 of 12 free" at a site with
two hundred poles.

### Showing five, not hundreds

A 10 km search in a city centre returns hundreds. The nearest five are shown and
the rest sit behind a button that states the remaining count — a wall of rows
buries the one you came for. The count in the status line is the true total, not
the number on screen.

### Overpass is still unreliable, and treated that way

Measured over one afternoon:

| Endpoint                  | Behaviour                                                        |
| ------------------------- | ---------------------------------------------------------------- |
| `overpass-api.de`         | 504 under load; 406 to a client sending no meaningful User-Agent |
| `overpass.kumi.systems`   | 429 under load                                                   |
| `overpass.private.coffee` | 429 under load                                                   |

`overpass.osm.ch` is deliberately **not** in the list: it answered HTTP 200 with
**zero** elements for a Stockholm query where Stockholm has hundreds of chargers.
A stale mirror is indistinguishable from an absence unless you know which endpoint
answered, so an empty answer from a non-primary endpoint is reported as a
**failed lookup**, never as a confirmed absence.

> Every public instance refuses or rate-limits a request from a **Node script** —
> `overpass-api.de` answers 406 at the Apache layer because undici will not let the
> script replace its User-Agent. In a browser the request carries an ordinary
> browser User-Agent. The browser path therefore **could not be verified from the
> command line**; `tools/check-stations.mjs` reports this rather than claiming a
> result it did not get.

### Nothing is invented

A chosen station fills the name and coordinates and **leaves the price alone**.
Digitraffic does publish real tariffs, but they are per-operator, change weekly,
and a wrong one is worse than none — the existing ambiguity logic exists precisely
to avoid that. The same reasoning applies to the 10 km radius: OpenStreetMap rows
outside Finland carry no power rating, so that field is empty rather than guessed.

### Cameras

`https://tie.digitraffic.fi/api/weathercam/v1/stations` lists **813 road-weather
cameras**. These are road-condition cameras, not enforcement or speed cameras, and
the screen says so. Images come from
`https://weathercam.digitraffic.fi/{presetId}.jpg`, about 15 KB with
`?thumbnail=true` and 158 KB full. The list is fetched fresh when opened and the
capture time is shown, because a stale road camera is worse than no camera.

### Diagnostics

Lookups are recorded under **`STATION LOOKUPS`**, deliberately _not_ in the error
log. `diagLog` renders under a heading that reads ERRORS and its empty line says
_"none — every write the server accepted"_, so a successful lookup filed there
would print as a fault — the same misreading that got a `42501` wrongly declared
fixed in the first place.

Each entry records the endpoint, elapsed ms, byte count, element count, whether
it came from a fallback, and the **raw response body**, truncated at 4 KB with the
true size stated. That is what lets the real response shape be read off a report
instead of guessed at. Ten entries, separately capped, so the raw bodies can never
crowd out the error log.

## Database

Supabase project: `ztzsyklfaqxurbtvsvtz`. Credentials are in
`ev-tracker.html` next to the sync code.

The publishable key is designed to be public, and Row Level Security is what
actually protects the data. There is deliberately no `service_role` key in this
repository, and no server-side code.

Migrations must be pasted into the Supabase SQL editor **in numeric order**:

| Order | File                          | What it does                                                 |
| ----- | ----------------------------- | ------------------------------------------------------------ |
| 1     | `supabase/01-schema.sql`      | `vehicle_shares`, sharing helpers, RLS policies              |
| 3     | `supabase/03-share-codes.sql` | 6-character share codes                                      |
| 4     | `supabase/04-roles.sql`       | Roles (viewer/driver/admin), owner approval, tightened RLS   |
| 5     | `supabase/05-trash.sql`       | `deleted_at` for the recoverable bin                         |
| 6     | `supabase/06-owner-stamp.sql` | `BEFORE INSERT` trigger stamping `user_id` from `auth.uid()` |
| —     | `supabase/07-diagnose.sql`    | Read-only. Tells apart the causes of a `42501` refusal.      |

Every one is idempotent, so re-running is safe. Each ends with a query that
confirms it worked. `07-diagnose.sql` is the exception: it is only SELECTs and
makes no changes, so it is safe to run at any time.

**There is no 02, and that is not a mistake.** It held a sessions trigger and
four policies, and `04-roles.sql` recreates every one of them, so it was removed
rather than left in place as a file that teaches the reader something untrue. The
numbering gap is deliberate; the files are not renumbered because they
cross-reference each other by number in their headers.

**Run the diagnostic queries one at a time.** The Supabase SQL editor returns
the result of the _last_ statement in a pasted script and nothing else, so
pasting all of `07-diagnose.sql` at once shows you only the final query. Its
header lists the four that decide it, in the order worth running.

### Why 06 exists

The client used to send `user_id` in every write. A stale or mismatched
client-side identity produced a row the insert policy then refused with
`42501 new row violates row-level security policy`, and there was no way to fix
it from the browser: the only available "repair" was to resend the same wrong
value. The trigger now overwrites `user_id` with `auth.uid()` on INSERT, so the
client cannot get it wrong at all.

Only INSERT is stamped, never UPDATE, so the original author of a charging
session survives an owner or admin correcting it, and a shared driver logging a
session is stamped with their own id exactly as before.

### Diagnosing a `42501` refusal

`42501 new row violates row-level security policy for table "vehicles"` has
three causes that look identical in the browser:

1. The access token has expired, so `auth.uid()` is NULL rather than wrong.
2. `06-owner-stamp.sql` was never applied, so `user_id` is whatever the client
   sent.
3. **The row already exists with `user_id IS NULL`.**

Cause 3 is the one that looks impossible and is not. `vehicle_role` resolves
ownership with `when v.user_id = auth.uid() then 'owner'`. With `user_id` NULL
that comparison yields NULL rather than true, so with no accepted share the role
is NULL, the rank is 0, and **the server refuses the row to the account that
actually owns it**. The SELECT policy refuses it too, so it never appears on a
pull either — invisible on every device while still blocking writes to the id
the app is holding.

Such rows come from before the policies were tightened, or from the Table
Editor, where `auth.uid()` is NULL and the trigger deliberately declines to
stamp. `06` cannot repair them, because its trigger is `BEFORE INSERT` only: a
row that already exists takes the UPDATE path and is never stamped.

Run `supabase/07-diagnose.sql` and read query 3. Adopt a row only with the
correct account id — a blanket `update` would attach somebody's car to the wrong
person.

### Deploying

`sw.js` carries a `VERSION` string that must be bumped whenever
`ev-tracker.html` changes. The cache name is derived from it, so a new value
makes the worker fetch a fresh shell. Skipping this is what leaves phones on an
old build: the worker only re-runs when its own file changes.

Check which build a device is on under **Settings → Data**. The stamp reads
`Build 2.10.2026 · SW v14`; the SW half is the one that goes stale.

### Resetting a device

**Settings → Data → Sign out and clear this device** wipes this browser's copy
of every account and signs out. Nothing on the server is deleted, so signing
back in pulls the account's real data again. It is deliberately a separate
button from ordinary sign-out, which keeps local data.

It exists because a stale session is the one failure the app cannot recover
from by itself.

### Forgotten passwords

Usernames are stored as `username@evtracker.test`, and that domain can never
receive mail, so Supabase's emailed reset link cannot work. To reset a password,
generate a recovery link from the Supabase dashboard and pass it to the user
directly. **Change password** in Settings works normally, since it needs a
signed-in session.

Do not build an in-app "forgot password" that returns a link to whoever typed
the username — that is account takeover for anyone who knows a name.

## To do

Ordered roughly by what is worth doing next. Open questions that need a human
answer are marked; they are not code tasks and should not be "fixed" by
changing the app.

### Mobile-readable charge log

The log is an eleven-column table with `min-width: 760px` and `nowrap`, so on a
phone it is a horizontal scroll with no context on which column you are reading.

The treatment is **one DOM styled two ways** — not a second renderer. Two
renderers drift apart, and sorting, selection and editing would have to be
written twice. Cells carry `data-label`, shown as labels through `::before` in
card layout below ~700px, with the table parts set to `display: block` only at
that breakpoint so the desktop table keeps its semantics.

### Shared-charge payer split

Charge a shared car partly and record who paid. Migration
`13-session-payers.sql` — the number is free because the temporary `11` probe
was removed rather than renumbered.

Decided already: split per session rather than per car; older charges with no
payer are excluded from the split and counted separately; the picker defaults
to the signed-in user; the charge log shows a pie chart per vehicle.

### The `focus` layout

`classic` and `wide` exist. `focus` does not: deep indigo-slate, mint `#10B981`,
hairline borders, no gradients or glass, a desktop rail and a mobile bottom bar,
inline monochrome SVG icons in place of emoji. `tools/emit-pages.mjs` and
`tools/test-layouts.mjs` both have to learn a third layout.

### Known bugs

- **Empty-bin ownership.** Binning the wrong vehicle, or a vehicle with sessions
  attached, does not resolve ownership or cascades correctly. Separate from
  detached shared-car rows, which are skipped deliberately.

- **Dark-mode contrast, beyond the one that was fixed.** `--surface-2` and
  `--surface-3` in the `body.dark` block are still the light theme's values,
  `#1e40af` and `#3b82f6` — brighter in dark mode than the surface behind them.
  They are used in about two dozen places. They were left alone on purpose: the
  change could not be previewed, and repainting a 24-site palette blind is how
  other things break. The one place that measurably failed WCAG AA — the selected
  station row — was fixed on its own. **This needs eyes on a real device.**

### Open questions

- **Two logged sessions report 357 kWh/100km.** No road car does that; a real EV
  is 15–25. The attribution logic is verified by `tools/test-consumption.mjs`,
  so the data is the suspect, not the code. Do not adjust the calculation to fit.

- **What was in the leaked bin?** The account-switch fix covers deleted
  _favourites_, because those are the only bin that was not reset on switch.
  Vehicle and session bins are reset correctly. If charge sessions were also
  visible to the next account, that is a second and unfound bug.

### Housekeeping

- Manual verification of the Overpass fallback chain from a **browser**. The Node
  harness exercises the failure and success paths but cannot reproduce a real
  User-Agent request.
- No browser visual review is available in the development environment, so
  layout and contrast work is finished only when a human has looked at it.
