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