/**
 * ChargeDesk 3.11 brand contract.
 *
 * A rebrand touches metadata in several independently-edited places. This test
 * keeps the PWA name, visible page titles, descriptions and language brands
 * from drifting apart again.
 */
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const i18n = readFileSync("app/i18n.js", "utf8");
const se = readFileSync("i18n/se-translation-template.json", "utf8");
const index = readFileSync("index.html", "utf8");
const sw = readFileSync("sw.js", "utf8");
const readme = readFileSync("README.md", "utf8");
const handover = readFileSync("HANDOVER.md", "utf8");
const sbom = readFileSync("SBOM.md", "utf8");

const pages = [
  "ev-tracker.html",
  "ev-tracker-focus.html",
  "ev-tracker-modern.html",
  "ev-tracker-hud.html",
  "ev-tracker-brutal.html",
  "ev-tracker-editorial.html",
  "ev-tracker-win31.html",
  "ev-tracker-retro-desktop.html",
];

let pass = 0;
const failures = [];
function ok(label, condition) {
  if (condition) pass++;
  else failures.push(label);
}
function is(label, actual, expected) {
  if (Object.is(actual, expected)) pass++;
  else failures.push(label + "\n      expected " + expected + ", got " + actual);
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log((failures.length - before ? "FAIL" : "ok  ") + "  " + name);
}

group("the PWA and package identity use ChargeDesk 3.11", () => {
  is("manifest name", manifest.name, "ChargeDesk 3.11");
  is("manifest short name", manifest.short_name, "ChargeDesk");
  ok("manifest description names the product", /^ChargeDesk 3\.11 tracks /.test(manifest.description));
  is("shortcut name", manifest.shortcuts[0].name, "Open ChargeDesk 3.11");
  is("package name", pkg.name, "chargedesk");
  is("lockfile package name", lock.name, "chargedesk");
  is("lockfile root package name", lock.packages[""].name, "chargedesk");
  ok("package description names the product", /ChargeDesk 3\.11 is a dependency-free app/.test(pkg.description));
});

group("every active layout page carries the new title and description", () => {
  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    ok(file + " title", html.includes("<title>ChargeDesk 3.11</title>"));
    ok(file + " Apple title", /apple-mobile-web-app-title" content="ChargeDesk 3\.11"/.test(html));
    ok(
      file + " meta description",
      /name="description"[\s\S]{0,140}?ChargeDesk 3\.11 tracks charging sessions/.test(html),
    );
  }
});

group("the visible brand is translated as a proper name", () => {
  is("English/Finnish/Swedish brand count", (i18n.match(/brand: "ChargeDesk 3\.11"/g) || []).length, 3);
  is("se template English brand count", (se.match(/"en": "ChargeDesk 3\.11/g) || []).length, 2);
  for (const old of ["EV Multi-Tracker", "EV Tracker", "Sähköautojen latausloki", "Laddningslogg för elbilar"])
    ok("i18n has no " + old, !i18n.includes(old));
});

group("the home page, icons, docs and cache agree", () => {
  ok("the portfolio project card names ChargeDesk 3.11", index.includes("ChargeDesk 3.11"));
  for (const file of ["icons/favicon.svg", "icons/icon.svg", "icons/icon-maskable.svg"]) {
    const svg = readFileSync(file, "utf8");
    ok(file + " title", svg.includes("<title>ChargeDesk 3.11</title>"));
    ok(file + " accessible name", svg.includes('aria-label="ChargeDesk 3.11"'));
  }
  ok("the service worker cache is rebranded", /const CACHE = .*chargedesk-shell-/.test(sw));
  ok("README names the product", readme.includes("ChargeDesk 3.11"));
  ok("HANDOVER names the rebrand", handover.includes("Rebrand to ChargeDesk 3.11"));
  ok("SBOM names the product", sbom.includes("ChargeDesk 3.11"));
});

console.log("\n" + pass + " passed, " + failures.length + " failed");
if (failures.length) {
  for (const failure of failures) console.error("  FAIL " + failure);
  process.exit(1);
}
