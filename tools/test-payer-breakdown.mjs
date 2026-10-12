/*
 * The payer breakdown: date windows, the donut, and the unassigned bucket.
 *
 * The decisions this pins
 *
 *   The four windows are genuinely different. "This month" is the calendar
 *   month, not the last thirty days - on the 3rd that is two days of spending,
 *   which is what "this month" means to anybody who says it. "Past year" is a
 *   rolling twelve months, and it is built with setFullYear rather than by
 *   subtracting milliseconds, because the 31st of a short month would otherwise
 *   roll into the next one.
 *
 *   A charge with no usable date belongs to no window except "all". It is held
 *   back and counted, never guessed into a month. Dropping it silently would
 *   understate the period with no visible reason, which reads as broken
 *   arithmetic rather than as a row nobody dated.
 *
 *   Unassigned is a bucket, hatched rather than coloured. It is not a person,
 *   and taking a slice from the payer palette would say that it was. It is the
 *   entire legacy history of a car whose charges predate the feature.
 *
 *   Slice colours are indexed from the PAYERS ONLY. If unassigned took a slot,
 *   switching windows - where it may or may not appear - would shift everyone
 *   else's colour, and one person would look like two depending on which chart
 *   you were looking at.
 *
 *   node tools/test-payer-breakdown.mjs
 */
import { readFileSync } from "node:fs";
import { appSource, fnSource, pageSource } from "./app-source.mjs";

const app = appSource();
const html = pageSource();
const css = readFileSync("app/app.css", "utf8");
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

/* ---- the range maths, executed ---- */

const num = new Function(`${fnSource("num")}; return num;`)();
const pad = new Function(`${fnSource("pad")}; return pad;`)();
const validDate = new Function(
  `${fnSource("pad")}${fnSource("validDate")}; return validDate;`,
)();

/** payRangeBounds + filterByRange, run against a fixed "today". */
function buildRange(today) {
  const src = `
    var pad = __pad, num = __num, validDate = __validDate;
    var __now = __today;
    /* Two different jobs, so two different answers.
       new Date()      -> the frozen "today", so a calendar month can be
                          asserted at all.
       new Date(y,m,d) -> the REAL Date, because the rolling-twelve-months
                          arithmetic leans on it: payRangeBounds passes
                          t.getMonth() - 12, and new Date(2026, -3, 3) has to
                          normalise back to September 2025. A stub that returned
                          the arguments verbatim produced "2026--02-03" and a
                          window that matched nothing. */
    var RealDate = __realDate;
    function FakeDate(y, m, d) {
      if (!(this instanceof FakeDate)) return new FakeDate(y, m, d);
      if (y === undefined) {
        this.getFullYear = function(){ return __now[0]; };
        this.getMonth = function(){ return __now[1] - 1; };
        this.getDate = function(){ return __now[2]; };
      } else {
        var real = new RealDate(y, m, d);
        this.getFullYear = function(){ return real.getFullYear(); };
        this.getMonth = function(){ return real.getMonth(); };
        this.getDate = function(){ return real.getDate(); };
      }
    }
    var Date = FakeDate;
    ${fnSource("payRangeBounds")}
    ${fnSource("filterByRange")}
    return { bounds: payRangeBounds, filter: filterByRange };
  `;
  return new Function("__pad", "__num", "__validDate", "__today", "__realDate", src)(
    pad,
    num,
    validDate,
    today,
    Date,
  );
}

group("this month is the calendar month, not thirty days", () => {
  /* The 3rd. A rolling thirty days would reach back into September and count a
     fortnight of spending that "this month" does not mean. */
  const r = buildRange([2026, 10, 3]);
  const b = r.bounds("month");
  is("it starts on the 1st", b.from, "2026-10-01");
  is("and ends today", b.to, "2026-10-03");
  const inMonth = r.filter(
    [{ date: "2026-10-01" }, { date: "2026-10-02" }, { date: "2026-10-03" }],
    "month",
  );
  is("three days are in it", inMonth.list.length, 3);
  const earlier = r.filter([{ date: "2026-09-20" }, { date: "2026-10-01" }], "month");
  is("September is not", earlier.list.length, 1);
});

group("a future date is not counted", () => {
  const r = buildRange([2026, 10, 3]);
  const f = r.filter([{ date: "2026-10-01" }, { date: "2026-10-04" }], "month");
  is("tomorrow is out", f.list.length, 1);
});

group("this year is the calendar year", () => {
  const r = buildRange([2026, 10, 3]);
  const b = r.bounds("year");
  is("from 1 January", b.from, "2026-01-01");
  is("to today", b.to, "2026-10-03");
  const f = r.filter([{ date: "2026-01-01" }, { date: "2025-12-31" }], "year");
  is("last year is out", f.list.length, 1);
});

group("past year is a rolling twelve months", () => {
  const r = buildRange([2026, 10, 3]);
  const b = r.bounds("last");
  is("twelve months back", b.from, "2025-10-03");
  is("to today", b.to, "2026-10-03");
  /* The same day last year is in; the day before is not. */
  const f = r.filter([{ date: "2025-10-03" }, { date: "2025-10-02" }], "last");
  is("the boundary day is in", f.list.length, 1);
  is("and the day before it is not", f.list[0].date, "2025-10-03");
});

group("past year does not roll into the wrong month", () => {
  /* 31 August minus twelve months is 31 September, which does not exist. Naive
     millisecond arithmetic silently becomes 1 October and quietly widens the
     window. */
  const r = buildRange([2026, 8, 31]);
  const b = r.bounds("last");
  is("the same day a year back", b.from, "2025-08-31");
  ok("and it is a real date", validDate(b.from) === b.from);
  const feb = buildRange([2026, 3, 31]);
  const fb = feb.bounds("last");
  is("and for a 31st that has no 31st", fb.from, "2025-03-31");
});

group("all means all", () => {
  const r = buildRange([2026, 10, 3]);
  is("no bounds", r.bounds("all"), null);
  const f = r.filter([{ date: "2019-01-01" }, { date: "2026-10-01" }, { date: "2027-01-01" }], "all");
  is("every row is kept", f.list.length, 3);
});

/* ---- undated rows ---- */

group("an unusable date is counted, not hidden", () => {
  const r = buildRange([2026, 10, 3]);
  const rows = [
    { date: "2026-10-01" },
    { date: "" },
    { date: null },
    { date: "not a date" },
    { date: "2026-02-31" }, /* a real shape, an impossible day */
  ];
  const m = r.filter(rows, "month");
  is("only the real one is dated", m.list.length, 1);
  is("and four are held back", m.undated, 4);
  /* "all" keeps them, because otherwise they would simply vanish. */
  const a = r.filter(rows, "all");
  is("all keeps everything", a.list.length, 5);
  is("and nothing is counted as undated there", a.undated, 0);
});

group("the note exists so the missing rows are named", () => {
  ok("the message says how many", /pay\.undatedNote/.test(app));
  is("and it exists in all three languages", (i18n.match(/"pay\.undatedNote"/g) || []).length, 3);
  ok("the note element starts hidden", /id="payBreakNote" hidden/.test(html));
});

/* ---- the totals ---- */

/** payBreakdown, executed. */
const payerBreakdown = new Function(
  `var price = 0.2;` +
    `var PAYER_HUES = [160, 28, 262, 196, 344, 92, 220, 48];` +
    fnSource("num") +
    fnSource("isNum") +
    fnSource("hasCost") +
    fnSource("costOf") +
    fnSource("payerColour") +
    fnSource("normPayer") +
    fnSource("payerListOf") +
    fnSource("payBreakdown") +
    "; return payBreakdown;",
)();

/** The palette, so the assertions can compare against it directly. */
const payerColour = new Function(
  `var PAYER_HUES = [160, 28, 262, 196, 344, 92, 220, 48];` +
    fnSource("payerColour") +
    "; return payerColour;",
)();

group("a charge with no payers is counted as unassigned", () => {
  const d = payerBreakdown([
    { cost: 100, energy: 50, payers: [{ name: "Anna", share: 1 }] },
    { cost: 30, energy: 15 },
  ]);
  is("one named payer", d.rows.length, 1);
  near("their spending", d.rows[0].cost, 100);
  near("the unassigned part", d.unassigned.cost, 30);
  is("and how many charges", d.unassigned.sessions, 1);
  ok("and that there is something to show", d.hasUnassigned === true);
});

group("unassigned is flagged only when it is worth money", () => {
  const d = payerBreakdown([{ cost: 100, energy: 50, payers: [{ name: "A", share: 1 }] }]);
  ok("no slice for nothing", d.hasUnassigned === false);
});

group("unassigned never takes a colour from the payer palette", () => {
  /* If it did, switching windows - where it may or may not exist - would shift
     everyone else's colour, and one person would look like two. */
  const one = payerBreakdown([
    { cost: 100, energy: 50, payers: [{ name: "A", share: 1 }] },
    { cost: 50, energy: 25 },
  ]);
  is("the payer is first", one.rows[0].name, "A");
  is("and takes the first colour", one.rows[0].colour, payerColour(0));
  /* Unassigned is appended after the payers, so it cannot shift them. */
  const two = payerBreakdown([
    { cost: 100, energy: 50, payers: [{ name: "A", share: 0.5 }, { name: "B", share: 0.5 }] },
  ]);
  is("two payers", two.rows.length, 2);
  is("A takes the first colour", two.rows[0].colour, payerColour(0));
  ok("the palette index follows the payer, not the slice order", /payerColour\(rows\.length\)/.test(app));
});

group("the grand total covers everything, assigned or not", () => {
  const d = payerBreakdown([
    { cost: 100, energy: 50, payers: [{ name: "A", share: 1 }] },
    { cost: 30, energy: 15 },
  ]);
  near("the whole bill", d.grand, 130);
});

/* ---- the donut ---- */

const payDonut = new Function(
  `var price = 0.2;` +
    `var PAYER_HUES = [160, 28, 262, 196, 344, 92, 220, 48];` +
    /* fmtMoney caches its formatter and reads the locale, both of which are
       module-level in the app and therefore not part of fnSource("fmtMoney").
       Declared here so the extracted function behaves as it does in the page. */
    `var moneyFmt = null;` +
    `var LOCALE = "fi-FI";` +
    fnSource("num") +
    fnSource("isNum") +
    fnSource("hasCost") +
    fnSource("costOf") +
    fnSource("esc") +
    fnSource("fmtMoney") +
    `function TXT(k, v){ return k; }` +
    `function veh(){ return { name: "Car" }; }` +
    fnSource("payerColour") +
    fnSource("payDonut") +
    "; return payDonut;",
)();

group("the donut is drawn without a library", () => {
  const d = payerBreakdown([
    { cost: 60, energy: 30, payers: [{ name: "A", share: 0.5 }, { name: "B", share: 0.5 }] },
    { cost: 40, energy: 20 },
  ]);
  const svg = payDonut(d);
  ok("it is an svg", /^<svg/.test(svg));
  ok("with one path per payer plus the unassigned slice", (svg.match(/<path /g) || []).length === 3);
  ok("and a centre label", /donut-total/.test(svg));
  ok("carrying the total", /class="donut-total"[^>]*>[^<]*100/.test(svg) && /€/.test(svg));
  ok("it is labelled for a screen reader", /role="img" aria-label/.test(svg));
});

group("the unassigned slice is hatched, not coloured", () => {
  const d = payerBreakdown([{ cost: 40, energy: 20 }]);
  const svg = payDonut(d);
  ok("a pattern is defined", /<pattern id="payHatch"/.test(svg));
  ok("and the slice uses it", /fill="url\(#payHatch\)"/.test(svg));
  ok("the pattern is a hatch, not a fill", /patternTransform="rotate/.test(svg));
});

group("a car with no money still draws something", () => {
  /* An empty chart teaching nothing is fine; an empty chart that renders as a
     blank space beside the number is not. */
  const svg = payDonut(payerBreakdown([]));
  ok("it still returns a figure", /<svg/.test(svg));
  ok("as a ring", /<circle/.test(svg));
});

group("a single payer still draws", () => {
  /* A full circle drawn as an arc from a point back to itself renders as
     nothing, which is the classic way a one-slice pie disappears. */
  const svg = payDonut(payerBreakdown([{ cost: 100, energy: 50, payers: [{ name: "A", share: 1 }] }]));
  ok("a path exists", /<path /.test(svg));
  ok("and the sweep is trimmed", /0\.0001/.test(app));
});

/* ---- the sheet ---- */

group("the breakdown is a sheet that can be dismissed three ways", () => {
  ok("it exists", /id="payBreakSheet"/.test(html));
  ok("with a dialog role", /aria-labelledby="payBreakTitle"/.test(html));
  ok("Escape closes it", /payBreakSheet"\)\.classList\.contains\("on"\)\) \{\s*closePayBreakdown\(\)/.test(app));
  ok("a close button closes it", /\[data-pay-close\]/.test(app));
  ok("the backdrop closes it", /e\.target === this\) closePayBreakdown\(\)/.test(app));
  ok("and focus is given back", /restoreFocus\(\)/.test(fnSource("closePayBreakdown")));
});

group("the four windows are all offered", () => {
  for (const v of ["all", "month", "year", "last"]) {
    ok(`the ${v} radio exists`, new RegExp(`id="payRange[A-Za-z]+" value="${v}"`).test(html));
  }
  ok("in a radiogroup", /role="radiogroup"/.test(html));
  is("and each has a label", (html.match(/for="payRange/g) || []).length, 4);
  /* A radio with no name is its own group and desynchronises the others. */
  is("all four share one name", (html.match(/name="payRange"/g) || []).length, 4);
});

group("the trigger only appears when there is something to show", () => {
  ok("the button row starts hidden", /id="payerBreakdownRow" hidden/.test(html));
  ok("and is revealed with the chart", /row\.hidden = !t\.rows\.length/.test(fnSource("renderPayerChart")));
  ok("so a car with no splits never offers a dead control", /if \(!t\.rows\.length\)[\s\S]{0,60}hidden = true/.test(fnSource("renderPayerChart")));
});

group("the sheet is narrow like a sheet, not a full page", () => {
  /* A modal wide enough for a table would force a horizontal scroll on a phone,
     which is the thing the log just stopped doing. */
  ok("it has its own width", /\.pay-box \{/.test(css));
  const m = /\.pay-box \{[^}]*\}/.exec(css);
  ok("and it is a max-width, not a width", /max-width/.test(m[0]));
});

group("every new string exists in all three languages", () => {
  for (const k of [
    "pay.breakdown",
    "pay.rangeAll",
    "pay.rangeMonth",
    "pay.rangeYear",
    "pay.rangeLast",
    "pay.total",
    "pay.sessions",
    "pay.unassignedShort",
    "pay.nothingInRange",
  ]) {
    is(k, (i18n.match(new RegExp('"' + k.replace(/\./g, "\\.") + '"', "g")) || []).length, 3);
  }
});

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);