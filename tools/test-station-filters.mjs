/**
 * Station filtering, sorting and operator extraction.
 *
 * The feed is messy: operator is often blank or generic and the brand lives in
 * the station name. These tests pin the pure helpers and the UI wiring that
 * makes the filter controls authoritative over the list and map.
 *
 *   node tools/test-station-filters.mjs
 */
import { readFileSync } from "node:fs";
import { appSource, fnSource } from "./app-source.mjs";

const app = appSource();
const html = readFileSync("ev-tracker.html", "utf8");
const hud = readFileSync("tools/hud-body.html", "utf8");
const i18n = readFileSync("app/i18n.js", "utf8");
const sw = readFileSync("sw.js", "utf8");

let pass = 0;
const failures = [];
function ok(label, condition) {
  if (condition) pass++;
  else failures.push(label);
}
function is(label, actual, expected) {
  if (Object.is(actual, expected)) pass++;
  else
    failures.push(
      `${label}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}
function constOf(name) {
  const m = app.match(new RegExp(`var ${name}\\s*=\\s*[^;]+;`));
  if (!m) throw new Error(`const ${name} not found`);
  return m[0];
}
const isNum = (v) => v !== null && v !== undefined && v !== "" && isFinite(+v);

function filterApi() {
  const state = {
    power: "any",
    connectors: {},
    operators: {},
    operatorSearch: "",
    sort: "distance",
  };
  const factory = new Function(
    "isNum",
    "stationFilters",
    [
      constOf("STATION_OPERATOR_PATTERNS"),
      constOf("STATION_GENERIC_OPERATOR"),
      fnSource("knownOperator"),
      fnSource("extractOperator"),
      fnSource("stationPowerKw"),
      fnSource("stationPowerMatches"),
      fnSource("stationConnectors"),
      fnSource("stationOperatorKey"),
      fnSource("stationFiltersActive"),
      fnSource("stationMatchesFilters"),
      fnSource("sortStationRows"),
      "return { extractOperator, stationPowerKw, stationPowerMatches, stationConnectors, stationOperatorKey, stationFiltersActive, stationMatchesFilters, sortStationRows };",
    ].join("\n"),
  );
  return { state, api: factory(isNum, state) };
}

function row(overrides) {
  return Object.assign(
    { id: "x", name: "Station", operator: "", power: "", plugs: [], poles: [], dist: 100 },
    overrides,
  );
}

group("operator extraction recovers brands from messy rows", () => {
  const { api } = filterApi();
  is("explicit operator", api.extractOperator(row({ operator: "Virta" })), "Virta");
  is(
    "brand in the name when operator is generic",
    api.extractOperator(row({ operator: "Charging station", name: "ABC Lataus Tampere" })),
    "ABC",
  );
  is(
    "K-Lataus in the name",
    api.extractOperator(row({ name: "K-Lataus Pirkkala" })),
    "K-Lataus",
  );
  is(
    "ABS in the name",
    api.extractOperator(row({ name: "ABS Lataus Espoo" })),
    "ABS",
  );
  is(
    "Ionity in the name",
    api.extractOperator(row({ operator: null, name: "Ionity Helsinki" })),
    "Ionity",
  );
  is(
    "known brand in an explicit company string",
    api.extractOperator(row({ operator: "Helen Oy" })),
    "Helen",
  );
  is(
    "non-generic explicit operator is preserved",
    api.extractOperator(row({ operator: "Local Energy Co" })),
    "Local Energy Co",
  );
  is(
    "generic local-language operator falls back to the name",
    api.extractOperator(row({ operator: "Lataus", name: "Virta Tampere" })),
    "Virta",
  );
  is(
    "generic public operator falls back to the name",
    api.extractOperator(
      row({ operator: "Public charging station", name: "Ionity Lahti" }),
    ),
    "Ionity",
  );
  is(
    "nothing invented for an unknown name",
    api.extractOperator(row({ name: "Roadside Charger 7" })),
    "",
  );
});

group("power and connector helpers understand both data sources", () => {
  const { api } = filterApi();
  is("summary power", api.stationPowerKw(row({ power: "50 kW" })), 50);
  is(
    "OSM socket rating",
    api.stationPowerKw(row({ plugs: ["type2 22 kW", "ccs"] })),
    22,
  );
  is(
    "per-pole watts",
    api.stationPowerKw(row({ poles: [{ watts: 150000 }] })),
    150,
  );
  is("unknown power", api.stationPowerKw(row({})), null);

  const ccs = api.stationConnectors(row({ plugs: ["Type 2 combo"] }));
  is("Type 2 combo is CCS", ccs.ccs, 1);
  is("but not AC Type 2", ccs.type2, undefined);
  const both = api.stationConnectors(row({ plugs: ["CHAdeMO", "Type 2"] }));
  is("CHAdeMO", both.chademo, 1);
  is("Type 2", both.type2, 1);
  const osm = api.stationConnectors(row({ plugs: ["ccs", "type2 22 kW"] }));
  is("OSM CCS", osm.ccs, 1);
  is("OSM Type 2", osm.type2, 1);
});

group("filters use OR within groups and AND between groups", () => {
  const { state, api } = filterApi();
  const rows = [
    row({ id: "a", name: "Virta 50", operator: "Virta", power: "50 kW", plugs: ["CCS"], dist: 100 }),
    row({ id: "b", name: "ABC 22", operator: "ABC", power: "22 kW", plugs: ["CHAdeMO"], dist: 200 }),
    row({ id: "c", name: "Other 50", operator: "Other", power: "50 kW", plugs: ["CCS"], dist: 50 }),
    row({ id: "d", name: "Unknown", power: "", plugs: [], dist: 10 }),
  ];

  state.power = "min50";
  is("the 50+ tier excludes 22 kW", rows.filter(api.stationMatchesFilters).length, 2);

  state.power = "any";
  state.connectors = { ccs: 1, chademo: 1 };
  is("connector selections are ORed", rows.filter(api.stationMatchesFilters).length, 3);

  state.connectors = {};
  state.operators = { Virta: 1, ABC: 1 };
  is("operator selections are ORed", rows.filter(api.stationMatchesFilters).length, 2);

  state.connectors = { ccs: 1 };
  state.operators = { Virta: 1 };
  state.power = "min50";
  is(
    "groups are ANDed",
    rows.filter(api.stationMatchesFilters).map((r) => r.id).join(","),
    "a",
  );

  state.power = "any";
  state.connectors = {};
  state.operators = {};
  is("no filters pass everything", rows.filter(api.stationMatchesFilters).length, 4);
});

group("power tiers include their exact boundaries", () => {
  const { api } = filterApi();
  const rows = [11, 22, 49, 50, 149, 150].map((kw) =>
    row({ id: String(kw), power: kw + " kW" }),
  );
  const ids = (mode) =>
    rows
      .filter((r) => api.stationPowerMatches(r, mode))
      .map((r) => r.id)
      .join(",");
  is("max22 includes exactly 22 kW", ids("max22"), "11,22");
  is("min50 includes exactly 50 kW", ids("min50"), "50,149,150");
  is("min150 includes exactly 150 kW", ids("min150"), "150");
  is("unknown power never matches a tier", api.stationPowerMatches(row({}), "min50"), false);
  is("any passes unknown power", api.stationPowerMatches(row({}), "any"), true);
});

group("sorting covers distance, power and operator", () => {
  const { api } = filterApi();
  const rows = [
    row({ id: "near", name: "Near", operator: "Virta", power: "22 kW", dist: 10 }),
    row({ id: "power", name: "Power", operator: "ABC", power: "150 kW", dist: 300 }),
    row({ id: "unknown", name: "Unknown", operator: "", power: "", dist: 200 }),
  ];
  is("distance is the default", api.sortStationRows(rows, "distance")[0].id, "near");
  is("power puts the fastest first", api.sortStationRows(rows, "power")[0].id, "power");
  is("unknown power sorts after known", api.sortStationRows(rows, "power")[2].id, "unknown");
  is("operator sorts A-Z", api.sortStationRows(rows, "operator")[0].operator, "");
  is("and known brands follow", api.sortStationRows(rows, "operator")[1].operator, "ABC");
});

group("the filter UI is present and wired to the filtered result set", () => {
  for (const id of [
    "stationFilters",
    "stationPowerAny",
    "stationPower22",
    "stationPower50",
    "stationPower150",
    "stationConnectorCcs",
    "stationConnectorChademo",
    "stationConnectorType2",
    "stationSort",
    "stationOperatorSearch",
    "stationOperatorList",
    "stationFilterClear",
  ])
    ok(`${id} exists`, html.includes(`id="${id}"`));

  for (const key of [
    "st.filters",
    "st.power",
    "st.powerAny",
    "st.power22",
    "st.power50",
    "st.power150",
    "st.connectors",
    "st.connectorCcs",
    "st.connectorChademo",
    "st.connectorType2",
    "st.sort",
    "st.sortDistance",
    "st.sortPower",
    "st.sortOperator",
    "st.clearFilters",
    "st.operators",
    "st.operatorSearch",
    "st.unknownOperator",
    "st.filteredCount",
    "st.noMatches",
  ])
    is(`${key} in all three languages`, (i18n.match(new RegExp(`"${key.replace(/\./g, "\\.")}"`, "g")) || []).length, 3);

  const apply = fnSource("applyStationFilters");
  ok("filtering uses the pure matcher", /stationMatchesFilters\(/.test(apply));
  ok("sorting uses the pure sorter", /sortStationRows\(/.test(apply));
  ok("the visible page comes from stationFiltered", /stationResults = stationFiltered\.slice/.test(apply));
  ok("rendering and map pins update together", /renderStations\(\)/.test(apply) && /drawStationMapResults\(\)/.test(apply));
  ok("status reports filtered counts", /st\.filteredCount/.test(apply) && /st\.noMatches/.test(apply));

  const search = fnSource("runStationSearch");
  ok("a search rebuilds operator options", /renderStationOperatorOptions\(\)/.test(search));
  ok("and applies the current filters", /applyStationFilters\(true\)/.test(search));

  const more = app.match(/\$\("stationMore"\)\.addEventListener[\s\S]{0,1000}?\}\);/);
  ok("show more pages the filtered list", /stationFiltered\.slice/.test(more ? more[0] : ""));
  ok("the rendered total is the filtered total", /stationFiltered\.length - shown\.length/.test(fnSource("renderStations")));
  ok("rows show the extracted operator", /extractOperator\(s\)/.test(fnSource("renderStations")));
  ok(
    "the matcher delegates to the power helper",
    /stationPowerMatches\(row, stationFilters\.power\)/.test(fnSource("stationMatchesFilters")),
  );
  ok(
    "the controls store the selected mode",
    /stationFilters\.power = power \? power\.value : "any"/.test(fnSource("readStationFilterControls")),
  );
  is(
    "Type 2 is the recognised term in every language",
    (i18n.match(/"st\.connectorType2": "Type 2"/g) || []).length,
    3,
  );
  ok("no legacy Finnish Tyyppi 2 remains", !/"st\.connectorType2": "Tyyppi 2"/.test(i18n));
  ok("no legacy Swedish Typ 2 remains", !/"st\.connectorType2": "Typ 2"/.test(i18n));
  for (const [name, doc] of [
    ["shared", html],
    ["HUD", hud],
  ])
    ok(
      name + ": operators come before sort",
      doc.indexOf('id="stationOperatorLabel"') >= 0 &&
        doc.indexOf('id="stationOperatorLabel"') < doc.indexOf('id="stationSort"'),
    );
});

group("operator options are dynamic, searchable and preserve selections", () => {
  const render = fnSource("renderStationOperatorOptions");
  ok("the list is derived from stationAll", /stationAll/.test(render));
  ok("counts are shown", /counts\[key\]/.test(render));
  ok("selected operators stay checked", /stationFilters\.operators\[op\] \? " checked"/.test(render));
  ok("the search filters the option labels", /stationFilters\.operatorSearch/.test(render));
  ok("unknown operators get a label", /st\.unknownOperator/.test(render));
  ok("the input only rerenders options", /\$\("stationOperatorSearch"\)\.addEventListener\("input"/.test(app));
  ok("checkbox changes reapply filters", /data-station-operator[\s\S]{0,500}?applyStationFilters\(true\)/.test(app));
  ok("clear resets all groups", /resetStationFilterControls\(\)/.test(app));
});

group("the service worker is bumped for the filter UI", () => {
  ok("sw.js is v104", /const VERSION = "v104"/.test(sw));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
