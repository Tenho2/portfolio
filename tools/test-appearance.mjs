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
  { name: "focus", file: "ev-tracker-focus.html" },
  { name: "modern", file: "ev-tracker-modern.html" },
  { name: "hud", file: "ev-tracker-hud.html" },
  { name: "brutal", file: "ev-tracker-brutal.html" },
  { name: "editorial", file: "ev-tracker-editorial.html" },
  { name: "win31", file: "ev-tracker-win31.html" },
  { name: "retro-desktop", file: "ev-tracker-retro-desktop.html" },
];

/* The pure helpers, with the real page list injected so the mapping under test
   is the one that ships. */
const layoutRedirectTarget = new Function(
  `var LAYOUT_PAGES = ${JSON.stringify(PAGES)};` +
    `var RETIRED_LAYOUTS = { wide: "classic", glass: "hud" };` +
    fnSource("normaliseStoredLayout") +
    fnSource("layoutFileFor") +
    fnSource("layoutRedirectTarget") +
    "; return layoutRedirectTarget;",
)();
const bootClasses = new Function(
  `${fnSource("num")}${fnSource("isNum")}${fnSource("normaliseScanlineLevel")}${fnSource("bootClasses")}; return bootClasses;`,
)();
const isTypingTarget = new Function(
  `${fnSource("isTypingTarget")}; return isTypingTarget;`,
)();

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

group("the start page redirects to the remembered layout, or retro for a new user", () => {
  /* The manifest's start_url is ev-tracker.html, whose layout is classic. */
  is("classic remembers the HUD", layoutRedirectTarget("classic", "hud"), "ev-tracker-hud.html");
  is("classic remembers focus", layoutRedirectTarget("classic", "focus"), "ev-tracker-focus.html");
  is("classic remembers retro desktop", layoutRedirectTarget("classic", "retro-desktop"), "ev-tracker-retro-desktop.html");
  /* Archived layouts are mapped, not left to fall through. Wide is a shared
     layout, so classic is the honest replacement; Glass was experimental, so its
     users land on the surviving experimental UI. */
  is("wide falls back to classic, with no redirect", layoutRedirectTarget("classic", "wide"), null);
  is("glass falls back to the HUD", layoutRedirectTarget("classic", "glass"), "ev-tracker-hud.html");
  is(
    "a new visitor lands on retro desktop",
    layoutRedirectTarget("classic", null),
    "ev-tracker-retro-desktop.html",
  );
  is(
    "an empty preference also lands on retro desktop",
    layoutRedirectTarget("classic", ""),
    "ev-tracker-retro-desktop.html",
  );
  is("classic with classic stored stays put", layoutRedirectTarget("classic", "classic"), null);
  /* A direct link to a layout page is a deliberate act. It must not bounce to
     whatever was chosen last, or that page becomes unreachable by URL. */
  is("the HUD page is not redirected", layoutRedirectTarget("hud", "focus"), null);
  is("focus is not redirected to the HUD", layoutRedirectTarget("focus", "hud"), null);
  /* A stale or hand-edited value must not navigate anywhere. */
  is("an unknown stored layout is ignored", layoutRedirectTarget("classic", "nonsense"), null);
  /* An empty value is the same as never having chosen; it is covered above. */
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

group("retro layouts share one Hot Dog preference", () => {
  ok("one helper identifies both windowed layouts", /function isRetroLayout\(\)[\s\S]{0,180}?win31[\s\S]{0,80}?retro-desktop/.test(app));
  ok("Hot Dog is stored in one shared key", /localStorage\.setItem\(K\.hotdog, on \? "on" : "off"\)/.test(app));
  ok("the storage module declares the shared key", /var K_HOTDOG = "retroHotDog"/.test(storage));
  const S = loadStorage(fakeStorage());
  is("the key is global", S.keysFor("user-a").hotdog, S.keysFor(null).hotdog);
  is("and named retroHotDog", S.keysFor(null).hotdog, "retroHotDog");
  ok(
    "the header button is no longer a Hot Dog route",
    /if \(isRetroLayout\(\)\) return;[\s\S]{0,160}?var d = document\.body\.classList\.toggle\("dark"\)/.test(app),
  );
  ok(
    "the Settings selector is no longer a Hot Dog route",
    /function applyThemeSel[\s\S]{0,400}?if \(isRetroLayout\(\)\) return;/.test(app),
  );
});

group("appearance preferences are independent body classes", () => {
  const none = bootClasses({}, true);
  is("no stored theme is light", none.dark, false);
  is("no stored red mode is off", none.red, false);
  /* Opt-in: never set has to mean off, or the retro texture returns for
     somebody who never asked for it. */
  is("no stored scanlines is off", none.scan, 0);

  const all = bootClasses(
    { theme: "dark", redMode: "on", scanlines: "on" },
    true,
  );
  is("dark theme applies", all.dark, true);
  is("red mode applies on the HUD", all.red, true);
  /* "on" is the pre-slider value; it maps to the old 20% strength. */
  is("the legacy on value becomes 20%", all.scan, 20);

  /* Neither of the HUD-only classes may leak onto a shared layout. */
  const shared = bootClasses(
    { theme: "dark", redMode: "on", scanlines: "on" },
    false,
  );
  is("shared layouts keep the theme", shared.dark, true);
  is("shared layouts do not get red mode", shared.red, false);
  is("shared layouts do not get scanlines", shared.scan, 0);

  is("only the literal on enables a switch", bootClasses({ redMode: "yes" }, true).red, false);
  is("10% is accepted", bootClasses({ scanlines: "10" }, true).scan, 10);
  is("40% is accepted", bootClasses({ scanlines: "40" }, true).scan, 40);
  is("an unknown level is off", bootClasses({ scanlines: "65" }, true).scan, 0);
  is("the scanline key is published", loadStorage(fakeStorage()).scanlines, "scanlines");

  /* Retro layouts have their own Hot Dog switch. Global dark from another
     layout must not turn them red/yellow. */
  const retroHotdog = bootClasses(
    { theme: "light", retroHotDog: "on" },
    false,
    true,
  );
  is("retro Hot Dog applies", retroHotdog.hotdog, true);
  is("retro Hot Dog is not ordinary dark", retroHotdog.dark, false);
  const retroLight = bootClasses(
    { theme: "dark", retroHotDog: "off" },
    false,
    true,
  );
  is("global dark is ignored by a retro layout", retroLight.dark, false);
  is("retro stays light without its own flag", retroLight.hotdog, false);
  const normal = bootClasses(
    { theme: "dark", retroHotDog: "on" },
    false,
    false,
  );
  is("ordinary layouts keep the global dark theme", normal.dark, true);
  is("ordinary layouts never get the retro class", normal.hotdog, false);
});

group("one preference cannot wipe another at boot", () => {
  const restore = fnSource("restoreAppearance");
  ok("it toggles the theme", /classList\.toggle\("dark", c\.dark\)/.test(restore));
  ok("it toggles Hot Dog", /classList\.toggle\("hotdog", c\.hotdog\)/.test(restore));
  ok("it toggles red mode", /classList\.toggle\("red-mode", c\.red\)/.test(restore));
  ok("it toggles scanlines", /classList\.toggle\("show-scanlines", c\.scan > 0\)/.test(restore));
  /* Assigning className would drop the other two, which is the exact failure a
     previous attempt produced. */
  ok("it never assigns className", !/className\s*=/.test(restore));
  ok("it re-syncs the header button", /syncThemeButton\(\)/.test(restore));
});

group("a pending update is not blocked by a checkbox", () => {
  /* The controllerchange reload used to be skipped for ANY focused input. That
     meant ticking "Retro scanlines" during a service-worker update left the
     page running the old app.js and hud.css while the new HTML was already on
     screen - a checkbox that appears to do nothing and scanlines that stay on. */
  const el = (tagName, type) => ({ tagName, type });
  is("nothing focused", isTypingTarget(null), false);
  is("a button", isTypingTarget(el("BUTTON", undefined)), false);
  is("a checkbox", isTypingTarget(el("INPUT", "checkbox")), false);
  is("a radio", isTypingTarget(el("INPUT", "radio")), false);
  is("a select", isTypingTarget(el("SELECT", undefined)), false);
  is("a text field", isTypingTarget(el("INPUT", "text")), true);
  is("an input with no type (text by default)", isTypingTarget(el("INPUT", "")), true);
  is("a number field", isTypingTarget(el("INPUT", "number")), true);
  is("a textarea", isTypingTarget(el("TEXTAREA", undefined)), true);
  is("a pending file choice", isTypingTarget(el("INPUT", "file")), true);
  ok(
    "the reload guard consults it",
    /if \(isTypingTarget\(document\.activeElement\)\) return;/.test(app),
  );
  ok(
    "and no longer blocks on the bare INPUT tag",
    !/a\.tagName === "INPUT"[\s\S]{0,120}a\.tagName === "TEXTAREA"/.test(app),
  );
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
