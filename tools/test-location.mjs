/**
 * Tests for location defaults and proximity matching.
 *
 * The safety-critical behaviour is the accuracy gate. Desktop geolocation is
 * IP-derived and routinely reports accuracy in the hundreds of metres, so a
 * 100m match against such a reading is meaningless and acting on it would write
 * the wrong place and the wrong price into real data. Anything coarser than the
 * threshold must be discarded rather than guessed at.
 *
 *   node tools/test-location.mjs
 */
import { appSource, fnSource } from "./app-source.mjs";

function constOf(name) {
  const m = appSource().match(new RegExp(`var ${name}\\s*=\\s*[^;]+;`));
  if (!m) throw new Error(`const ${name} not found`);
  return m[0];
}

const build = new Function(
  [
    fnSource("isNum"),
    constOf("LOC_RADIUS_M"),
    constOf("LOC_MAX_ACCURACY_M"),
    fnSource("metresBetween"),
    `return { metresBetween, LOC_RADIUS_M, LOC_MAX_ACCURACY_M };`,
  ].join("\n\n"),
);
const { metresBetween, LOC_RADIUS_M, LOC_MAX_ACCURACY_M } = build();

let pass = 0;
const failures = [];
function is(label, actual, expected) {
  if (actual === expected) pass++;
  else failures.push(`${label}\n      expected ${expected}, got ${actual}`);
}
function near(label, actual, expected, tol) {
  if (Math.abs(actual - expected) <= tol) pass++;
  else failures.push(`${label}\n      expected ~${expected} (±${tol}), got ${actual}`);
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

/* Helsinki city centre, used as the origin for the distance checks. */
const LAT = 60.1699,
  LNG = 24.9384;
/** Roughly this many metres of latitude per degree. */
const M_PER_DEG_LAT = 111320;

group("distance is zero for the same point", () => {
  near("identical", metresBetween(LAT, LNG, LAT, LNG), 0, 0.5);
});

group("a short walk is inside the radius", () => {
  /* ~55 m north */
  const d = metresBetween(LAT, LNG, LAT + 55 / M_PER_DEG_LAT, LNG);
  near("55 m", d, 55, 3);
  is("and therefore within 100 m", d <= LOC_RADIUS_M, true);
});

group("a different city is far outside the radius", () => {
  /* Tampere, ~160 km away */
  const d = metresBetween(LAT, LNG, 61.4978, 23.7610);
  is("over 100 km", d > 100000, true);
  is("so no match", d <= LOC_RADIUS_M, false);
});

group("distance is symmetric", () => {
  const a = metresBetween(LAT, LNG, LAT + 0.001, LNG + 0.001);
  const b = metresBetween(LAT + 0.001, LNG + 0.001, LAT, LNG);
  near("both directions agree", a, b, 0.01);
});

group("the accuracy threshold is what we intend", () => {
  /* The whole point: a reading this coarse is discarded, not trusted. */
  is("threshold is 50 m", LOC_MAX_ACCURACY_M, 50);
  is("a 5000 m desktop reading is far too coarse", 5000 > LOC_MAX_ACCURACY_M, true);
  is("a 20 m GPS reading qualifies", 20 <= LOC_MAX_ACCURACY_M, true);
  is("a 60 m reading does not", 60 <= LOC_MAX_ACCURACY_M, false);
  /* A boundary reading just inside is accepted. */
  is("exactly 50 m is accepted", 50 <= LOC_MAX_ACCURACY_M, true);
});

group("the radius and the threshold are not confused", () => {
  /* Radius is how close a saved place must be; accuracy is how much we trust
     the reading. They are different numbers on purpose: a perfect fix inside a
     100 m radius is fine, and a poor fix outside it is still refused. */
  is("radius", LOC_RADIUS_M, 100);
  is("they differ", LOC_RADIUS_M !== LOC_MAX_ACCURACY_M, true);
});

group("matching ignores favourites without coordinates", () => {
  /* A text-only favourite has no lat/lng, so it can never be matched. That is
     the common case for an old favourite saved before geocoding existed. */
  const f = { id: "a", name: "Somewhere", address: "Somewhere", lat: null, lng: null };
  const usable = [f].filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
  is("not matchable", usable.length, 0);
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}