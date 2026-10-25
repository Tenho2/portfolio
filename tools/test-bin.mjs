/**
 * Tests for the bin (recoverable deletes).
 *
 * The invariant that matters: a row the user deleted must never reappear in the
 * live arrays, and no row may be lost in the process. Everything downstream
 * (totals, distance, the chart, exports, the log, the import target) reads the
 * live arrays directly, so the split is the single thing standing between a
 * deleted charging session and still being counted next month.
 *
 *   node tools/test-bin.mjs
 */
import { readFileSync } from "node:fs";
import { appSource, fnSource } from "./app-source.mjs";

/* mayWriteVehicle is injected rather than extracted, because it closes over the
   live arrays and the permission helpers. Only its own body is under test. */
const buildWrite = new Function(
  [
    `var binned = { vehicles: [], sessions: [], favs: [] };`,
    `var vehicles = [];`,
    `var ME = "owner-1";`,
    `function ownerId() { return ME; }`,
    /* Reached only when the row is not ours, which is the last case below. */
    `function canEditVehicle() { return false; }`,
    `function vehById(id) {
       for (var i = 0; i < vehicles.length; i++)
         if (vehicles[i].id === id) return vehicles[i];
       return null;
     }`,
    fnSource("vehicleAnywhere"),
    fnSource("mayWriteVehicle"),
    fnSource("ownsVehicle"),
    fnSource("canPurgeVehicle"),
    `return {
       mayWriteVehicle,
       ownsVehicle,
       canPurgeVehicle,
       set: function (live, gone, me) {
         vehicles = live; binned.vehicles = gone; if (me !== undefined) ME = me;
       },
     };`,
  ].join("\n\n"),
);
const w = buildWrite();

const buildSession = new Function(
  [
    `var binned = { vehicles: [], sessions: [], favs: [] };`,
    `var vehicles = [];`,
    `var sessions = [];`,
    `var shares = {};`,
    `var ME = "";`,
    `var ROLE_RANK = { owner: 4, admin: 3, driver: 2, viewer: 1 };`,
    `function ownerId() { return ME; }`,
    `function vehById(id) {
       for (var i = 0; i < vehicles.length; i++)
         if (vehicles[i].id === id) return vehicles[i];
       return null;
     }`,
    fnSource("vehicleAnywhere"),
    fnSource("ownsVehicle"),
    fnSource("myShare"),
    fnSource("rankOf"),
    fnSource("myRole"),
    fnSource("myRank"),
    fnSource("canEditSession"),
    `return {
       canEditSession,
       set: function (gone, session, me) {
         binned.vehicles = gone;
         sessions = session ? [session] : [];
         ME = me;
       },
     };`,
  ].join("\n\n"),
);
const s = buildSession();

const build = new Function(
  [
    `var binned = { vehicles: [], sessions: [], favs: [] };`,
    fnSource("binCount"),
    fnSource("splitBinned"),
    `return { binCount, splitBinned, binned };`,
  ].join("\n\n"),
);
const { binCount, splitBinned, binned } = build();

let pass = 0;
const failures = [];
function is(label, actual, expected) {
  if (actual === expected) pass++;
  else failures.push(`${label}\n      expected ${expected}, got ${actual}`);
}
function ok(label, condition) {
  is(label, !!condition, true);
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

const live = (id) => ({ id, deletedAt: null });
const dead = (id) => ({ id, deletedAt: "2026-10-02T10:00:00.000Z" });

group("a live list is returned untouched", () => {
  const rows = [live("a"), live("b")];
  is("length", splitBinned(rows, []).length, 2);
  is("nothing binned", binned.vehicles.length, 0);
});

group("a binned row is diverted and not returned as live", () => {
  const into = [];
  const out = splitBinned([live("a"), dead("b"), live("c")], into);
  is("live count", out.length, 2);
  is("binned count", into.length, 1);
  is("the right row was binned", into[0].id, "b");
  is("binned rows are not in the live list", out.some((r) => r.id === "b"), false);
});

group("no row is ever lost", () => {
  const into = [];
  const rows = [live("a"), dead("b"), live("c"), dead("d"), dead("e")];
  const out = splitBinned(rows, into);
  is("live plus binned equals input", out.length + into.length, rows.length);
  const ids = new Set([...out, ...into].map((r) => r.id));
  is("every id survives", ids.size, rows.length);
});

group("falsy and malformed rows are dropped, not crashed on", () => {
  const into = [];
  const out = splitBinned([null, undefined, live("a"), 0, ""], into);
  is("only the real row survives", out.length, 1);
  is("nothing binned", into.length, 0);
});

group("a non-array input yields an empty live list", () => {
  is("undefined", splitBinned(undefined, []).length, 0);
  is("null", splitBinned(null, []).length, 0);
  is("object", splitBinned({ nope: true }, []).length, 0);
});

group("an empty-string timestamp counts as live, not binned", () => {
  const into = [];
  const out = splitBinned([{ id: "a", deletedAt: "" }], into);
  is("treated as live", out.length, 1);
  is("not binned", into.length, 0);
});

group("the into bucket accumulates rather than replaces", () => {
  const into = [];
  splitBinned([dead("a")], into);
  splitBinned([dead("b")], into);
  is("both accumulated", into.length, 2);
});

group("binCount totals every kind", () => {
  binned.vehicles = [live("v")];
  binned.sessions = [live("s"), live("s2")];
  binned.favs = [];
  is("one vehicle and two sessions", binCount(), 3);
  binned.favs = [live("f")];
  is("plus a favourite", binCount(), 4);
  binned.vehicles = [];
  binned.sessions = [];
  binned.favs = [];
  is("empty bin", binCount(), 0);
});

group("a binned vehicle is still writable, or binning never reaches the server", () => {
  /* The bug this guards: mayWriteVehicle looked the row up in the live array
     only. doRemoveVehicle moves the row into the bin *before* pushing it, so the
     lookup returned null for exactly the row that needed writing, syncVehicle
     read that as "belongs to another account", skipped the push and cleared the
     dirty flag. The server kept the car live and the next pull brought it back
     into the list, so binning looked like it worked until the next sync. */
  const owner = "owner-1";
  const other = "owner-2";

  w.set([{ id: "v1", userId: owner }], [], owner);
  is("a live vehicle is writable", w.mayWriteVehicle("v1"), true);

  /* Now the state doRemoveVehicle leaves behind: gone from live, in the bin. */
  w.set([], [{ id: "v1", userId: owner, deletedAt: "2026-10-05" }], owner);
  is("a just-binned vehicle is still writable", w.mayWriteVehicle("v1"), true);

  /* A row that is genuinely nobody's is still refused. */
  w.set([], [{ id: "v2", userId: other, deletedAt: "2026-10-05" }], owner);
  is("another account's binned row is refused", w.mayWriteVehicle("v2"), false);

  /* A locally-made vehicle has no owner yet and was created here. */
  w.set([], [{ id: "v3", deletedAt: "2026-10-05" }], owner);
  is("an ownerless binned row is treated as ours", w.mayWriteVehicle("v3"), true);

  /* Unknown id: no row at all, so nothing to write. */
  is("a row that does not exist is refused", w.mayWriteVehicle("nope"), false);
});

group("a binned vehicle keeps its owner and can be purged", () => {
  const owner = "owner-1";
  const other = "owner-2";

  /* doRemoveVehicle moves the row out of the live array before any later
     permission check. Ownership must still resolve from the bin. */
  w.set(
    [],
    [{ id: "v1", userId: owner, deletedAt: "2026-10-05" }],
    owner,
  );
  is("the owner still owns the binned vehicle", w.ownsVehicle("v1"), true);
  is("and may permanently delete it", w.canPurgeVehicle("v1"), true);

  w.set(
    [],
    [{ id: "v2", userId: other, deletedAt: "2026-10-05" }],
    owner,
  );
  is("another account's binned vehicle is not owned", w.ownsVehicle("v2"), false);
  is("and cannot be purged", w.canPurgeVehicle("v2"), false);

  /* A local-only vehicle has no server row to protect. */
  w.set([], [{ id: "v3", deletedAt: "2026-10-05" }], owner);
  is("a local-only binned vehicle may be purged", w.canPurgeVehicle("v3"), true);

  /* A server row with no owner is not local data, and the owner-only delete
     policy would refuse it. Do not offer a purge that cannot succeed. */
  w.set([], [{ id: "v4", confirmed: true, deletedAt: "2026-10-05" }], owner);
  is("a confirmed ownerless vehicle is not purgeable", w.canPurgeVehicle("v4"), false);
});

group("a binned ownerless session is still editable", () => {
  /* Signed-out/local data has no owner id to resolve. It must remain
     purgeable/restorable without pretending there is a server owner. */
  s.set(
    [{ id: "v1", deletedAt: "2026-10-05" }],
    { id: "s1", vehicleId: "v1" },
    "",
  );
  w.set([], [{ id: "v1", deletedAt: "2026-10-05" }], "");
  is("the local vehicle is not owned", w.ownsVehicle("v1"), false);
  is("but its local session is editable", s.canEditSession({ id: "s1", vehicleId: "v1" }), true);

  /* A confirmed ownerless row came back from the server, so the local-only
     branch must not open its sessions for a delete the server would refuse. */
  s.set(
    [{ id: "v2", confirmed: true, deletedAt: "2026-10-05" }],
    { id: "s2", vehicleId: "v2" },
    "owner-1",
  );
  is("a confirmed ownerless session is not editable", s.canEditSession({ id: "s2", vehicleId: "v2" }), false);

  /* The same binned row under a real owner still resolves as owned. */
  s.set(
    [{ id: "v1", userId: "owner-1", deletedAt: "2026-10-05" }],
    { id: "s1", vehicleId: "v1" },
    "owner-1",
  );
  is("an owned binned session is editable", s.canEditSession({ id: "s1", vehicleId: "v1" }), true);
});

group("permanent vehicle deletion is owner-only, like the database", () => {
  const empty = fnSource("emptyBin");
  const purge = fnSource("binPurge");
  ok("emptyBin asks canPurgeVehicle", /canPurgeVehicle\(/.test(empty));
  ok("emptyBin no longer uses mayWriteVehicle for vehicles", !/mayWriteVehicle\(/.test(empty));
  ok("binPurge asks canPurgeVehicle", /canPurgeVehicle\(id\)/.test(purge));
  ok("binPurge no longer uses mayWriteVehicle for vehicles", !/mayWriteVehicle\(id\)/.test(purge));
});

group("pending deletes survive a reload and suppress resurrection", () => {
  const app = appSource();
  ok("the pending-delete queue is persisted", /function savePendingDeletes/.test(app) && /localStorage\.setItem\(K\.pd/.test(app));
  ok("it is loaded on boot", /function loadPendingDeletes/.test(app) && /loadPendingDeletes\(\)/.test(app));
  ok("mark/clear persist it", /function markDeleted[\s\S]{0,250}?savePendingDeletes/.test(app) && /function clearDeleted[\s\S]{0,250}?savePendingDeletes/.test(app));
  ok("the pull filters pending vehicle deletes", /syncDeleted\.vehicles\[pv\.id\]/.test(app));
  ok("the pull filters pending session deletes", /syncDeleted\.sessions\[srows\[j\]\.id\]/.test(app));
  ok("children are deleted before a vehicle", /Promise\.all\(sessionWork\)[\s\S]{0,500}?syncDelete\("vehicles"/.test(fnSource("emptyBin")));
});

group("the bin migration archives orphans and cascades vehicle deletes", () => {
  const sql = readFileSync("supabase/18-bin-integrity.sql", "utf8");
  ok("it runs as one transaction", /begin;[\s\S]*lock table[\s\S]*commit;/.test(sql));
  ok("it creates the orphan archive", /create table if not exists public\.orphaned_sessions/.test(sql));
  ok("it archives payer splits too", /create table if not exists public\.orphaned_session_payers/.test(sql));
  ok("it deletes orphan sessions", /delete from public\.sessions[\s\S]{0,200}?not exists/.test(sql));
  ok("it audits the foreign key", /confdeltype/.test(sql));
  ok("it adds ON DELETE CASCADE", /on delete cascade/i.test(sql));
  ok("it verifies no orphans remain", /orphan_sessions_remaining/.test(sql));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}