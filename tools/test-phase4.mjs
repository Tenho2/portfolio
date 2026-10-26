/*
 * Phase 4: the nearby-charger list in Add Session, and the camera fix.
 *
 * C  The reported problem: "Add session find charger does not show chargers if
 *    saved favourites nearby." The registry is now always consulted, and the
 *    results are flattened into one gravity-sorted list:
 *      - saved and previously used places receive a 1500 m benefit;
 *      - the true distance is still what every row displays;
 *      - rank #1 is also the auto-fill target;
 *      - the same 10 km radius bounds local places and registry stations.
 *
 * D  The camera search asks for a current fix. The old centre is a fallback
 *    only when the device will not say.
 *
 *   node tools/test-phase4.mjs
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
  else failures.push(`${label}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

const app = appSource();
const code = app.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const html = readFileSync("ev-tracker.html", "utf8");
const focusPage = readFileSync("ev-tracker-focus.html", "utf8");
const i18 = readFileSync("app/i18n.js", "utf8");

function value(lang, key) {
  const marks = [...i18.matchAll(/^\s*(en|fi|sv):\s*\{/gm)];
  const i = marks.findIndex((m) => m[1] === lang);
  const start = marks[i].index;
  const end = i + 1 < marks.length ? marks[i + 1].index : i18.length;
  const m = new RegExp('"' + key.replace(/\./g, "\\.") + '":\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(
    i18.slice(start, end),
  );
  return m ? m[1] : null;
}

function fnOf(name, from = 0) {
  const i = code.indexOf(`function ${name}(`, from);
  if (i < 0) return "";
  let depth = 0;
  for (let j = code.indexOf("{", i); j < code.length; j++) {
    if (code[j] === "{") depth++;
    else if (code[j] === "}") {
      depth--;
      if (depth === 0) return code.slice(i, j + 1);
    }
  }
  return "";
}

/* The real gravity-sorted list, run against stub globals. */
function nearbyApi(sessions, favs) {
  const isNum = (v) => v !== null && v !== undefined && v !== "" && isFinite(+v);
  const factory = new Function(
    ["sessions", "favs", "isNum"],
    [
      "var NEAR_SOURCE_BONUS_M = 1500;",
      "var NEAR_STATION_RADIUS_M = 10000;",
      fnSource("haversine"),
      fnSource("nearbyChargers"),
      fnSource("nearbyRank"),
      fnSource("flattenNearby"),
      "return { nearbyChargers, flattenNearby, nearbyRank };",
    ].join("\n"),
  );
  return factory(sessions, favs, isNum);
}
const H = { lat: 60.1699, lng: 24.9384 };
const mNorth = (m) => ({ lat: H.lat + m / 111320, lng: H.lng });
const sess = (id, name, lat, lng, date) => ({ id, location: name, lat, lng, date });
const fav = (id, name, lat, lng) => ({ id, name, address: name, lat, lng });
const st = (id, name, lat, lng) => ({ id, name, lat, lng, plugs: [], power: "" });
function flat(sessions, favs) {
  const api = nearbyApi(sessions, favs);
  return (stations) => api.flattenNearby(api.nearbyChargers(H.lat, H.lng, stations || []));
}

/* ---------- distance formatter ---------- */

group("fmtDistance is a person-readable, localised distance", () => {
  const fmtDistance = new Function(
    [
      fnSource("isNum"),
      "var LOCALE = 'fi-FI'; var numFmtCache = {};",
      fnSource("fmtNum"),
      fnSource("fmtDistance"),
      "return fmtDistance;",
    ].join("\n"),
  )();
  is("below a kilometre", fmtDistance(900), "900 m");
  is("rounds the metre branch", fmtDistance(949.6), "950 m");
  is("one decimal kilometre", fmtDistance(1100), "1,1 km");
  is("the reported distance", fmtDistance(6527), "6,5 km");
  is("ten-kilometre distance", fmtDistance(10100), "10,1 km");
  is("the rounding boundary becomes a kilometre", fmtDistance(999.6), "1,0 km");
});

/* ---------- gravity ordering and de-duplication ---------- */

group("the flat list is gravity-sorted", () => {
  const list = flat(
    [sess("s1", "Used 100 m", mNorth(100).lat, mNorth(100).lng, "2026-10-01")],
    [fav("f1", "Saved 300 m", mNorth(300).lat, mNorth(300).lng)],
  )([st("n1", "Station 500 m", mNorth(500).lat, mNorth(500).lng)]);
  is("three rows", list.length, 3);
  is("used place first", list[0].name, "Used 100 m");
  is("saved second", list[1].name, "Saved 300 m");
  is("station third", list[2].name, "Station 500 m");
});

group("a saved place within 1.5 km beats a closer station", () => {
  const list = flat(
    [],
    [fav("f1", "Saved 1.4 km", mNorth(1400).lat, mNorth(1400).lng)],
  )([st("n1", "Station 300 m", mNorth(300).lat, mNorth(300).lng)]);
  is("saved first", list[0].name, "Saved 1.4 km");
  is("station second", list[1].name, "Station 300 m");
});

group("a far saved place loses to a closer station but is not dropped", () => {
  const list = flat(
    [],
    [fav("f1", "Far favourite", mNorth(6500).lat, mNorth(6500).lng)],
  )([st("n1", "Nearby charger", mNorth(300).lat, mNorth(300).lng)]);
  is("station first", list[0].name, "Nearby charger");
  is("far favourite still listed", list[1].name, "Far favourite");
});

group("a saved place beyond the bonus loses to a closer station", () => {
  const list = flat(
    [],
    [fav("f1", "Saved 1.6 km", mNorth(1600).lat, mNorth(1600).lng)],
  )([st("n1", "Station here", mNorth(0).lat, mNorth(0).lng)]);
  is("station wins", list[0].name, "Station here");
  const api = nearbyApi([], []);
  is(
    "the 1.5 km bonus creates an exact tie",
    api.nearbyRank({ dist: 1500, kind: "favourite" }),
    api.nearbyRank({ dist: 0, kind: "station" }),
  );
});

group("one charger is never listed twice", () => {
  const p = mNorth(50);
  const list = flat(
    [sess("s1", "Kivihaka", p.lat, p.lng, "2026-10-01")],
    [],
  )([st("n1", "Kivihaka", p.lat, p.lng)]);
  is("only one row", list.length, 1);
  is("kept from the higher-priority source", list[0].kind, "session");
});

group("de-duplication is by position, even when the names differ", () => {
  const p = mNorth(80);
  const list = flat(
    [],
    [fav("f1", "P-Eliel", p.lat, p.lng)],
  )([st("n1", "P-Eliel Kivihaka", p.lat + 0.0001, p.lng + 0.0001)]);
  is("one row", list.length, 1);
  is("favourite keeps the slot", list[0].kind, "favourite");
});

group("de-duplication is by name, even when the pins differ", () => {
  const list = flat(
    [sess("s1", "Kivihaka", mNorth(100).lat, mNorth(100).lng, "2026-10-01")],
    [],
  )([st("n1", "kivihaka", mNorth(900).lat, mNorth(900).lng)]);
  is("name matching ignores case", list.length, 1);
  is("the session remains", list[0].kind, "session");
});

group("a local place beyond the 10 km radius is not a near-me answer", () => {
  const far = flat(
    [],
    [fav("f1", "1000 km away", mNorth(1000000).lat, mNorth(1000000).lng)],
  )();
  is("nothing is offered", far.length, 0);
  const near = flat(
    [],
    [fav("f1", "1000 km away", mNorth(1000000).lat, mNorth(1000000).lng)],
  )([st("n1", "Nearby charger", mNorth(300).lat, mNorth(300).lng)]);
  is("only the nearby station survives", near.length, 1);
  is("and it is the station", near[0].kind, "station");
});

/* ---------- list rendering and auto-fill ---------- */

group("the nearby list is a flat source-labelled list", () => {
  ok("one list container", /loc-near-list/.test(code));
  ok(
    "used/saved/station labels are rendered",
    /locNearUsed/.test(code) &&
      /locNearSaved/.test(code) &&
      /locNearStation/.test(code),
  );
  ok("distances use the formatter", /fmtDistance\(p\.dist\)/.test(code));
  for (const [name, doc] of [["classic", html], ["focus", focusPage]]) {
    ok(`${name} has the container`, /id="locNear"/.test(doc));
    ok(`${name} keeps it hidden until filled`, /id="locNear" hidden/.test(doc));
  }
  ok("rows carry a latitude", /data-near-lat=/.test(code));
  ok("and a longitude", /data-near-lng=/.test(code));
  ok("and a name", /data-near-name=/.test(code));
  ok("clicking one fills the form", /classList\.contains\("loc-near-row"\)/.test(code));
  ok("with that exact position", /useNearbyPlace\(\s*t\.getAttribute\("data-near-lat"\)/.test(code));
});

group("Near me builds the local list before the registry answers", () => {
  const fn = fnOf("useMyLocation");
  ok("the slice found the function", fn.length > 500);
  ok("it builds the local flat list", /flattenNearby\(nearbyChargers\(lat, lng, \[\]\)\)/.test(fn));
  ok("home still wins within 100 m", /homeFavourite\(lat, lng, 100\)/.test(fn));
  ok("only a local top within 250 m is filled immediately", /localTop\.dist <= 250/.test(fn));
  ok("it renders that local list", /renderNearby\(local\)/.test(fn));
  ok("then asks the registry", /loadNearStations\(lat, lng, mine\)/.test(fn));
  ok("it no longer uses nearestPlace", !/nearestPlace\(/.test(fn));
});

group("nearby results are drawn on the session map through the shared pin factory", () => {
  const factory = fnOf("numberedPin");
  const draw = fnOf("drawNumberedPins");
  const station = fnOf("drawStationPins");
  const session = fnOf("drawSessionNearby");
  const nearMe = fnOf("useMyLocation");
  const load = fnOf("loadNearStations");

  ok("one shared numbered marker factory", /L\.marker/.test(factory) && /L\.divIcon/.test(factory));
  ok("it uses the numbered station pin styling", /station-pin/.test(factory) && /station-num/.test(factory));
  ok("marker clicks do not bubble to the map", /bubblingMouseEvents:\s*false/.test(factory));
  ok("the factory is the only marker creator", !/L\.marker/.test(station) && !/L\.marker/.test(session));
  ok("both maps use the shared collection drawer", /drawNumberedPins\(/.test(station) && /drawNumberedPins\(/.test(session));
  ok("the shared drawer installs a per-marker click handler", /m\.on\(\s*"click",\s*onClick\)/.test(factory));
  ok("the shared drawer captures the row and its index", /function \(item, index\)/.test(draw) && /clickFor\(item, index\)/.test(draw));
  ok("the shared drawer replaces old markers", /removeLayer\(slot\[key\]\[i\]\)/.test(draw) && /slot\[key\] = \[\]/.test(draw));
  ok("the session map stores nearPins", /"nearPins"/.test(session));
  ok("nearby marker clicks reuse the list selection", /useNearbyPlace\(p\.lat,\s*p\.lng,\s*p\.name,\s*p\.price\)/.test(session));
  ok("the user dot is drawn", /drawUserLocation\(slot, lat, lng\)/.test(session));
  ok("bounds include the visible results", /fitBounds\(L\.latLngBounds\(points\)/.test(session));
  ok("local results draw immediately", /drawSessionNearby\(local, lat, lng\)/.test(nearMe));
  ok("both registry outcomes draw the merged/local list", (load.match(/drawSessionNearby\(list, lat, lng\)/g) || []).length === 2);
  ok("starting Near me clears old overlays", /clearSessionNearby\(\)/.test(nearMe));
  ok("resetting the session clears old overlays", /clearSessionNearby\(\)/.test(fnOf("resetSessionFormState")));
});

group("the shared drawer binds each marker to its own row", () => {
  const factory = new Function(
    "L",
    "isNum",
    [
      fnSource("numberedPin"),
      fnSource("drawNumberedPins"),
      "return { drawNumberedPins: drawNumberedPins };",
    ].join("\n"),
  );
  const created = [];
  const removed = [];
  const L = {
    marker(coord, opts) {
      const m = {
        coord,
        opts,
        bindPopup(html) {
          m.popup = html;
          return m;
        },
        on(event, fn) {
          if (event === "click") m.click = fn;
          return m;
        },
        addTo(map) {
          m.map = map;
          created.push(m);
          return m;
        },
        getLatLng() {
          return { lat: coord[0], lng: coord[1] };
        },
      };
      return m;
    },
    divIcon(opts) {
      return opts;
    },
  };
  const api = factory(L, (v) => v !== "" && isFinite(+v));
  const map = {
    removeLayer(layer) {
      removed.push(layer);
    },
  };
  const slot = { map };
  const clicks = [];
  const list = [
    { name: "First", lat: 1, lng: 2 },
    { name: "Second", lat: 3, lng: 4 },
  ];
  const pins = api.drawNumberedPins(
    slot,
    "nearPins",
    list,
    (p) => p.name,
    (p, i) => clicks.push(p.name + ":" + i),
  );
  is("both rows become pins", pins.length, 2);
  is("the shared styling is used", created[0].opts.icon.className, "station-pin");
  is("the number is one-based", created[1].opts.icon.html, '<span class="station-num">2</span>');
  pins[1].click();
  is("each marker captures its own row", clicks[0], "Second:1");
  api.drawNumberedPins(slot, "nearPins", [list[0]], () => "", null);
  is("the old markers are removed", removed.length, 2);
});

group("rank #1 is the only auto-fill target", () => {
  const fill = fnOf("fillFromNearbyTop");
  const correct = fnOf("correctToBestNearby");
  ok("the top item is applied", /fillFromNearbyTop\(input, top\)/.test(correct));
  ok("it stores the gravity rank", /nearFill\.rank = nearbyRank\(p\)/.test(fill));
  ok("a filled field is only replaced by a better rank", /rank < nearFill\.rank/.test(correct));
  ok("typing is never overwritten", /typed !== nearFill\.value/.test(correct));
  ok("the local fallback can fill too", /correctToBestNearby\(list\[0\] \|\| null\)/.test(fnOf("loadNearStations")));
});

group("the registry lookup uses 10 km and cannot hide local places", () => {
  const fn = fnOf("loadNearStations");
  ok("it reuses the cached registry", /StationData\.findStations/.test(fn));
  ok("within the station radius", /NEAR_STATION_RADIUS_M/.test(fn));
  ok("it does not use the 100 m location radius", !/LOC_RADIUS_M/.test(fn));
  ok("it keeps the local list on failure", /flattenNearby\(nearbyChargers\(lat, lng, \[\]\)\)/.test(fn));
  ok("it re-checks the token after failure", /if \(mine !== nearToken\) return/.test(fn));
});

group("a stale registry answer cannot replace a newer one", () => {
  ok("there is a token", /var nearToken = 0/.test(code));
  ok("the load claims one", /\+\+nearToken/.test(code));
  ok("and the response checks it", /if \(mine !== nearToken\) return/.test(code));
});

group("station and camera distances use the same formatter", () => {
  ok("station list uses fmtDistance", /fmtDistance\(s\.dist\)/.test(code));
  ok("camera cards use fmtDistance", /fmtDistance\(c\.dist\)/.test(code));
  ok("the map popup uses fmtDistance", /TXT\("st\.away", \{ d: fmtDistance\(s\.dist\) \}\)/.test(code));
  ok("st.away no longer carries a metre suffix", value("en", "st.away") === "{d} away");
  ok("toast.geoNear no longer carries a metre suffix", value("en", "toast.geoNear") === "Near {v} — {d}, used as the location.");
});

/* ---------- D: cameras ---------- */

group("the camera search asks for a current fix", () => {
  const fn = fnOf("findCamerasNearMe");
  const success = fn.slice(fn.indexOf("getCurrentPosition")).split("function () {")[0];
  ok("the success path does not reuse the station centre", !/if \(stationCentre\)/.test(success));
  ok("nor does it return before asking", !/return;\s*\}/.test(success.slice(0, 200)));
  ok("it asks the device", /getCurrentPosition/.test(fn));
  ok("with a short maximumAge", /maximumAge: 60000/.test(fn));
  ok("and still records the accuracy", /cameraFixM = isNum\(p\.coords\.accuracy\)/.test(fn));
});

group("a refused fix falls back rather than failing", () => {
  const fn = fnOf("findCamerasNearMe");
  ok("it falls back to the last known centre", /if \(stationCentre\)/.test(fn));
  ok("and says that is what it did", /cam\.usedStationFix/.test(fn));
  ok("which is translated", value("en", "cam.usedStationFix") && value("fi", "cam.usedStationFix") && value("sv", "cam.usedStationFix"));
});

group("the per-station cameras load without a second tap", () => {
  const open = fnSource("openStationDetail");
  const near = fnSource("camerasNearStation");
  ok("opening a station loads its cameras", /camerasNearStation\(id\)/.test(open));
  ok("and searches from the station's own position", /findCameras\(\{ lat: s\.lat, lng: s\.lng \}/.test(near));
  ok("within a 10 km radius", /STATION_CAMERA_RADIUS_M/.test(near) && /STATION_CAMERA_RADIUS_M = 10000/.test(code));
  ok("the manual button is gone", !/data-station-cameras/.test(code));
});

group("the cameras are credited below the map", () => {
  ok("no long note remains in the dictionary", !value("en", "cam.note") && !value("fi", "cam.note") && !value("sv", "cam.note"));
  ok("the credit is translated", /Digitraffic/.test(value("en", "cam.credit")) && value("fi", "cam.credit") && value("sv", "cam.credit"));
  for (const doc of [html, focusPage])
    ok("the credit follows the map", doc.indexOf('id="stationMapBox"') < doc.indexOf('data-i18n="cam.credit"'));
  ok("the credit is on the page", /data-i18n="cam\.credit"/.test(html));
});

if (pass < 60) {
  console.log(`\nonly ${pass} assertions ran - the suite has gone quiet`);
  failures.push("too few assertions to be trustworthy");
}

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
