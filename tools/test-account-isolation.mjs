/*
 * Cross-account data leakage.
 *
 * Why this suite exists
 *   On a shared device - a family phone, a borrowed tablet, a demo kiosk - two
 *   accounts run one browser. The storage keys are per-account, so the obvious
 *   bug is impossible: nothing is ever read from the wrong key. The bug that
 *   actually shipped was in the IN-MEMORY copies, which survive a key change
 *   when a loader returns early without resetting them.
 *
 * The defect that shipped
 *   loadFavs() zeroed `favs` but reset `binned.favs` only at the very end,
 *   after an early `return`. Switching to an account that had never saved a
 *   favourite therefore left the previous account's DELETED favourites sitting
 *   in memory - names and street addresses - and the next saveFavs() copied
 *   them into the new account's own key, permanently. The user could read them,
 *   restore them into their own live list, or purge them for good.
 *
 *   loadLocDefaults() had the same shape: an absent key left the previous
 *   account's chosen charger and its "use the device location" flag in place.
 *
 * Why these are executed rather than asserted with regexes
 *   The existing UI suite checks the source text of loadFavs, and it passed for
 *   the entire life of this bug, because the text was correct and the control
 *   flow was not. A regex cannot see an early return. These tests run the real
 *   functions against a real localStorage stand-in, switch accounts between
 *   calls, and check what the next account can actually see.
 *
 *   node tools/test-account-isolation.mjs
 */
import { readFileSync } from "node:fs";
import { fnSource } from "./app-source.mjs";

const app = readFileSync("app/app.js", "utf8");

let pass = 0;
const failures = [];
function ok(label, condition) {
  if (condition) pass++;
  else failures.push(label);
}
function is(label, actual, expected) {
  if (Object.is(actual, expected)) pass++;
  else failures.push(`${label}\n      expected ${expected}, got ${actual}`);
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

/* A localStorage stand-in with one flat namespace, exactly as the browser has. */
function makeStorage() {
  const data = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

/** KeysFor, as storage.js builds them. */
const KEYS_FOR = (uid) => {
  const pre = uid ? "ev.v1." + uid + "." : "ev.v1.local.";
  return { f: pre + "favs", bf: pre + "binFavs", df: pre + "locDefaults" };
};

/* The real functions, run against a controllable bucket. `binned` is passed in
   and mutated in place, because in the app it is a module-level object that
   survives the account switch - which is the whole problem. */
const loadFavsInto = new Function(
  "LS_",
  "K_",
  "binned_",
  `
  var localStorage = LS_, K = K_, binned = binned_, favs = [];
  function uid() { return "id-" + Math.random().toString(36).slice(2); }
  ${fnSource("splitBinned")}
  ${fnSource("isNum")}
  ${fnSource("loadFavs")}
  loadFavs();
  return { favs: favs };
`,
);

const loadLocDefaultsInto = new Function(
  "LS_",
  "K_",
  "locDefaults_",
  `
  var localStorage = LS_, K = K_, locDefaults = locDefaults_;
  ${fnSource("isNum")}
  ${fnSource("loadLocDefaults")}
  loadLocDefaults();
  return locDefaults;
`,
);

const isNum = new Function(`${fnSource("isNum")}; return isNum;`)();

/* The bin object is module-level in the app and SURVIVES an account switch - it
   is the whole reason this bug existed. So every switch below reuses one object
   rather than making a fresh one. That detail is the test: with a fresh object
   per account the leak cannot happen, and these assertions pass against the
   broken code while proving nothing. */
function oneBin() {
  return { favs: [], sessions: [], vehicles: [] };
}

function emptyBin() {
  return oneBin();
}

/* A deleted favourite belonging to account A. The street address is the
   sensitive part: it is a private place, and it is what would have been
   readable by the next person to use the phone. */
const A_DELETED_FAV = {
  id: "fav-a1",
  name: "Anna's home",
  address: "Bäckgatan 14, Malmö",
  lat: 55.6,
  lng: 13.0,
  price: 1.2,
  deletedAt: "2026-10-01T10:00:00.000Z",
};

const A_LIVE_FAV = { id: "fav-a0", name: "Work", address: "Storgatan 1" };

group("a deleted favourite does not follow you to the next account", () => {
  const LS = makeStorage();
  const kA = KEYS_FOR("uid-A");
  const kB = KEYS_FOR("uid-B");

  /* Account A has a live favourite and a deleted one. */
  LS.setItem(kA.f, JSON.stringify([A_LIVE_FAV]));
  LS.setItem(kA.bf, JSON.stringify([A_DELETED_FAV]));

  /* Account B has never saved a favourite, so the key is simply absent. That is
     the exact condition that used to skip the reset. */
  ok("account B has no favourites key", LS.getItem(kB.f) === null);
  ok("account B has no bin key either", LS.getItem(kB.bf) === null);

  const bin = oneBin();
  loadFavsInto(LS, kA, bin);
  is("account A sees its own deleted favourite", bin.favs.length, 1);
  is("and it is not also live", bin.favs.filter((f) => !f.deletedAt).length, 0);

  /* The switch: same object, re-read under the new keys. */
  loadFavsInto(LS, kB, bin);
  is("account B sees no deleted favourites", bin.favs.length, 0);
  ok("and no trace of the address", !JSON.stringify(bin).includes("Bäckgatan"));
});

group("the leak cannot be written into the next account's key", () => {
  const LS = makeStorage();
  const kA = KEYS_FOR("uid-A");
  const kB = KEYS_FOR("uid-B");
  LS.setItem(kA.f, JSON.stringify([A_LIVE_FAV]));
  LS.setItem(kA.bf, JSON.stringify([A_DELETED_FAV]));

  /* Account B makes an ordinary edit: one favourite of their own. That calls
     saveFavs(), which serialises the entire bin array. If the bin still held
     A's row, this is where it becomes durable in B's namespace. */
  const bin = oneBin();
  loadFavsInto(LS, kA, bin);
  loadFavsInto(LS, kB, bin);
  LS.setItem(kB.f, JSON.stringify([{ id: "fav-b0", name: "Mine", address: "Kungsgatan 2" }]));
  LS.setItem(kB.bf, JSON.stringify(bin.favs));

  ok(
    "B's bin key does not contain A's address",
    !String(LS.getItem(kB.bf)).includes("Bäckgatan"),
  );
  is("B's bin key holds nothing", JSON.parse(LS.getItem(kB.bf) || "[]").length, 0);
});

group("account B still gets its own deleted favourites", () => {
  /* The fix must not simply empty the bin always - restore has to keep working. */
  const LS = makeStorage();
  const kA = KEYS_FOR("uid-A");
  const kB = KEYS_FOR("uid-B");
  const bDel = { id: "fav-b9", name: "Gym", address: "Drottninggatan 5", deletedAt: "2026-10-02" };
  /* Seed A first, so the test also proves B's own bin replaces rather than
     merely joins what was there. */
  LS.setItem(kA.f, JSON.stringify([A_LIVE_FAV]));
  LS.setItem(kA.bf, JSON.stringify([A_DELETED_FAV]));
  LS.setItem(kB.f, JSON.stringify([{ id: "fav-b0", name: "Mine", address: "Kungsgatan 2" }]));
  LS.setItem(kB.bf, JSON.stringify([bDel]));

  const bin = oneBin();
  loadFavsInto(LS, kA, bin);
  const out = loadFavsInto(LS, kB, bin);
  is("the deleted favourite is there", bin.favs.length, 1);
  is("and it is exactly B's own", bin.favs[0].id, "fav-b9");
  is("and it is out of the live list", out.favs.length, 1);
  ok("the live one is untouched", out.favs[0].id === "fav-b0");
});

group("a corrupt key does not resurrect the previous account either", () => {
  const LS = makeStorage();
  const kA = KEYS_FOR("uid-A");
  const kB = KEYS_FOR("uid-B");
  LS.setItem(kA.f, JSON.stringify([A_LIVE_FAV]));
  LS.setItem(kA.bf, JSON.stringify([A_DELETED_FAV]));
  /* Unparseable is the other way the old catch-all funnelled into the same
     skip, so it needs the same guarantee. */
  LS.setItem(kB.f, "{not json");

  const bin = oneBin();
  loadFavsInto(LS, kA, bin);
  loadFavsInto(LS, kB, bin);
  is("a corrupt key yields an empty bin", bin.favs.length, 0);
  ok("with no trace of A", !JSON.stringify(bin).includes("Bäckgatan"));
});

group("signing out does not strand the previous account's bin on screen", () => {
  /* The same skip re-arms on the SIGNED-OUT bucket, so a device left signed out
     shows the last account's deleted favourites to whoever opens it next. */
  const LS = makeStorage();
  const kA = KEYS_FOR("uid-A");
  const kLocal = KEYS_FOR(null);
  LS.setItem(kA.f, JSON.stringify([A_LIVE_FAV]));
  LS.setItem(kA.bf, JSON.stringify([A_DELETED_FAV]));
  ok("the signed-out bucket has no favourites", LS.getItem(kLocal.f) === null);

  const bin = oneBin();
  loadFavsInto(LS, kA, bin);
  loadFavsInto(LS, kLocal, bin);
  is("nothing is left on the signed-out screen", bin.favs.length, 0);
  ok("and no address", !JSON.stringify(bin).includes("Bäckgatan"));
});

group("location defaults do not follow you either", () => {
  const LS = makeStorage();
  const kA = KEYS_FOR("uid-A");
  const kB = KEYS_FOR("uid-B");
  LS.setItem(kA.df, JSON.stringify({ loc: "fav-a0", hour: 22, geo: true }));

  const a = loadLocDefaultsInto(LS, kA, { loc: null, hour: null, geo: false });
  is("account A has its own defaults", a.hour, 22);

  /* Account B has none. `geo` is the one that matters: it is the flag deciding
     whether the app offers to read the device position at all. The same object
     is passed in, because in the app locDefaults is a module-level var that
     survives the switch. */
  const shared = { loc: null, hour: null, geo: false };
  loadLocDefaultsInto(LS, kA, shared);
  const b = loadLocDefaultsInto(LS, kB, shared);
  is("account B starts with no chosen charger", b.loc, null);
  is("and no hour", b.hour, null);
  ok("and does not inherit A's device-location permission", b.geo === false);
});

group("account B's own defaults are not lost to the reset", () => {
  const LS = makeStorage();
  const kA = KEYS_FOR("uid-A");
  const kB = KEYS_FOR("uid-B");
  LS.setItem(kA.df, JSON.stringify({ loc: "fav-a0", hour: 22, geo: true }));
  LS.setItem(kB.df, JSON.stringify({ loc: "fav-b0", hour: 7, geo: true }));

  const shared = { loc: null, hour: null, geo: false };
  loadLocDefaultsInto(LS, kA, shared);
  const b = loadLocDefaultsInto(LS, kB, shared);
  is("the chosen charger survives", b.loc, "fav-b0");
  is("the hour survives", b.hour, 7);
  ok("and so does the location flag", b.geo === true);
});

group("the reset precedes any early return", () => {
  /* Structural guard. The behavioural tests above are the real defence, but a
     future edit that reintroduces an early return should fail something visible
     rather than waiting to be found on a shared phone. */
  const favs = fnSource("loadFavs");
  const binAt = favs.indexOf("binned.favs =");
  const retAt = favs.indexOf("return;");
  ok("loadFavs was found", favs.length > 0);
  ok("the bin is assigned", binAt > -1);
  ok("and it comes before any early return", retAt === -1 || binAt < retAt);

  const loc = fnSource("loadLocDefaults");
  const resetAt = loc.indexOf("locDefaults = {");
  const guardAt = loc.indexOf("if (raw &&");
  ok("locDefaults is reset", resetAt > -1);
  ok("and it comes before its guard", guardAt === -1 || resetAt < guardAt);
  ok("the account switch still reloads favourites", /loadFavs\(\)/.test(app));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);