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
const storage = readFileSync("app/storage.js", "utf8");

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

group("the luxury aesthetic strips radii and padding", () => {
  ok("the radius token drops to 3px", /body\[data-layout="focus"\]\s*\{[^}]*--r:\s*3px;/.test(appCss));
  ok("panels tighten their padding", /body\[data-layout="focus"\]\s*\.panel\s*\{[^}]*padding:\s*1rem/.test(appCss));
  ok("tiles tighten their padding", /body\[data-layout="focus"\]\s*\.stat\s*\{[^}]*padding:\s*0\.7rem/.test(appCss));
  ok("vehicle cards go to a hairline border", /body\[data-layout="focus"\]\s*\.vcard\s*\{[^}]*border-width:\s*1px/.test(appCss));
  ok("action tiles go to a hairline border and a small radius", /body\[data-layout="focus"\]\s*\.qa button\s*\{[^}]*border-width:\s*1px/.test(appCss) && /body\[data-layout="focus"\]\s*\.qa button\s*\{[^}]*border-radius:\s*3px/.test(appCss));
});

group("the mobile log is a two-line telemetry row", () => {
  ok("the density block is scoped to focus", /@media\s*\(max-width:\s*700px\)[\s\S]*body\[data-layout="focus"\] #logTable/.test(appCss));
  ok("rows become a wrapping flex row, not a table", /body\[data-layout="focus"\] #logTable tr\s*\{[^}]*display:\s*flex/.test(appCss));
  ok("the two lines are separated by a full-width break", /#logTable tr::after\s*\{[^}]*flex-basis:\s*100%/.test(appCss));
  ok("the card labels are suppressed", /body\[data-layout="focus"\] #logTable td::before\s*\{[^}]*content:\s*none/.test(appCss));
  ok("line 1 puts date and location first", /td:nth-child\(1\)\s*\{[^}]*order:\s*1/.test(appCss) && /td:nth-child\(4\)\s*\{[^}]*order:\s*2/.test(appCss));
  ok("line 1 puts energy and cost on the right", /td:nth-child\(5\)\s*\{[^}]*order:\s*3/.test(appCss) && /td:nth-child\(8\)\s*\{[^}]*order:\s*4/.test(appCss));
  ok("line 2 puts mileage, duration, then the edit action", /td:nth-child\(7\)\s*\{[^}]*order:\s*5/.test(appCss) && /td:nth-child\(3\)\s*\{[^}]*order:\s*6/.test(appCss) && /td:nth-child\(11\)\s*\{[^}]*order:\s*7/.test(appCss));
  ok("the secondary columns are hidden", /td:nth-child\(2\),[\s\S]*td:nth-child\(10\)\s*\{[^}]*display:\s*none/.test(appCss));
  ok("the delete button is hidden, leaving the edit action", /#logTable \[data-del\]\s*\{[^}]*display:\s*none/.test(appCss));
  ok("no column header is shown", !/body\[data-layout="focus"\] #logTable thead\s*\{[^}]*display:\s*block/.test(appCss));
});

group("the bottom bar honours handedness", () => {
  ok("the setting exists in the markup", /id="navAlignSel"/.test(html));
  ok("its label is translated in all three languages", (i18n.match(/"set\.navAlign":/g) || []).length === 3 && (i18n.match(/"set\.navRight":/g) || []).length === 3 && (i18n.match(/"set\.navLeft":/g) || []).length === 3);
  ok("the app writes a body attribute", /setAttribute\("data-nav-align",\s*v\)/.test(appJs));
  ok("and persists the choice", /localStorage\.setItem\(K\.na,\s*v\)/.test(appJs));
  ok("and applies it on boot", /applyNavAlign\(localStorage\.getItem\(K\.na\)\)/.test(appJs));
  ok("the change handler drives the attribute immediately", /\$\("navAlignSel"\)\.addEventListener\("change"/.test(appJs));
  ok("storage exposes a global navAlign key", /navAlign:\s*K_NAVALIGN/.test(storage));
  ok("the icons shrink to a 44px touch target", /\.side-nav li\s*\{[^}]*min-width:\s*44px/.test(focusCss));
  ok("and cluster right by default", /body\[data-layout="focus"\] .side-nav\s*\{[^}]*justify-content:\s*flex-end/.test(focusCss));
  ok("right-handed aligns to the edge with no gap", /body\[data-layout="focus"\]\[data-nav-align="right"\] .side-nav\s*\{[^}]*justify-content:\s*flex-end[^}]*padding-right:\s*0/.test(focusCss));
  ok("left-handed mirrors it", /body\[data-layout="focus"\]\[data-nav-align="left"\] .side-nav\s*\{[^}]*justify-content:\s*flex-start[^}]*padding-left:\s*0/.test(focusCss));
});

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
