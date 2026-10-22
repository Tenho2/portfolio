/**
 * The wide layout is a real layout, not the classic one renamed.
 *
 * Both pages share app/app.css and app/app.js; the wide page adds
 * app/layout-wide.css. Nothing here proves the wide arrangement is *good* -
 * that needs a pair of eyes - but it does prove the stylesheet is doing the
 * arranging it claims to, which is the part that silently stops being true.
 *
 * The specific way that happens: app.css holds a base rule, the layout sheet
 * overrides it, and a later edit to the base rule quietly stops applying to one
 * layout. Nothing errors. The user just sees an inconsistency that no test can
 * explain.
 *
 *   node tools/test-layout-wide.mjs
 */
import { readFileSync } from "node:fs";

const css = readFileSync("app/layout-wide.css", "utf8");
const wide = readFileSync("ev-tracker-wide.html", "utf8");
const classic = readFileSync("ev-tracker.html", "utf8");
const appCss = readFileSync("app/app.css", "utf8");

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

/** Every selector the sheet declares, comments and at-rules removed. */
function selectors() {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n}")
    .flatMap((chunk) => chunk.split(/}\s*(?=[^{}]*\{)/))
    .flatMap((chunk) => chunk.split("},"))
    .map((c) => c.split("{")[0].trim())
    .filter((s) => s && !/^@/.test(s) && !/^(from|to|\d+%)$/.test(s));
}

group("the wide page is the classic page with a different shell", () => {
  ok("the wide page exists", wide.length > 0);
  ok("it declares the wide layout", /<body[^>]*data-layout="wide"/.test(wide));
  ok("the classic page declares the classic layout", /<body[^>]*data-layout="classic"/.test(classic));
  /* Both pages must reach the same application. If the wide page loaded its own
     copy, "the same app in two arrangements" would be a claim rather than a
     fact. */
  ok("the wide page loads app/app.js", /src="app\/app\.js"/.test(wide));
  ok("the classic page loads app/app.js", /src="app\/app\.js"/.test(classic));
  ok(
    "the two pages load the same stylesheet stack",
    /app\/app\.css/.test(wide) && /app\/app\.css/.test(classic),
  );
  /* The layouts differ in arrangement, so the markup must not differ at all. */
  const markup = (src) =>
    src
      .split(/\r?\n/)
      .slice(
        src.split(/\r?\n/).findIndex((l) => /<body/.test(l)),
        src.split(/\r?\n/).findIndex((l) => /scripts:begin/.test(l)),
      )
      .join("\n")
      .replace(/\s*data-layout="[^"]*"/g, "");
  ok("the markup is identical apart from the layout attribute", markup(wide) === markup(classic));
});

group("the wide shell actually rearranges things", () => {
  const all = selectors();
  ok("the sheet declares rules", all.length > 0);

  /* The rail becomes a bar: a fixed full-height side becomes a sticky row. */
  ok(
    "the navigation is unstuck from the left edge",
    /body\[data-layout="wide"\][^{]*\.side\s*\{[^}]*position:\s*sticky/.test(css),
  );
  ok(
    "the rail no longer reserves horizontal space",
    /body\[data-layout="wide"\][^{]*\.wrap[^{]*\{[^}]*margin-left:\s*0/.test(css) ||
      /body\[data-layout="wide"\]\s*\.wrap,\s*body\[data-layout="wide"\]\s*footer\s*\{[^}]*margin-left:\s*0/.test(css),
  );

  /* The classic layout's whole point at narrow widths is that the labels
     disappear. The wide layout exists precisely to not do that, so it has to
     undo it - and it has to do so explicitly, because the rule that hides the
     labels is in the shared sheet and would otherwise win. */
  ok(
    "the navigation labels are restored",
    /\.side-nav button span:not\(\.ic\):not\(\.bin-count\)\s*\{\s*display:\s*inline/.test(css),
  );

  /* Content is capped so text never runs the full width of a large display. */
  ok(
    "the content column is capped and centred",
    /\.wrap\s*\{[^}]*max-width/.test(css) && /margin-right:\s*auto/.test(css),
  );

  /* The account and sync state must be visible in the wide bar, or a user on
     this layout has no way to tell who is signed in. */
  ok(
    "the account cluster is shown in the bar",
    /body\[data-layout="wide"\][^{]*\.who-mobile\s*\{[^}]*display:\s*flex/.test(css),
  );
});

group("the wide layout cannot break the shared components", () => {
  /* app.css hides the mobile account cluster by default and switches it on
     under 560px. The wide sheet must not depend on that breakpoint, because it
     turns the cluster on at every width - which is the intent, but only if the
     underlying rules for the cluster still exist in the shared sheet. */
  ok("the shared sheet still styles the account cluster", /\.who-mobile\s*\{/.test(appCss));
  ok("the shared sheet still styles the navigation", /\.side-nav\s*\{/.test(appCss));
  ok("the shared sheet still styles the content column", /\.wrap\s*\{/.test(appCss));

  /* The wide sheet must not restyle anything the two layouts are supposed to
     share. A colour or a focus ring here is a second theme. */
  const appearance = [
    /(^|[\s;{])color\s*:/,
    /(^|[\s;{])background(-color)?\s*:/,
    /border-color\s*:/,
    /box-shadow\s*:/,
    /outline\s*:/,
    /font-family\s*:/,
  ].filter((re) => re.test(css.replace(/\/\*[\s\S]*?\*\//g, "")));
  ok(`no component appearance is overridden (${appearance.length} found)`, appearance.length === 0);

  /* Hiding content is the one thing a layout must never do on its own: it is
     how information disappears silently. */
  ok("nothing is hidden with display:none", !/display:\s*none/.test(css));
  ok("nothing is hidden with visibility:hidden", !/visibility:\s*hidden/.test(css));
});

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);