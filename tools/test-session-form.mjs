/*
 * The energy / cost / price triangle, and the duration default.
 *
 * Why executed rather than asserted over the source text
 *   Three numbers that each determine the other two is a state machine, and a
 *   regex cannot tell you which one gives way in which order - only that a
 *   branch exists. Two suites written during this project passed against
 *   broken code for exactly that reason, so the rule here is that a test is not
 *   evidence until it has failed once against the bug.
 *
 * The three fields
 *   energy   kWh
 *   cost     EUR, the whole bill
 *   price    EUR per kWh
 *
 * Any two fix the third. Which one yields is decided by flags recording what
 * was calculated last:
 *   costAuto   the cost was calculated, so re-solve it when the energy moves
 *   priceAuto  the price was calculated, so re-solve it when the energy moves
 *   energyAuto the energy was calculated, so re-solve it when the cost moves
 *
 * The bug
 *   Typing a total overwrote the unit price with cost/energy. With the energy
 *   field still empty - the normal state for someone reading a bill, who has a
 *   total and a tariff but no meter reading - the total was ignored outright.
 *
 *   node tools/test-session-form.mjs
 */
import { readFileSync } from "node:fs";
import { fnSource } from "./app-source.mjs";

const app = readFileSync("app/app.js", "utf8");
const i18n = readFileSync("app/i18n.js", "utf8");

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
  ok(`${label} (${actual} vs ${expected})`, Math.abs(actual - expected) <= (tol || 0.005));
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

/**
 * The three recalculation functions wired to a settable form.
 * `price` is app state; the fields are DOM elements the code writes through.
 */
function makeForm(startPrice) {
  /* Stable element objects. Returning a fresh { value } per lookup would
     silently discard every write, because the code under test does
     $("cost").value = ... and on a throwaway object that goes nowhere. The
     first draft did exactly that and produced NaN across the board. */
  const els = {
    energy: { value: "" },
    cost: { value: "" },
    ppkCents: { value: "" },
    ppk: { value: "" },
    priceHint: { value: "" },
    ppkCentsHint: { value: "" },
  };
  let writes = 0;

  const src = `
    var price = __price, calcLock = false, costAuto = false,
        priceAuto = false, energyAuto = false;
    var fields = __fields;
    function $(id){ return fields[id]; }
    function persist(){ __wrote(); }
    /* The hint text is asserted from the source. syncHints() pulls in the whole
       translation layer, and counting the calls is enough to show every path
       refreshes it. */
    var hintCalls = 0;
    function syncHints(){ hintCalls++; }
    ${fnSource("num")}
    ${fnSource("isNum")}
    ${fnSource("setPriceCents")}
    ${fnSource("recalcFromCost")}
    ${fnSource("recalcFromPrice")}
    ${fnSource("recalcFromEnergy")}
    return {
      recalcFromCost: recalcFromCost,
      recalcFromPrice: recalcFromPrice,
      recalcFromEnergy: recalcFromEnergy,
      /* The #ppkCents input handler, verbatim in behaviour: the element holds
         the typed cents, they become the price, then the cost is re-solved.
         All three, because recalcFromPrice() reads the element AND the price,
         and a helper that set only one would test a path the app never takes. */
      typePrice: function(cents){
        fields.ppkCents.value = cents;
        if (cents === "" || !isNum(cents)) return;
        price = Math.min(99, Math.max(0, num(cents))) / 100;
        persist();
        recalcFromPrice();
      },
      flags: function(){ return { costAuto: costAuto, priceAuto: priceAuto, energyAuto: energyAuto }; },
      price: function(){ return price; },
      writes: function(){ return __count(); },
      hints: function(){ return hintCalls; },
    };
  `;
  const build = new Function("__fields", "__price", "__wrote", "__count", src);
  const api = build(
    els,
    startPrice || 0,
    () => writes++,
    () => writes,
  );
  return { els, api };
}

const E = (f, v) => (f.els.energy.value = v);
const C = (f, v) => (f.els.cost.value = v);
const P = (f, v) => (f.els.ppkCents.value = v);
const ev = (f) => parseFloat(f.els.energy.value);
const cv = (f) => parseFloat(f.els.cost.value);

/** The edit sheet's two local calculators, on the same kind of stub form. */
function makeEditForm(startPrice) {
  const els = {
    eEnergy: { value: "" },
    ePriceCents: { value: "" },
    eCost: { value: "" },
  };
  const src = `
    var price = __price;
    var fields = __fields;
    function $(id){ return fields[id]; }
    ${fnSource("num")}
    ${fnSource("isNum")}
    ${fnSource("editUnitCents")}
    ${fnSource("editPriceCents")}
    ${fnSource("editCostToPrice")}
    return { editPriceCents, editCostToPrice };
  `;
  const api = new Function("__price", "__fields", src)(startPrice || 0, els);
  return { els, api };
}
const EE = (f, v) => (f.els.eEnergy.value = v);
const EC = (f, v) => (f.els.eCost.value = v);
const EP = (f, v) => (f.els.ePriceCents.value = v);
const ecv = (f) => parseFloat(f.els.eCost.value);

/* ---------- the common case: kWh + price -> cost ---------- */

group("energy and price give the cost", () => {
  const f = makeForm(0.32);
  E(f, "50");
  f.api.recalcFromEnergy();
  near("the cost is 50 x 0.32", cv(f), 16.0, 0.01);
  ok("and it is marked as calculated", f.api.flags().costAuto === true);
});

group("changing the price re-solves the cost", () => {
  const f = makeForm(0.32);
  E(f, "50");
  f.api.recalcFromEnergy();
  /* Mirrors the real #ppkCents handler, which writes `price` from the cents
     field and only then recalculates. recalcFromPrice() on its own reads
     `price` without touching it, so calling it directly would test a path the
     app never takes. */
  f.api.typePrice("40");
  near("the cost follows the new price", cv(f), 20.0, 0.01);
  near("0.40 EUR/kWh is stored", f.api.price(), 0.4);
});

group("changing the energy re-solves a calculated cost", () => {
  const f = makeForm(0.32);
  E(f, "50");
  f.api.recalcFromEnergy();
  E(f, "60");
  f.api.recalcFromEnergy();
  near("60 x 0.32", cv(f), 19.2, 0.01);
});

group("every path refreshes the hint", () => {
  const f = makeForm(0.32);
  E(f, "50");
  f.api.recalcFromEnergy();
  C(f, "16.00");
  f.api.recalcFromCost();
  P(f, "40");
  f.api.recalcFromPrice();
  is("one per edit", f.api.hints(), 3);
});

/* ---------- the bill case: cost + price -> energy ---------- */

group("a total and a price give the energy", () => {
  /* The case that did nothing at all before. */
  const f = makeForm(0.32);
  C(f, "16.00");
  f.api.recalcFromCost();
  near("16.00 / 0.32", ev(f), 50, 0.01);
  ok("and it is marked as calculated", f.api.flags().energyAuto === true);
  ok("the price is not overwritten", Math.abs(f.api.price() - 0.32) < 1e-9);
});

group("typing the energy by hand takes it back from the calculation", () => {
  /* Otherwise a bill-derived figure survives as if the user had confirmed it,
     and a later edit to the total would silently re-solve the energy from a
     number the user never chose. */
  const f = makeForm(0.32);
  C(f, "16.00");
  f.api.recalcFromCost();
  ok("the energy was calculated", f.api.flags().energyAuto === true);
  E(f, "45");
  f.api.recalcFromEnergy();
  ok("typing clears the flag", f.api.flags().energyAuto === false);
});

group("a second total re-solves the energy", () => {
  const f = makeForm(0.32);
  C(f, "16.00");
  f.api.recalcFromCost();
  C(f, "19.20");
  f.api.recalcFromCost();
  near("19.20 / 0.32", ev(f), 60, 0.01);
});

group("a real total and a real energy still solve for the price", () => {
  /* Both typed by hand, so the energy is not a calculation and wins; the
     price is what is left over. */
  const f = makeForm(0);
  E(f, "50");
  C(f, "20.00");
  f.api.recalcFromCost();
  near("20.00 / 50", f.api.price(), 0.4);
  ok("and the price is marked as calculated", f.api.flags().priceAuto === true);
  is("the energy is left alone", ev(f), 50);
});

group("a zero price cannot be divided by", () => {
  /* Free charging is real. The energy must stay blank rather than become
     Infinity. */
  const f = makeForm(0);
  C(f, "16.00");
  f.api.recalcFromCost();
  is("no energy is invented", f.els.energy.value, "");
  ok("nothing became Infinity or NaN", !/Infinity|NaN/.test(f.els.energy.value + f.els.cost.value));
});

group("an empty total calculates nothing", () => {
  const f = makeForm(0.32);
  E(f, "50");
  f.api.recalcFromEnergy();
  const before = ev(f);
  C(f, "");
  f.api.recalcFromCost();
  is("the energy is untouched", ev(f), before);
});

group("malformed input is ignored, not propagated", () => {
  const f = makeForm(0.32);
  C(f, "abc");
  f.api.recalcFromCost();
  is("nothing becomes NaN", f.els.energy.value, "");
  near("the price is unchanged", f.api.price(), 0.32);
});

group("all three flags are cleared when the form is reused", () => {
  /* The save path resets two of them. A third left set would make the next
     session begin believing its energy had been calculated, and re-solve it
     from a total instead of using what the user typed. */
  const block = app.slice(app.lastIndexOf("f.reset();"));
  ok("costAuto is cleared", /costAuto = false/.test(block));
  ok("priceAuto is cleared", /priceAuto = false/.test(block));
  ok("energyAuto is cleared too", /energyAuto = false/.test(block));
});

group("the hint says where the kWh came from", () => {
  /* A calculated figure presented as if it were typed is how a wrong number
     gets saved. */
  const hints = fnSource("syncHints");
  ok("it reports a bill-derived energy", /energyAuto/.test(hints));
  ok("the string exists in all three languages", (i18n.match(/"toast\.energyFromTotal"/g) || []).length === 3);
  /* And the old message told the user to enter the energy to see a total,
     which is now only one of two ways. */
  ok("the empty-energy hint no longer says energy is the only way", !/Enter the charged energy to see the total/.test(i18n));
});

/* ---------- the edit sheet's local calculator ---------- */

group("the edit sheet recalculates the total from kWh and price", () => {
  const f = makeEditForm(0.32);
  EE(f, "50");
  EP(f, "40");
  f.api.editPriceCents();
  near("50 kWh at 0.40", ecv(f), 20.0, 0.01);

  EC(f, "16.00");
  f.api.editCostToPrice();
  is("16.00 over 50 kWh is 32 cents", f.els.ePriceCents.value, "32");
});

group("a row with no explicit price uses the saved default", () => {
  /* The reported gap: open a legacy row with energy but no cost, change kWh,
     and nothing happened because ePriceCents was blank. The add form already
     falls back to the saved global price; the edit sheet must too. */
  const f = makeEditForm(0.32);
  EE(f, "50");
  EP(f, "");
  f.api.editPriceCents();
  near("50 x the saved 0.32", ecv(f), 16.0, 0.01);
});

group("the edit sheet invents nothing without energy", () => {
  const f = makeEditForm(0.32);
  EP(f, "40");
  f.api.editPriceCents();
  is("the total stays empty", f.els.eCost.value, "");
  ok("and no NaN or Infinity appears", !/NaN|Infinity/.test(f.els.eCost.value));
});

/* ---------- the duration default ---------- */

const avgDuration = new Function(
  `${fnSource("isNum")}${fnSource("num")}${fnSource("avgDuration")}; return avgDuration;`,
)();

group("fewer than five charges gives the flat default", () => {
  const rows = [];
  for (let i = 0; i < 4; i++) rows.push({ hours: 3.0, date: "2026-10-0" + (i + 1) });
  const a = avgDuration(rows);
  is("four charges count", a.n, 4);
  ok("but the threshold is not met", a.n < 5);
  near("the mean itself is real", a.hours, 3.0);
  /* 0.5 h is 30 minutes, the documented fallback. */
  ok("the fallback is half an hour", /DURATION_FALLBACK_H = 0\.5/.test(app));
  ok("and the threshold is five", /DURATION_SAMPLE_MIN = 5/.test(app));
});

group("seconds are counted even though they are not shown", () => {
  /* 30m20s and 30m00s average to 30m10s - not 30m00s. */
  const a = avgDuration([{ hours: 0.5 + 20 / 3600 }, { hours: 0.5 }]);
  near("the mean keeps the seconds", a.hours * 60, 30 + 10 / 60, 0.001);
});

group("the duration default is the vehicle's own charges", () => {
  /* It used to be every charge on the device, so one car that had reached the
     threshold supplied the default to every other car - including one with no
     history, which was then offered a figure it had never earned. */
  const d = fnSource("defaultDuration");
  ok("it filters to the selected vehicle", /ofVehicle\(/.test(d));
  ok("it no longer uses the whole array", !/durationDefault\(sessions\)/.test(d));
});

group("switching vehicle re-computes the default", () => {
  const i = app.indexOf('t.hasAttribute("data-v")');
  ok("the vehicle switch exists", i > 0);
  const block = app.slice(i, i + 700);
  ok("it sets the current index", /cur = i/.test(block));
  ok("it now recomputes the duration", /defaultDuration\(\)/.test(block));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);