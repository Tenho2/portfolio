/**
 * Theme modes, mobile navigation and dialog surfaces.
 *
 * Why this exists
 *   Three classes of bug kept escaping visual review:
 *
 *   1. A phone bottom bar with seven labelled tabs is wider than the viewport.
 *      Settings was the sixth tab and was simply clipped off the right edge, so
 *      the only way to switch layouts disappeared.
 *   2. A UI theme can style well in one mode and be missing the other entirely.
 *      Focus was permanently dark; Editorial and Brutal had no dark tokens.
 *   3. Editorial made every dialog transparent, so #syncPanel appeared as
 *      floating text over the dimmed page.
 *
 *   These are contract assertions, not screenshots. They pin the properties
 *   that make the failures impossible: five shrinkable tabs, a Settings route
 *   to the hidden views, both token sets in each theme, and opaque dialogs.
 *
 *   node tools/test-theme-modes.mjs
 */
import { readFileSync } from "node:fs";

const appCss = readFileSync("app/app.css", "utf8");
const base = readFileSync("app/ui/base.css", "utf8");
const editorial = readFileSync("app/ui/editorial.css", "utf8");
const brutal = readFileSync("app/ui/brutal.css", "utf8");
const win31 = readFileSync("app/ui/win31.css", "utf8");
const shared = readFileSync("ev-tracker.html", "utf8");
const hud = readFileSync("tools/hud-body.html", "utf8");

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
/** The body of the first rule whose selector contains `selector`. */
function block(css, selector) {
  const i = css.indexOf(selector);
  if (i < 0) return "";
  const open = css.indexOf("{", i);
  const close = css.indexOf("}", open);
  return open < 0 || close < 0 ? "" : css.slice(open + 1, close);
}
/** The mobile block of a sheet, from its 820px media query onward. */
function mobile(css) {
  const i = css.indexOf("@media (max-width: 820px)");
  return i < 0 ? "" : css.slice(i);
}

group("the phone bar has at most five shrinkable tabs", () => {
  const m = mobile(base);
  ok("the base mobile block exists", m.length > 0);
  ok("Favourites is hidden", /li:nth-child\(4\)/.test(m) && /display:\s*none/.test(m));
  ok("the bin is hidden", /li:nth-child\(5\)/.test(m));
  ok("Settings is not hidden", !/li:nth-child\(6\)[^{]*\{[^}]*display:\s*none/.test(m));
  ok("Stations is shown", /\.nav-stations\s*\{[^}]*display:\s*block/.test(m));
  ok("the tabs share the width", /\.side-nav li\s*\{[^}]*flex:\s*1 1 0/.test(m));
  ok("a tab can shrink", /\.side-nav li\s*\{[^}]*min-width:\s*0/.test(m));
  ok("a button fills its tab", /\.side-nav button\s*\{[^}]*width:\s*100%/.test(m));
  ok("a long label ellipsises", /text-overflow:\s*ellipsis/.test(m));
});

group("the hidden views are reachable from Settings", () => {
  for (const [name, doc] of [
    ["shared", shared],
    ["HUD", hud],
  ]) {
    ok(`${name}: Settings links to Favourites`, /data-go="favourites"/.test(doc));
    ok(`${name}: Settings links to the bin`, /data-go="bin"/.test(doc));
    ok(`${name}: the shortcuts are labelled`, /set\.shortcuts/.test(doc));
  }
});

group("Focus has both a warm light and the original dark palette", () => {
  const light = block(appCss, "body[data-layout=\"focus\"] {");
  const dark = block(appCss, "body.dark[data-layout=\"focus\"] {");
  ok("the light block exists", light.length > 0);
  ok("the dark block exists", dark.length > 0);
  ok("the light surface is warm paper", /--surface:\s*#fffdf8/.test(light));
  ok("the light surface is not raw white", !/--surface:\s*#fff(?:fff)?;/.test(light));
  ok("the dark surface is the cockpit slate", /--surface:\s*#151b2e/.test(dark));
  ok("the dark mode overrides the light background", /background:\s*#0e1322/.test(dark));
});

group("Editorial has a dark edition and opaque dialogs", () => {
  const dark = block(editorial, "body.dark[data-layout=\"editorial\"] {");
  ok("the dark block exists", dark.length > 0);
  ok("the dark paper is warm charcoal", /--surface:\s*#211e19/.test(dark));
  ok("the dark ink is warm", /--text:\s*#efe9dc/.test(dark));
  for (const selector of [".sheet-box,", ".confirm-box,", ".auth-box {"]) {
    const rule = block(editorial, selector);
    ok(`${selector} has a surface`, /background:\s*var\(--surface\)/.test(rule));
    ok(`${selector} has a border`, /border:\s*1px solid var\(--line\)/.test(rule));
    ok(`${selector} is not transparent`, !/background:\s*transparent/.test(rule));
  }
  ok("the light surface is warm paper", /--surface:\s*#fffdf8/.test(editorial));
});

group("Brutal has a dark paper mode and warm light surface", () => {
  const dark = block(brutal, "body.dark[data-layout=\"brutal\"] {");
  ok("the dark block exists", dark.length > 0);
  ok("the dark paper is warm black", /--surface:\s*#221f1a/.test(dark));
  ok("the borders invert with the ink", /--line:\s*#f2ede2/.test(dark));
  ok("the light surface is warm", /--surface:\s*#fffdf8/.test(brutal));
  ok("the offset shadow follows the line token", /--shadow:\s*5px 5px 0 var\(--line\)/.test(brutal));
});

group("classic and modern light surfaces are warm", () => {
  ok("classic uses warm paper", /--surface:\s*#fffdf8/.test(appCss));
  ok("classic no longer uses raw white", !/--surface:\s*#fff;/.test(appCss));
  ok("modern stays warm", /body\[data-layout="modern"\][\s\S]{0,500}--surface:\s*#ede9e0/.test(appCss));
});

group("the other layouts already keep their mobile bars within bounds", () => {
  /* Classic is a top strip with icon-only tabs and explicit horizontal scroll. */
  ok(
    "classic hides labels on the phone strip",
    /\.side-nav button span:not\(\.ic\):not\(\.bin-count\)\s*\{\s*display:\s*none/.test(appCss),
  );
  ok("classic allows horizontal scrolling", /\.side\s*\{[^}]*overflow-x:\s*auto/.test(appCss));
  /* Focus keeps three view tabs; Modern keeps five. */
  ok(
    "focus hides Add, Favourites and Bin",
    /body\[data-layout="focus"\] \.side-nav li:nth-child\(2\),[\s\S]{0,200}nth-child\(4\),[\s\S]{0,120}nth-child\(5\)/.test(
      readFileSync("app/layout-focus.css", "utf8"),
    ),
  );
  ok(
    "modern hides Favourites and Bin",
    /body\[data-layout="modern"\] \.side-nav li:nth-child\(4\),[\s\S]{0,120}nth-child\(5\)/.test(
      readFileSync("app/layout-modern.css", "utf8"),
    ),
  );
  ok(
    "Win31 resets its desktop rail width on a phone",
    /@media \(max-width: 820px\)[\s\S]*body\[data-layout="win31"\] \.side[\s\S]{0,160}width:\s*100%/.test(
      win31,
    ),
  );
});

group("Win31 keeps its intended modes", () => {
  ok("Win31 still has a dark variant", /body\.dark\[data-layout="win31"\]/.test(win31));
  ok("Win31 keeps its teal desktop", /--win-teal:\s*#008080/.test(win31));
  ok("Win31 keeps its silver window", /--win-gray:\s*#c0c0c0/.test(win31));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
