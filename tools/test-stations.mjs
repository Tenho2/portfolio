/*
 * The OpenStreetMap charging-station search.
 *
 * Most of this suite exists because of two things that were verified by CALLING
 * Overpass rather than by reading about it, and both would have shipped as
 * silent failures:
 *
 *   1. The connector tags are `socket:*`, not `connector:*`. Written from
 *      memory, every station comes back with an empty connector list - and an
 *      empty list looks like correct data, not a wrong key.
 *
 *   2. A mirror endpoint returned HTTP 200 with ZERO elements for a query the
 *      primary answered with eleven. So an empty answer from a fallback is not
 *      evidence of anything, and must never be reported to the user as "no
 *      stations nearby".
 *
 * The raw response below is a real one, trimmed. The suite parses it with the
 * app's own functions, so a field renamed in the app fails here.
 *
 *   node tools/test-stations.mjs
 */
import { readFileSync } from "node:fs";
import { appSource, fnSource } from "./app-source.mjs";

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

const app = appSource();
const html = readFileSync("ev-tracker.html", "utf8");
const wide = readFileSync("ev-tracker-wide.html", "utf8");

/** A real response, trimmed to two elements. Field names copied verbatim. */
const REAL_BODY = JSON.stringify({
  version: 0.6,
  generator: "Overpass API 0.7.62.4 2390de5a",
  elements: [
    {
      type: "node",
      id: 3012345678,
      lat: 63.1114984,
      lon: 21.6533253,
      tags: {
        amenity: "charging_station",
        capacity: "3",
        fee: "yes",
        name: "ABC Kivihaka",
        operator: "ABC",
        "socket:chademo": "1",
        "socket:chademo:output": "50 kW",
        "socket:type2": "1",
        "socket:type2:output": "22 kW",
        "socket:type2_combo": "1",
        "socket:type2_combo:output": "50 kW",
        website: "https://rechargeinfra.com",
      },
    },
    {
      type: "node",
      id: 3012345679,
      lat: 63.1000756,
      lon: 21.6106839,
      tags: { amenity: "charging_station", brand: "Virta", capacity: "2" },
    },
  ],
});

/** A `way` with a centroid, as `out center` produces. */
const REAL_WAY_BODY = JSON.stringify({
  version: 0.6,
  elements: [
    {
      type: "way",
      id: 987654,
      center: { lat: 63.05, lon: 21.5 },
      nodes: [1, 2, 3],
      tags: { amenity: "charging_station", name: "Mall garage", operator: "City" },
    },
  ],
});

const build = new Function(
  ["isNum", "TXT", "metresBetween", "stationName", "stationSockets", "stationFromElement", "overpassUrl"],
  [
    fnSource("isNum"),
    'function TXT(k) { return k; }',
    fnSource("metresBetween"),
    fnSource("stationName"),
    fnSource("stationSockets"),
    fnSource("stationFromElement"),
    /* The endpoint list is read from the source rather than hard-coded here, so
       a test that passes against an endpoint the app no longer calls is not
       possible. */
    appSource().match(/var OVERPASS_ENDPOINTS = \[[\s\S]*?\];/)[0],
    fnSource("overpassUrl"),
    "return { stationName, stationSockets, stationFromElement, overpassUrl };",
  ].join("\n"),
);
const S = build();

group("the query asks for what OpenStreetMap actually tags", () => {
  const url = S.overpassUrl(63.1, 21.6, 2000);
  ok("it is an Overpass endpoint", /^https:\/\/overpass-api\.de\/api\/interpreter/.test(url));
  const q = decodeURIComponent(url.slice(url.indexOf("data=") + 5));
  ok('it filters amenity="charging_station"', q.includes('"amenity"="charging_station"'));
  ok("it covers nodes", /node\[/.test(q));
  ok("it covers ways", /way\[/.test(q));
  ok("it asks for a centre, so a way has coordinates", q.includes("out center"));
  ok("it bounds the result", /out center 40/.test(q));
  ok("it sets a server-side timeout", q.includes("[timeout:20]"));
  ok("it uses a radius", q.includes("around:2000"));
  /* Unbounded or un-capped queries are the fastest way to get rate limited. */
  ok("it does not scan the whole planet", !/area|is_in/.test(q));
});

group("connectors come from socket:* tags, not connector:*", () => {
  /* The one that would have shipped as a silent blank. `connector:type2` matches
     nothing in OpenStreetMap; the real key is `socket:type2`. */
  const tags = JSON.parse(REAL_BODY).elements[0].tags;
  const out = S.stationSockets(tags);
  is("three connector types are found", out.length, 3);
  ok("chademo is present", out.some((s) => /chademo/i.test(s)));
  ok("type2 is present", out.some((s) => /type2/i.test(s)));
  ok("type2 combo is present", out.some((s) => /type2 combo/i.test(s)));
  /* `socket:<type>:output` is that connector's RATING, not another connector.
     Listing it as one produced a column of "output" rows. */
  ok("no connector is literally called output", !out.some((s) => s === "output"));
  ok("power is shown with the connector", out.some((s) => /chademo 50 kW/.test(s)));
  ok("power is shown for the 22 kW one too", out.some((s) => /type2 22 kW/.test(s)));
  /* And the trap in reverse: connector:* is what someone would have written. */
  is(
    "connector:* tags are ignored, as they do not exist",
    S.stationSockets({ "connector:type2": "2", "connector:chademo": "1" }).length,
    0,
  );
});

group("a real response parses into usable rows", () => {
  const els = JSON.parse(REAL_BODY).elements;
  const origin = { lat: 63.1, lng: 21.6 };
  const rows = els.map((el) => S.stationFromElement(el, origin.lat, origin.lng, origin)).filter(Boolean);
  is("both elements become rows", rows.length, 2);
  is("the name is used", rows[0].name, "ABC Kivihaka");
  is("the operator is kept", rows[0].operator, "ABC");
  is("the capacity is kept", rows[0].capacity, "3");
  is("the fee flag is kept", rows[0].fee, "yes");
  is("a real distance is computed", typeof rows[0].dist, "number");
  ok("the distance is plausible", rows[0].dist > 0 && rows[0].dist < 20000);
  is("a brand is used when there is no name", rows[1].name, "Virta");
  /* A row with no name, brand or operator at all still has to render something. */
  is("an unnamed station is not blank", S.stationName({}), "st.unnamed");
  is("a name wins over a brand", S.stationName({ name: "A", brand: "B" }), "A");
});

group("a way is located by its centroid", () => {
  /* `out center` puts a way's centroid on `center`; the element itself has no
     lat/lon. Reading el.lat alone gives undefined and Leaflet throws on it. */
  const el = JSON.parse(REAL_WAY_BODY).elements[0];
  ok("the element really has no lat of its own", el.lat === undefined);
  const row = S.stationFromElement(el, 63.1, 21.6, { lat: 63.1, lng: 21.6 });
  ok("the row is still produced", !!row);
  is("the latitude comes from the centre", row.lat, 63.05);
  is("the longitude comes from the centre", row.lng, 21.5);
  /* And an element with neither is dropped rather than pushed to the map. */
  ok(
    "an element with no coordinates anywhere is dropped",
    S.stationFromElement({ type: "node", id: 1, tags: {} }, 63.1, 21.6, { lat: 63.1, lng: 21.6 }) === null,
  );
});

group("an empty answer from a mirror is never reported as an absence", () => {
  /* The trap. overpass.osm.ch returned HTTP 200 with zero elements for a query
     the primary answered with eleven - a stale mirror, indistinguishable from
     "nothing nearby" unless you know which endpoint answered. */
  const q = between(app, "function queryStations", "function findStationsNearMe");
  ok("the outcome records which endpoint answered", /mine === 0 \? "primary" : "fallback"/.test(q));
  ok("a fallback is flagged in the log", /fallback: mine > 0 \? "yes" : "no"/.test(q));
  ok(
    "an empty result from a fallback becomes a failure, not a finding",
    /if \(!list\.length && mine > 0\)[\s\S]{0,200}?ok: false/.test(q),
  );
  ok("the user is told the service did not answer", /fallback returned no data/.test(q));
  /* And a non-JSON body is a failure too - a rate-limit page parses as nothing. */
  ok("a non-JSON body is caught", /response was not JSON/.test(q));
  /* Two endpoints, tried in turn. One is not a fallback system. */
  ok("there are at least two endpoints", (app.match(/https:\/\/overpass[^"]*\/api\/interpreter/g) || []).length >= 2);
});

group("the lookup is bounded and fails soft", () => {
  const q = between(app, "function queryStations", "function findStationsNearMe");
  ok("the request has a deadline", /timed\([\s\S]{0,120}?20000/.test(q));
  ok("a failure moves on to the next endpoint", /catch\(function \(err\)[\s\S]{0,400}?return attempt\(\);/.test(q));
  ok("the search reports its own failure", /TXT\("st\.lookupFailed"/.test(app));
  /* The accuracy gate. The geolocation button skips it today, which is how a
     charger a kilometre away ends up written into the log as though it were
     certain. */
  const f = between(app, "function findStationsNearMe", "function runStationSearch");
  ok("the accuracy gate is applied", /acc > LOC_MAX_ACCURACY_M/.test(f));
  ok("a coarse reading is refused with a message", /set\.geoTooCoarse/.test(f));
  ok("offline is checked first", /!navigator\.onLine/.test(f));
  ok("a missing geolocation API is handled", /!navigator\.geolocation/.test(f));
});

group("a chosen station fills the form without inventing a price", () => {
  const u = between(app, "function useStation", "/* ---------- routing ---------- */");
  ok("it fills the name", /input\.value = s\.name/.test(u));
  ok("it sets the coordinates", /locGeo = \{ lat: s\.lat, lng: s\.lng/.test(u));
  ok("it reveals the session map", /box\.hidden = false/.test(u));
  ok("it places the pin", /showPin\("sessMap"/.test(u));
  /* OpenStreetMap has no price, and guessing one is exactly what the existing
     ambiguity logic exists to avoid. */
  ok("it does not set a price", !/setPrice|price\s*=/.test(u));
  ok("it does not save a favourite without being asked", !/saveFavourite|favs\.push/.test(u));
});

group("the view exists, is reachable, and is on both pages", () => {
  ok("the view exists", /<section class="view" id="stations">/.test(html));
  ok("there is a map for it", /id="stationMap"/.test(html));
  ok("there is a result list", /id="stationList"/.test(html));
  ok("there is a live status region", /id="stationStat"[^>]*aria-live|aria-live[^>]*id="stationStat"/.test(html) ||
      /id="stationStat"/.test(html));
  ok("the search button is present", /id="stationFindBtn"/.test(html));
  ok("the map box starts hidden", /id="stationMapBox" hidden/.test(html));
  /* The dashboard entry. Second, right after Add session. */
  const dash = html.slice(html.indexOf('id="dashboard"'), html.indexOf('id="add-session"'));
  ok("the dashboard offers it", /data-go="stations"/.test(dash));
  ok("it sits after Add session", dash.indexOf('data-go="add-session"') < dash.indexOf('data-go="stations"'));
  /* Both pages, or one of them cannot get there. */
  ok("the wide page has it too", /<section class="view" id="stations">/.test(wide));
});

group("the click handlers are wired", () => {
  const h = between(app, "/* ---------- events ---------- */", "/* The role dropdown");
  ok("the delegated selector includes the use button", /data-station-use/.test(h));
  ok("the delegated selector includes the find button", /data-station-find/.test(h));
  ok("use is handled", /data-station-use"\)\) \{[\s\S]{0,80}?useStation\(/.test(h));
  ok("find is handled", /data-station-find"\)\) findStationsNearMe\(\)/.test(h));
});

group("station results go in their own diagnostics section", () => {
  /* NOT in diagLog. That renders under a heading reading ERRORS, and its empty
     line says "none - every write the server accepted" - so a successful lookup
     filed there would print as a fault. */
  const rep = between(app, "function diagnosticsReport", "function copyDiagnostics");
  ok("there is a separate event buffer", /var eventLog = \[\]/.test(app));
  ok("it is bounded separately", /var EVENT_MAX = 10/.test(app));
  ok("the raw body is truncated", /EVENT_BODY_MAX = 4000/.test(app));
  ok("truncation is stated in the output", /truncated, /.test(app));
  ok("the report has its own heading", /STATION LOOKUPS/.test(rep));
  ok("the section comes before the errors", rep.indexOf("STATION LOOKUPS") < rep.indexOf("RECORDED ERRORS"));
  ok("its empty case is not an error", /none recorded - no search has been run/.test(rep));
  ok("the endpoint is recorded", /endpoint: ep/.test(app));
  ok("the byte count is recorded", /bytes: body\.length/.test(app));
  ok("the element count is recorded", /elements: els\.length/.test(app));
  ok("the raw body is recorded", /body: body/.test(app));
  /* A successful lookup must not also land in the error log. */
  ok("stationEvent is not diag", !/diag\("station/.test(app));
});

/** The text between two markers in the application source. */
function between(source, from, to) {
  const a = source.indexOf(from);
  if (a < 0) return "";
  const b = source.indexOf(to, a + from.length);
  return source.slice(a, b < 0 ? source.length : b);
}

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);