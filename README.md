# portfolio

Personal projects. Two pages, no build step: `index.html` is the home page and
`ev-tracker.html` is an EV charging tracker that runs straight from the file.

## Layout

| Path                      | What it is                                                                      |
| ------------------------- | ------------------------------------------------------------------------------- |
| `index.html`              | Home page. Served at the domain root, so it has to stay here.                   |
| `ev-tracker.html`         | The whole tracker: markup, styles and JavaScript in one file, by choice.        |
| `sw.js`                   | Service worker. Caches the app shell; Supabase and map tiles stay network-only. |
| `manifest.json`, `icons/` | PWA install metadata.                                                           |
| `i18n/`                   | Northern Sámi translation template. The app's other languages are inline.       |
| `supabase/`               | Database migrations. Not run automatically — see below.                         |
| `tools/`                  | Test harnesses and the inline-JS syntax check.                                  |

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

The page is now being split into classic scripts under `app/`:

| File              | Lines  | Contents                            |
| ----------------- | ------ | ----------------------------------- |
| `ev-tracker.html` | 10,600 | markup, CSS, application script     |
| `app/i18n.js`     | 2,100  | translations for all four languages |
| `app/storage.js`  | 160    | per-account local storage keys      |

Classic `<script src>` rather than ES modules on purpose: it keeps the page
working from `file://` with no build step, and each file gets its own scope, so
the i18n module's privates are unreachable from the application script rather
than merely untested. `tools/test-wiring.mjs` asserts the load order, since
loading a module after the app would leave its global undefined at boot, and it
now covers every `<script src>` the markup lists rather than a hard-coded pair.

`app/storage.js` owns key naming and bucket selection only. It never touches the
vehicles or sessions arrays and never renders anything, which is what keeps the
boundary real — there is no state in it to reach back into. Its tests run the
real file in a sandbox with a fake `localStorage`, rather than re-assembling
functions out of the HTML, so the module's own wiring is exercised too.

Remaining slices: sync, then the UI. Each is verified by the suite above before
the next one starts. The upgrade to `type="module"` — which would turn a
cross-module reference into a load-time error instead of a separate scope — is a
separate change and needs `file://` to stop working.

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
