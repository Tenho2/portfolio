/*
 * Seconds on every time field, and the data loss that came with it.
 *
 * The background
 *   There were never any carousels. "The same three wheels as the duration has
 *   when you tick add seconds" is the browser's native time picker drawing its
 *   third wheel because step="1" instead of step="60". So the whole feature was
 *   one attribute on four inputs.
 *
 * The bug that came with it
 *   fmtTime() matched an optional seconds group and then returned only hours and
 *   minutes. A row with 12:30:45 came back as "12:30". While the only
 *   seconds-capable field was the duration - which fmtTime never touches - that
 *   was unreachable. Giving the time field the same precision made it a live
 *   path, and every edit-save would have silently rewritten the clock of every
 *   row. So the fix and the truncation fix ship together or not at all.
 *
 * Also removed here: durShowSec, a module global that openEdit() read to decide
 * the edit sheet's granularity. Ticking the checkbox on the add form silently
 * changed the editor for every later edit - a setting that lived in the DOM of a
 * different view and was never persisted anywhere.
 *
 *   node tools/test-time-fields.mjs
 */
import { appSource, fnSource } from "./app-source.mjs";

let pass = 0;
const failures = [];
function ok(label, condition) {
  if (condition) pass++;
  else failures.push(label);
}
function is(label, actual, expected) {
  /* Object.is, because === reports NaN !== NaN. Three of the assertions below
     assert a rejection, which is spelled NaN, and a plain === would fail them
     all for the wrong reason - the same way a negative assertion against an
     empty string passes for the wrong reason. */
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

import { readFileSync } from "node:fs";

/* Run the real parse and format functions. */
const build = new Function(
  ["pad", "hmToHours", "hoursToHM", "fmtTime", "validTime"],
  [
    fnSource("pad"),
    fnSource("hmToHours"),
    fnSource("hoursToHM"),
    fnSource("fmtTime"),
    fnSource("validTime"),
    "return { hmToHours, hoursToHM, fmtTime, validTime };",
  ].join("\n"),
);
const F = build();

group("every time field offers its third wheel", () => {
  /* step="1" is what makes the native picker draw HH:MM:SS. step="60" draws two
     wheels, which is what the checkbox used to switch between. */
  for (const id of ["duration", "time", "eDuration", "eTime"]) {
    ok(`#${id} exists`, html.includes(`id="${id}"`));
    /* Prettier puts one attribute per line, so `step` can sit a long way from
       `id` in either direction. The tag itself is the only thing to look at. */
    const at = html.indexOf(`id="${id}"`);
    const open = html.lastIndexOf("<input", at);
    const close = html.indexOf(">", at);
    const tag = html.slice(open, close);
    ok(`#${id} has step="1"`, /step="1"/.test(tag));
    ok(`#${id} has no step="60"`, !/step="60"/.test(tag));
  }
  /* The date field is a date; wheels would be meaningless. Listed so a future
     "make them all the same" cannot silently hit it. */
  const dateAt = html.indexOf('id="date"');
  const dateTag = html.slice(html.lastIndexOf("<input", dateAt), html.indexOf(">", dateAt));
  ok("#date is a date input", /type="date"/.test(dateTag));
  ok("#date carries no step", !/step=/.test(dateTag));
});

group("the seconds switch and its leaked global are gone", () => {
  /* Matched against the code with comments stripped: this file's own prose
     names the deleted function, and a check that trips over a comment reports
     a problem that is not there. */
  const code = app.replace(/\/\*[\s\S]*?\*\//g, "");
  ok("no #durSec checkbox", !html.includes('id="durSec"'));
  ok("no durShowSec variable", !/var durShowSec/.test(code));
  ok("no durShowSec assignment", !/durShowSec\s*=/.test(code));
  ok("no applyDurStep function", !/function applyDurStep/.test(code));
  ok("no applyDurStep call", !/applyDurStep\s*\(/.test(code));
  ok("no syncDurHint", !/function syncDurHint/.test(code));
  ok("no durSecondsOn", !/durSecondsOn/.test(code));
  /* A plain substring, not a regex: the pattern contains parentheses that belong
     to the JavaScript being searched for, and escaping them inside a regex
     literal is exactly the fiddliness that hides a real failure behind a syntax
     error. */
  ok("the edit sheet no longer writes .step at all", !code.includes('$("eDuration").step'));
  /* The orphan strings must be gone too, or they sit in three dictionaries
     looking load-bearing. */
  const i18n = readFileSync("app/i18n.js", "utf8");
  for (const key of ["as.durSec", "as.durHintSec", "ed.durHintSec"])
    ok(`${key} removed`, !i18n.includes(`"${key}":`));
  /* And one hint survives, in all three languages. */
  for (const key of ["as.durHint", "ed.durHint"]) {
    const n = (i18n.match(new RegExp(`"${key}":`, "g")) || []).length;
    is(`${key} exists in all three languages`, n, 3);
  }
});

group("fmtTime keeps the seconds it matched", () => {
  /* The truncation. Every one of these used to return the first two components. */
  is("a full time survives", F.fmtTime("12:30:45"), "12:30:45");
  is("leading zeroes survive", F.fmtTime("07:05:09"), "07:05:09");
  is("an already-padded time is untouched", F.fmtTime("23:59:59"), "23:59:59");
  /* Seconds of zero are dropped rather than invented, so a hundred historical
     rows do not all gain ":00" the day this ships. */
  is("zero seconds are not invented", F.fmtTime("12:30:00"), "12:30");
  is("a time without seconds is unchanged", F.fmtTime("12:30"), "12:30");
  is("a loose separator still works", F.fmtTime("12.30.45"), "12:30:45");
  is("an empty value is still empty", F.fmtTime(""), "");
  is("null is still empty", F.fmtTime(null), "");
});

group("validTime accepts and preserves seconds on import", () => {
  /* The export writes HH:MM:SS now, so a two-component regex either rejected
     every row of a file this app produced or silently truncated it. */
  is("HH:MM:SS round-trips", F.validTime("12:30:45"), "12:30:45");
  is("HH:MM is still accepted", F.validTime("12:30"), "12:30");
  is("zero seconds are dropped", F.validTime("12:30:00"), "12:30");
  is("a single-digit hour is padded", F.validTime("7:05"), "07:05");
  /* Bounds. A clock cannot pass 23:59:59 whatever the input claims. */
  is("hour 24 is rejected", F.validTime("24:00"), null);
  is("minute 60 is rejected", F.validTime("12:60"), null);
  is("second 60 is rejected", F.validTime("12:30:60"), null);
  is("garbage is rejected", F.validTime("noon"), null);
});

group("hoursToHM has two deliberate modes", () => {
  /* Input fields must be able to SHOW seconds, even a whole-minute one. */
  is("inputs show seconds", F.hoursToHM(0.5, true), "00:30:00");
  /* Read paths - the log, the tiles, every CSV export - stay clean, because a
     hundred whole-minute rows becoming "01:30:00" is a diff on data nobody
     asked to change. */
  is("reads stay clean for whole minutes", F.hoursToHM(0.5), "00:30");
  is("reads show real seconds", F.hoursToHM(0.5 + 45 / 3600), "00:30:45");
  is("a duration over an hour still works", F.hoursToHM(2.25, true), "02:15:00");
});

group("hmToHours still parses a duration, not a clock", () => {
  /* The distinction the carousel work could not ignore: a duration accumulates
     and may run long, a wall clock never does. The two caps have to stay
     different or one of the two fields starts rejecting valid input. */
  is("a 48-hour session is still accepted", F.hmToHours("48:00"), 48);
  is("49 hours is still refused", F.hmToHours("49:00"), NaN);
  is("seconds are counted", F.hmToHours("00:00:45"), 0.0125);
  is("an impossible minute is refused", F.hmToHours("00:60"), NaN);
  /* The signed-component hole. `-0 < 0` is false in JavaScript, so "-0:30"
     passed the negative check and came back as thirty minutes - a malformed
     string silently accepted. Each component must now be digits only. */
  is("a signed hour is refused", F.hmToHours("-0:30"), NaN);
  is("a signed minute is refused", F.hmToHours("00:-30"), NaN);
  is("a signed second is refused", F.hmToHours("00:00:-30"), NaN);
  /* The real property, stated directly: no malformed input may produce a
     negative number of hours, because a negative row SUBTRACTS from the Hours
     tile and from every total derived from it. */
  const junk = ["-0:30", "0:-30", "0:0:-30", "-1:-1", "+1:00", "1e1:00", "  :  ", "-:-", "1:-2:3"];
  ok(
    "no malformed input yields a negative duration",
    junk.every((v) => {
      const h = F.hmToHours(v);
      return !(typeof h === "number" && h < 0);
    }),
  );
});

group("both pages carry the same change", () => {
  for (const f of [html, wide]) {
    ok(`step="1" present (${f === html ? "classic" : "wide"})`, /id="duration"[\s\S]{0,400}?step="1"/.test(f));
    ok(`no #durSec (${f === html ? "classic" : "wide"})`, !f.includes('id="durSec"'));
  }
});

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);