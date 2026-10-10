/*
 * Capture real API responses as test fixtures.
 *
 * Fixtures typed from memory are the enemy here: every field in the station
 * data was wrong in a way that read as plausible. `connector:*` instead of
 * `socket:*`, watts read as kilowatts, `[lat, lng]` for GeoJSON's `[lng, lat]`
 * - each one produces plausible-looking output rather than an error.
 *
 * So this hits the live API and keeps only what the tests need, trimmed down
 * to two stations: one small, one with many poles.
 *
 *   node tools/fixtures/capture.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";

const HDR = { "Accept-Encoding": "gzip" };
const API = "https://afir.digitraffic.fi/api/charging-network/v1/";

mkdirSync("tools/fixtures", { recursive: true });

async function get(url) {
  const r = await fetch(url, { headers: HDR });
  if (!r.ok) throw new Error(url + " -> HTTP " + r.status);
  return r.json();
}

const loc = await get(API + "locations?limit=ALL");
const small = loc.features.find(
  (f) =>
    f.properties.evses.length === 2 &&
    f.properties.evses.some((e) => e.connectors.length > 1),
);
const big = loc.features.find((f) => f.properties.evses.length > 8);
if (!small || !big) throw new Error("no suitable stations in the live response");

writeFileSync(
  "tools/fixtures/stations.json",
  JSON.stringify(
    {
      pagination: { limit: 3840 },
      modifiedAt: "2026-10-09T20:37:37.945Z",
      type: "FeatureCollection",
      features: [small, big],
    },
    null,
    1,
  ),
  "utf8",
);
console.log("small:", small.properties.name, "-", small.properties.evses.length, "evses");
console.log("big:  ", big.properties.name, "-", big.properties.evses.length, "evses");

const cam = await get("https://tie.digitraffic.fi/api/weathercam/v1/stations");
writeFileSync(
  "tools/fixtures/cameras.json",
  JSON.stringify(
    {
      type: "FeatureCollection",
      dataUpdatedTime: cam.dataUpdatedTime,
      features: cam.features.slice(0, 3),
    },
    null,
    1,
  ),
  "utf8",
);
console.log("cameras: 3 kept of", cam.features.length);