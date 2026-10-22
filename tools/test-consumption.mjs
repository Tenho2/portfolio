/*
 * Consumption: leg attribution and battery-derived energy.
 *
 * Two defects are guarded against here, and both were silent.
 *
 * 1. Everything added up. The old figure was total charged energy over total
 *    distance. That is not the energy used between two points, it is the energy
 *    put into the car across the whole history - and the newest charge has no
 *    distance behind it at all, so dividing by the odometer delta divided by
 *    too few kilometres and roughly doubled the reported efficiency.
 *
 *    Each charge's energy is now attributed to the distance driven AFTER it,
 *    and the newest charge is held back until a later odometer reading exists.
 *    Unattributed energy is reported rather than quietly averaged in, because
 *    "12 charges" and "12 charges, 11 of them measured" are different facts.
 *
 * 2. Order. The app's `sorted()` is newest-first, which is right for the log
 *    and exactly backwards for a walk through history. An early version of this
 *    code forgot the reversal and produced zero legs. Both helpers reverse
 *    deliberately, and the assertions below pin that.
 *
 * The functions are lifted out of app/app.js by name, so a change to them is a
 * change to what is tested here rather than a divergence between a copy in the
 * test and the copy in the app.
 *
 *   node tools/test-consumption.mjs
 */
import { readFileSync } from "node:fs";
import { appSource, fnSource } from "./app-source.mjs";

const html = readFileSync("ev-tracker.html", "utf8");
const hudHtml = readFileSync("tools/hud-body.html", "utf8");
const migration = readFileSync("supabase/15-vehicle-baseline.sql", "utf8");
const migration16 = readFileSync(
  "supabase/16-vehicle-seasonal-baseline.sql",
  "utf8",
);
const app = appSource();

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
function near(label, actual, expected, tol) {
  ok(`${label} (${actual} vs ${expected})`, Math.abs(actual - expected) <= tol);
}
/* Synchronous on purpose. An earlier version was async and the call sites never
   awaited it, so every per-group status line was queued behind a microtask that
   the final process.exit cut off: the suite reported a bare total with no group
   names, and a failure inside a group would have been printed after the summary
   or lost. No body below is async, so there is nothing to await. */
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

/* The app's own helpers, built from its own source. */
/* `costOf` falls back to energy x `price`, which is app state rather than a
   function. Supplied here at a known value so the cost assertions can predict
   the number instead of depending on whatever the user last typed. */
const PRICE = 0.3;

const legStats = new Function(
  `var price = ${PRICE};` +
    fnSource("sorted") +
    fnSource("num") +
    fnSource("isNum") +
    fnSource("soc") +
    fnSource("hasCost") +
    fnSource("costOf") +
    fnSource("legStats") +
    "; return legStats;",
)();
const socLegStats = new Function(
  `${fnSource("sorted")}${fnSource("num")}${fnSource("isNum")}${fnSource("soc")}${fnSource("socLegStats")}; return socLegStats;`,
)();
const avgPerSession = new Function(
  `${fnSource("num")}${fnSource("avgPerSession")}; return avgPerSession;`,
)();
const seasonSplit = new Function(
  `${fnSource("sorted")}${fnSource("num")}${fnSource("isNum")}${fnSource("posOrNull")}${fnSource("soc")}${fnSource("anchoredConsumption")}${fnSource("seasonSplit")}; return seasonSplit;`,
)();
const batteryHealth = new Function(
  `${fnSource("num")}${fnSource("isNum")}${fnSource("soc")}${fnSource("batteryHealth")}; return batteryHealth;`,
)();
/* The baseline anchor depends only on its arguments, so it is lifted out and
   tested directly rather than through renderConsumption's DOM. */
const anchoredConsumption = new Function(
  `${fnSource("num")}${fnSource("isNum")}${fnSource("posOrNull")}${fnSource("anchoredConsumption")}; return anchoredConsumption;`,
)();

/* `costOf` falls back to energy x `price`, and `price` is app state. Held here so
   a test can predict the number rather than depending on a global. */
const CAP = 73.53;

function s(date, mileage, energy, socStart, socEnd, cost) {
  return { date, mileage, energy, socStart, socEnd, cost };
}

/* The reported case: two charges 14 km apart, 95 kWh charged between them, no
   initial odometer. The battery ends the first leg at 80% and starts the second
   at 20%. */
const REPORTED = [s("2026-10-01", 1000, 0, 60, 80), s("2026-10-05", 1014, 95, 20, 55)];

group("the reported case is attributed rather than summed", () => {
  /* The real reported data had 0 kWh on the first charge, which hides what the
     attribution actually does. The same shape with 50 and 95 makes it visible,
     and every assertion below uses that form. */
  const legs = legStats(
    [s("2026-10-01", 1000, 50, 60, 80), s("2026-10-05", 1014, 95, 20, 55)],
    0,
  );
  is("one leg", legs.legs, 1);
  is("14 km", legs.km, 14);
  is("the leg carries the earlier charge", legs.kwh, 50);
  ok("it is not the sum of both charges", legs.kwh < 145);
  /* 95 kWh over 14 km is 678.6 kWh/100km, which is what the old all-in figure
     printed against a real figure near 357. */
  ok(
    "the all-in figure is not what is reported",
    Math.abs(legs.kwh / legs.km) * 100 < 400,
  );
});

group("the newest charge waits for a distance behind it", () => {
  const legs = legStats(
    [s("2026-10-01", 1000, 50, 60, 80), s("2026-10-05", 1014, 95, 20, 55)],
    0,
  );
  is("95 kWh is held back", legs.unattributed, 95);
  /* A third charge closes the second gap. */
  const closed = legStats(
    [s("2026-10-01", 1000, 50, 60, 80), s("2026-10-05", 1014, 95, 20, 55), s("2026-10-09", 1060, 40, 10, 30)],
    0,
  );
  is("two legs once the second gap closes", closed.legs, 2);
  /* Both closed legs now carry energy: the first carries the first charge, the
     second the second. 50 + 95. */
  is("the two legs carry the two charges", closed.kwh, 145);
  is("only the newest is still held back", closed.unattributed, 40);
});

group("input order does not change the answer", () => {
  const forwards = legStats([s("2026-10-01", 1000, 50), s("2026-10-05", 1014, 95)], 0);
  const backwards = legStats([s("2026-10-05", 1014, 95), s("2026-10-01", 1000, 50)], 0);
  is("same leg count", backwards.legs, forwards.legs);
  is("same distance", backwards.km, forwards.km);
  is("same energy", backwards.kwh, forwards.kwh);
  ok("reversing the input does not zero the legs", forwards.legs === 1);
});

group("a first reading without an initial odometer is unmeasured, not zero", () => {
  const legs = legStats([s("2026-10-01", 1000, 50), s("2026-10-05", 1014, 95)], 0);
  ok("it reports that it has no starting point", legs.noStart === true);
  const withStart = legStats([s("2026-10-01", 1000, 50), s("2026-10-05", 1014, 95)], 986);
  /* The gap from the starting point to the first reading is distance with no
     charge at its start, so it is a leg that carries no energy. It is counted
     rather than discarded, because the kilometres were driven. */
  is("the starting gap counts as a leg", withStart.legs, 2);
  is("covering 28 km in total", withStart.km, 28);
  is("but only the charge-to-charge leg carries energy", withStart.kwh, 50);
});

group("readings that cannot be measured are skipped, not counted", () => {
  /* A repeated reading is a typo, not a drive of zero length. */
  const same = legStats([s("2026-10-01", 1000, 50), s("2026-10-05", 1000, 95)], 0);
  is("no distance from a repeated reading", same.km, 0);
  ok("it is counted as skipped", same.skipped > 0);
  /* A reading below the previous one cannot be a drive either. */
  const back = legStats([s("2026-10-01", 1000, 50), s("2026-10-05", 900, 95)], 0);
  is("no negative distance", back.km, 0);
  /* The charge is still real, so its energy is still accounted for. */
  ok("the energy is not lost", back.unattributed + back.kwh === 145);
});

group("battery-derived energy uses the SoC gap between charges", () => {
  const legs = socLegStats(REPORTED, CAP);
  is("one leg", legs.legs, 1);
  is("14 km", legs.km, 14);
  /* (80 - 20) / 100 x 73.53 */
  near("44.12 kWh", legs.kwh, 44.12, 0.01);
  ok("it needs the previous END and the current START", legs.legs === 1);
});

group("a first session with no start value does not block the battery figure", () => {
  /* The formula never reads the first session's socStart, so a missing one is
     harmless rather than fatal. */
  const legs = socLegStats([s("2026-10-01", 1000, 50, null, 80), s("2026-10-05", 1014, 95, 20, 55)], CAP);
  is("still one leg", legs.legs, 1);
  near("still 44.12 kWh", legs.kwh, 44.12, 0.01);
});

group("no capacity means no battery figure, not a zero one", () => {
  for (const cap of [null, undefined, 0, "", -5]) {
    const legs = socLegStats(REPORTED, cap);
    is(`no legs for capacity ${JSON.stringify(cap)}`, legs.legs, 0);
    ok(`not usable for capacity ${JSON.stringify(cap)}`, legs.usable === false);
  }
  ok("a real capacity is usable", socLegStats(REPORTED, CAP).usable === true);
});

group("a SoC reading that rises is not negative energy", () => {
  /* SoC is a share of a pack whose real size moves with temperature and
     ageing. A negative figure is always a reading problem, never a car that
     gained energy. */
  const rising = socLegStats([s("2026-10-01", 1000, 50, 60, 40), s("2026-10-05", 1014, 95, 80, 90)], CAP);
  ok("no negative kWh", rising.kwh >= 0);
  is("the leg is discarded", rising.legs, 0);
  ok("and counted as skipped", rising.skipped > 0);
});

group("a leg needs both a percentage and a distance", () => {
  /* Half a measurement is not a measurement. */
  const noSoC = socLegStats([s("2026-10-01", 1000, 50, 60, null), s("2026-10-05", 1014, 95, null, 55)], CAP);
  is("no leg without SoC", noSoC.legs, 0);
  const noOdo = socLegStats([s("2026-10-01", 0, 50, 60, 80), s("2026-10-05", 0, 95, 20, 55)], CAP);
  is("no leg without distance", noOdo.legs, 0);
});

group("the two methods are independent and both plausible", () => {
  const charged = legStats([s("2026-10-01", 1000, 50), s("2026-10-05", 1014, 95)], 0);
  const battery = socLegStats(REPORTED, CAP);
  ok("charged and battery figures differ on the same sessions", charged.kwh !== battery.kwh);
  is("but they cover the same distance", charged.km, battery.km);
});

group("a baseline anchors a sparse figure instead of replacing it", () => {
  /* The reported shape: one 14 km leg carrying 50 kWh is 357 kWh/100km. A
     driver-supplied baseline of 18.4 over 12,000 km is far more informative
     than three charges' worth of noise, and the weighted mean says so without
     discarding the measurement. */
  near("the raw sparse figure", anchoredConsumption(50, 14, null, null), 357.14, 0.05);
  is("no measured distance and no baseline is null", anchoredConsumption(0, 0, null, null), null);

  const sparse = anchoredConsumption(50, 14, 18, 5000);
  /* (50 + 0.18 * 5000) / (14 + 5000) * 100 = 18.947 */
  near("anchored near the baseline", sparse, 18.95, 0.05);
  ok("which is a plausible car, unlike 357", sparse > 15 && sparse < 25);

  /* The baseline is evidence, not an override: the more real distance there
     is, the less it moves the answer. */
  const wellUsed = anchoredConsumption(3000, 15000, 18, 5000);
  near("15,000 measured km pulls toward the raw figure", wellUsed, 19.5, 0.05);
  ok("the same baseline moves it by less than 1", Math.abs(wellUsed - 20) < 1);
  ok("while it moved the 14 km figure by hundreds", Math.abs(sparse - 357.14) > 300);
});

group("a baseline alone is labelled, never invented", () => {
  /* A new car with a baseline and no legs yet should show something useful;
     renderConsumption labels it as the entered figure rather than a measurement. */
  is("no measured data returns the baseline", anchoredConsumption(0, 0, 18, 5000), 18);
  ok("and the tile has a label for exactly that", /tile\.baselineOnly/.test(app));
  ok("and a label for an anchored figure", /tile\.baseline\b/.test(app));
  ok("the anchored provenance names both numbers", /tile\.baseline[\s\S]{0,120}baselineKm/.test(app));
});

group("an incomplete or impossible baseline is ignored", () => {
  /* Half a pair cannot be weighted: a figure with no distance behind it says
     nothing about how much evidence it is. */
  near("consumption without distance", anchoredConsumption(50, 14, 18, null), 357.14, 0.05);
  near("distance without consumption", anchoredConsumption(50, 14, null, 5000), 357.14, 0.05);
  near("zero consumption", anchoredConsumption(50, 14, 0, 5000), 357.14, 0.05);
  near("zero distance", anchoredConsumption(50, 14, 18, 0), 357.14, 0.05);
  near("negative values", anchoredConsumption(50, 14, -18, -5000), 357.14, 0.05);
  near("strings that are not numbers", anchoredConsumption(50, 14, "x", "y"), 357.14, 0.05);
});

group("the baseline is stored as a pair and carried through sync", () => {
  ok("the shared editor has both boxes", /id="vfBaseKwh"/.test(html) && /id="vfBaseKm"/.test(html));
  ok("the HUD editor has both boxes", /id="vfBaseKwh"/.test(hudHtml) && /id="vfBaseKm"/.test(hudHtml));
  ok("the editor explains both", /id="vfBaseHint"/.test(html) && /set\.baselineLead/.test(html));
  ok(
    "saving clamps an impossible consumption",
    /kwh100OrNull\(\$\("vfBaseKwh"\)\.value\)/.test(app),
  );
  ok("saving keeps the distance as a positive number", /v\.baselineKm = posOrNull\(\$\("vfBaseKm"\)\.value\)/.test(app));
  ok(
    "vehicleRow sends both columns",
    /baseline_consumption_kwh_100km: kwh100OrNull\(v\.baselineKwh100\)/.test(app) &&
      /baseline_distance_km: posOrNull\(v\.baselineKm\)/.test(app),
  );
  ok(
    "rowVehicle reads both columns back",
    /baselineKwh100: kwh100OrNull\(r\.baseline_consumption_kwh_100km\)/.test(app) &&
      /baselineKm: posOrNull\(r\.baseline_distance_km\)/.test(app),
  );
  ok("old vehicles normalise to null", /baselineKwh100 = kwh100OrNull/.test(app));
  ok(
    "a backup restore carries the pair",
    /baselineKwh100: kwh100OrNull\(pa\.baselineKwh100\)/.test(app) &&
      /baselineKm: posOrNull\(pa\.baselineKm\)/.test(app),
  );
  ok(
    "migration 15 adds both columns idempotently",
    /add column if not exists baseline_consumption_kwh_100km numeric/.test(migration) &&
      /add column if not exists baseline_distance_km numeric/.test(migration),
  );
});

group("cost per 100 km is on the leg basis too", () => {
  /* The newest charge's money belongs to kilometres not yet driven. Charging
     it against the driven distance is the same error as the kWh one. */
  const legs = legStats(
    [s("2026-10-01", 1000, 50, 60, 80, 15), s("2026-10-05", 1014, 95, 20, 55, 30)],
    0,
  );
  is("only the earlier charge's cost is in the leg", legs.cost, 15);
  ok("the newest charge's cost is not", legs.cost < 45);
});

group("the capacity editor stores usable, not gross", () => {
  /* 95% is a middle estimate: real ratios run from about 90% to 95%, so the
     derived box is editable and only the usable figure is kept. That leaves no
     flag that could disagree with the stored number. */
  ok("the gross factor is declared in the source", /CAP_GROSS_FACTOR\s*=\s*0\.95/.test(app));
  ok("the usable box is editable, not readonly", !/id="vfUsable"[^>]*readonly/.test(html));
  ok("the gross box exists", /id="vfGross"/.test(html));
  ok("the usable box exists", /id="vfUsable"/.test(html));
  ok("there is a gross mode and a usable mode", /vfCapGrossMode/.test(html) && /vfCapNetMode/.test(html));
  /* Absent on vehicles written before migration 12, and it must read as
     "unknown" rather than as a zero-capacity battery, which would say the
     usable energy is zero instead of that it is not known. */
  ok("old vehicles normalise to null", /capacity = null/.test(app));
  ok("a row written from a vehicle keeps null, not 0", /battery_capacity_kwh: isNum\(v\.capacity\)[\s\S]{0,80}null/.test(app));
  ok("a row read back rejects a missing column", /isNum\(r\.battery_capacity_kwh\)/.test(app));
});

group("the tiles name the method instead of showing a bare number", () => {
  /* A wrong figure reads as a right one when it arrives without provenance. */
  ok("the consumption tile exists", /id="sEffNote"/.test(html));
  ok("the cost tile has a provenance line too", /id="sCost100Note"/.test(html));
  ok("both methods are named", /tile\.fromBattery/.test(app) && /tile\.fromCharging/.test(app));
  ok("disagreement is surfaced", /tile\.disagree/.test(app));
  ok("the battery method is preferred", /var useSoc = bySoc !== null/.test(app));
  ok("the headline figure is anchored to the baseline", /anchoredConsumption\(/.test(app));
  /* Money cannot be read off a battery percentage. */
  ok("cost per 100 km uses the charging method only", /legs\.cost \/ legs\.km/.test(app));
});

group("every kWh is accounted for exactly once", () => {
  /* The property that matters most, and the one that caught two real bugs: an
     initial odometer used to bill the first session's charge to two legs, and
     a session with no starting point was counted as unmeasured even when the
     next reading later measured it properly. Both inflated or duplicated the
     figures while every individual number still looked plausible.
     Charged energy must therefore always equal measured plus held back. */
  const shapes = [
    { name: "no initial odometer", rows: [s("2026-10-01", 1000, 50, 60, 80), s("2026-10-05", 1014, 95, 20, 55)], start: 0 },
    { name: "with an initial odometer", rows: [s("2026-10-01", 1000, 50, 60, 80), s("2026-10-05", 1014, 95, 20, 55)], start: 986 },
    { name: "a single session", rows: [s("2026-10-01", 1000, 50, 60, 80)], start: 0 },
    { name: "single session, starting point", rows: [s("2026-10-01", 1000, 50, 60, 80)], start: 986 },
    { name: "three charges", rows: [s("2026-10-01", 1000, 50, 60, 80), s("2026-10-05", 1014, 95, 20, 55), s("2026-10-09", 1060, 40, 10, 30)], start: 0 },
    { name: "a repeated reading", rows: [s("2026-10-01", 1000, 50, 60, 80), s("2026-10-05", 1000, 95, 20, 55)], start: 0 },
    { name: "a reading that goes backwards", rows: [s("2026-10-01", 1000, 50, 60, 80), s("2026-10-05", 900, 95, 20, 55)], start: 0 },
    { name: "a session with no mileage", rows: [s("2026-10-01", 0, 50, 60, 80), s("2026-10-05", 1014, 95, 20, 55)], start: 0 },
  ];
  for (const shape of shapes) {
    const total = shape.rows.reduce((t, r) => t + r.energy, 0);
    const legs = legStats(shape.rows, shape.start);
    is(
      `${shape.name}: measured plus held back is the energy charged`,
      legs.kwh + legs.unattributed,
      total,
    );
  }
});

group("average energy per session ignores blanks, not zeroes", () => {
  const a = avgPerSession([
    { energy: 40 },
    { energy: 60 },
    { energy: 0 },
    { energy: "" },
  ]);
  is("only the two real charges count", a.n, 2);
  is("their mean", a.kwh, 50);
  const none = avgPerSession([{ energy: 0 }, { energy: "" }, {}]);
  is("no real charge means no figure", none.kwh, null);
  is("and no sample", none.n, 0);
});

group("consumption splits by the season of the charge that powered the leg", () => {
  const list = [
    { date: "2026-01-10", mileage: 1000, energy: 50, winter: true, socStart: 20, socEnd: 80 },
    { date: "2026-07-10", mileage: 1300, energy: 30, winter: false, socStart: 20, socEnd: 80 },
    { date: "2026-07-20", mileage: 1600, energy: 40, winter: false, socStart: 20, socEnd: 80 },
  ];
  /* The winter leg runs 1000 -> 1300, powered by the winter charge. The summer
     leg runs 1300 -> 1600, powered by the first summer charge. The newest
     charge is held back, as in legStats. */
  const charge = seasonSplit(list, 0, 0);
  is("one winter leg", charge.winter.legs, 1);
  is("300 km in winter", charge.winter.km, 300);
  near("winter, from charging", charge.winter.kwh100, (50 / 300) * 100, 0.01);
  is("one summer leg", charge.summer.legs, 1);
  near("summer, from charging", charge.summer.kwh100, (30 / 300) * 100, 0.01);
  /* With a capacity, the battery method covers every leg in each season, so it
     is preferred - exactly as the headline tile does. */
  const battery = seasonSplit(list, 0, 73.53);
  near("winter, from the battery", battery.winter.kwh100, (0.6 * 73.53) / 3, 0.01);
  near("summer, from the battery", battery.summer.kwh100, (0.6 * 73.53) / 3, 0.01);
  is(
    "a season with no measured drive has no figure",
    seasonSplit(
      [{ date: "2026-07-01", mileage: 100, energy: 10, winter: false }],
      0,
      0,
    ).winter.kwh100,
    null,
  );
});

group("seasonal baselines anchor their own tile", () => {
  const list = [
    { date: "2026-01-10", mileage: 1000, energy: 50, winter: true },
    { date: "2026-07-10", mileage: 1300, energy: 30, winter: false },
    { date: "2026-07-20", mileage: 1600, energy: 40, winter: false },
  ];
  const anchored = seasonSplit(list, 0, 0, {
    winter: 22,
    summer: 15,
    fallback: 18,
    km: 5000,
  });
  /* (50 + 0.22 * 5000) / (300 + 5000) * 100 and the summer equivalent. */
  near("winter uses the winter figure", anchored.winter.kwh100, 21.7, 0.05);
  near("summer uses the summer figure", anchored.summer.kwh100, 14.72, 0.05);
  is("the winter tile says it was anchored", anchored.winter.anchored, true);
  is("and names the figure it used", anchored.winter.baseline, 22);
  is("the summer tile says it was anchored", anchored.summer.anchored, true);
  is("and names its own figure", anchored.summer.baseline, 15);

  /* A missing seasonal value falls back to the all-year figure, so an existing
     vehicle keeps its anchor without a second edit. */
  const fallback = seasonSplit(list, 0, 0, { fallback: 18, km: 5000 });
  near("winter falls back to all-year", fallback.winter.kwh100, 17.92, 0.05);
  near("summer falls back to all-year", fallback.summer.kwh100, 17.55, 0.05);
  is("and says so", fallback.summer.anchored, true);

  /* No distance means the baseline cannot be weighted, so the measurement
     stands rather than being replaced by a bare seasonal figure. */
  const noKm = seasonSplit(list, 0, 0, { winter: 22, summer: 15 });
  near("no distance leaves winter measured", noKm.winter.kwh100, (50 / 300) * 100, 0.01);
  near("no distance leaves summer measured", noKm.summer.kwh100, (30 / 300) * 100, 0.01);
  is("and neither is marked anchored", noKm.winter.anchored, false);
});

group("the seasonal baseline editor stores two more figures", () => {
  ok(
    "the shared editor has both seasonal boxes",
    /id="vfBaseSummer"/.test(html) && /id="vfBaseWinter"/.test(html),
  );
  ok(
    "the HUD editor has both seasonal boxes",
    /id="vfBaseSummer"/.test(hudHtml) && /id="vfBaseWinter"/.test(hudHtml),
  );
  ok("the editor explains the seasonal fallback", /set\.baselineLead/.test(html));
  ok(
    "saving bounds all three consumption figures",
    /kwh100OrNull\(\$\("vfBaseSummer"\)\.value\)/.test(app) &&
      /kwh100OrNull\(\$\("vfBaseWinter"\)\.value\)/.test(app),
  );
  ok(
    "vehicleRow sends both seasonal columns",
    /baseline_summer_kwh_100km: kwh100OrNull\(v\.baselineSummerKwh100\)/.test(app) &&
      /baseline_winter_kwh_100km: kwh100OrNull\(v\.baselineWinterKwh100\)/.test(app),
  );
  ok(
    "rowVehicle reads them back",
    /baselineSummerKwh100: kwh100OrNull\(r\.baseline_summer_kwh_100km\)/.test(app) &&
      /baselineWinterKwh100: kwh100OrNull\(r\.baseline_winter_kwh_100km\)/.test(app),
  );
  ok(
    "a backup restore carries them",
    /baselineSummerKwh100: kwh100OrNull\(pa\.baselineSummerKwh100\)/.test(app) &&
      /baselineWinterKwh100: kwh100OrNull\(pa\.baselineWinterKwh100\)/.test(app),
  );
  ok(
    "migration 16 adds both columns idempotently",
    /add column if not exists baseline_summer_kwh_100km numeric/.test(migration16) &&
      /add column if not exists baseline_winter_kwh_100km numeric/.test(migration16),
  );
});

group("battery capacity is estimated only from large SoC jumps", () => {
  const rows = [
    { socStart: 10, socEnd: 60, energy: 36.75 }, // 50 pts -> 73.5 kWh
    { socStart: 20, socEnd: 55, energy: 25.7 }, // 35 pts -> 73.43 kWh
    { socStart: 40, socEnd: 50, energy: 8 }, // 10 pts -> ignored
    { socStart: 30, socEnd: 70, energy: 29.4 }, // 40 pts -> 73.5 kWh
  ];
  const h = batteryHealth(rows, 73.53);
  is("only the big jumps are used", h.samples, 3);
  near("the median capacity", h.est, 73.5, 0.05);
  near("state of health percent", h.soh, (73.5 / 73.53) * 100, 0.5);
  const noRated = batteryHealth(rows, 0);
  is("no rated capacity means no state of health", noRated.soh, null);
  is("but the estimate still exists", noRated.est !== null, true);
  is(
    "too small a jump gives nothing at all",
    batteryHealth([{ socStart: 40, socEnd: 50, energy: 8 }], 73.53),
    null,
  );
});

group("the spread and the newest leg are reported", () => {
  const legs = legStats(
    [
      s("2026-10-01", 1000, 50),
      s("2026-10-05", 1100, 20),
      s("2026-10-09", 1400, 10),
    ],
    0,
  );
  /* 1000 -> 1100 carries the first charge (50/100 = 50); 1100 -> 1400 carries
     the second (20/300 = 6.67). The newest charge is held back. */
  near("the best leg", legs.min100, 6.666, 0.01);
  near("the worst leg", legs.max100, 50, 0.01);
  is("the newest measured leg is 300 km", legs.lastKm, 300);
});

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);