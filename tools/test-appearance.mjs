/**
 * Appearance memory: layout, theme, red mode and scanlines across reloads.
 *
 * Why this exists
 *   The layout used to be deliberately forgotten: switching pages was a plain
 *   navigation and nothing was stored. That is correct for a browser tab, but
 *   wrong for an installed PWA, whose manifest start_url is always
 *   ev-tracker.html - so every home-screen launch dropped the user back into
 *   classic no matter which UI they had chosen.
 *
 *   Persisting it is easy to get wrong in two specific ways, and both are
 *   silent: redirecting from a page the user opened directly (which makes that
 *   layout unreachable by URL), and restoring one preference by assigning the
 *   whole class attribute (which wipes the others). The pure helpers are
 *   tested here, and the boot order is pinned by source.
 *
 *   node tools/test-appearance.mjs
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { appSource, fnSource } from "./app-source.mjs";

const app = appSource();
const storage = readFileSync("app/storage.js", "utf8");
const readme = readFileSync("README.md", "utf8");

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
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

const PAGES = [
  { name: "classic", file: "ev-tracker.html" },
  { name: "wide", file: "ev-tracker-wide.html" },
  { name: "focus", file: "ev-tracker-focus.html" },
  { name: "modern", file: "ev-tracker-modern.html" },
  { name: "hud", file: "ev-tracker-hud.html" },
  { name: "brutal", file: "ev-tracker-brutal.html" },
  { name: "editorial", file: "ev-tracker-editorial.html" },
  { name: "glass", file: "ev-tracker-glass.html" },
];

/* The pure helpers, with the real page list injected so the mapping under test
   is the one that ships. */
const layoutRedirectTarget = new Function(
  `var LAYOUT_PAGES = ${JSON.stringify(PAGES)};` +
    fnSource("layoutFileFor") +
    fnSource("layoutRedirectTarget") +
    "; return layoutRedirectTarget;",
)();
const bootClasses = new Function(`${fnSource("bootClasses")}; return bootClasses;`)();

/* app/storage.js is a classic script that publishes onto window. */
function loadStorage(localStorage) {
  const window = { localStorage };
  const sandbox = { window, localStorage, console };
  vm.createContext(sandbox);
  vm.runInContext(storage, sandbox, { filename: "app/storage.js" });
  if (!window.EV_STORAGE) throw new Error("app/storage.js did not publish EV_STORAGE");
  return window.EV_STORAGE;
}
function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(String(k)) ? data.get(String(k)) : null),
    setItem: (k, v) => data.set(String(k), String(v)),
    removeItem: (k) => data.delete(String(k)),
    clear: () => data.clear(),
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
  };
}

group("the start page redirects to the remembered layout, and only there", () => {
  /* The manifest's start_url is ev-tracker.html, whose layout is classic. */
  is("classic remembers the HUD", layoutRedirectTarget("classic", "hud"), "ev-tracker-hud.html");
  is("classic remembers wide", layoutRedirectTarget("classic", "wide"), "ev-tracker-wide.html");
  is("classic with no memory stays put", layoutRedirectTarget("classic", null), null);
  is("classic with classic stored stays put", layoutRedirectTarget("classic", "classic"), null);
  /* A direct link to a layout page is a deliberate act. It must not bounce to
     whatever was chosen last, or that page becomes unreachable by URL. */
  is("the HUD page is not redirected", layoutRedirectTarget("hud", "wide"), null);
  is("wide is not redirected to the HUD", layoutRedirectTarget("wide", "hud"), null);
  /* A stale or hand-edited value must not navigate anywhere. */
  is("an unknown stored layout is ignored", layoutRedirectTarget("classic", "nonsense"), null);
  is("an empty stored layout is ignored", layoutRedirectTarget("classic", ""), null);
});

group("the redirect is wired at boot without losing the view", () => {
  ok("boot consults the remembered layout", /if \(restoreLayout\(\)\) return;/.test(app));
  ok(
    "it replaces rather than assigning, so Back does not bounce",
    /location\.replace\(target \+ location\.hash\)/.test(app),
  );
  ok("and the fragment is carried", /\+ location\.hash/.test(app));
  /* And it runs before the app loads data, so nothing flashes. */
  const boot = app.slice(app.indexOf("/* ---------- boot ---------- */"));
  const layoutAt = boot.indexOf("restoreLayout()");
  const appearanceAt = boot.indexOf("restoreAppearance()");
  const loadAt = boot.indexOf("load();");
  ok("the layout check comes first", layoutAt > 0 && layoutAt < appearanceAt);
  ok("the appearance is restored before the first read", appearanceAt > 0 && appearanceAt < loadAt);
});

group("the picker remembers the choice through the storage module", () => {
  ok("the picker calls rememberLayout", /rememberLayout\(target\.name\)/.test(app));
  ok("the helper writes the published key", /localStorage\.setItem\(K\.layout, name\)/.test(app));
  const S = loadStorage(fakeStorage());
  is("the storage module publishes layout", S.layout, "layout");
  is("the key is global", S.keysFor("user-a").layout, S.keysFor(null).layout);
  is("and is not account-scoped", S.keysFor("user-a").layout, "layout");
});

group("appearance preferences are independent body classes", () => {
  const none = bootClasses({}, true);
  is("no stored theme is light", none.dark, false);
  is("no stored red mode is off", none.red, false);
  /* Opt-in: never set has to mean off, or the retro texture returns for
     somebody who never asked for it. */
  is("no stored scanlines is off", none.scan, false);

  const all = bootClasses(
    { theme: "dark", redMode: "on", scanlines: "on" },
    true,
  );
  is("dark theme applies", all.dark, true);
  is("red mode applies on the HUD", all.red, true);
  is("scanlines apply on the HUD", all.scan, true);

  /* Neither of the HUD-only classes may leak onto a shared layout. */
  const shared = bootClasses(
    { theme: "dark", redMode: "on", scanlines: "on" },
    false,
  );
  is("shared layouts keep the theme", shared.dark, true);
  is("shared layouts do not get red mode", shared.red, false);
  is("shared layouts do not get scanlines", shared.scan, false);

  is("only the literal on enables a switch", bootClasses({ redMode: "yes" }, true).red, false);
  is("the scanline key is published", loadStorage(fakeStorage()).scanlines, "scanlines");
});

group("one preference cannot wipe another at boot", () => {
  const restore = fnSource("restoreAppearance");
  ok("it toggles the theme", /classList\.toggle\("dark", c\.dark\)/.test(restore));
  ok("it toggles red mode", /classList\.toggle\("red-mode", c\.red\)/.test(restore));
  ok("it toggles scanlines", /classList\.toggle\("show-scanlines", c\.scan\)/.test(restore));
  /* Assigning className would drop the other two, which is the exact failure a
     previous attempt produced. */
  ok("it never assigns className", !/className\s*=/.test(restore));
  ok("it re-syncs the header button", /syncThemeButton\(\)/.test(restore));
});

group("the documentation matches the behaviour", () => {
  ok(
    "README says the layout is remembered",
    /chosen layout \*\*is remembered\*\*/.test(readme),
  );
  ok("and no longer claims it is not", !/deliberately \*\*not remembered\*\*/.test(readme));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
