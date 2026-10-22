/**
 * The Windows 3.1 theme's contract.
 *
 * Why this file exists
 *   UI themes have failed in this app in three ways: by depending on
 *   app/app.css, by being offered in the switcher without a matching page, and
 *   by restyling a generic component until a variant became unreadable (the
 *   .btn.dgr and .btn.warn failures). test-layouts.mjs covers the page/id
 *   contract. This suite covers the thing that makes it a Windows 3.1 theme:
 *   the palette, the hard bevels, the navy title bars, and the absence of
 *   modern decoration.
 *
 *   node tools/test-win31-theme.mjs
 */
import { readFileSync } from "node:fs";

const css = readFileSync("app/ui/win31.css", "utf8");
const page = readFileSync("ev-tracker-win31.html", "utf8");
const i18n = readFileSync("app/i18n.js", "utf8");

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
/** The block of a CSS rule, so a value is checked in the right scope. */
function block(selector) {
  const i = css.indexOf(selector);
  if (i < 0) return "";
  const open = css.indexOf("{", i);
  const close = css.indexOf("}", open);
  return open < 0 || close < 0 ? "" : css.slice(open + 1, close);
}

group("the page is a UI-theme page, not a shared one", () => {
  ok("the page exists", page.length > 0);
  ok("it declares win31", /<body[^>]*data-layout="win31"/.test(page));
  ok("it loads the UI base", /href="app\/ui\/base\.css"/.test(page));
  ok("it loads its own theme", /href="app\/ui\/win31\.css"/.test(page));
  ok("it does not load app.css", !/href="app\/app\.css"/.test(page));
  ok("it still loads the application", /src="app\/app\.js"/.test(page));
});

group("the palette is Windows 3.1, not a recolour", () => {
  const root = block(":root {");
  ok("teal desktop", /--win-teal:\s*#008080/.test(root));
  ok("silver window", /--win-gray:\s*#c0c0c0/.test(root));
  ok("navy title bar", /--win-navy:\s*#000080/.test(root));
  ok("black text", /--text:\s*var\(--win-black\)/.test(root));
  ok("square corners", /--radius:\s*0/.test(root) && /--radius-sm:\s*0/.test(root));
  ok("the desktop is teal", /background:\s*var\(--win-teal\)/.test(block("body {")));
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  ok("no rounded corners anywhere", !/border-radius:\s*[1-9]/.test(bare));
  ok("no gradients", !/gradient/i.test(bare));
  const glass = [...bare.matchAll(/backdrop-filter:\s*([^;]+)/g)].map((m) =>
    m[1].trim(),
  );
  ok("no glass", glass.every((v) => v === "none"));
});

group("windows are built from hard two-tone bevels", () => {
  const root = block(":root {");
  ok("an outer bevel is defined", /--bevel-out:/.test(root));
  ok("an inner bevel is defined", /--bevel-in:/.test(root));
  ok("the panel is raised", /box-shadow:\s*var\(--bevel-out\)/.test(block(".panel,")));
  ok("the button is raised", /box-shadow:\s*var\(--bevel-out\)/.test(block(".btn,")));
  ok("a pressed button sinks", /box-shadow:\s*var\(--bevel-in\)/.test(block(".btn:active,")));
  ok("fields sink", /box-shadow:\s*var\(--bevel-in\)/.test(block("input,")));
});

group("the title bars are the window chrome", () => {
  const title = block(".panel > h2,");
  ok("the title bar is navy", /background:\s*var\(--win-navy\)/.test(title));
  ok("and its text is white", /color:\s*#fff/.test(title));
  ok("it carries a decorative control box", /::after/.test(css) && /var\(--bevel-out\)/.test(block(".panel > h2::after,")));
  ok("sheets use the same title bar", /\.sheet-box > h3/.test(css));
});

group("controls are period-correct", () => {
  ok("the typeface is MS Sans Serif with a fallback", /MS Sans Serif/.test(block(":root {")));
  ok("buttons are not shouty uppercase", /text-transform:\s*none/.test(block(".btn,")));
  ok("focus is a dotted rectangle", /outline:\s*1px dotted/.test(css));
  ok("the warning variant keeps black ink", /\.btn\.warn\s*\{[^}]*color:\s*#000/.test(css));
  ok("the destructive variant keeps white ink", /\.btn\.dgr\s*\{[^}]*color:\s*#fff/.test(css));
});

group("the dark variant is deliberate", () => {
  const dark = block('body.dark[data-layout="win31"] {');
  ok("a dark palette exists", /--bg:\s*#000000/.test(dark));
  ok("it keeps the navy title bar", /background:\s*#000080/.test(css));
  ok("inputs stay readable", /body\.dark\[data-layout="win31"\] input/.test(css));
});

group("the label is translated everywhere", () => {
  for (const key of ["set.layoutWin31"]) {
    ok(
      `${key} is translated in all three languages`,
      (i18n.match(new RegExp(`"${key}":`, "g")) || []).length === 3,
    );
  }
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
