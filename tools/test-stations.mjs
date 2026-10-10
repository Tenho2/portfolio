/*
 * The station and camera data layer.
 *
 * Everything asserted here was checked against the LIVE API first, because
 * every field in this data was wrong in a way that looked right:
 *
 *   - `limit` accepts only 500 or ALL. `?limit=2` is a 400, not a short page.
 *   - The payload is GeoJSON `features[]`, not `result[]`.
 *   - Coordinates are [lng, lat]. The other order drops every Finnish station
 *     into the Baltic and returns an empty map with no error anywhere.
 *   - `maxElectricPower` is in WATTS. 12800 is a 12.8 kW charger, and read as
 *     kW the app would advertise a 12.8 MW one.
 *   - The status path is `locations/statuses`; `statuses` alone is a 404.
 *   - `tariffs` is top level, not under `locations`.
 *   - `evseStatus=AVAILABLE` is accepted and then IGNORED, so filtering has to
 *     happen here or not at all.
 *
 * The fixtures under tools/fixtures are real responses, trimmed. They were
 * captured by tools/fixtures/capture.mjs, so a field that is renamed in the app
 * fails here rather than silently producing a blank.
 *
 *   node tools/test-stations.mjs
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

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
async function group(name, fn) {
  const before = failures.length;
  await fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

const html = readFileSync("ev-tracker.html", "utf8");
const wide = readFileSync("ev-tracker-wide.html", "utf8");
const app = readFileSync("app/app.js", "utf8");
const mod = readFileSync("app/stations.js", "utf8");
const shell = readFileSync("app/shell.mjs", "utf8");
const sw = readFileSync("sw.js", "utf8");
const i18 = readFileSync("app/i18n.js", "utf8");

const STATIONS_FIXTURE = JSON.parse(readFileSync("tools/fixtures/stations.json", "utf8"));
/* A real position inside the fixture, so a radius test actually covers it.
   The captured stations are in Tornio and Kuopio - 276 km and 101 km from
   Helsinki - so searching from Helsinki correctly finds nothing. */
const FIXTURE_ORIGIN = {
  lat: STATIONS_FIXTURE.features[0].geometry.coordinates[1],
  lng: STATIONS_FIXTURE.features[0].geometry.coordinates[0],
};
const CAMERAS_FIXTURE = JSON.parse(readFileSync("tools/fixtures/cameras.json", "utf8"));

/* Load the module the way the page does: as a classic script that publishes a
   global. Evaluating it in a function scope would let a broken IIFE wrapper
   pass unnoticed, which is exactly the kind of breakage that only shows up as
   "StationData is undefined" in the browser. */
function loadModule(fake = {}) {
  const store = new Map();
  const win = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    AbortController,
    TextEncoder,
    TextDecoder,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    fetch: fake.fetch || (() => Promise.reject(new Error("no fetch in tests"))),
    ...fake,
  };
  /* Compression is optional, so both paths are exercised. `noCompress` is how
     the fallback for an older browser is reached in a test rather than assumed. */
  if (!fake.noCompress) {
    win.CompressionStream = globalThis.CompressionStream;
    win.DecompressionStream = globalThis.DecompressionStream;
  }
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
    win.fetch,
    AbortController,
    win.btoa,
    win.atob,
    TextEncoder,
    TextDecoder,
    win.CompressionStream,
    win.DecompressionStream,
  );
  return { S: win.StationData, win, store };
}

await group("the module publishes the interface the page uses", () => {
  const { S } = loadModule();
  ok("it is published as a global", !!S);
  for (const fn of ["findStations", "refreshRegistry", "loadStatuses", "loadTariffs", "findCameras", "stationFromFeature", "metresBetween", "inFinland", "powerText"]) {
    ok(`${fn} is available`, typeof S[fn] === "function");
  }
});

await group("the endpoints are the ones that answer", () => {
  const { S } = loadModule();
  /* Read from the source, not from a copy here: a test that passes against an
     endpoint the app no longer calls is worse than no test. */
  ok("the registry is asked for with limit=ALL", /\?limit=ALL/.test(S.LOCATIONS_URL));
  ok("and limit=2 would be rejected", !/\?limit=2\b/.test(S.LOCATIONS_URL));
  ok("statuses are under locations/", /\/locations\/statuses/.test(S.STATUS_URL));
  /* `/statuses` on its own is a 404, and `/locations/statuses` is not - the
     check has to exclude the substring that is legitimately there. */
  ok("a bare statuses path is not used", !/\/v1\/statuses/.test(S.STATUS_URL));
  ok("tariffs are top level", /\/v1\/tariffs/.test(S.TARIFF_URL));
  /* Only the URL constants are checked. The word appears in the header comment,
     which explains why the filter is not used, and matching that would be
     testing the prose. */
  const urls = [S.LOCATIONS_URL, S.STATUS_URL, S.TARIFF_URL].join(" ");
  ok("no evseStatus filter is sent, because it is ignored", !/evseStatus/.test(urls));
  is("two Overpass endpoints remain", S.OVERPASS_ENDPOINTS.length >= 2, true);
});

await group("coordinates are read in GeoJSON order", () => {
  const { S } = loadModule();
  const f = STATIONS_FIXTURE.features[0];
  const raw = f.geometry.coordinates;
  const row = S.stationFromFeature(f);
  /* The fixture really is [lng, lat]: a longitude under 32 and a latitude over
     59 is Finland, and any other reading is somewhere in the North Sea. */
  is("the fixture really is [lng, lat]", raw[0] < 32 && raw[1] > 59, true);
  is("latitude comes from the second value", row.lat, raw[1]);
  is("longitude comes from the first", row.lng, raw[0]);
  ok("the result is in Finland", S.inFinland(row.lat, row.lng));
});

await group("power is watts, and says so", () => {
  const { S } = loadModule();
  /* One decimal is kept where the value is a real product: 11 and 22 kW are the
     two common AC chargers, and 7.4 rounds to a charger that does not exist. */
  is("12800 W reads as 12.8 kW", S.powerText(12800), "12.8 kW");
  is("7400 W keeps its decimal", S.powerText(7400), "7.4 kW");
  is("11000 W is 11 kW", S.powerText(11000), "11 kW");
  is("22000 W is 22 kW", S.powerText(22000), "22 kW");
  is("and 22, not 22.0", S.powerText(22000).indexOf("."), -1);
  /* Above 100 kW a tenth is not information a driver can act on. */
  is("a DC charger is whole kilowatts", S.powerText(150000), "150 kW");
  is("350 kW stays 350", S.powerText(350000), "350 kW");
  is("zero watts is empty, not 0 kW", S.powerText(0), "");
  is("missing is empty", S.powerText(null), "");
  is("a string of digits still works", S.powerText("7400"), "7.4 kW");
  /* A station with no connector data must not claim 0 kW. */
  is("nothing is better than a wrong number", S.powerText(undefined), "");
});

await group("a real response becomes usable rows", () => {
  const { S } = loadModule();
  const rows = S.stationsFromCollection(STATIONS_FIXTURE);
  is("both stations become rows", rows.length, 2);
  const r = rows[0];
  ok("it has a name", !!r.name);
  ok("it has coordinates", isNum(r.lat) && isNum(r.lng));
  is("the source is recorded", r.source, "digitraffic");
  /* GeoJSON `properties.id` is the join key for live status. Losing it means
     the detail panel can never show whether a pole is free. */
  ok("it keeps the registry id", !!r.id);
});

await group("poles are kept individually, not collapsed to the first", () => {
  const { S } = loadModule();
  const big = S.stationFromFeature(STATIONS_FIXTURE.features[1]);
  const evseCount = STATIONS_FIXTURE.features[1].properties.evses.length;
  is("every EVSE becomes a pole", big.poles.length, evseCount);
  /* The trap: reading connectors[0] and calling it the station. A 16-pole
     station summarised by its first pole understates what is there. */
  ok("the station has several poles", big.poles.length > 8);
  ok("each pole carries its own connector list", big.poles.every((p) => Array.isArray(p.plugs)));
  ok("each pole carries its own evse id", big.poles.every((p) => typeof p.id === "string" && p.id.length));
  /* And the summary power is the best available, not the first. */
  const maxPower = Math.max(
    ...STATIONS_FIXTURE.features[1].properties.evses.flatMap((e) =>
      e.connectors.map((c) => c.maxElectricPower || 0),
    ),
  );
  is("the summary is the highest power on site", big.power, S.powerText(maxPower));
});

await group("connector standards are translated, not shown raw", () => {
  const { S } = loadModule();
  is("IEC_62196_T2 is Type 2", S.standardText("IEC_62196_T2"), "Type 2");
  is("the combo is a combo", S.standardText("IEC_62196_T2_COMBO"), "Type 2 combo");
  is("CHAdeMO keeps its name", S.standardText("CHADEMO"), "CHAdeMO");
  is("DOMESTIC_F is Schuko", S.standardText("DOMESTIC_F"), "Type F (Schuko)");
  is("DOMESTIC_H is Type K", S.standardText("DOMESTIC_H"), "Type K");
  /* An unknown standard passes through rather than vanishing, because a new
     type appearing in the feed should be visible, not silently dropped. */
  is("an unknown one is passed through", S.standardText("MEGACHARGE"), "MEGACHARGE");
  const rows = S.stationsFromCollection(STATIONS_FIXTURE);
  const all = rows.flatMap((r) => r.plugs);
  ok("no raw protocol id reaches the screen", !all.some((p) => /^[A-Z0-9_]+$/.test(p)));
  ok("and the list is not empty", all.length > 0);
});

await group("a feature with no position is dropped", () => {
  const { S } = loadModule();
  is("null geometry", S.stationFromFeature({ geometry: null, properties: {} }), null);
  is("short coordinates", S.stationFromFeature({ geometry: { coordinates: [1] }, properties: {} }), null);
  is("non-numeric coordinates", S.stationFromFeature({ geometry: { coordinates: ["a", "b"] }, properties: {} }), null);
  /* A feature with a position but nothing to call it is dropped: a row reading
     only "Laturi" in a search list is noise, not a result. */
  is("no name and no operator", S.stationFromFeature({ geometry: { coordinates: [24, 60] }, properties: {} }), null);
  ok("but an operator alone is enough", !!S.stationFromFeature({
    geometry: { coordinates: [24, 60] },
    properties: { operator: { details: { name: "Virta" } } },
  }));
  ok("and so is a name", !!S.stationFromFeature({ geometry: { coordinates: [24, 60] }, properties: { name: "X" } }));
});

await group("distance is a real distance, in the right order", () => {
  const { S } = loadModule();
  is("the same point is zero", S.metresBetween(60, 24, 60, 24), 0);
  /* Helsinki to Tampere is about 160 km as the crow flies. A flat-earth
     approximation is out by tens of percent, enough to reorder results. */
  const d = S.metresBetween(60.1699, 24.9384, 61.4978, 23.7610);
  ok("Helsinki to Tampere is plausible", d > 150000 && d < 175000);
  is("it is symmetric", S.metresBetween(61.4978, 23.761, 60.1699, 24.9384), d);
});

await group("the source is chosen by where the user is", () => {
  const { S } = loadModule();
  ok("Helsinki counts as inside", S.inFinland(60.1699, 24.9384));
  ok("Rovaniemi counts as inside", S.inFinland(66.5, 25.7));
  ok("Stockholm does not", !S.inFinland(59.33, 18.07));
  ok("Berlin does not", !S.inFinland(52.52, 13.4));
  /* Far out at sea the answer barely matters: the wrong registry returns
     nothing nearby, it does not return wrong rows. */
  ok("an empty position is neither", !S.inFinland(null, null));
  ok("a zero is not a position", !S.inFinland(0, 0));
});

await group("Overpass is still asked for socket:*, not connector:*", () => {
  const { S } = loadModule();
  const url = S.overpassUrl(52.52, 13.4, 10000);
  ok("it is an Overpass endpoint", /overpass-api\.de\/api\/interpreter/.test(url));
  const q = decodeURIComponent(url.slice(url.indexOf("data=") + 5));
  ok('it filters amenity="charging_station"', q.includes('"amenity"="charging_station"'));
  ok("it covers nodes", /node\[/.test(q));
  ok("it covers ways", /way\[/.test(q));
  ok("it bounds the query", /out center 40/.test(q));
  ok("it has a timeout", /\[timeout:20\]/.test(q));
  is("three socket tags are found", S.stationSockets({ "socket:chademo": "1", "socket:type2": "1", "socket:type2_combo": "1" }).length, 3);
  /* `socket:<type>:output` is the RATING of that connector. Listing it produced
     a column of rows literally called "output". */
  ok("no connector is called output", !S.stationSockets({ "socket:chademo:output": "50 kW" }).includes("output"));
  ok("the rating is attached to its connector", S.stationSockets({ "socket:chademo": "1", "socket:chademo:output": "50 kW" }).includes("chademo 50 kW"));
  /* And connector:* is what someone writes from memory; it matches nothing. */
  is("connector:* matches nothing", S.stationSockets({ "connector:type2": "2", "connector:chademo": "1" }).length, 0);
  /* A way is located by its centre: the element has no lat of its own, and
     reading el.lat alone gives undefined, which Leaflet throws on. */
  const way = S.stationFromElement({ type: "way", id: 7, center: { lat: 52.5, lon: 13.4 }, tags: { amenity: "charging_station", name: "X" } });
  is("a way takes its latitude from the centre", way.lat, 52.5);
  is("and its longitude", way.lng, 13.4);
  is("an element with no position at all is dropped", S.stationFromElement({ type: "node", id: 1, tags: {} }), null);
});

await group("a search inside Finland uses the cache and does not re-fetch", async () => {
  let calls = 0;
  const payload = STATIONS_FIXTURE;
  const { S } = loadModule({
    fetch: () => {
      calls++;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
    },
  });
  /* First search: nothing cached, so it fetches. */
  const first = await S.findStations(FIXTURE_ORIGIN, 50000);
  ok("the registry was fetched", calls >= 1);
  is("rows came back", Array.isArray(first.rows), true);
  is("and it says which source answered", first.source, "digitraffic");
  ok("and that it was not from the cache", first.cached === false);
  /* Second search: cached, so it must not fetch again. */
  const after = calls;
  const second = await S.findStations(FIXTURE_ORIGIN, 50000);
  is("a second search makes no request", calls, after);
  is("and reports the cache", second.cached, true);
});

await group("the cache is per device, not per account", () => {
  const { S, store } = loadModule();
  ok("the key is a fixed device key", S.K_STATIONS === "ev.v1.stations");
  /* It must NOT carry an account id, or every sign-in would download 23 MB and
     the cache would be empty exactly when it is needed most. */
  ok("it has no account id in it", !/@|uid|account/.test(S.K_STATIONS));
});

await group("a failed fetch is reported, not shown as no stations", async () => {
  const { S } = loadModule({
    fetch: () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }),
  });
  let failed = false;
  try {
    await S.findStations(FIXTURE_ORIGIN, 50000);
  } catch (e) {
    failed = true;
  }
  ok("an HTTP error rejects", failed);
});

await group("live status is keyed by evse id, and only on request", async () => {
  let calls = 0;
  const statusPayload = {
    pagination: { limit: 500 },
    statuses: [
      { evseId: "FI*1*E*A*1", status: "AVAILABLE", lastUpdatedAt: "2026-10-08T23:01:39.000Z" },
      { evseId: "FI*1*E*A*2", status: "CHARGING", lastUpdatedAt: "2026-10-08T23:01:39.000Z" },
      { evseId: "FI*1*E*A*3", status: "OUTOFORDER", lastUpdatedAt: "2026-10-08T23:01:39.000Z" },
    ],
  };
  const { S } = loadModule({
    fetch: () => {
      calls++;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(statusPayload) });
    },
  });
  const map = await S.loadStatuses();
  is("one call", calls, 1);
  is("three evses are keyed", Object.keys(map).length, 3);
  is("status is by evse id", map["FI*1*E*A*2"], "CHARGING");
  /* And nothing fetched status as a side effect of the module loading: it is
     20,000 rows that change by the minute, and belongs on a click. */
  is("only when asked", calls, 1);
});

await group("tariffs quote an energy price, in euros per kWh", async () => {
  /* Five kinds of price component share this feed, and only one is per kWh.
     Reading elements[0].priceComponents[0] regardless of type is how a 237.80
     EUR/hour parking tariff ends up in a field labelled price per kWh. */
  const payload = {
    tariffs: [
      { id: "ok", currency: "EUR", elements: [{ priceComponents: [{ type: "ENERGY", price: 0.29, stepSize: 1, vat: 25.5 }] }] },
      { id: "parking", currency: "EUR", elements: [{ priceComponents: [{ type: "PARKING_TIME", price: 237.8, stepSize: 15 }] }] },
      { id: "timeFirst", currency: "EUR", elements: [{ priceComponents: [{ type: "TIME", price: 2.5 }, { type: "ENERGY", price: 0.42 }] }] },
      { id: "perMwh", currency: "EUR", elements: [{ priceComponents: [{ type: "ENERGY", price: 290, stepSize: 1000 }] }] },
      { id: "sek", currency: "SEK", elements: [{ priceComponents: [{ type: "ENERGY", price: 3.1 }] }] },
      { id: "flat", currency: "EUR", elements: [{ priceComponents: [{ type: "FLAT", price: 5 }] }] },
      { id: "empty", currency: "EUR", elements: [] },
    ],
  };
  const { S } = loadModule({ fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) }) });
  const t = await S.loadTariffs();

  is("the energy price is kept", t.ok.price, 0.29);
  is("the VAT comes from the energy component", t.ok.vat, 25.5);
  /* A parking-only tariff has no charging price. Recording 0 would display the
     station as free, which is the opposite of the truth. */
  ok("a parking-only tariff is not a charging price", !t.parking);
  /* TIME comes first here, so reading the first component would give 2.50. */
  is("the energy component is found past a time charge", t.timeFirst.price, 0.42);
  /* 290 per MWh is 0.29 per kWh. Unscaled it is a factor of a thousand out. */
  is("a per-MWh price is scaled to per-kWh", t.perMwh.price, 0.29);
  /* The feed carries nine currencies; labelling SEK as EUR is wrong. */
  is("the currency travels with the price", t.sek.currency, "SEK");
  ok("a flat fee is not a charging price", !t.flat);
  ok("an empty tariff list is not free charging", !t.empty);
});

await group("the cache is packed, compressed, and small enough to be safe", async () => {
  const { S, store } = loadModule({
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(STATIONS_FIXTURE) }),
  });
  await S.findStations(FIXTURE_ORIGIN, 50000);
  const raw = store.get(S.K_STATIONS);
  ok("something was written", !!raw);

  /* The quota is shared with the user's own sessions, vehicles and favourites.
     The first version stored one named-key object per pole and measured 2.1 MB
     of a typical 5 MB budget - spent on public reference data, with the
     failure landing on someone's charge history if it tipped over. */
  ok("the cache is compressed", raw.indexOf("gz:") === 0);
  const j = JSON.parse(gunzipSync(Buffer.from(raw.slice(3), "base64")).toString("utf8"));
  ok("poles are stored positionally, not as named objects", Array.isArray(j.stations[0].p[0]));
  ok("the field names are short", !/"id"|"name"|"latitude"|"longitude"/.test(raw));

  /* Round-trip: what is read back must be what went in. */
  const back = await S.readCache();
  ok("the cache reads back", !!back);
  const a = back.stations[0];
  const orig = S.stationsFromCollection(STATIONS_FIXTURE)[0];
  is("the id survives", a.id, orig.id);
  is("the name survives", a.name, orig.name);
  is("the position survives", a.lat, orig.lat);
  is("the power survives", a.power, orig.power);
  is("the plug list survives", a.plugs.join(","), orig.plugs.join(","));
  is("the pole count survives", a.polesTotal, STATIONS_FIXTURE.features[0].properties.evses.length);
  /* Every evse id is kept, because live status is looked up by id and a
     truncated count would report the wrong number of free poles. */
  is("every evse id is kept for status", a.evseIds.length, STATIONS_FIXTURE.features[0].properties.evses.length);
});

await group("compression is optional, not assumed", async () => {
  /* CompressionStream is recent. A browser without it must still work, just
     with a bigger cache - not lose the feature. */
  const { S, store } = loadModule({
    noCompress: true,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(STATIONS_FIXTURE) }),
  });
  const res = await S.findStations(FIXTURE_ORIGIN, 50000);
  ok("stations still come back", res.rows.length > 0);
  const raw = store.get(S.K_STATIONS);
  is("the uncompressed marker is used", raw.indexOf("js:"), 0);
  ok("and it still reads back", !!(await S.readCache()));
});

await group("a cache written by an older version is still readable", async () => {
  const { S, store } = loadModule();
  /* Before the marker existed the value was bare JSON. Reading it rather than
     discarding it means an upgrade does not force a 23 MB re-download on
     everyone's next search. */
  const rows = S.stationsFromCollection(STATIONS_FIXTURE);
  store.set(S.K_STATIONS, JSON.stringify({ v: 1, fetchedAt: Date.now(), stations: rows }));
  const back = await S.readCache();
  ok("legacy JSON is read", !!back);
  is("and its fields still mean the same thing", back.stations[0].name, rows[0].name);
});

await group("a corrupt cache is discarded, not fatal", async () => {
  const { S, store } = loadModule();
  /* Truncated storage or a half-finished write. The registry is public and can
     be fetched again, so this must not throw into the search. */
  store.set(S.K_STATIONS, "gz:not-real-gzip-at-all");
  is("garbage under the gzip marker reads as nothing", await S.readCache(), null);
  store.set(S.K_STATIONS, "js:{\"v\":2,\"stations\":[]}");
  is("an empty list reads as nothing", await S.readCache(), null);
  store.set(S.K_STATIONS, "js:{\"stations\":[{}]}");
  is("a list with no timestamp reads as nothing", await S.readCache(), null);
});

await group("a very large site is not stored pole by pole", () => {
  /* The registry holds a site with 219 poles. Nobody reads 219 rows, and the
     connector detail for them is most of the cache. The count and the ids are
     kept; only the repeated per-pole detail is capped. */
  ok("there is a cap on stored pole detail", /POLE_DETAIL_MAX = \d+/.test(mod));
  const cap = Number(mod.match(/POLE_DETAIL_MAX = (\d+)/)[1]);
  ok("and it is small", cap > 0 && cap <= 24);
  ok("the true total is stored alongside", /polesTotal: p\.t \|\| poles\.length/.test(mod));
  ok("and the ranker carries it through", /polesTotal: r\.polesTotal/.test(mod));
  /* And the UI admits the truncation rather than showing a short list as if it
     were the whole site. */
  ok("the panel says how many were not listed", /st\.polesMore/.test(app));
  ok("the heading counts every pole", /st\.polesTitle", \{ n: total \}/.test(app));
  /* Status must count every id, not the capped detail. */
  ok("live status uses every evse id", /s\.evseIds && s\.evseIds\.length \? s\.evseIds/.test(app));
});

await group("cameras are parsed, with a real image url", () => {
  const { S } = loadModule();
  const cams = S.camerasFromCollection(CAMERAS_FIXTURE);
  is("the fixtures become rows", cams.length, 3);
  const c = cams[0];
  ok("it has an id", !!c.id);
  ok("and coordinates", isNum(c.lat) && isNum(c.lng));
  /* Presets[0].id is the image key. Getting it wrong yields a 404 that looks
     like a broken camera rather than a wrong id. */
  ok("it has a preset id", !!c.presetId);
  is("the preset came from the fixture", c.presetId, CAMERAS_FIXTURE.features[0].properties.presets[0].id);
  ok("the full image url is built from it", c.image.endsWith(c.presetId + ".jpg"));
  ok("the thumbnail is the same url, asked for smaller", c.thumb.includes("thumbnail=true"));
  ok("and it says when the picture was taken", !!c.updated);
});

await group("the camera screen exists and says what these cameras are", () => {
  for (const [name, doc] of [["classic", html], ["wide", wide]]) {
    ok(`${name} has a camera button`, /id="cameraFindBtn"/.test(doc));
    ok(`${name} has a camera list`, /id="cameraList"/.test(doc));
    ok(`${name} has a live status region for it`, /id="cameraStat"[^>]*aria-live|aria-live[^>]*id="cameraStat"/.test(doc));
    /* The note matters more than it looks. The obvious reading of a camera on a
       Finnish road is a speed camera, and this feed contains none. */
    ok(`${name} states they are road-condition cameras`, /data-i18n="cam\.note"/.test(doc));
  }
  ok("the note says so in the copy too", /not speed cameras/.test(i18));
  /* Thumbnails, not full pictures: 264 KB each, and 813 of them is 215 MB. */
  ok("thumbnails are used in the grid", /c\.thumb/.test(app));
  ok("the full picture is opened, not inlined", /data-camera-full/.test(app) && /window\.open/.test(app));
  /* app.js is a browser classic script with no module scope, so a bare `global`
     is a ReferenceError at runtime - thrown from a click handler, where nothing
     catches it and the button silently does nothing. It shipped once. */
  ok("app.js uses window, never a bare global", !/\bglobal\.[A-Za-z]/.test(app));
  /* Every image carries alt text, or the grid is unreadable to a screen reader. */
  ok("each image has an alt", /TXT\("cam\.alt"/.test(app));
  /* And the capture time is shown, because a stale road camera misleads. */
  ok("the age is shown", /cameraAge\(c\.updated\)/.test(app));
  ok("and handles a missing timestamp", /cam\.ageUnknown/.test(i18));
});

await group("camera images are real, and the right size", () => {
  const { S } = loadModule();
  const cam = S.camerasFromCollection(CAMERAS_FIXTURE)[0];
  /* A wrong preset id produces a 404 that reads as a broken camera rather than
     a wrong key, so the id is taken from the fixture rather than built. */
  is("the thumbnail asks for the smaller picture", cam.thumb, cam.image + "?thumbnail=true");
  ok("the full picture is the same key", cam.image.indexOf(cam.presetId) > 0);
  ok("and neither is empty", cam.image.length > 0 && cam.thumb.length > 0);
  /* 16 KB measured live for the thumbnail, 264 KB for the full one. */
  ok("the thumbnail url is the documented one", /^https:\/\/weathercam\.digitraffic\.fi\/[A-Z0-9]+\.jpg\?thumbnail=true$/.test(cam.thumb));
});

await group("cameras are ranked, capped, and never cached", () => {
  ok("there is a radius", /CAMERA_RADIUS_M = \d+/.test(app));
  ok("and a cap on what is shown", /CAMERA_NEAREST = \d+/.test(app));
  const n = Number(app.match(/CAMERA_NEAREST = (\d+)/)[1]);
  ok("small enough to look at", n > 0 && n <= 12);
  /* Fresh every time: a cached road camera is a picture of last hour's rain
     presented as this one, so the camera section must not persist anything. */
  const camSection = mod.slice(mod.indexOf("/* ---------- cameras"), mod.indexOf("global.StationData"));
  ok("the camera section exists", camSection.length > 200);
  ok("nothing about cameras is written to localStorage", !/localStorage/.test(camSection));
  /* The position the station search already resolved is reused rather than
     asking the user for a second fix. */
  ok("an existing position is reused", /if \(stationCentre\) \{/.test(app));
});

await group("each pole keeps its OWN plugs, not the whole station's", async () => {
  /* The packed form stores an index per pole into a table of distinct plug
     combinations. The reader threw that index away and gave every pole the
     station-wide union, so a site with one CHAdeMO pole and four Type 2 poles
     rendered five CHAdeMO poles. It reads as data, not as a bug. */
  const two = {
    features: [
      {
        geometry: { coordinates: [24.9384, 60.1699] },
        properties: {
          id: "s1",
          name: "Mixed site",
          operator: { details: { name: "Op" } },
          address: {},
          evses: [
            { id: "E1", connectors: [{ standard: "CHADEMO", maxElectricPower: 50000 }] },
            { id: "E2", connectors: [{ standard: "IEC_62196_T2", maxElectricPower: 11000 }] },
            { id: "E3", connectors: [{ standard: "IEC_62196_T2", maxElectricPower: 22000 }] },
          ],
        },
      },
    ],
  };
  const { S, store } = loadModule({
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(two) }),
  });
  await S.findStations({ lat: 60.1699, lng: 24.9384 }, 5000);
  const back = await S.readCache();
  const poles = back.stations[0].poles;
  is("every pole survives", poles.length, 3);
  is("the CHAdeMO pole has only CHAdeMO", poles[0].plugs.join(","), "CHAdeMO");
  is("the first Type 2 pole has only Type 2", poles[1].plugs.join(","), "Type 2");
  /* The power is per pole too - 50 kW, 11 kW, 22 kW, not the station maximum
     repeated three times. */
  is("power is per pole", [poles[0].watts, poles[1].watts, poles[2].watts].join(","), "50000,11000,22000");
  /* And the station summary is still the best available. */
  is("the station summary is the highest", back.stations[0].power, "50 kW");
  ok("the cache really did round-trip through storage", !!store.get(S.K_STATIONS));
});

await group("an empty mirror moves on to the next endpoint", async () => {
  /* The failure was raised inside the fulfilment handler of a two-argument
     `.then(ok, err)`. In that form a `throw` rejects the promise the caller
     holds and is never seen by `err` beside it - so an empty fallback aborted
     the search instead of trying the third endpoint.

     And the first fix over-corrected: a `.catch` placed around the call that
     also recursed caught the NEXT endpoint's rejection too, and cycled the
     same three endpoints six times before giving up. That repeat is invisible
     to a source scan, so this group executes the loop instead. */
  const section = mod.slice(mod.indexOf("function fromOverpass"), mod.indexOf("function rank("));
  ok("an empty fallback is still rejected as a failure", /fallback returned no data/.test(section));
  ok("the fetch is its own function, outside the recursion", /function tryEndpoint/.test(section));

  const endpoints = mod.match(/OVERPASS_ENDPOINTS = \[([\s\S]*?)\];/)[1].match(/https:\/\/[^"]+/g);
  const calls = [];
  let n = 0;
  const { S } = loadModule({
    fetch: () => {
      n++;
      return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    },
  });
  let rejected = false;
  await S.findStations({ lat: 52.52, lng: 13.4 }, 5000, {
    onAttempt: (i) => calls.push(i.endpoint),
  }).catch(() => {
    rejected = true;
  });
  is("the search rejects rather than resolving empty", rejected, true);
  is("one attempt per endpoint, no repeats", calls.length, endpoints.length);
  is("and no endpoint is tried twice", new Set(calls).size, calls.length);
  is("the fetch was called once per endpoint", n, endpoints.length);
});

await group("the search button comes back", () => {
  /* It was disabled on click and never re-enabled, so the screen worked exactly
     once per page load and stayed dead after a failure the user could retry. */
  const i = app.indexOf("function findStationsNearMe");
  const body = app.slice(i, app.indexOf("function runStationSearch", i) > i ? app.indexOf("/* ---------- charging stations") : i + 3000);
  ok("it is disabled while asking", /btn\.disabled = true/.test(body));
  const reEnabled = (body.match(/btn\.disabled = false/g) || []).length;
  /* Once in each geolocation callback, and once on each early return. Without
     all of them a refused or coarse fix leaves a dead control. */
  ok("it is re-enabled on every path out", reEnabled >= 4);
});

await group("no request can answer for a newer one", () => {
  /* Two searches in flight resolve in arbitrary order. Without a token the
     slower one can land last and show stations for a place the user has left. */
  ok("a token counter exists", /var stationToken = 0/.test(app));
  ok("and one for cameras", /var cameraToken = 0/.test(app));
  ok("and one for the per-station camera panel", /var stationCameraToken = 0/.test(app));
  ok("the station search claims a token", /\+\+stationToken/.test(app));
  ok("and checks it before writing anything", /if \(mine !== stationToken\) return/.test(app));
  ok("the camera load does too", /if \(mine !== cameraToken\) return/.test(app));
  /* The failure paths must check too, or an older rejected request can still
     overwrite a newer successful one with its error text. Three search paths
     plus three rejections. */
  ok(
    "three guards, one per async path",
    (app.match(/if \(mine !== \w+Token\) return/g) || []).length >= 4,
  );
  /* The detail panel rebuilds #stationCameras on every open, so the box has to
     be looked up after the await, not captured before it. */
  ok("the panel box is re-looked-up after the request", /var box = \$\("stationCameras"\)/.test(app));
});

await group("an empty result clears what was on the map", () => {
  /* Otherwise a confident green marker sits beside the words "no stations
     within 10 km". Scoped to the search path: `renderStations` has its own
     `if (!stationResults.length)`, and matching that one would pass without
     ever reaching the map. */
  const search = app.slice(app.indexOf("function runStationSearch"), app.indexOf("function findStationsNearMe"));
  ok("the station path clears its pins", /drawStationPins\(\[\]\)/.test(search));
  /* Window widened from 600 to 1400: the fix-quality report sits between the
     guard and the pin clear, so this assertion broke on an unrelated edit. A
     window that tight is a test that fails for reasons that have nothing to do
     with what it checks. */
  ok("and it is on the empty branch", /if \(!stationResults\.length\)[\s\S]{0,1400}?drawStationPins\(\[\]\)/.test(search));
  const cams = app.slice(app.indexOf("function loadCameras"), app.indexOf("function drawCameraPins"));
  ok("and so does the camera path", /if \(!cameraResults\.length\)[\s\S]{0,1400}?drawCameraPins\(\[\]\)/.test(cams));
});

await group("unknown statuses do not print a raw key", () => {
  /* Digitraffic also emits OCCUPIED, REMOVED, NOAPPLICABLE and UNPLANNED, and
     i18n.t falls through to printing the key itself for anything undefined. The
     detail panel would have read "st.status_occupied". */
  ok("the key is checked before it is used", /hasKey\(key\)/.test(app));
  ok("and there is a fallback string", /st\.statusOther/.test(app) && /"st\.statusOther"/.test(i18));
  /* Every status the feed is known to emit has a real string. */
  for (const s of ["available", "blocked", "charging", "inoperative", "outoforder", "planned", "reserved", "unknown"]) {
    ok(`st.status_${s} is translated`, new RegExp('"st\\.status_' + s + '":').test(i18));
  }
});

await group("the mileage sentence is never left half-finished", () => {
  /* The floor can come from the vehicle's starting odometer, which has no
     date. An empty label rendered "…is lower than the 50 000 km recorded on ." */
  ok("that case has its own label", /TXT\("odo\.startReading"\)/.test(app));
  ok("and it is translated", /"odo\.startReading":/.test(i18));
});

await group("socket attributes are not connectors", () => {
  const { S } = loadModule();
  /* `socket:output`, `socket:voltage` and friends sit at two segments, so a
     naive length check admits them. A station tagged with all three produced a
     plug list reading "type2, output, voltage". */
  is("output is not a plug", S.stationSockets({ "socket:output": "22" }).length, 0);
  is("nor voltage", S.stationSockets({ "socket:voltage": "230" }).length, 0);
  is("nor access", S.stationSockets({ "socket:access": "customers" }).length, 0);
  is("nor cable", S.stationSockets({ "socket:cable": "yes" }).length, 0);
  is("but type2 still is", S.stationSockets({ "socket:type2": "2" }).join(","), "type2");
  is("alongside chademo", S.stationSockets({ "socket:type2": "2", "socket:chademo": "1" }).length, 2);
  /* `socket:<type>:output` is the rating of that connector, still not a type. */
  is("a rating is not a second plug", S.stationSockets({ "socket:type2": "2", "socket:type2:output": "22 kW" }).length, 1);
  /* The three-segment form IS a type: socket:plug:CHADEMO. */
  is("socket:plug:<type> is accepted", S.stationSockets({ "socket:plug:CHADEMO": "1" }).join(","), "CHADEMO");
  is("but bare socket:plug is not", S.stationSockets({ "socket:plug": "Type 2" }).length, 0);
});

await group("no distance is ever NaN", () => {
  const { S } = loadModule();
  /* Rounding can push the haversine fraction above 1 for distant points, making
     1 - a negative. NaN then passes `d > radius` as false, so the row survives
     the filter and renders as "NaN km". */
  const d = S.metresBetween(0, 0, 0, 180);
  ok("an antipodal pair is a number", Number.isFinite(d));
  ok("and roughly half the circumference", Math.abs(d - 20015000) < 100000);
  is("the same point is still zero", S.metresBetween(60, 24, 60, 24), 0);
  /* And a NaN could never be produced by a row that survived the filter. */
  const nan = S.metresBetween(90, 0, -90, 0);
  ok("poles are finite too", Number.isFinite(nan));
});

await group("the mileage field can actually be left blank", () => {
  /* It carried `required`, and both entry points gate on reportValidity(), so
     the entire "empty saves as null, and says so" design was unreachable.
     `type` and `min` come BEFORE `id` in the generated markup, so the window
     has to reach backwards as well as forwards. */
  const addField = html.slice(html.indexOf('type="number"', html.indexOf("id=\"mileage\"") - 200) - 200, html.indexOf('id="mileage"') + 200);
  const editField = html.slice(html.indexOf('type="number"', html.indexOf('id="eMileage"') - 200) - 200, html.indexOf('id="eMileage"') + 200);
  ok("the add form does not require it", !/id="mileage"[\s\S]{0,300}?\brequired\b/.test(html));
  ok("the edit sheet does not require it", !/id="eMileage"[\s\S]{0,300}?\brequired\b/.test(html));
  /* Still validated as a number, and never negative. */
  ok("but it is still a number", /type="number"/.test(addField) && /type="number"/.test(editField));
  ok("and still cannot go backwards", /min="0"/.test(addField) && /min="0"/.test(editField));
  /* And not required anywhere else either - a stray `required` further down the
     form would re-block the save the dialog is asking about. */
  ok("nothing re-adds it", !/aria-required="true"[\s\S]{0,80}?mileage/.test(html));
});

await group("an id is never empty", () => {
  /* The UI looks a station up by id. An empty one resolves to the first row
     with an empty id, so "Use" would fill in the wrong charger. */
  const { S } = loadModule();
  const row = S.stationFromFeature({
    geometry: { coordinates: [24.9384, 60.1699] },
    properties: { name: "No id", operator: { details: { name: "Op" } }, address: {}, evses: [] },
  });
  ok("a feature with no id still gets one", !!row.id);
  ok("and it is derived from the position", /^dt:/.test(row.id));
  is("which is stable for the same position", row.id, S.stationFromFeature({
    geometry: { coordinates: [24.9384, 60.1699] },
    properties: { name: "No id", operator: { details: { name: "Op" } }, address: {}, evses: [] },
  }).id);
});

await group("the registry cap cannot silently hide a region", () => {
  /* The cap is applied in API order, so exceeding it drops the tail - and rank
     filters by radius afterwards, which would mean "no stations near you" for
     anyone near that tail. The count has to be reported, not swallowed. */
  ok("the cap is declared above the current registry size", /CACHE_MAX = \d+/.test(mod));
  const cap = Number(mod.match(/CACHE_MAX = (\d+)/)[1]);
  ok("and it is larger than the 3840 stations published today", cap >= 3840);
  ok("anything dropped is counted", /out\.dropped = /.test(mod));
});

await group("a remembered position does not outlive its view", () => {
  /* It existed only to avoid a second geolocation prompt in the same sitting.
     Held for the life of the page, the camera button could never ask again -
     and the 50 m accuracy gate was only ever applied to the first search. */
  ok("it is cleared on navigation", /if \(id !== "stations"\)[\s\S]{0,300}?stationCentre = null/.test(app));
  ok("the camera results go with it", /stationCentre = null;[\s\S]{0,200}?cameraResults = \[\]/.test(app));
});

await group("the module is loaded on both pages, in the right order", () => {
  for (const [name, doc] of [["classic", html], ["wide", wide]]) {
    const at = (re) => doc.search(re);
    const stations = at(/<script src="app\/stations\.js"><\/script>/);
    const appjs = at(/<script src="app\/app\.js"><\/script>/);
    ok(`${name} loads stations.js`, stations > 0);
    ok(`${name} loads stations.js before app.js`, stations > 0 && stations < appjs);
    /* A plain script has no module timing, so a definition that arrives late is
       simply undefined when the search runs. */
    ok(`${name} loads it synchronously`, !/defer|async/.test(doc.slice(stations - 60, stations + 40)));
  }
  ok("the generator is told about it", /app\/stations\.js/.test(shell));
  ok("the service worker precaches it", /"\.\/app\/stations\.js"/.test(sw));
});

await group("the screen has somewhere to put all of this", () => {
  for (const [name, doc] of [["classic", html], ["wide", wide]]) {
    ok(`${name} has a result list`, /id="stationList"/.test(doc));
    ok(`${name} has a detail panel`, /id="stationDetail"/.test(doc));
    ok(`${name} has the show-more control`, /id="stationMore"/.test(doc));
    ok(`${name} has a live-status line`, /id="stationLive"|stationLive/.test(app));
    /* Leaflet measures the element it is given, and a hidden one measures zero,
       so the map comes up blank with no error. */
    ok(`${name} keeps the map box hidden until there is something in it`, /id="stationMapBox" hidden/.test(doc));
    ok(`${name} starts with the detail panel hidden`, /id="stationDetail" hidden/.test(doc));
  }
});

await group("a chosen station fills the form without inventing a price", () => {
  /* Sliced to the next top-level function. Ending the slice at the next
     "function " token stops at `loadLeaflet(function () {`, which silently
     truncated the body and hid the very line being checked. */
  const i = app.indexOf("function useStation");
  const rest = app.slice(i);
  const next = rest.slice(1).search(/^\s*function \w/m);
  const body = next < 0 ? rest : rest.slice(0, next + 1);
  ok("it fills the name", /input\.value = s\.name/.test(body));
  ok("it sets the coordinates", /locGeo = \{ lat: s\.lat, lng: s\.lng/.test(body));
  ok("it reveals the session map", /box\.hidden = false/.test(body));
  ok("it places the pin", /showPin\("sessMap"/.test(body));
  /* Digitraffic has real tariffs, but they are per-operator, change weekly, and
     a wrong one is worse than none. */
  ok("it does not set a price", !/setPrice|priceAuto\s*=|costAuto\s*=/.test(body));
  ok("it does not save a favourite without being asked", !/saveFavourite|favs\.push/.test(body));
});

await group("only a handful of results are shown at once", () => {
  /* A city centre returns hundreds within 10 km. A wall of rows buries the one
     the user came for, so the count is stated and the rest is a button. */
  const i = app.indexOf("var STATION_NEAREST");
  ok("a nearest count exists", i > 0);
  const decl = app.slice(i, app.indexOf(";", i));
  const n = Number(decl.match(/=\s*(\d+)/)[1]);
  ok("and it is small enough to read above the fold", n > 0 && n <= 10);
  ok("the full list is kept separately, so paging needs no re-query", /var stationAll = \[\]/.test(app));
  ok("and the visible list is a slice of it", /stationResults = stationAll\.slice/.test(app) || /res\.rows\.slice/.test(app));
  ok("the show-more button is wired", /\$\("stationMore"\)\.addEventListener/.test(app));
  ok("the count shown is the true total, not the visible count", /var n = stationAll\.length/.test(app));
});

await group("the search reports its own failures", () => {
  ok("offline is checked first", /st\.offline/.test(app));
  ok("a missing geolocation API is handled", /st\.geoUnavailable/.test(app));
  ok("a coarse reading is refused", /acc > LOC_MAX_ACCURACY_M/.test(app));
  ok("a lookup failure is stated, not shown as empty", /st\.lookupFailed/.test(app));
  ok("a stale cache is announced", /st\.cacheStale/.test(app));
  /* The status line is a live region, so a screen reader announces the result
     of a search the user cannot see complete. */
  ok("the status is announced", /id="stationStat"[^>]*aria-live|aria-live[^>]*id="stationStat"/.test(html));
});

await group("results go to their own diagnostics section", () => {
  const rep = app.slice(app.indexOf("function diagnosticsReport"));
  ok("there is a separate event buffer", /var eventLog = \[\]/.test(app));
  ok("it is bounded separately", /var EVENT_MAX = 10/.test(app));
  ok("the raw body is truncated", /EVENT_BODY_MAX = 4000/.test(app));
  ok("the report has its own heading", /STATION LOOKUPS/.test(rep));
  ok("the section comes before the errors", rep.indexOf("STATION LOOKUPS") < rep.indexOf("RECORDED ERRORS"));
  ok("its empty case is not an error", /no search has been run/.test(rep));
  /* A successful lookup filed under ERRORS would print as a fault. */
  ok("a lookup is never filed as an error", !/diag\("station/.test(app));
});

/* The suite is only meaningful if it is running. A module that stopped
   publishing its interface would make every call above throw rather than
   quietly pass, but a group that stopped executing would look like a pass. */
if (pass < 120) {
  console.log(`\nonly ${pass} assertions ran - the suite has gone quiet`);
  failures.push("suite ran too few assertions to be trustworthy");
}

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);

function isNum(v) {
  return v !== null && v !== undefined && v !== "" && isFinite(+v);
}