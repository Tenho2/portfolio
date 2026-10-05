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
npm install     # prettier + html-validate, devDependencies only
npm run check   # tests, formatting, HTML validity, inline JS syntax
npm test        # 132 assertions on roles, storage, bin, sync and location
npm run fmt     # format *.json and *.md
npm run fmt:html  # reformat the HTML: rewrites ~480 lines, so opt-in
```

There is no bundler and no build output. `ev-tracker.html` is served as-is.

`tools/check-inline-js.mjs` exists because all the JavaScript is inline, so
`node --check` and eslint have nothing to look at. It compiles each `<script>`
block; it never executes anything.

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
| 2     | `supabase/02-sharing-fix.sql` | Sessions trigger, lock vehicle edits to the owner            |
| 3     | `supabase/03-share-codes.sql` | 6-character share codes                                      |
| 4     | `supabase/04-roles.sql`       | Roles (viewer/driver/admin), owner approval, tightened RLS   |
| 5     | `supabase/05-trash.sql`       | `deleted_at` for the recoverable bin                         |
| 6     | `supabase/06-owner-stamp.sql` | `BEFORE INSERT` trigger stamping `user_id` from `auth.uid()` |

Every one is idempotent, so re-running is safe. Each ends with a query that
confirms it worked.

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

### Deploying

`sw.js` carries a `VERSION` string that must be bumped whenever
`ev-tracker.html` changes. The cache name is derived from it, so a new value
makes the worker fetch a fresh shell. Skipping this is what leaves phones on an
old build: the worker only re-runs when its own file changes.

Check which build a device is on under **Settings → Data**. The stamp reads
`Build 2.10.2026 · SW v12`; the SW half is the one that goes stale.

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
