/**
 * Tests for the unsynced-rows classification.
 *
 * The whole point of the sync panel is that "waiting for the network" and "the
 * server refused this" are told apart. Conflating them is how a row that can
 * never sync ends up looking like bad reception and gets ignored for weeks.
 *
 *   node tools/test-sync-status.mjs
 */
import { readFileSync } from "node:fs";

const html = readFileSync("ev-tracker.html", "utf8");

function fnSource(name) {
  const start = html.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in ev-tracker.html`);
  let i = html.indexOf("{", start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

/* vehById is not self-contained, so it is injected rather than extracted. */
const build = new Function(
  "vehById",
  [
    `var syncDirty = { vehicles: {}, sessions: {} };`,
    `var syncStalled = { vehicles: {}, sessions: {} };`,
    `var vehicles = [], sessions = [], binned = { vehicles: [], sessions: [], favs: [] };`,
    `var online = true;`,
    `function syncOnline() { return online; }`,
    fnSource("vehicleAnywhere"),
    fnSource("sessionAnywhere"),
    fnSource("stalledCount"),
    fnSource("unsyncedRows"),
    `return {
       unsyncedRows, stalledCount,
       get vehicles() { return vehicles; },
       setOnline: function (v) { online = v; },
       seed: function (state) {
         syncDirty = state.syncDirty;
         syncStalled = state.syncStalled;
         vehicles = state.vehicles || [];
         sessions = state.sessions || [];
         binned = state.binned || { vehicles: [], sessions: [], favs: [] };
       },
     };`,
  ].join("\n\n"),
);

const t = build((id) => t.vehicles.find((v) => v.id === id) || null);

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

const row = (id) => ({ id, name: "Car " + id, deletedAt: null });
const ses = (id) => ({ id, location: "Loc " + id, date: "2026-10-02", deletedAt: null });

group("nothing unsynced means nothing listed", () => {
  t.seed({ syncDirty: { vehicles: {}, sessions: {} }, syncStalled: { vehicles: {}, sessions: {} } });
  is("no rows", t.unsyncedRows().length, 0);
  is("stalledCount is 0", t.stalledCount(), 0);
});

group("a queued row is reported as waiting, not refused", () => {
  t.seed({
    syncDirty: { vehicles: { v1: 1 }, sessions: {} },
    syncStalled: { vehicles: {}, sessions: {} },
    vehicles: [row("v1")],
  });
  t.setOnline(true);
  const rows = t.unsyncedRows();
  is("one row", rows.length, 1);
  is("reason", rows[0].why, "queued");
  is("not hard", rows[0].hard, false);
  is("named", rows[0].label, "Car v1");
  /* hard=false is what suppresses the Discard button; there is no point in the
     panel offering a way to drop a row that will sync on its own. */
});

group("offline is called out separately from queued", () => {
  t.seed({
    syncDirty: { vehicles: {}, sessions: { s1: 1 } },
    syncStalled: { vehicles: {}, sessions: {} },
    sessions: [ses("s1")],
  });
  t.setOnline(false);
  const rows = t.unsyncedRows();
  is("reason is offline", rows[0].why, "offline");
  is("still not hard", rows[0].hard, false);
});

group("a refused row is hard and offered a way out", () => {
  t.seed({
    syncDirty: { vehicles: {}, sessions: {} },
    syncStalled: {
      vehicles: {
        v9: {
          reason: "rejected",
          code: "42501",
          message: "new row violates row-level security policy",
          details: 'for table "vehicles"',
          when: "2026-10-02T10:00:00.000Z",
        },
      },
      sessions: {},
    },
    vehicles: [row("v9")],
  });
  t.setOnline(true);
  const rows = t.unsyncedRows();
  is("one row", rows.length, 1);
  is("reason", rows[0].why, "rejected");
  is("hard", rows[0].hard, true);
  is("stalledCount counts it", t.stalledCount(), 1);
  /* The whole point of recording the error: "refused" on its own cannot be
     diagnosed, and a policy rejection is the single most likely cause. */
  is("code surfaced", rows[0].code, "42501");
  is(
    "message and table surfaced",
    rows[0].detail.indexOf("row-level security") >= 0 &&
      rows[0].detail.indexOf("vehicles") >= 0,
    true,
  );
});

group("a refusal with no error detail does not break the row", () => {
  t.seed({
    syncDirty: { vehicles: {}, sessions: {} },
    syncStalled: { vehicles: { v8: { reason: "rejected" } }, sessions: {} },
    vehicles: [row("v8")],
  });
  const rows = t.unsyncedRows();
  is("still listed", rows.length, 1);
  is("reason survives", rows[0].why, "rejected");
  is("detail is empty rather than undefined", rows[0].detail, "");
});

group("a row in both queues is only listed once, as refused", () => {
  /* failPush clears the dirty flag, but a defensive check here: if both were
     ever set, the refused reading must win so the user is not told to wait. */
  t.seed({
    syncDirty: { vehicles: { v1: 1 }, sessions: {} },
    syncStalled: { vehicles: { v1: "rejected" }, sessions: {} },
    vehicles: [row("v1")],
  });
  t.setOnline(true);
  const rows = t.unsyncedRows();
  is("listed once", rows.length, 1);
  is("reported as refused", rows[0].why, "rejected");
});

group("a binned row is still findable, so a pending delete is not lost", () => {
  t.seed({
    syncDirty: { sessions: {}, vehicles: {} },
    syncStalled: { vehicles: {}, sessions: { s2: "rejected" } },
    sessions: [],
    binned: { vehicles: [], sessions: [ses("s2")], favs: [] },
  });
  const rows = t.unsyncedRows();
  is("one row", rows.length, 1);
  is("named from the bin", rows[0].label.indexOf("Loc s2") >= 0, true);
});

group("a row that vanished from the device is labelled, not dropped", () => {
  t.seed({
    syncDirty: { vehicles: { ghost: 1 }, sessions: {} },
    syncStalled: { vehicles: {}, sessions: {} },
    vehicles: [],
  });
  const rows = t.unsyncedRows();
  is("still listed", rows.length, 1);
  is("says so", rows[0].label, "(no longer on this device)");
});

group("stalledCount spans both tables", () => {
  t.seed({
    syncDirty: { vehicles: {}, sessions: {} },
    syncStalled: { vehicles: { a: "rejected" }, sessions: { b: "rejected", c: "rejected" } },
  });
  is("three", t.stalledCount(), 3);
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}