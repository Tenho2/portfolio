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

group("the phone navigation is a full-width bottom bar", () => {
  const m = css.slice(css.indexOf("@media (max-width: 820px)"));
  ok("the mobile block exists", m.length > 0);
  const side = /body\[data-layout="win31"\] \.side\s*\{([^}]*)\}/.exec(m);
  ok("the rail rule exists", !!side);
  if (side) {
    ok("it is fixed", /position:\s*fixed/.test(side[1]));
    ok("it spans the viewport", /left:\s*0/.test(side[1]) && /right:\s*0/.test(side[1]) && /width:\s*100%/.test(side[1]));
    ok("it sits on the bottom edge", /bottom:\s*0/.test(side[1]));
    ok("it is above the content", /z-index:\s*100/.test(side[1]));
    ok("the floating window bevel is gone", /padding:\s*0/.test(side[1]));
  }
  ok("the classic gray bar survives", /background:\s*#c0c0c0/.test(m));
  ok("the top bevel is a single inset line", /border-top:\s*2px solid #ffffff/.test(m) && /inset 0 1px 0 #dfdfdf/.test(m));
  ok("the title bar is hidden", /body\[data-layout="win31"\] \.side-brand[^{]*\{[^}]*display:\s*none/.test(m));
  ok(
    "the nav is a horizontal row",
    /body\[data-layout="win31"\] \.side-nav\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*row[^}]*justify-content:\s*space-around[^}]*width:\s*100%[^}]*padding:\s*4px[^}]*gap:\s*4px/.test(
      m,
    ),
  );
  ok(
    "each tab flexes equally",
    /body\[data-layout="win31"\] \.side-nav li\s*\{[^}]*flex:\s*1 1 0[^}]*min-width:\s*0/.test(m),
  );
  const button = /body\[data-layout="win31"\] \.side-nav button\s*\{([^}]*)\}/.exec(m);
  ok("the tab button exists", !!button);
  if (button) {
    ok("it is gray with black ink", /background:\s*#c0c0c0/.test(button[1]) && /color:\s*#000000/.test(button[1]));
    ok("it has square corners", /border-radius:\s*0/.test(button[1]));
    ok(
      "it carries the classic outset bevel",
      /inset -1px -1px #000/.test(button[1]) &&
        /inset 1px 1px #fff/.test(button[1]) &&
        /inset -2px -2px #808080/.test(button[1]) &&
        /inset 2px 2px #dfdfdf/.test(button[1]),
    );
  }
  const active = /body\[data-layout="win31"\] \.side-nav button\.active,[\s\S]{0,120}\[aria-current="page"\]\s*\{([^}]*)\}/.exec(
    m,
  );
  ok("the active rule targets the button, not the rail", !!active);
  if (active) {
    ok(
      "the active bevel is inverted",
      /inset 1px 1px #000/.test(active[1]) &&
        /inset -1px -1px #fff/.test(active[1]) &&
        /inset 2px 2px #808080/.test(active[1]) &&
        /inset -2px -2px #dfdfdf/.test(active[1]),
    );
    ok("and it is pressed in", /transform:\s*translate\(1px, 1px\)/.test(active[1]));
  }
  ok("the content clears the bar", /body\[data-layout="win31"\] \.wrap\s*\{[^}]*padding-bottom:\s*4\.5rem/.test(m));
  ok(
    "the three quick actions keep three columns",
    /body\[data-layout="win31"\] #dashboard \.qa\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(
      m,
    ),
  );
  ok(
    "the sheet clears the fixed taskbar",
    /body\[data-layout="win31"\] \.sheet\s*\{[^}]*padding-bottom:\s*4\.5rem/.test(
      m,
    ) &&
      /body\[data-layout="win31"\] \.sheet \.sheet-box\s*\{[^}]*max-height:\s*calc\(90vh - 4\.5rem\)/.test(
        m,
      ),
  );
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
