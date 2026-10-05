/**
 * Renders the real page and checks it the way a screen reader would.
 *
 * Why this exists
 *   The other suites extract functions and run them headlessly, which means
 *   they cannot see markup, labelling or the translation pipeline. Both times
 *   text went missing on screen, the cause lived in exactly that gap: a
 *   `data-i18n` key with no English text, and a field whose only explanation
 *   was `sr-only`. Neither is visible to a function-level test.
 *
 *   So this loads the actual ev-tracker.html into jsdom, runs the actual i18n
 *   module over it, and then asks the resulting DOM whether anything a person
 *   needs in order to use the app is actually there.
 *
 *   It deliberately does NOT boot the application script. That needs Supabase,
 *   Chart.js, Leaflet and a live network, none of which belong in a unit test,
 *   and stubbing them faithfully is a different and much larger job. What is
 *   checked here is everything that can be decided from the page alone.
 *
 *   node tools/test-dom.mjs
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const html = readFileSync("ev-tracker.html", "utf8");

let pass = 0;
const failures = [];
function is(label, actual, expected) {
  if (actual === expected) pass++;
  else failures.push(`${label}\n      expected ${expected}, got ${actual}`);
}
function fail(label, detail) {
  failures.push(`${label}\n      ${detail}`);
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

/* ------------------------------------------------------------------ */
/* 1. Boot the page as a browser would.                                */
/* ------------------------------------------------------------------ */
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

/* The i18n module now lives in app/i18n.js as a classic script. jsdom is
   created with runScripts:"outside-only" and no resource loader, so nothing
   fetches external files; read it and run it the same way a browser would run
   the tag in ev-tracker.html. If the tag is missing or points somewhere else,
   this must fail loudly rather than silently testing a stale copy. */
const i18nTag = document.querySelector('script[src*="i18n"]');
if (!i18nTag) {
  console.error("ev-tracker.html does not load the i18n module");
  process.exit(1);
}
const i18nPath = i18nTag.getAttribute("src");
if (i18nPath !== "app/i18n.js") {
  console.error(`Expected the i18n tag to load app/i18n.js, found ${i18nPath}`);
  process.exit(1);
}
const i18nSrc = readFileSync(i18nPath, "utf8");
if (!i18nSrc.includes("window.EV_I18N =")) {
  console.error(`${i18nPath} does not define window.EV_I18N`);
  process.exit(1);
}

/* Minimal globals the module expects. It reads navigator.language, and
   matchMedia is touched by some browsers' code paths. */
Object.defineProperty(window, "navigator", {
  value: { language: "en", languages: ["en"], userAgent: "test" },
  configurable: true,
});
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
}
window.eval(i18nSrc);

const i18n = window.EV_I18N;
if (!i18n) {
  console.error("The i18n module did not expose window.EV_I18N");
  process.exit(1);
}
i18n.bootLang ? i18n.bootLang() : i18n.applyI18n();

const text = (el) => (el.textContent || "").trim();

/* ------------------------------------------------------------------ */
group("every translated text element ends up with visible text", () => {
  const nodes = [...document.querySelectorAll("[data-i18n]")];
  is("there are translated elements to check", nodes.length > 100, true);
  const blank = nodes.filter((n) => !text(n));
  is(
    `no blank [data-i18n] (${blank.length} blank)`,
    blank.length,
    0,
  );
  for (const n of blank.slice(0, 8))
    fail("blank element", `${n.tagName.toLowerCase()} key=${n.getAttribute("data-i18n")}`);
});

group("every translated placeholder ends up filled", () => {
  const nodes = [...document.querySelectorAll("[data-i18n-ph]")];
  const blank = nodes.filter((n) => !(n.getAttribute("placeholder") || "").trim());
  is(`no blank [data-i18n-ph] (${blank.length} blank)`, blank.length, 0);
  for (const n of blank.slice(0, 8))
    fail("blank placeholder", `key=${n.getAttribute("data-i18n-ph")}`);
});

group("every translated accessible name ends up filled", () => {
  const nodes = [...document.querySelectorAll("[data-i18n-aria]")];
  const blank = nodes.filter((n) => !(n.getAttribute("aria-label") || "").trim());
  is(`no blank [data-i18n-aria] (${blank.length} blank)`, blank.length, 0);
  for (const n of blank.slice(0, 8))
    fail("blank aria-label", `key=${n.getAttribute("data-i18n-aria")}`);
});

group("no element still shows a raw translation key", () => {
  /* A missing key falls back to the key itself, so a visible "set.foo" is the
     signature of a lookup that failed. */
  const nodes = [...document.querySelectorAll("[data-i18n], [data-i18n-ph], [data-i18n-aria]")];
  const raw = [];
  for (const n of nodes) {
    const key = n.getAttribute("data-i18n") || n.getAttribute("data-i18n-ph") || n.getAttribute("data-i18n-aria");
    const shown = n.hasAttribute("data-i18n-ph")
      ? n.getAttribute("placeholder")
      : n.hasAttribute("data-i18n-aria")
        ? n.getAttribute("aria-label")
        : text(n);
    if (shown && shown === key) raw.push(`${key} @ ${n.tagName.toLowerCase()}`);
  }
  is(`none shown raw (${raw.length} found)`, raw.length, 0);
  for (const r of raw.slice(0, 8)) fail("raw key rendered", r);
});

/* ------------------------------------------------------------------ */
group("every label points at a field that exists", () => {
  const labels = [...document.querySelectorAll("label[for]")];
  const broken = labels.filter((l) => !document.getElementById(l.htmlFor));
  is(`no dangling label[for] (${broken.length} broken)`, broken.length, 0);
  for (const l of broken.slice(0, 8))
    fail("label points at nothing", `for="${l.htmlFor}"`);
});

group("every form control has an accessible name", () => {
  /* This is the check that would have caught "vehicle rename window missing
     help texts" and "every text field empty without explanation": a field with
     no label, no aria-label and no placeholder is unusable and silent. */
  const controls = [
    ...document.querySelectorAll("input, select, textarea"),
  ].filter((n) => n.type !== "hidden" && !n.hasAttribute("hidden"));
  const unnamed = [];
  for (const c of controls) {
    const byLabel = c.id ? document.querySelector(`label[for="${c.id}"]`) : null;
    const named =
      (byLabel && text(byLabel)) ||
      c.getAttribute("aria-label") ||
      c.getAttribute("aria-labelledby") ||
      c.getAttribute("title") ||
      c.getAttribute("placeholder");
    if (!named) unnamed.push(`${c.tagName.toLowerCase()}#${c.id || "(no id)"}`);
  }
  is(`all ${controls.length} controls are named (${unnamed.length} unnamed)`, unnamed.length, 0);
  for (const u of unnamed.slice(0, 12)) fail("control with no accessible name", u);
});

group("every input has a type", () => {
  /* A missing type defaults to text, which is invisible until it misbehaves. */
  const bad = [...document.querySelectorAll("input")].filter((n) => !n.getAttribute("type"));
  is(`none missing (${bad.length} found)`, bad.length, 0);
});

group("ids are unique", () => {
  const seen = new Map();
  const dupes = [];
  for (const n of document.querySelectorAll("[id]")) {
    const id = n.id;
    if (seen.has(id)) dupes.push(`${id} (${seen.get(id)} and ${n.tagName.toLowerCase()})`);
    else seen.set(id, n.tagName.toLowerCase());
  }
  is(`no duplicate ids (${dupes.length} found)`, dupes.length, 0);
  for (const d of dupes.slice(0, 8)) fail("duplicate id", d);
});

group("no element is left invisible by a stray CSS rule", () => {
  /* A guard on the class of damage that cost us time: a display:none or a
     zero-opacity rule that was meant for one breakpoint leaking everywhere. */
  const css = document.querySelector("style").textContent;
  is("no leftover .mini display:none in a bare rule", /^\s*\.mini\s*\{[^}]*display:\s*none/m.test(css), false);
  is("no global .user-chip display:none", /^\s*\.user-chip\s*\{[^}]*display:\s*none/m.test(css), false);
  /* Braces must balance, or everything after the mistake is dropped. */
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  is(`css braces balance (${open}/${close})`, open, close);
});

group("the vehicle editor explains both of its fields", () => {
  /* Named specifically, because this is the sheet that was reported as blank. */
  const sheet = document.getElementById("vehSheet");
  is("the sheet exists", !!sheet, true);
  if (!sheet) return;
  for (const id of ["vfName", "vfOdo"]) {
    const field = document.getElementById(id);
    is(`${id} exists`, !!field, true);
    if (!field) continue;
    const label = sheet.querySelector(`label[for="${id}"]`);
    is(`${id} has a labelled name`, !!(label && text(label)), true);
    const describedBy = field.getAttribute("aria-describedby");
    const hint = describedBy ? document.getElementById(describedBy) : null;
    /* Must be visible, not sr-only: an explanation a sighted phone user cannot
       read is not an explanation. */
    is(`${id} points at a hint`, !!hint, true);
    if (hint) {
      is(`${id} hint has text`, !!text(hint), true);
      is(`${id} hint is visible`, !hint.classList.contains("sr-only"), true);
    }
  }
});

group("each settings control is explained", () => {
  const ids = ["defLoc", "defHour", "vName", "vOdo", "ppk"];
  const section = document.getElementById("settings");
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const label = section && section.querySelector(`label[for="${id}"]`);
    const named = (label && text(label)) || el.getAttribute("aria-label") || el.getAttribute("placeholder");
    is(`${id} is named`, !!named, true);
  }
});

group("the reset button is present and unmistakable", () => {
  const b = document.getElementById("resetDeviceBtn");
  is("exists", !!b, true);
  if (b) is("has visible text", !!text(b), true);
  /* It must be its own control, never the ordinary sign-out. */
  is("ordinary sign-out still exists separately", !!document.getElementById("logoutBtn"), true);
  is("the settings sign-out exists separately", !!document.getElementById("logoutBtn2"), true);
});

/* ------------------------------------------------------------------ */
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("");
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
