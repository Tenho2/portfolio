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
import { fnSource } from "./app-source.mjs";

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
    `return {
       mayWriteVehicle,
       set: function (live, gone, me) {
         vehicles = live; binned.vehicles = gone; if (me !== undefined) ME = me;
       },
     };`,
  ].join("\n\n"),
);
const w = buildWrite();

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

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}