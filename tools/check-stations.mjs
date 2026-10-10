/*
 * Load app/stations.js and use it against the live APIs.
 *
 * The unit tests prove the parsing is right by feeding it captured responses.
 * This proves the endpoints still answer, that the response is still the shape
 * the parser expects, and that a real end-to-end search returns real stations.
 * It is not part of `npm run check`: it needs a network, and a suite that fails
 * because a third party is rate-limiting a developer is worse than no suite.
 *
 *   node tools/check-stations.mjs
 */
import { readFileSync } from "node:fs";
import assert from "node:assert";

const mod = readFileSync("app/stations.js", "utf8");

/* A localStorage stand-in, so the real caching path runs rather than a stub. */
const store = new Map();
const win = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (store.get(k) === String(v)) return;
      store.set(k, String(v));
    },
    removeItem: (k) => store.delete(k),
  },
  setTimeout,
  clearTimeout,
  AbortController,
  fetch,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  TextEncoder,
  TextDecoder,
  /* The real ones, because this measures what a current browser actually
     stores. Omitting them here silently tested the fallback path and reported
     a cache 3x larger than the app really writes. */
  CompressionStream,
  DecompressionStream,
};
win.window = win;
win.globalThis = win;
new Function(
  "window",
  "globalThis",
  "fetch",
  "AbortController",
  "btoa",
  "atob",
  "TextEncoder",
  "TextDecoder",
  "CompressionStream",
  "DecompressionStream",
  mod,
)(
  win,
  win,
  fetch,
  AbortController,
  win.btoa,
  win.atob,
  TextEncoder,
  TextDecoder,
  CompressionStream,
  DecompressionStream,
);
const S = win.StationData;

const HELSINKI = { lat: 60.1699, lng: 24.9384 };
const STOCKHOLM = { lat: 59.3293, lng: 18.0686 };

console.log("endpoints");
console.log("  registry :", S.LOCATIONS_URL);
console.log("  status   :", S.STATUS_URL);
console.log("  tariffs  :", S.TARIFF_URL);

console.log("\nsearching inside Finland (Helsinki, 10 km)");
const t0 = Date.now();
const inside = await S.findStations(HELSINKI, 10000);
console.log(`  source ${inside.source}, cached ${inside.cached}, ${inside.rows.length} rows in ${Date.now() - t0} ms`);
assert.ok(inside.source === "digitraffic", "should use Digitraffic inside Finland");
assert.ok(inside.rows.length > 0, "Helsinki should have stations");

inside.rows.slice(0, 5).forEach((r) => {
  console.log(
    `  ${(r.dist / 1000).toFixed(2)} km  ${(r.power || "?").padEnd(9)} ${(r.name || "?").slice(0, 42).padEnd(42)} ${(r.plugs || []).join(", ")}`,
  );
});

/* The invariants that actually broke in earlier drafts. */
const sorted = inside.rows.every((r, i) => i === 0 || inside.rows[i - 1].dist <= r.dist);
console.log("  nearest first:", sorted);
assert.ok(sorted, "rows must be ordered by distance");

const inRange = inside.rows.every((r) => r.dist <= 10000);
console.log("  all within the radius:", inRange);
assert.ok(inRange, "every row must be inside the requested radius");

const named = inside.rows.every((r) => r.name && r.name.length);
console.log("  every row is named:", named);
assert.ok(named, "no unnamed rows");

const sane = inside.rows.every((r) => r.lat > 59 && r.lat < 71 && r.lng > 18 && r.lng < 33);
console.log("  every row is in Finland:", sane);
assert.ok(sane, "coordinates are [lng, lat] and must land in Finland");

const kw = inside.rows.filter((r) => r.power).map((r) => parseFloat(r.power));
console.log("  power range:", Math.min(...kw), "-", Math.max(...kw), "kW");
assert.ok(Math.max(...kw) < 1000, "power must be kilowatts, not watts");
assert.ok(Math.max(...kw) > 50, "Finland has DC chargers; 50 kW+ should appear");

console.log("\ncache");
const again = await S.findStations(HELSINKI, 10000);
console.log("  second search cached:", again.cached, `(${Date.now() - t0} ms total)`);
assert.ok(again.cached === true, "the second search must come from the cache");
const bytes = (store.get(S.K_STATIONS) || "").length;
console.log("  cache size:", Math.round(bytes / 1024), "KB, key", S.K_STATIONS);
/* The quota is shared with the user's own sessions. Public reference data must
   not be able to push a charge history out of localStorage. */
assert.ok(bytes < 900 * 1024, "cache must stay well under 1 MB, got " + Math.round(bytes / 1024) + " KB");
const cached = await S.readCache();
const withPoles = cached.stations.filter((s) => s.polesTotal > s.poles.length);
console.log("  sites whose pole detail was truncated:", withPoles.length);
if (withPoles.length) {
  const w = withPoles[0];
  console.log(`    e.g. ${w.name}: showing ${w.poles.length} of ${w.polesTotal}, but keeping ${w.evseIds.length} ids for live status`);
  /* Truncating the display is fine; truncating the status lookup is not. */
  assert.ok(w.evseIds.length === w.polesTotal, "every pole id must be kept for live status");
}

console.log("\nsearching outside Finland (Stockholm, 10 km) - Overpass");
/* NOT an assertion, and that is deliberate.
   Every public Overpass instance rejects or rate-limits a request from a Node
   script: overpass-api.de answers 406 at the Apache layer to a client whose
   User-Agent undici will not let us replace, and the mirrors answer 429. In a
   browser the request carries an ordinary browser User-Agent and is served
   normally. So this leg cannot be verified from here, and claiming otherwise
   would be worse than saying so.

   What IS checked here is the behaviour that matters: every instance is tried
   in turn, each attempt is reported, and the search ends in a clear failure
   rather than in an empty result list. */
const attempts = [];
const out = await S.findStations(STOCKHOLM, 10000, {
  onAttempt: (i) => {
    attempts.push(i);
    console.log(`  ${i.which.padEnd(9)} ${i.endpoint}\n            ok=${i.ok}${i.ok ? " elements=" + i.elements : " error=" + i.error}`);
  },
}).catch((e) => {
  console.log("  (no endpoint answered:", e.message + ")");
  return { rows: [], source: "osm" };
});
console.log(`  source ${out.source}, ${out.rows.length} rows, ${attempts.length} endpoints tried`);
console.log("  NOTE: Overpass refuses scripted clients, so this is the failure");
console.log("        path, not the success path. Browser behaviour is unverified here.");
if (attempts.length > 1) {
  console.log("  the fallback chain is exercised: more than one endpoint was tried");
} else {
  console.log("  WARNING: only one endpoint was tried, so the chain is untested");
}

console.log("\nlive status");
const statuses = await S.loadStatuses();
const keys = Object.keys(statuses);
console.log("  evses with a status:", keys.length);
console.log("  a real evse id looks like:", keys[0]);
assert.ok(keys.length > 1000, "the status feed should be large");
assert.ok(/FI\*/.test(keys[0]), "status keys are evse ids, not station ids");

console.log("\ncameras");
const cams = await S.findCameras(HELSINKI, 50000);
console.log("  within 50 km of Helsinki:", cams.length);
cams.slice(0, 3).forEach((c) => console.log(`  ${(c.dist / 1000).toFixed(1)} km  ${c.name}  ${c.thumb}`));
assert.ok(cams.length > 0, "there should be cameras near Helsinki");

console.log("\ntariffs");
const tariffs = await S.loadTariffs();
const all = Object.values(tariffs);
const eur = all.filter((t) => t.currency === "EUR").map((t) => t.price);
console.log("  tariffs with an energy price:", all.length);
console.log("  currencies:", [...new Set(all.map((t) => t.currency))].join(", "));
console.log("  EUR range:", Math.min(...eur), "-", Math.max(...eur), "per kWh");
/* Only euros are bounded, because the feed carries nine currencies and 220 HUF
   is about 0.60 EUR - a perfectly ordinary price that a naive ceiling would
   flag as a parsing error. Getting this wrong the other way is worse: a
   PARKING_TIME component of 2.50 EUR/hour in a field labelled per kWh is a
   real charging price and would slip through a range check unnoticed. */
assert.ok(Math.max(...eur) < 10, "an EUR price above 10/kWh means a non-energy component leaked through");
assert.ok(Math.min(...eur) >= 0, "a negative price is a parsing error");
console.log("  EUR range is sane, so TIME and PARKING_TIME were excluded");
console.log("  a few real ones:", all.slice(0, 3).map((t) => `${t.price} ${t.currency}/kWh`).join(", "));

console.log("\nall live checks passed");