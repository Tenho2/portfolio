/**
 * Account isolation tests for the storage keys.
 *
 * Regression cover for the bug where localStorage used one global set of keys
 * for every account. Signing out of one account and into another carried the
 * first account's vehicles and sessions into the new one, which then appeared
 * labelled "shared vehicle" and could never be pushed, because the new account
 * was not allowed to write them.
 *
 * This now runs app/storage.js as it actually ships, in a sandbox with a fake
 * localStorage. Before the split it re-assembled the functions out of the HTML,
 * which meant the module's own wiring was never exercised: it could have been
 * broken in ways every one of these tests still passed.
 *
 *   node tools/test-storage.mjs
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync("app/storage.js", "utf8");

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

/** A localStorage that behaves like the browser's, including quota failures. */
function fakeStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  const store = {
    getItem(k) {
      return data.has(String(k)) ? data.get(String(k)) : null;
    },
    setItem(k, v) {
      data.set(String(k), String(v));
    },
    removeItem(k) {
      data.delete(String(k));
    },
    clear() {
      data.clear();
    },
    get length() {
      return data.size;
    },
    key(i) {
      return [...data.keys()][i] ?? null;
    },
    _data: data,
  };
  return store;
}

/**
 * Load app/storage.js the way the page does: as a classic script that
 * publishes onto window.
 */
function loadModule(localStorage) {
  const window = { localStorage };
  const sandbox = { window, localStorage, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "app/storage.js" });
  if (!window.EV_STORAGE) throw new Error("app/storage.js did not publish EV_STORAGE");
  return window.EV_STORAGE;
}

const A = "aaaaaaaa-1111-1111-1111-111111111111";
const B = "bbbbbbbb-2222-2222-2222-222222222222";
/* Every per-account slot, including the bin keys and the favourites bin. The
   bin slots were left out originally, which is why a binned vehicle could be
   lost and a binned favourite had no key to be stored under at all. */
const SLOTS = ["v", "s", "p", "f", "n", "bv", "bs", "bf", "df"];

group("the module publishes the interface the page uses", () => {
  const S = loadModule(fakeStorage());
  for (const name of ["keysFor", "current", "useAccount", "migrateLegacyStorage"])
    is(`EV_STORAGE.${name} exists`, typeof S[name], "function");
});

group("two accounts never share a key", () => {
  const { keysFor } = loadModule(fakeStorage());
  for (const slot of SLOTS)
    is(`account A and B differ on "${slot}"`, keysFor(A)[slot] === keysFor(B)[slot], false);
});

group("the signed-out bucket is separate from every account", () => {
  const { keysFor } = loadModule(fakeStorage());
  for (const slot of SLOTS) {
    is(`local vs A "${slot}"`, keysFor(null)[slot] === keysFor(A)[slot], false);
    is(`local vs B "${slot}"`, keysFor(null)[slot] === keysFor(B)[slot], false);
  }
});

group("keys carry the account id, so they are self-describing", () => {
  const { keysFor } = loadModule(fakeStorage());
  for (const slot of SLOTS) {
    is(`A "${slot}" mentions A`, keysFor(A)[slot].includes(A), true);
    is(`B "${slot}" mentions B`, keysFor(B)[slot].includes(B), true);
  }
});

group("every slot in one bucket is distinct", () => {
  const { keysFor } = loadModule(fakeStorage());
  for (const who of [null, A, B]) {
    const seen = new Set(SLOTS.map((s) => keysFor(who)[s]));
    is(`no collisions for ${who || "local"}`, seen.size, SLOTS.length);
  }
});

group("theme is a device preference, not account data", () => {
  const { keysFor } = loadModule(fakeStorage());
  is("A matches local", keysFor(A).t, keysFor(null).t);
  is("B matches local", keysFor(B).t, keysFor(null).t);
});

group("useAccount swaps the live bucket and reports the change", () => {
  const S = loadModule(fakeStorage());
  is("the module starts in the signed-out bucket", S.current().v, S.keysFor(null).v);
  const r1 = S.useAccount(A);
  is("first switch to A is a change", r1.changed, true);
  is("bucket is now A", S.current().v, S.keysFor(A).v);
  is("switching to A again is not a change", S.useAccount(A).changed, false);
  is("switch to B is a change", S.useAccount(B).changed, true);
  is("bucket is now B", S.current().v, S.keysFor(B).v);
  is("signing out is a change", S.useAccount(null).changed, true);
  is("bucket is now local", S.current().v, S.keysFor(null).v);
  is("signing out twice is not a change", S.useAccount(null).changed, false);
});

group("useAccount returns the key set, so no caller caches its own", () => {
  const S = loadModule(fakeStorage());
  const r = S.useAccount(B);
  is("returned keys match the live bucket", r.keys.v, S.current().v);
  is("returned keys are the full set", Object.keys(r.keys).length, Object.keys(S.keysFor(null)).length);
});

group("legacy data is moved once and never to an account", () => {
  const store = fakeStorage({
    "ev.v1.vehicles": JSON.stringify([{ id: "v1" }]),
    "ev.v1.sessions": JSON.stringify([{ id: "s1" }]),
    "ev.v1.favs": JSON.stringify([{ id: "f1" }]),
    "ev.v1.price": "0.35",
    "ev.v1.shareNames": JSON.stringify({ a: "Anna" }),
  });
  const S = loadModule(store);
  let reported = 0;
  const moved = S.migrateLegacyStorage((n) => (reported = n));

  is("five slots moved", moved, 5);
  is("the caller was told how many", reported, 5);
  is("vehicles landed in the signed-out bucket", store.getItem(S.keysFor(null).v), JSON.stringify([{ id: "v1" }]));
  is("price landed", store.getItem(S.keysFor(null).p), "0.35");
  is("share names landed", store.getItem(S.keysFor(null).n), JSON.stringify({ a: "Anna" }));

  /* The whole point of the migration: nothing may be handed to an account. */
  is("nothing was written into A", store.getItem(S.keysFor(A).v), null);
  is("nothing was written into B", store.getItem(S.keysFor(B).v), null);

  /* Running again must be a no-op, because a second run after the user signed
     in would otherwise move freshly written account data. */
  is("a second run moves nothing", S.migrateLegacyStorage(() => {}), 0);
});

group("migration never overwrites real per-account data", () => {
  const store = fakeStorage({
    "ev.v1.vehicles": JSON.stringify([{ id: "legacy" }]),
    [`ev.v1.local.vehicles`]: JSON.stringify([{ id: "mine" }]),
  });
  const S = loadModule(store);
  /* Zero, not one: the legacy vehicles slot was read and then deliberately
     refused because its destination was already occupied. Counting a refused
     move as a move would hide exactly the case this test exists for. */
  is("nothing was moved, because the destination was taken", S.migrateLegacyStorage(() => {}), 0);
  is(
    "the existing local row survived",
    store.getItem(S.keysFor(null).v),
    JSON.stringify([{ id: "mine" }]),
  );
  is("the legacy value was not deleted", store.getItem("ev.v1.vehicles"), JSON.stringify([{ id: "legacy" }]));
});

group("migration survives a hostile localStorage", () => {
  const broken = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };
  const S = loadModule(broken);
  /* The app must still boot. It must return rather than throw, and must not
     have marked itself done. */
  is("a throwing storage returns 0", S.migrateLegacyStorage(() => {}), 0);
  is("the bucket is still usable", typeof S.current().v, "string");
});

group("unparseable leftovers are left alone", () => {
  const store = fakeStorage({ "ev.v1.vehicles": "{not json" });
  const S = loadModule(store);
  is("nothing moved", S.migrateLegacyStorage(() => {}), 0);
  is("the bad value was not deleted", store.getItem("ev.v1.vehicles"), "{not json");
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}