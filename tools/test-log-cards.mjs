/*
 * The charge log as cards below 700px.
 *
 * The problem
 *   Eleven columns with nowrap and min-width: 760px means a phone gets a
 *   horizontal scroll. The headings scroll off with the content, so on the
 *   second screen of a row there is no way to tell which column you are
 *   reading.
 *
 * The approach, and why
 *   ONE DOM, styled two ways. A second renderer for small screens was rejected:
 *   sorting, row selection and editing would then have to exist twice, and the
 *   two would drift. The markup carries data-label on every cell and the
 *   stylesheet decides what that means.
 *
 *   The labels come from the SAME translation keys the <th> elements use, so
 *   the card view cannot fall out of step with the table heading, and a
 *   language switch relabels both at once. That is asserted here rather than
 *   assumed, because the alternative - a parallel set of strings - is exactly
 *   how the two would drift.
 *
 *   node tools/test-log-cards.mjs
 */
import { readFileSync } from "node:fs";
import { fnSource, pageSource } from "./app-source.mjs";

const i18n = readFileSync("app/i18n.js", "utf8");
const css = readFileSync("app/app.css", "utf8");

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

for (const page of ["ev-tracker.html", "ev-tracker-wide.html"]) {
  group(`the log table exists and is identifiable on ${page}`, () => {
    const html = pageSource(page);
    ok("the table has an id", /<table id="logTable"/.test(html));
    ok("the body has one", /id="logBody"/.test(html));
  });
}

group("every column carries a label", () => {
  /* Eleven headings, eleven labels. A cell without one becomes an unlabelled
     line of text in the card view, which is the problem being fixed. */
  const html = pageSource();
  const table = html.slice(html.indexOf('<table id="logTable"'), html.indexOf("</table>"));
  const heads = (table.match(/<th\b/g) || []).length;
  ok(`there are ${heads} column headings`, heads === 11);
});

group("the row builder labels its cells from the heading keys", () => {
  const render = fnSource("renderBody");
  ok("renderBody was found", render.length > 1000);
  /* The attribute is assembled as data-label="' + TXT("th.x"). Matched loosely
     on the gap so a change in how the string is concatenated does not turn
     this into a silent zero. */
  const labels = [...render.matchAll(/data-label="[\s\S]{0,24}?TXT\("th\.(\w+)"\)/g)].map((m) => m[1]);
  ok(`it labels ${labels.length} cells`, labels.length === 10);
  /* Same keys, same order, as the <th> elements. */
  const want = ["date", "time", "dur", "loc", "energy", "speed", "mileage", "cost", "tags", "notes"];
  is("and they are the heading keys, in order", labels.join(","), want.join(","));
});

group("the labels reuse the heading translations", () => {
  /* The whole point of using the same keys. A parallel string set would need
     translating twice and would drift. */
  for (const key of ["th.date", "th.time", "th.dur", "th.loc", "th.energy", "th.speed", "th.mileage", "th.cost", "th.tags", "th.notes"]) {
    const n = (i18n.match(new RegExp('"' + key.replace(/\./g, "\\.") + '"', "g")) || []).length;
    is(`${key} exists in all three languages`, n, 3);
  }
});

/* The file has several 700px media queries; this one is the card block. Found by
   its content rather than its first match on the width, because the width
   appears in a rule that has nothing to do with the log. */
function cardBlock() {
  const anchor = css.indexOf("#logTable tbody");
  if (anchor < 0) return "";
  const open = css.lastIndexOf("@media", anchor);
  /* Brace-match from the opening one to find where the block ends. */
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open, i + 1);
    }
  }
  return "";
}

group("the transformation is scoped and breakpoint-only", () => {
  /* `table` is a bare element selector shared with the settings and import
     previews. Restacking those too would be a change nobody asked for. */
  const scoped = (css.match(/#logTable/g) || []).length;
  ok(`the rules are scoped to #logTable (${scoped} selectors)`, scoped > 10);
  ok("there is a 700px breakpoint", /@media \(max-width: 700px\)/.test(css));
  const block = cardBlock();
  ok("the card block was found", block.length > 200);
  const flat = block.replace(/\s+/g, " ");
  /* And it must be BELOW that breakpoint only - the desktop table keeps its
     display:table-cell, its column widths and its sticky header. */
  ok(
    "the block changes the table to block layout",
    /#logTable,\s*#logTable tbody,\s*#logTable tr,\s*#logTable td\s*\{\s*display:\s*block/.test(flat),
  );
  ok("and hides the head, which no longer means anything", /#logTable thead\s*\{\s*display:\s*none/.test(flat));
  ok("and drops the min-width that caused the scroll", /min-width:\s*0/.test(flat));
});

group("the cards reveal their labels", () => {
  ok("::before carries the label", /#logTable td::before\s*\{\s*content:\s*attr\(data-label\)/.test(css));
  /* A fixed-width label column, so the values line up instead of forming a
     ragged edge down the card. */
  ok("the label holds its width", /flex:\s*0 0 34%/.test(css));
  ok("the value takes the rest", /overflow-wrap:\s*anywhere/.test(css));
  ok("long values wrap instead of pushing the card sideways", /white-space:\s*normal/.test(css));
});

group("the action buttons are not given an empty gutter", () => {
  /* The delete cell has no heading. Left alone it would sit under a 34% blank
     label column, which looks like a mistake even though it is not one. */
  ok("its label is suppressed", /#logTable td:last-child::before\s*\{\s*content:\s*""/.test(css));
  ok("and it sits at the card's right", /justify-content:\s*flex-end/.test(css));
});

group("the desktop table is untouched", () => {
  /* The regression that matters most: a mobile fix must not restyle the
     desktop table it was meant to leave alone. */
  const block = cardBlock().replace(/\s+/g, " ");
  ok("the card block restyles no bare table selector", !/(^|[;{])\s*table\s*\{/.test(block));
  ok("and no bare td or th", !/(^|[;{])\s*(td|th)\s*\{/.test(block));
  /* The original table rules are still there. */
  ok("the 760px floor is still declared for wide screens", /min-width:\s*760px/.test(css));
  ok("the sticky header is still declared", /position:\s*sticky/.test(css));
});

group("nothing about the log's behaviour changed", () => {
  /* data-label is inert markup. The row must still carry its ids and
     buttons, or sorting and editing break on every screen. */
  const render = fnSource("renderBody");
  ok("renderBody was found", render.length > 1000);
  ok("rows still carry the edit button", /data-edit="/.test(render));
  ok("and the delete button", /data-del="/.test(render));
  ok("and the notes cell keeps its wrapping class", /wrapc/.test(render));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);