/*
 * Phase 4: the nearby-charger list in Add Session, and the camera fix.
 *
 * C  The reported problem: "Add session find charger does not show chargers if
 *    saved favourites nearby." That was accurate, and the cause was structural.
 *    useMyLocation() asked nearestPlace(), which only knows your favourites and
 *    your past session locations, and filled the field from the nearest within
 *    1000 m. The Digitraffic registry was never consulted on this screen at all.
 *    A favourite nearby did not merely outrank the registry - it was the only
 *    thing being looked at.
 *
 *    The fix keeps useMyLocation exactly as it was and adds a list underneath.
 *    Three properties are asserted here because each has a way of being wrong
 *    that still looks right:
 *      - ordering: places you have used outrank favourites outrank the registry
 *      - de-duplication: by position AND by name, because one charger showing
 *        twice reads as two findings
 *      - the cap: nearest two per group, not two overall
 *
 * D  The camera search reused the charger search's position to avoid a second
 *    permission prompt. On the same screen minutes apart that is free; once the
 *    user has walked to a different charger it quietly reports cameras for the
 *    old place. It now asks for a current fix, with the old centre kept only as
 *    a fallback when the device will not say.
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
/* Comments blanked: several assertions are "this must not appear", and the
   code says what it avoids in prose - the camera fallback literally reads
   "Reuse the position the station search already resolved". */
const code = app.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const html = readFileSync("ev-tracker.html", "utf8");
const wide = readFileSync("ev-tracker-wide.html", "utf8");
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

/**
 * One function's body, by brace matching.
 *
 * Slicing from one function's index to the NEXT one's index is wrong here:
 * several of the markers used as boundaries sit BEFORE the function being
 * tested, so the slice comes out empty and every assertion in the group passes
 * vacuously or fails for no reason. Brace matching cannot get that wrong.
 */
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

/* The real grouping function, run against stub globals. */
function groups(sessions, favs) {
  const isNum = (v) => v !== null && v !== undefined && v !== "" && isFinite(+v);
  const factory = new Function(
    ["sessions", "favs", "isNum"],
    [
      fnSource("haversine"),
      fnSource("nearbyChargers"),
      fnSource("capGroups"),
      "return { nearbyChargers, capGroups };",
    ].join("\n"),
  );
  const api = factory(sessions, favs, isNum);
  return (stations) => api.capGroups(api.nearbyChargers(H, H, stations), 2);
}

/* A point near Helsinki, and offsets in metres. */
const H = { lat: 60.1699, lng: 24.9384 };
const mNorth = (m) => ({ lat: H.lat + m / 111320, lng: H.lng });
const sess = (id, name, lat, lng, date) => ({ id, location: name, lat, lng, date });
const fav = (id, name, lat, lng) => ({ id, name, address: name, lat, lng });
const st = (id, name, lat, lng) => ({ id, name, lat, lng, plugs: [], power: "" });

/* ---------- C: grouping and de-duplication ---------- */

group("the three groups come out in priority order", () => {
  const g = groups(
    [sess("s1", "Kivihaka", mNorth(100).lat, mNorth(100).lng, "2026-10-01")],
    [fav("f1", "P-Eliel", mNorth(300).lat, mNorth(300).lng)],
    [st("n1", "Stockmann", mNorth(500).lat, mNorth(500).lng)],
  )([st("n1", "Stockmann", mNorth(500).lat, mNorth(500).lng)]);
  is("one from each group", g.sessions.length + g.favs.length + g.stations.length, 3);
  is("the place you charged at is first", g.sessions[0].name, "Kivihaka");
  is("then the favourite", g.favs[0].name, "P-Eliel");
  is("then the registry", g.stations[0].name, "Stockmann");
});

group("one charger is never listed twice", () => {
  /* The whole point of the ordering. A charger you have used and a registry row
     for it are ONE place; showing both makes the list look richer than it is,
     and "nearby stations" is the least trustworthy of the three labels. */
  const p = mNorth(50);
  const g = groups(
    [sess("s1", "Kivihaka", p.lat, p.lng, "2026-10-01")],
    [],
    [st("n1", "Kivihaka", p.lat, p.lng)],
  )([st("n1", "Kivihaka", p.lat, p.lng)]);
  is("the registry row is dropped", g.stations.length, 0);
  is("and only one row appears", g.sessions.length + g.favs.length + g.stations.length, 1);
  is("kept from the higher group", g.sessions[0].name, "Kivihaka");
});

group("de-duplication is by position, even when the names differ", () => {
  /* Two spellings of one charger are not two choices to offer. */
  const p = mNorth(80);
  const g = groups(
    [],
    [fav("f1", "P-Eliel", p.lat, p.lng)],
    [st("n1", "P-Eliel Kivihaka", p.lat + 0.0001, p.lng + 0.0001)],
  )([st("n1", "P-Eliel Kivihaka", p.lat + 0.0001, p.lng + 0.0001)]);
  is("the favourite keeps the slot", g.favs.length, 1);
  is("the registry row is dropped", g.stations.length, 0);
});

group("de-duplication is by name, even when the pins differ", () => {
  /* The reverse case: the same name recorded twice at coordinates far enough
     apart to be different pins, which is what happens when one is dragged. */
  const g = groups(
    [sess("s1", "Kivihaka", mNorth(100).lat, mNorth(100).lng, "2026-10-01")],
    [],
    [st("n1", "kivihaka", mNorth(900).lat, mNorth(900).lng)],
  )([st("n1", "kivihaka", mNorth(900).lat, mNorth(900).lng)]);
  is("the second spelling is dropped", g.stations.length, 0);
  is("name matching ignores case", g.sessions.length, 1);
});

group("genuinely different chargers all survive de-duplication", () => {
  /* The opposite trap: de-duplication that is too eager hides real choices.
     Checked on the grouped result BEFORE the display cap, because the cap is
     separately specified as two per group and would otherwise mask this. */
  const rows = [0, 300, 700].map((m, i) => st("n" + i, "ABCD"[i], mNorth(m).lat, mNorth(m).lng));
  const isNum = (v) => v !== null && v !== undefined && v !== "" && isFinite(+v);
  const api = new Function(
    ["sessions", "favs", "isNum"],
    [
      fnSource("haversine"),
      fnSource("nearbyChargers"),
      fnSource("capGroups"),
      "return { nearbyChargers, capGroups };",
    ].join("\n"),
  )([], [], isNum);
  const grouped = api.nearbyChargers(H, H, rows);
  is("three distinct stations survive", grouped.stations.length, 3);
  /* And the cap then limits what is shown, which is a different decision. */
  is("and the cap limits it to two", api.capGroups(grouped, 2).stations.length, 2);
});

group("two of each, not two overall", () => {
  const many = (p) => Array.from({ length: 5 }, (_, i) => sess("s" + i, "Place " + i, mNorth(i * 120).lat, mNorth(i * 120).lng, "2026-10-0" + (i + 1)));
  const g = groups(many(), [], [])();
  is("at most two past sessions", g.sessions.length, 2);
  ok("and never more", g.sessions.length <= 2);
  /* Most recent first, so the place used yesterday beats last summer's. */
  is("the most recent leads", g.sessions[0].name, "Place 4");
  const g2 = groups([], many(), [])();
  is("at most two favourites", g2.favs.length, 2);
});

group("the most recent charge is the one offered", () => {
  const g = groups(
    [
      sess("old", "Old place", mNorth(100).lat, mNorth(100).lng, "2026-01-01"),
      sess("new", "New place", mNorth(200).lat, mNorth(200).lng, "2026-10-01"),
    ],
    [],
    [],
  )();
  is("two rows", g.sessions.length, 2);
  is("newest first", g.sessions[0].name, "New place");
});

group("rows without coordinates are not offered", () => {
  const g = groups(
    [
      sess("noCoord", "Nowhere", null, null, "2026-10-01"),
      sess("ok", "Somewhere", mNorth(100).lat, mNorth(100).lng, "2026-10-02"),
    ],
    [fav("bad", "Also nowhere", undefined, undefined)],
    [],
  )();
  is("only the one with a position", g.sessions.length, 1);
  is("and the favourite is skipped too", g.favs.length, 0);
});

/* ---------- C: wiring ---------- */

group("Near me still fills the field exactly as before", () => {
  /* The user asked for this function to be kept. It still fills from the
     nearest known place; the list is additive. */
  const fn = fnOf("useMyLocation");
  ok("the slice found the function", fn.length > 500);
  ok("it still asks nearestPlace", /nearestPlace\(lat, lng\)/.test(fn));
  ok("it still fills the location field", fn.includes('$("location").value = near.p.address'));
  ok("it still pins it", /showPin\(\s*"sessMap"/.test(fn));
  ok("it still uses the 1000 m threshold", /threshold = 1000/.test(fn));
  /* And the new list is built in every branch, including the one where a saved
     place filled the field - which is exactly the reported bug. */
  ok("and builds the list from what it knows", /nearbyChargers\(lat, lng, \[\]\)/.test(fn));
  ok("then asks the registry", /loadNearStations\(lat, lng, mine\)/.test(fn));
});

group("the list is a real control, not decoration", () => {
  for (const [name, doc] of [["classic", html], ["wide", wide]]) {
    ok(`${name} has the container`, /id="locNear"/.test(doc));
    ok(`${name} keeps it hidden until filled`, /id="locNear" hidden/.test(doc));
  }
  /* Each row carries its own position, so the name cannot drift from the pin. */
  ok("rows carry a latitude", /data-near-lat=/.test(code));
  ok("and a longitude", /data-near-lng=/.test(code));
  ok("and a name", /data-near-name=/.test(code));
  ok("clicking one fills the form", /classList\.contains\("loc-near-row"\)/.test(code));
  ok("with that exact position", /useNearbyPlace\(\s*t\.getAttribute\("data-near-lat"\)/.test(code));
});

group("the groups are labelled, and the labels say what they are", () => {
  for (const k of ["locNearUsed", "locNearSaved", "locNearStation"]) {
    ok(`${k} is translated`, value("en", k) && value("fi", k) && value("sv", k));
  }
  ok("the heading order matches the priority", /locNearUsed[\s\S]{0,200}locNearSaved[\s\S]{0,200}locNearStation/.test(code));
  /* The middle label has to be "favourites", not something vaguer: it is the
     group the user curated by hand, and that is exactly what makes it outrank
     the registry. */
  ok("and the second group is named as favourites", /favourites/i.test(value("en", "locNearSaved")));
  ok("and the first as places already used", /charged here before/i.test(value("en", "locNearUsed")));
});

group("the registry lookup cannot hide the local groups", () => {
  const fn = fnOf("loadNearStations");
  ok("it reuses the cached registry", /StationData\.findStations/.test(fn));
  ok("within a stated radius", /LOC_RADIUS_M/.test(fn));
  /* A failed charger search is no reason to throw away a favourite the user can
     already see, so the error path must not clear the list. */
  ok("it ignores its own failure", /\.catch\(function \(\) \{/.test(fn));
  const catchBody = fn.slice(fn.indexOf(".catch("));
  ok("and leaves what is on screen", !/renderNearby\(\{/.test(catchBody) && !/box\.innerHTML = ""/.test(catchBody.slice(0, 400)));
  /* The first two groups are local and appear before the registry is asked. */
  ok("the local groups render first", /renderNearby\(capGroups\(nearbyChargers\(lat, lng, \[\]\), 2\)\)/.test(code));
});

group("a stale registry answer cannot replace a newer one", () => {
  ok("there is a token", /var nearToken = 0/.test(code));
  ok("the load claims one", /\+\+nearToken/.test(code));
  ok("and the response checks it", /if \(mine !== nearToken\) return/.test(code));
});

/* ---------- D: cameras ---------- */

group("the camera search asks for a current fix", () => {
  const fn = fnOf("findCamerasNearMe");
  /* The reuse was to avoid a second prompt, which is fair on the same screen
     minutes apart and wrong once the user has walked to another charger. */
  /* The fallback in the error path is deliberate - see the next group. What
     must NOT happen is the SUCCESS path returning early on a remembered
     centre, which is what it used to do. */
  const success = fn.slice(fn.indexOf("getCurrentPosition")).split("function () {")[0];
  ok("the success path does not reuse the station centre", !/if \(stationCentre\)/.test(success));
  ok("nor does it return before asking", !/return;\s*\}/.test(success.slice(0, 200)));
  ok("it asks the device", /getCurrentPosition/.test(fn));
  /* 60 s keeps it cheap when nothing has changed, so this is usually not even
     a new prompt. */
  ok("with a short maximumAge", /maximumAge: 60000/.test(fn));
  ok("and still records the accuracy", /cameraFixM = isNum\(p\.coords\.accuracy\)/.test(fn));
});

group("a refused fix falls back rather than failing", () => {
  const fn = fnOf("findCamerasNearMe");
  /* A stale centre shows nearby cameras, labelled as such. No centre shows
     none at all, which is a worse answer for no good reason. */
  ok("it falls back to the last known centre", /if \(stationCentre\)/.test(fn));
  ok("and says that is what it did", /cam\.usedStationFix/.test(fn));
  ok("which is translated", value("en", "cam.usedStationFix") && value("fi", "cam.usedStationFix") && value("sv", "cam.usedStationFix"));
});

group("the per-station camera control survives", () => {
  ok("the button is still in the detail panel", /data-station-cameras=/.test(code));
  ok("and is still wired", /data-station-cameras"\)\) \{/.test(code));
  ok("and still searches from the station", /findCameras\(\{ lat: s\.lat, lng: s\.lng \}/.test(code));
});

group("the cameras say what they are, without being asked", () => {
  /* The obvious reading of a camera icon on a Finnish road is a fine. This
     feed contains no speed cameras at all. */
  const note = value("en", "cam.note");
  ok("the note says so", /not speed cameras/i.test(note));
  ok("and says what they are", /road-condition/i.test(note));
  ok("in every language", value("fi", "cam.note") && value("sv", "cam.note"));
/* The Finnish word is written with an escape rather than a literal. A shell
   here-string mangled the character to "?" once, which turned this into a test
   that could never pass and no amount of looking at the string would explain
   why. */
ok("Finnish says what they are", /tiekamerat/i.test(value("fi", "cam.note")));
ok("and denies they are speed cameras", /eivät nopeuskamerat/i.test(value("fi", "cam.note")));
  ok("Swedish says the same", /inte hastighetskameror/i.test(value("sv", "cam.note")));
  ok("it is on the page, not behind a tooltip", /data-i18n="cam\.note"/.test(html));
});

if (pass < 60) {
  console.log(`\nonly ${pass} assertions ran - the suite has gone quiet`);
  failures.push("too few assertions to be trustworthy");
}

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);