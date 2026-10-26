/**
 * Sync resilience: durable writes, binned-row reconciliation, pull freshness
 * and honest status reporting.
 *
 * Why this exists
 *   A session deleted on one device could remain live on another, with both
 *   devices reporting "sync ok". The causes were independent:
 *
 *   1. ordinary dirty rows were only in memory, so an offline bin move was
 *      forgotten on reload;
 *   2. a local binned row whose server copy was still live was kept locally but
 *      never re-sent, so the delete reached no other device;
 *   3. an idle tab had no reason to pull again after the first load;
 *   4. diagnostics and the badge did not distinguish "no error" from "up to
 *      date", and permanent deletes did not stamp a successful write.
 *
 *   These assertions pin the repairs without pretending to exercise Supabase.
 *
 *   node tools/test-sync-resilience.mjs
 */
import { readFileSync } from "node:fs";
import { appSource, fnSource } from "./app-source.mjs";

const app = appSource();
const storage = readFileSync("app/storage.js", "utf8");
const i18n = readFileSync("app/i18n.js", "utf8");

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

function fakeStorage() {
  const data = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    data,
  };
}

group("ordinary pending writes are persisted per account", () => {
  const store = fakeStorage();
  const K = { pw: "ev.v1.user.pendingWrites" };
  const build = new Function(
    "__K",
    "__ls",
    "__dirty",
    `
      var K = __K;
      var localStorage = __ls;
      var syncDirty = __dirty;
      ${fnSource("loadPendingWrites")}
      ${fnSource("savePendingWrites")}
      return {
        load: loadPendingWrites,
        save: savePendingWrites,
        get: function () { return syncDirty; },
        set: function (v) { syncDirty = v; },
      };
    `,
  );
  const api = build(K, store, { vehicles: {}, sessions: {} });
  api.set({ vehicles: { v1: 1 }, sessions: { s1: 1 } });
  api.save();
  is(
    "the queue is written to the account key",
    store.data[K.pw],
    JSON.stringify({ vehicles: { v1: 1 }, sessions: { s1: 1 } }),
  );

  api.set({ vehicles: {}, sessions: {} });
  api.load();
  is("vehicle ids come back", api.get().vehicles.v1, 1);
  is("session ids come back", api.get().sessions.s1, 1);

  store.setItem(K.pw, "not json");
  api.set({ vehicles: { stale: 1 }, sessions: {} });
  api.load();
  is("a corrupt queue becomes empty", Object.keys(api.get().vehicles).length, 0);
  is("the corruption does not throw", Object.keys(api.get().sessions).length, 0);

  ok("storage publishes the pendingWrites key", /pw:\s*pre \+ "pendingWrites"/.test(storage));
  ok(
    "boot restores pending writes after deletes",
    /loadPendingDeletes\(\);\s*loadPendingWrites\(\)/.test(app),
  );
  ok(
    "an account reset restores the current bucket's writes",
    /loadPendingDeletes\(\);\s*loadPendingWrites\(\)/.test(
      app.slice(app.indexOf("function resetSyncQueues"), app.indexOf("function resetSyncQueues") + 2200),
    ),
  );
});

group("local binned rows can be reconciled with a live server copy", () => {
  const needsPush = new Function(
    `${fnSource("binnedRowsNeedingPush")}; return binnedRowsNeedingPush;`,
  )();
  const row = (id, extra) => ({
    id,
    deletedAt: "2026-10-26T03:00:00.000Z",
    ...(extra || {}),
  });

  is(
    "a local binned row with a live server copy is queued",
    needsPush([row("s1")], { s1: 1 }, {}, {}, {}).length,
    1,
  );
  is(
    "a server row that is already binned is not re-sent",
    needsPush([row("s1")], {}, {}, {}, {}).length,
    0,
  );
  is(
    "a pending permanent delete owns the row instead",
    needsPush([row("s1")], { s1: 1 }, { s1: 1 }, {}, {}).length,
    0,
  );
  is(
    "a row already in the retry queue is not duplicated",
    needsPush([row("s1")], { s1: 1 }, {}, { s1: 1 }, {}).length,
    0,
  );
  is(
    "a stalled row is not retried behind its back",
    needsPush([row("s1")], { s1: 1 }, {}, {}, { s1: 1 }).length,
    0,
  );
  is(
    "a detached row has no server copy to update",
    needsPush([row("s1", { detached: true })], { s1: 1 }, {}, {}, {}).length,
    0,
  );
  is(
    "a live local row is not a binned-row candidate",
    needsPush([{ id: "s1", deletedAt: null }], { s1: 1 }, {}, {}, {}).length,
    0,
  );

  ok(
    "the pull uses the binned reconciliation helper for vehicles",
    /binnedVehiclesToSync\s*=\s*binnedRowsNeedingPush\(/.test(app),
  );
  ok(
    "the pull uses the binned reconciliation helper for sessions",
    /binnedSessionsToSync\s*=\s*binnedRowsNeedingPush\(/.test(app),
  );
  ok(
    "a binned session can use its binned vehicle for the write",
    /function sessionVehicleReady\(s\)[\s\S]{0,700}?vehicleAnywhere\(s\.vehicleId\)/.test(app),
  );
  ok(
    "the pull re-sends binned sessions",
    /binnedSessionsToSync[\s\S]{0,500}?syncSession\(bsRow\)/.test(app),
  );
});

group("the pull is automatic and cannot stack", () => {
  ok(
    "one pull can be in flight per account",
    /if \(syncPullInFlight && syncPullInFlight\.gen === acctGen\)[\s\S]{0,80}?return syncPullInFlight\.promise/.test(
      app,
    ),
  );
  ok("the focus event pulls when stale", /addEventListener\("focus"[\s\S]{0,180}?pullIfStale/.test(app));
  ok(
    "the visibility event pulls when visible",
    /visibilitychange[\s\S]{0,220}?pullIfStale/.test(app),
  );
  ok("pageshow pulls", /addEventListener\("pageshow"[\s\S]{0,160}?pullIfStale/.test(app));
  ok("a periodic ticker pulls", /setInterval\([\s\S]{0,120}?pullIfStale\(PULL_PERIOD_MS\)/.test(app));
  ok("a pull has an age gate", /function pullIfStale[\s\S]{0,500}?PULL_MIN_INTERVAL_MS/.test(app));
});

group("status and diagnostics distinguish a quiet queue from fresh data", () => {
  ok(
    "the diagnostics summary includes queued deletes",
    /var out = \{ vehicles: 0, sessions: 0, deletes: 0 \}[\s\S]{0,300}?out\.deletes = pendingDeleteCount\(\)/.test(app),
  );
  ok(
    "the badge counts pending writes and deletes",
    /function refreshSyncBadge\(\)[\s\S]{0,600}?pendingCount\(\) \+ pendingDeleteCount\(\)/.test(app),
  );
  ok("the badge reports stale sync", /function refreshSyncBadge\(\)[\s\S]{0,1000}?sync\.stale/.test(app));
  ok(
    "the panel names the last successful pull",
    /function syncStatusFooter\(\)[\s\S]{0,600}?sync\.lastSync/.test(app),
  );
  ok(
    "deleting a row stamps a successful write",
    /function syncDelete[\s\S]{0,3000}?stampSuccess\("push"\)/.test(app),
  );
  ok(
    "bulk session writes stamp a successful write",
    /function syncSessions[\s\S]{0,1800}?stampSuccess\("push"\)/.test(app),
  );
  const reset = app.slice(
    app.indexOf("function resetSyncQueues"),
    app.indexOf("function resetSyncQueues") + 2400,
  );
  ok(
    "an account switch clears the previous account's freshness stamps",
    /lastPullAt = null/.test(reset) && /lastPushAt = null/.test(reset),
  );
  for (const key of ["sync.lastSync", "sync.stale"]) {
    is(
      `${key} is translated everywhere`,
      (i18n.match(new RegExp(`"${key}":`, "g")) || []).length,
      3,
    );
  }
});

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
