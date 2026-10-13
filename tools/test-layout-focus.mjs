/**
 * The focus layout matches the spec it was planned from.
 *
 * README.md:472 and HANDOVER.md:101 describe focus as "deep indigo-slate, mint
 * #10B981, hairline borders, no gradients or glass, a desktop rail and a mobile
 * bottom bar, inline monochrome SVG icons in place of emoji". tools/test-layouts.mjs
 * proves the page is generated, scoped and free of component restyling; this
 * suite proves the focus-specific promise:
 *   1. The palette lives in app/app.css under body[data-layout="focus"] and the
 *      layout sheet stays arrangement-only.
 *   2. Gradients and glass are removed, and the background is a flat colour.
 *   3. The shell folds from a desktop rail into a mobile bottom bar.
 *   4. The nav rail and the primary actions use inline SVG, and nothing else was
 *      touched (the brand and theme emoji survive).
 *   5. The raw server refusal text sits behind a "Technical details" disclosure.
 *   6. The page is offered by the switcher, cached by the service worker, and the
 *      label is translated.
 *
 *   node tools/test-layout-focus.mjs
 */
import { readFileSync, existsSync } from "node:fs";

const appCss = readFileSync("app/app.css", "utf8");
const focusCss = readFileSync("app/layout-focus.css", "utf8");
const html = readFileSync("ev-tracker.html", "utf8");
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

/* The nav list and the dashboard quick actions, so the icon swap can be checked
   in isolation from every other emoji on the page. */
const nav = html.slice(html.indexOf('<ul class="side-nav">'), html.indexOf("</ul>"));
const qa = html.slice(html.indexOf('<div class="qa">'), html.indexOf("</div>", html.indexOf('<div class="qa">')));

group("the palette lives in the shared sheet, not the layout sheet", () => {
  ok("focus redefines the primary to mint", /body\[data-layout="focus"\]\s*\{[^}]*--primary:\s*#10b981;/.test(appCss));
  ok("focus redefines the page background to indigo-slate", /body\[data-layout="focus"\]\s*\{[^}]*--page-a:\s*#[0-9a-fA-F]+;/.test(appCss));
  /* The sheet may reference var(--line) and var(--primary) for the rail border
     and the current-page marker; it must not define the tokens themselves. */
  ok("the layout sheet carries no palette", !/--primary\s*:|--surface\s*:|--line\s*:|#10b981/.test(focusCss));
});

group("gradients and glass are removed", () => {
  ok("the page background is a flat colour, not a gradient", /body\[data-layout="focus"\]\s*\{[^}]*background:\s*#[0-9a-fA-F]+;/.test(appCss));
  ok("the sheet scrim loses its blur", /body\[data-layout="focus"\]\s*\.sheet\s*\{[^}]*backdrop-filter:\s*none/.test(appCss));
  ok("the pressed vehicle card is flat, not a gradient", /body\[data-layout="focus"\]\s*\.vcard\[aria-pressed="true"\]\s*\{[^}]*background:\s*var\(--surface-2\)/.test(appCss));
});

group("the shell folds from a rail into a bottom bar", () => {
  ok("keeps a fixed rail at the 820px collapse", /@media\s*\(max-width:\s*820px\)[\s\S]*body\[data-layout="focus"\]\s*\.side\s*\{[^}]*position:\s*fixed/.test(focusCss));
  ok("the rail labels are restored between 700px and 820px", /@media\s*\(max-width:\s*820px\)[\s\S]*\.side-nav button span:not\(\.ic\):not\(\.bin-count\)\s*\{[^}]*display:\s*inline/.test(focusCss));
  ok("has a mobile bottom bar breakpoint", /@media\s*\(max-width:\s*700px\)/.test(focusCss));
  ok("the bar pins to the bottom edge", /@media\s*\(max-width:\s*700px\)[\s\S]*\.side\s*\{[^}]*inset:\s*auto 0 0 0/.test(focusCss));
  ok("the rail furniture is hidden only on mobile", /@media\s*\(max-width:\s*700px\)[\s\S]*\.side-brand,[\s\S]*\.badge,[\s\S]*\.who-mobile\s*\{[^}]*display:\s*none/.test(focusCss));
  ok("content is padded up off the bar", /@media\s*\(max-width:\s*700px\)[\s\S]*\.wrap\s*\{[^}]*padding-bottom:\s*5rem/.test(focusCss));
});

group("the nav rail and primary actions use inline SVG", () => {
  ok("six nav icons are inline SVG", (nav.match(/<svg/g) || []).length === 6);
  ok("five primary-action icons are inline SVG", (qa.match(/<svg/g) || []).length === 5);
  ok("the icons inherit the text colour", /stroke="currentColor"/.test(nav) && /stroke="currentColor"/.test(qa));
  ok("no emoji remain in the nav or the actions", !/📊|📝|📄|⭐|🗑️|⚙️|🛰️|📥|➕/.test(nav + qa));
  ok("the swap did not touch the rest of the page", /🚗/.test(html) && /☀️/.test(html));
  ok("the icon size helper exists", /\.ic\s*svg\s*\{/.test(appCss));
});

group("the raw server text is behind a disclosure", () => {
  ok("the panel renders a details element", appJs.includes('<details class="sync-tech">'));
  ok("the summary uses the translated key", appJs.includes('TXT("sync.techDetails")'));
  ok("the key is translated in all three languages", (i18n.match(/"sync\.techDetails":/g) || []).length === 3);
});

group("the focus page is offered and cached", () => {
  ok("shell.mjs lists the focus page", /name:\s*"focus",\s*file:\s*"ev-tracker-focus\.html"/.test(shell));
  ok("app.js lists the focus page", /name:\s*"focus",\s*file:\s*"ev-tracker-focus\.html"/.test(appJs));
  ok("the focus page exists", existsSync("ev-tracker-focus.html"));
  ok("the focus page declares its layout", /<body[^>]*data-layout="focus"/.test(readFileSync("ev-tracker-focus.html", "utf8")));
  ok("the service worker precaches the page and sheet", sw.includes('"./ev-tracker-focus.html"') && sw.includes('"./app/layout-focus.css"'));
  ok("the offline fallback knows the focus page", /const PAGES = \[[\s\S]*?ev-tracker-focus\.html[\s\S]*?\];/.test(sw));
});

group("the focus label is translated in all three languages", () => {
  ok("set.layoutFocus appears once per language", (i18n.match(/"set\.layoutFocus":/g) || []).length === 3);
});

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
