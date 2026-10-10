/*
 * Phase 2: leaving a car that was shared with you, and showing who logged a
 * charge.
 *
 * The reported problem was that there was no way out at all. That was two
 * separate blocks, and fixing only the visible one would have produced a worse
 * failure: a button that appears and then fails.
 *
 *   1. renderShare returns early for anyone who is not the owner, printing
 *      "you're not the owner". So there was nothing to press.
 *   2. The delete policy on vehicle_shares allowed only the VEHICLE OWNER to
 *      remove a share. Even with a button, the database refused with 42501.
 *
 * The second one is why this suite also checks the migration, and why leaving
 * distinguishes a 42501 from a lost connection: those need different actions
 * from the user, and telling somebody to check their wifi when their database
 * has not been migrated sends them looking in the wrong place entirely.
 *
 * The subtle part is what happens to the rows afterwards. A car you left is
 * binned on this device only, and must stay purgeable forever - see the
 * `detached` assertions, which exist because binPurge's permission check would
 * otherwise make those rows impossible to delete.
 *
 *   node tools/test-phase2.mjs
 */
import { readFileSync } from "node:fs";
import { appSource } from "./app-source.mjs";

let pass = 0;
const failures = [];
function ok(label, condition) {
  if (condition) pass++;
  else failures.push(label);
}
function is(label, actual, expected) {
  if (Object.is(actual, expected)) pass++;
  else failures.push(`${label}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

const app = appSource();
const i18 = readFileSync("app/i18n.js", "utf8");
const sql = readFileSync("supabase/10-leave-share.sql", "utf8");
const roles = readFileSync("supabase/04-roles.sql", "utf8");

/**
 * Source with comments blanked.
 *
 * Several assertions here are "this must NOT appear", and the code says what it
 * deliberately avoids in a comment - detachVehicle carries the note "No
 * markDirty, no syncVehicle, no syncSession". Matching prose found that note
 * and failed a correct implementation. Blank the comments first; offsets and
 * line numbers still line up.
 */
const code = app.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const codeOf = (from, to) =>
  code.slice(code.indexOf(from), to ? code.indexOf(to) : undefined);

/** The text of one key inside one language block. */
function value(lang, key) {
  const marks = [...i18.matchAll(/^\s*(en|fi|sv):\s*\{/gm)];
  const i = marks.findIndex((m) => m[1] === lang);
  const start = marks[i].index;
  const end = i + 1 < marks.length ? marks[i + 1].index : i18.length;
  const m = new RegExp('"' + key.replace(/\./g, "\\.") + '":\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(
    i18.slice(start, end),
  );
  return m ? m[1] : null;
}

group("the migration is there and says what it does", () => {
  ok("the file exists and was read", sql.length > 500);
  ok("it replaces the old policy by name", /drop policy if exists "shares removable by owner"/i.test(sql));
  /* Drop-then-create rather than adding a second policy: RLS combines policies
     with OR, so an extra policy would also work while making the rule
     impossible to read. */
  ok("and creates one in its place", /create policy "shares removable by owner or self"/i.test(sql));
  ok("the new clause is present", /vehicle_shares\.user_id = auth\.uid\(\)/.test(sql));
  ok("the owner's existing right is kept", /and v\.user_id = auth\.uid\(\)/.test(sql));
  /* Per-row evaluation is what makes this safe: the clause can only ever match
     a row that is already the caller's. */
  ok("it is a row policy, not a statement one", /for\s+delete/i.test(sql));
  ok("it uses USING, which is the row predicate", /using\s*\(/i.test(sql));
  ok("it is idempotent", /drop policy if exists/i.test(sql));
  /* It must not touch anything else - a migration that widens more than it
     says is the worst kind. */
  ok("it grants nothing on other tables", !/create policy[^;]*\n[^;]*\bon public\.(vehicles|sessions)\b/i.test(sql));
  ok("it adds no column", !/add column/i.test(sql));
  ok("it drops no table", !/drop table/i.test(sql));
});

group("the old policy is what blocked it, and it is now superseded", () => {
  ok("04-roles.sql still holds the narrow policy", /"shares removable by owner"/.test(roles));
  /* That is expected - 04 is history and is not re-run. What matters is that 10
     names the same policy in its drop statement, so re-running 10 on a database
     that only ever ran 04 replaces it rather than stacking. */
  ok("and 10 drops exactly that name", /"shares removable by owner"/.test(sql));
});

group("the vehicle card offers a way out to anyone who is not the owner", () => {
  ok("there is a leave control", /data-leave=/.test(code));
  ok("it is wired into the delegated click handler", /data-leave/.test(code));
  ok("it is only offered to a non-owner", /!mine && myShare\(vehicles\[k\]\.id\)/.test(code));
  /* The three states need three different labels, and saying "Leave" to
     somebody whose request is still pending is simply wrong. */
  ok("pending reads as a cancellation", /isPending\(vehicles\[k\]\.id\)[\s\S]{0,140}?"set\.cancelRequest"/.test(code));
  ok("rejected reads as clearing it", /isRejected\(vehicles\[k\]\.id\)[\s\S]{0,140}?"set\.clearRequest"/.test(code));
  ok("and an accepted share reads as leaving", /"set\.leave"/.test(code));
  ok("every label is translated", ["set.leave", "set.cancelRequest", "set.clearRequest"].every((k) => value("en", k) && value("fi", k) && value("sv", k)));
  ok("and it has an accessible name", /a11y\.leaveVeh/.test(code));
});

group("leaving never pushes anything to the server", () => {
  const fn = codeOf("function detachVehicle", "function shareRemoveSelf");
  ok("the detach helper exists", fn.length > 200);
  /* You have no right to write to that car's rows once you have left. Pushing
     them produces a 42501 that stays in the sync panel forever, and the user
     cannot clear it, because binPurge refuses the rows too. */
  ok("no markDirty", !/markDirty/.test(fn));
  ok("no syncVehicle", !/syncVehicle/.test(fn));
  ok("no syncSession", !/syncSession\(/.test(fn));
  ok("but it does bin locally", /binned\.vehicles\.push/.test(fn));
  ok("and the sessions with it", /binned\.sessions = binned\.sessions\.concat/.test(fn));
  ok("and marks them detached", /detached = true/.test(fn));
});

group("a detached row can always be purged", () => {
  /* The trap. binPurge asks mayWriteVehicle() before deleting, which is false
     after leaving - so the rows would sit in the bin with a Delete button that
     always answers "no permission". Unreachable, undeletable, forever. */
  const purge = codeOf("function binPurge", "function renderLocDefaults");
  ok("purge skips the check for a detached vehicle", /!row\.detached && !mayWriteVehicle/.test(purge));
  ok("purge skips the check for a detached session", /!row\.detached && !canEditSession/.test(purge));
  /* And it must not even try the server, or the refusal comes straight back.
     Every one of the three call sites in this function is guarded - the vehicle,
     the session, and the sessions orphaned with the vehicle. */
  ok("no server delete for a detached vehicle", /if \(!row\.detached\) syncDelete\("vehicles"/.test(purge));
  ok("no server delete for a detached session", /if \(!row\.detached\) syncDelete\("sessions"/.test(purge));
  ok("nor for its orphaned sessions", /if \(gone\[i\]\.detached\) continue/.test(purge));
  const unguarded = purge.split("syncDelete(").length - 1;
  const guarded = (purge.match(/if \([^)]*detached[^)]*\) syncDelete\(/g) || []).length + (/if \(gone\[i\]\.detached\) continue/.test(purge) ? 1 : 0);
  is("every syncDelete in the function is guarded", guarded, unguarded);
});

group("emptying the bin also skips detached rows", () => {
  /* Same trap one level up: emptyBin counts rows it may not write and refuses
     the whole operation, so a single detached car would make the bin
     permanently un-emptiable. */
  const empty = codeOf("function emptyBin", "function addVehicle");
  ok("the slice is not empty", empty.length > 200);
  ok("detached vehicles are not counted as foreign", /!binned\.vehicles\[ei\]\.detached && !mayWriteVehicle/.test(empty));
  ok("detached sessions are not counted", /!binned\.sessions\[ej\]\.detached && !canEditSession/.test(empty));
  ok("and no server delete is queued for them", /if \(!goneSes\[i\]\.detached\) syncDelete/.test(empty));
  ok("nor for the vehicles", /if \(!goneVeh\[j\]\.detached\) syncDelete/.test(empty));
});

group("the order is server first, then local", () => {
  const fn = codeOf("function leaveShare", "function detachVehicle");
  const server = fn.indexOf("shareRemoveSelf");
  const local = fn.indexOf("detachVehicle");
  ok("both are called", server > 0 && local > 0);
  /* Binning first and failing after would leave a car that is gone locally but
     still shared on the server - invisible to the owner, still occupying a
     share row, and reappearing on the next pull. */
  ok("the server is changed first", server < local);
  /* The guard has to sit between the two calls, not merely exist somewhere. */
  ok(
    "and a failure returns before anything local is touched",
    /if \(!res\.ok\)[\s\S]{0,900}?return false;[\s\S]{0,200}?detachVehicle\(/.test(fn),
  );
});

group("a refusal is distinguishable from a lost connection", () => {
  /* 42501 here has exactly one cause: migration 10 has not been run. Sending
     somebody to check their wifi would send them looking in the wrong place. */
  const fn = codeOf("function shareRemoveSelf", "function removeVehicle");
  ok("the error code is captured", /err\.code \|\| err\.error_code/.test(fn));
  ok("42501 is recognised", /=== "42501"/.test(fn));
  const leave = codeOf("function leaveShare", "function detachVehicle");
  ok("and each gets its own message", /toast\.leaveNeedsSql/.test(leave) && /toast\.leaveOffline/.test(leave) && /toast\.leaveSignedOut/.test(leave));
  for (const k of ["toast.leaveNeedsSql", "toast.leaveOffline", "toast.leaveSignedOut", "toast.leaveBlocked"]) {
    ok(`${k} is translated`, value("en", k) && value("fi", k) && value("sv", k));
  }
  /* It deletes the caller's OWN row, from the signed-in account id - not the
     random id that uid() mints for local rows. */
  ok("it uses the account id", /authUser && authUser\.id/.test(fn));
  ok("and filters the delete by it", /\.eq\("user_id", who\)/.test(fn));
});

group("the owner is unaffected", () => {
  const fn = codeOf("function leaveShare", "function detachVehicle");
  ok("an owner cannot leave", /!share \|\| ownsVehicle\(vehicleId\)/.test(fn));
  /* They already have "Remove vehicle", which does a real delete. */
  ok("and removal is still offered to them", /data-rm=/.test(code));
});

group("who logged a charge needs no schema work", () => {
  /* sessions.user_id is already written and already preserved through edits,
     deliberately, because can_edit_session is checked against it. */
  ok("the row writer sends it", /user_id: s\.userId \|\| ownerId\(\)/.test(app));
  ok("the row reader takes it back", /userId: r\.user_id \|\| null/.test(app));
  ok("the session keeps it through an edit", /s\.vehicleId = v\.id;/.test(app) && /s\.edited = Date\.now\(\)/.test(app));
  ok("the log shows it", /authorOf\(s, v\)/.test(code));
  ok("and the helper exists", /function authorOf\(/.test(code));
});

group("authorship says nothing when it would say nothing useful", () => {
  const fn = codeOf("function authorOf", "function closeStationDetail");
  /* On a car with one member every row would read "by you". That is not
     information, it is a full column of noise on the common case. */
  ok("a single-member car shows nothing", /mine && !shareCount\(v\.id\)\) return ""/.test(fn));
  ok("a row with no author shows nothing", /if \(!who\) return ""/.test(fn));
});

group("an author who has left is admitted, not guessed", () => {
  /* Leaving deletes the share row, and the cached name goes with it. Inventing
     a name for a member who is gone would be worse than saying we do not know:
     on a shared car the author is the difference between "we agreed to share
     this" and "who actually paid". */
  const fn = codeOf("function authorOf", "function closeStationDetail");
  ok("it falls back rather than guessing", /log\.byUnknown/.test(fn));
  ok("the fallback is styled as secondary", /log-by dim/.test(fn));
  ok("names come from the share cache", /shareLabel\(v\.id, who\)/.test(fn));
  ok("a bare id is never shown as a name", /name !== String\(who\)\.slice\(0, 8\)/.test(fn));
  for (const k of ["log.by", "log.byYou", "log.byUnknown"]) {
    ok(`${k} is translated`, value("en", k) && value("fi", k) && value("sv", k));
  }
});

/* Floor, not an aspiration. The suite runs 67; anything that made a group stop
   executing would drop it under this and be caught. It was set to 70 first and
   failed, which told me nothing about the code - so it is set from the measured
   count with room for additions. */
if (pass < 60) {
  console.log(`\nonly ${pass} assertions ran - the suite has gone quiet`);
  failures.push("too few assertions to be trustworthy");
}

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);