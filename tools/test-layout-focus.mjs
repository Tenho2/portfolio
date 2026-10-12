/**
 * The focus layout is a real arrangement of the dashboard, and it is reachable.
 *
 * tools/test-layouts.mjs proves the focus page is generated, scoped and free of
 * restyling. It cannot prove the arrangement does what it says. This suite
 * checks that:
 *   1. The four figures the focus layout promotes are marked in the shared
 *      markup, and the sheet actually moves them ahead of the rest.
 *   2. Nothing is hidden to make room: no rule removes a tile or a view.
 *   3. The settings switcher offers the page, under a translated label.
 *   4. The service worker precaches the page and its sheet, and falls back to
 *      the page when the user is offline on it.
 *
 *   node tools/test-layout-focus.mjs
 */
import { readFileSync } from "node:fs";

const html = readFileSync("ev-tracker.html", "utf8");
const css = readFileSync("app/layout-focus.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const appJs = readFileSync("app/app.js", "utf8");
const i18n = readFileSync("app/i18n.js", "utf8");
const sw = readFileSync("sw.js", "utf8");
const shell = readFileSync("app/shell.mjs", "utf8");

let pass = 0;
const failures = [];
function ok(label, condition) {
  if (condition) pass++;
  else failures.push(label);
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

/* The rule block that sets `order` for a selector, if there is one. The
   selector is matched as written, so a rule that moved or renamed fails here. */
function orderOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!m) return null;
  const o = m[1].match(/order:\s*(-?\d+)/);
  return o ? +o[1] : null;
}

group("the promoted figures are marked in the shared markup", () => {
  const keyIds = ["sEnergy", "sCost", "sEff", "sCost100"];
  for (const id of keyIds) {
    const tile = new RegExp(`<div class="stat"[^>]*data-key[^>]*>\\s*<div class="n" id="${id}"`);
    ok(`${id} sits in a tile marked data-key`, tile.test(html));
  }
  ok(
    "exactly the four key tiles are marked",
    (html.match(/class="stat"[^>]*\bdata-key\b/g) || []).length === 4,
  );
});

group("the sheet moves the key tiles ahead of the rest", () => {
  const keyOrder = orderOf('body[data-layout="focus"] .stats > .stat[data-key]');
  const restOrder = orderOf('body[data-layout="focus"] .stats > .stat');
  ok("key tiles have an order rule", keyOrder !== null);
  ok("other tiles have an order rule", restOrder !== null);
  /* A positive control: without this, the comparison below could pass on two
     nulls. */
  ok("key tiles sort before the rest", keyOrder !== null && restOrder !== null && keyOrder < restOrder);
  ok(
    "the promoted figures are larger than the body text",
    /\.stat\[data-key\]\s*\.n\s*\{[^}]*font-size:\s*2/.test(css),
  );
});

group("nothing is hidden to make room", () => {
  /* Hiding a tile or a view would lose information in exactly the layout meant
     to show the important information most clearly. */
  ok("no display:none", !/display:\s*none/.test(css));
  ok("no visibility:hidden", !/visibility:\s*hidden/.test(css));
  ok("no tile is pushed off the grid with a zero width", !/width:\s*0/.test(css));
});

group("the settings switcher offers the focus page", () => {
  ok("app.js lists the focus page", /name:\s*"focus",\s*file:\s*"ev-tracker-focus\.html"/.test(appJs));
  ok("shell.mjs lists the focus page", /name:\s*"focus",\s*file:\s*"ev-tracker-focus\.html"/.test(shell));
  ok("the focus page exists", readFileSync("ev-tracker-focus.html", "utf8").length > 0);
  ok(
    "the focus page declares its layout",
    /<body[^>]*data-layout="focus"/.test(readFileSync("ev-tracker-focus.html", "utf8")),
  );
});

group("the focus label is translated in all three languages", () => {
  const count = (i18n.match(/"set\.layoutFocus":/g) || []).length;
  ok("set.layoutFocus appears once per language", count === 3);
});

group("the service worker caches the focus page and sheet", () => {
  ok("the shell precaches the focus page", sw.includes('"./ev-tracker-focus.html"'));
  ok("the shell precaches the focus sheet", sw.includes('"./app/layout-focus.css"'));
  const pages = sw.match(/const PAGES = \[([\s\S]*?)\];/);
  ok("the offline fallback knows the focus page", !!pages && pages[1].includes("ev-tracker-focus.html"));
});

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
