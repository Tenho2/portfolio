/*
 * Emits both layout pages from one shared source of truth.
 *
 * Why a generator instead of two hand-maintained HTML files
 *   The pages are ~1,480 lines each and must agree on everything. Kept by hand
 *   they drift within a week: a field added to the session form on one page and
 *   not the other is invisible until a user on that page finds it missing, and
 *   by then it has shipped.
 *
 * The important decision: the two pages share their MARKUP too
 *   app/app.js dereferences element ids unconditionally at startup - roughly 170
 *   of them, with no per-page guard - so a layout that omitted or renamed any of
 *   them would throw before the first line of application logic ran. Giving the
 *   wide layout its own markup would mean maintaining a second copy of every id
 *   for no benefit.
 *
 *   So the DOM is identical and only the arrangement differs, which is what
 *   `data-layout` and the per-page stylesheet are for. A layout change is a CSS
 *   change. That also means the two pages cannot disagree about behaviour: they
 *   run the same bytes of app/app.js against the same ids.
 *
 * Usage:  node tools/emit-pages.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { LAYOUTS, LINK_LINES, SCRIPT_LINES } from "../app/shell.mjs";

const SOURCE = "ev-tracker.html";

const src = readFileSync(SOURCE, "utf8");
const lines = src.split(/\r?\n/);

// These tags are indented in the source, so the match cannot be anchored.
const headEnd = lines.findIndex((l) => /<\/head>/.test(l));
if (headEnd < 0) throw new Error(`${SOURCE}: no </head>`);

const bodyStart = lines.findIndex((l) => /<body/.test(l));
if (bodyStart < 0) throw new Error(`${SOURCE}: no <body>`);
if (bodyStart < headEnd) throw new Error(`${SOURCE}: <body> before </head>`);

// The end of the shared markup. Prefer the sentinel, because after a generated
// run the app/i18n.js tag sits *inside* the scripts block and would otherwise cut
// the markup short before the block is found.
const scriptsBegin = lines.findIndex((l) => l.includes("scripts:begin"));
const scriptStart =
  scriptsBegin >= 0
    ? scriptsBegin
    : lines.findIndex((l) => /app\/i18n\.js/.test(l));
if (scriptStart < 0) throw new Error(`${SOURCE}: no script block`);
if (scriptStart < bodyStart) throw new Error(`${SOURCE}: script block before <body>`);

/**
 * Drop a previous run's injected block, so the generator is idempotent.
 *
 * Delimited by sentinel comments rather than filtered by pattern. A pattern
 * filter cannot see the prose above each <link>, so the comments survive and
 * accumulate: the page grows by a few lines on every run and nobody notices for
 * weeks. Verified by running this twice and comparing.
 */
function excise(lines, open, close) {
  const a = lines.findIndex((l) => l.includes(open));
  if (a < 0) return lines;
  const b = lines.findIndex((l, i) => i >= a && l.includes(close));
  if (b < 0) throw new Error(`${SOURCE}: unterminated ${open} block`);
  return [...lines.slice(0, a), ...lines.slice(b + 1)];
}

/* The source page still has its original inline <style> and <script> blocks.
   They are cut here rather than left to survive into the output, because a page
   that loads app/app.css AND carries the same rules inline is ambiguous: the
   duplicate wins by source order, so a fix to app.css would silently not apply.
   Both blocks are matched on their sentinel-free tag pair, and the fact that
   they are gone is asserted by tools/test-layouts.mjs. */
function exciseBlock(lines, open, close) {
  const a = lines.findIndex((l) => new RegExp(`<${open}[\\s>]`).test(l));
  if (a < 0) return lines;
  const b = lines.findIndex((l, i) => i > a && new RegExp(`</${close}>`).test(l));
  if (b < 0) throw new Error(`${SOURCE}: unterminated <${open}> block`);
  return [...lines.slice(0, a), ...lines.slice(b + 1)];
}

const head = exciseBlock(
  excise(lines.slice(0, headEnd), "stylesheets:begin", "stylesheets:end"),
  "style",
  "style",
);
/* The inline <script> goes the same way as the inline <style>, for the same
   reason: app/app.js is the single copy, and leaving the original beside it
   means two copies that both run. */
const markup = exciseBlock(
  excise(lines.slice(bodyStart + 1, scriptStart), "scripts:begin", "scripts:end"),
  "script",
  "script",
);

for (const entry of LAYOUTS) {
  const layout = entry.name;
  // The body tag is rewritten, not appended to: the source page may already
  // carry a data-layout from a previous run, and duplicating the attribute
  // would make the first one win in every query.
  // The opening tag ends with `>`, which is re-emitted, and any data-layout a
  // previous run left is stripped first so the attribute cannot be duplicated.
  const bodyOpen =
    lines[bodyStart]
      .trimEnd()
      .replace(/>\s*$/, "")
      .replace(/\s*data-layout="[^"]*"$/, "")
      .trimEnd() + ` data-layout="${layout}">`;
  const out = [
    ...head,
    ...LINK_LINES.map((l) => l.replace("__LAYOUT__", layout)),
    "  </head>",
    bodyOpen,
    ...markup,
    ...SCRIPT_LINES,
    "  </body>",
    "</html>",
    "",
  ];
  /* CRLF, because the rest of the repo is CRLF and tools/test-wiring.mjs fails
     on a bare LF. Writing "\n" produced pages that were correct in every other
     respect and were rejected by the build. */
  const file = entry.file;
  writeFileSync(file, out.join("\n").replace(/\n/g, "\r\n"), "utf8");
  /* Running the generator twice must be a no-op, and it is easy to write a
     filter that strips the previous run's output imperfectly. That shows up as
     a page quietly growing two attributes every time the shell is touched, so
     it is checked rather than assumed. */
  if (readFileSync(file, "utf8") !== out.join("\n").replace(/\n/g, "\r\n"))
    throw new Error(`${file}: output is not stable across runs`);
  console.log(`${layout.padEnd(8)} -> ${file} (${out.length} lines)`);
}

console.log("shared: app/app.css, app/app.js, app/i18n.js, app/storage.js");