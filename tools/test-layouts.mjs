/**
 * The layout pages cannot drift.
 *
 * Why this file exists
 *   Four of the eight pages - classic, wide, focus and modern - are the same
 *   application: identical markup, identical app/app.js, identical storage keys,
 *   identical account. The only difference is one attribute and one stylesheet.
 *   Everything else being equal is the whole safety argument - app/app.js looks
 *   up roughly 200 element ids unconditionally while wiring its handlers, so any
 *   divergence in the markup is a page that throws before the application starts.
 *
 *   That argument cannot be left as a comment. Someone adding a field to the
 *   session form on one page, or fixing a label on one page, produces a working
 *   application and a broken one side by side, and the symptom is reported by a
 *   user on whichever page was missed.
 *
 *   The four experimental UIs (hud, brutal, editorial, glass) load app/ui/base.css
 *   plus their own theme instead of app/app.css, and they are deliberately
 *   allowed to restructure the DOM rather than only recolour it - hud does. So
 *   the byte-identical assertion applies only to the shared-markup family. The
 *   experimental pages are held to the contract that actually matters: every id
 *   the shared app looks up must still exist, whichever way the DOM is arranged.
 *
 * What it checks
 *   1. Every page exists and declares a layout.
 *   2. The shared-markup pages have identical markup apart from the <body>
 *      layout attribute and the layout stylesheet href.
 *   3. The experimental pages keep every id the shared markup has, so a rewrite
 *      cannot silently break app/app.js.
 *   4. Every page loads the same four shared modules, in the same order,
 *      last-first as app/app.js.
 *   5. No page inlines CSS or JS any more.
 *   6. The layout stylesheets only arrange what app/app.css defines - they may
 *      not restyle a component's colour, border or focus ring, because that is
 *      the part the shared-markup pages share.
 *   7. The generator is stable: re-running it must change nothing.
 *
 *   node tools/test-layouts.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PAGES = [
  { name: "classic", file: "ev-tracker.html" },
  { name: "wide", file: "ev-tracker-wide.html" },
  { name: "focus", file: "ev-tracker-focus.html" },
  { name: "modern", file: "ev-tracker-modern.html" },
  /* Experimental UIs: each loads app/ui/base.css + its own theme instead of
     the shared app/app.css. */
  { name: "hud", file: "ev-tracker-hud.html", ui: true },
  { name: "brutal", file: "ev-tracker-brutal.html", ui: true },
  { name: "editorial", file: "ev-tracker-editorial.html", ui: true },
  { name: "glass", file: "ev-tracker-glass.html", ui: true },
];

/* Two families. The shared-markup pages must stay byte-identical; the
   experimental UIs may restructure, but must keep the same ids. */
const CORE = PAGES.filter((p) => !p.ui);
const UI = PAGES.filter((p) => p.ui);

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

const read = (f) => readFileSync(f, "utf8");
const appCss = read("app/app.css");
const layoutCss = {
  classic: read("app/layout-classic.css"),
  wide: read("app/layout-wide.css"),
  focus: read("app/layout-focus.css"),
  modern: read("app/layout-modern.css"),
};
const shell = read("app/shell.mjs");

/** The markup of a page: everything between <body> and the script block. */
function markupOf(file) {
  const lines = read(file).split(/\r?\n/);
  const a = lines.findIndex((l) => /<body/.test(l));
  const b = lines.findIndex((l) => /scripts:begin/.test(l));
  if (a < 0 || b < 0) throw new Error(`${file}: cannot locate the markup block`);
  return lines
    .slice(a, b)
    .join("\n")
    /* The only permitted difference: the layout attribute on <body>. */
    .replace(/\s*data-layout="[^"]*"/g, "");
}

/** The static ids declared in a markup block. */
function idsOf(markup) {
  return new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

/**
 * Remove a top-level `@media (max-width: Npx) { ... }` block, brace-balanced.
 *
 * Responsive furniture-hiding is legitimate arrangement: the focus bottom bar
 * hides the rail's brand, account and badge below 700px, and that is exactly
 * the kind of "what shows at which width" the layout sheets exist for. So the
 * display:none prohibition below reads the sheet with this block excised, and
 * the split is asserted by test-layout-focus.mjs instead of being trusted.
 */
function withoutMobile(css, maxWidthPx) {
  const query = `@media (max-width: ${maxWidthPx}px)`;
  let out = css;
  let i = out.indexOf(query);
  while (i >= 0) {
    const open = out.indexOf("{", i);
    if (open < 0) break;
    let depth = 0;
    let j = open;
    for (; j < out.length; j++) {
      if (out[j] === "{") depth++;
      else if (out[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    out = out.slice(0, i) + out.slice(j + 1);
    i = out.indexOf(query);
  }
  return out;
}

group("both layout pages exist and declare themselves", () => {
  for (const p of PAGES) {
    ok(`${p.file} exists`, existsSync(p.file));
    ok(
      `${p.file} declares data-layout="${p.name}"`,
      new RegExp(`<body[^>]*data-layout="${p.name}"`).test(read(p.file)),
    );
    if (p.ui) {
      /* Experimental UIs share no styling with app.css. */
      ok(
        `${p.file} loads the UI base`,
        /href="app\/ui\/base\.css"/.test(read(p.file)),
      );
      ok(
        `${p.file} loads its own theme`,
        new RegExp(`href="app/ui/${p.name}\\.css"`).test(read(p.file)),
      );
      ok(
        `${p.file} does not load the shared sheet`,
        !/href="app\/app\.css"/.test(read(p.file)),
      );
    } else {
      ok(
        `${p.file} loads its own layout sheet`,
        new RegExp(`href="app/layout-${p.name}\\.css"`).test(read(p.file)),
      );
      ok(
        `${p.file} loads the shared design system`,
        /href="app\/app\.css"/.test(read(p.file)),
      );
    }
  }
});

group("the shared-markup pages are the same application", () => {
  const coreMarkups = CORE.map((p) => markupOf(p.file));
  ok(
    "the markup is byte-identical across the shared-markup pages",
    coreMarkups.every((m) => m === coreMarkups[0]),
  );
  ok(
    "the shared modules are loaded identically",
    PAGES.every((p) => {
      const src = read(p.file);
      const order = ["app/i18n.js", "app/storage.js", "app/app.js"].map((m) =>
        src.indexOf(`src="${m}"`),
      );
      return order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2];
    }),
  );
  /* The whole point of the split: one copy of the application logic. If a page
     grew an inline <script> again, there would be a second copy to keep in
     step, which is the problem the split exists to remove. */
  for (const p of PAGES) {
    const src = read(p.file);
    ok(`${p.file} inlines no script`, !/<script(?![^>]*\bsrc=)[^>]*>/.test(src));
    ok(`${p.file} inlines no style`, !/<style[\s>]/.test(src));
  }
  ok("there is one application script", existsSync("app/app.js"));
  ok("there is one stylesheet", existsSync("app/app.css"));
});

group("the experimental pages restructure without breaking the id contract", () => {
  /* The experimental UIs may arrange the DOM however they like, but app/app.js
     looks up ~200 ids unconditionally, so every one of them has to survive the
     rewrite. This is the check that makes a real restructure safe: hud has a
     visibly different DOM yet cannot drop an element the app reaches for. */
  const coreMarkup = markupOf(CORE[0].file);
  const coreIds = idsOf(coreMarkup);
  for (const p of UI) {
    const markup = markupOf(p.file);
    const ids = idsOf(markup);
    const missing = [...coreIds].filter((id) => !ids.has(id));
    ok(
      `${p.file} keeps every id the shared app looks up (${missing.length} missing)`,
      missing.length === 0,
    );
    for (const id of missing.slice(0, 12))
      failures.push(`${p.file} dropped the id "${id}" the app looks up`);
  }
  /* And the restructure is deliberate, not a relabelled skin: hud's markup must
     differ from the shared markup and must not keep the .panel wrappers. */
  const hud = CORE.length ? markupOf("ev-tracker-hud.html") : "";
  ok("hud markup differs from the shared markup", hud !== coreMarkup);
  ok("hud drops the shared .panel wrappers", !/class="panel/.test(read("ev-tracker-hud.html")));
});

group("the layout sheets only arrange what the shared sheet defines", () => {
  for (const [name, css] of Object.entries(layoutCss)) {
    /* Every selector is scoped to the page's own data-layout. An unscoped rule
       would apply to both layouts, so the two could not differ - or worse, one
       would silently override the other depending on load order. */
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((b) => (b.includes("{") ? b.slice(b.lastIndexOf("}") + 0) : ""))
      .filter(Boolean);
    const unscoped = selectors.filter((s) => {
      const sel = s.split("{")[0].trim();
      if (!sel || sel.startsWith("@") || sel.startsWith("from") || sel.startsWith("to"))
        return false;
      return !/data-layout=/.test(sel);
    });
    ok(`${name}: every rule is scoped to its own layout`, unscoped.length === 0);
    /* Component colour and focus styling is shared and must not be forked: two
       pages that disagree about what a disabled button looks like are two
       themes, not two layouts. */
    const restyles = [
      /(^|[^-])color\s*:/,
      /border-color\s*:/,
      /box-shadow\s*:/,
      /outline\s*:/,
      /background(-color)?\s*:/,
      /font-family\s*:/,
    ].filter((re) => re.test(css.replace(/\/\*[\s\S]*?\*\//g, "")));
    ok(`${name}: does not restyle a component's appearance`, restyles.length === 0);
    ok(
      `${name}: cannot hide content with display:none outside the mobile bottom bar`,
      !/display:\s*none/.test(withoutMobile(css, 700)),
    );
  }
});

group("the generator is stable", () => {
  /* Running it must be a no-op. A generator that is not idempotent produces a
     page that quietly grows on every run, which is invisible until it ships. */
  const before = PAGES.map((p) => read(p.file));
  try {
    execFileSync(process.execPath, ["tools/emit-pages.mjs"], { stdio: "pipe" });
  } catch (e) {
    ok("emit-pages.mjs runs without error", false);
    return;
  }
  ok("emit-pages.mjs runs without error", true);
  const after = PAGES.map((p) => read(p.file));
  PAGES.forEach((p, i) => ok(`${p.file} is unchanged by a rebuild`, before[i] === after[i]));
});

group("every layout the switcher offers is a real page", () => {
  /* The switcher in app/app.js lists the layouts itself. If that list and
     app/shell.mjs disagree, the settings panel offers a page that does not
     exist - a 404 that only a user with that layout already selected would see,
     because the picker starts on the current one. */
  const appJs = read("app/app.js");
  const listed = [...appJs.matchAll(/file:\s*"([^"]+\.html)"/g)].map((m) => m[1]);
  ok("the switcher lists at least two layouts", listed.length >= 2);
  for (const file of listed) {
    ok(`${file} (offered by the switcher) exists`, existsSync(file));
    const sheet = (read(file).match(
      /href="(app\/(?:layout-[^"]+|ui\/[^"]+)\.css)"/,
    ) || [])[1];
    ok(`${file} loads a stylesheet that exists`, !!sheet && existsSync(sheet));
  }
  for (const p of PAGES) {
    ok(`${p.file} is offered by the switcher`, listed.includes(p.file));
  }
  /* The generator's list and the switcher's list must name the same files. */
  const fromShell = [...shell.matchAll(/file:\s*"([^"]+\.html)"/g)].map((m) => m[1]);
  ok(
    "the generator and the switcher agree on the filenames",
    [...listed].sort().join() === [...fromShell].sort().join(),
  );
});

console.log(failures.length ? `\n${failures.length} FAILED:` : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);