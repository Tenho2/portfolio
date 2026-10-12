/*
 * The JSON-import payer prompt.
 *
 * Importing sessions is the one place the app writes many rows without the
 * user filling in the payer picker. A JSON file has no payer column to
 * preserve, so the import has to decide: attribute every row to the signed-in
 * user, or leave them unassigned for the user to attribute later. Guessing
 * would put the wrong name on a financial record, so it is a prompt with two
 * explicit answers rather than a silent default.
 *
 * A CSV import never asks: it has no payer column either, but a CSV is an
 * external spreadsheet, not a round-trip of this app's own data, so the safe
 * reading is "unassigned" without interrupting a bulk import. A signed-out
 * user has no "me" to assign, so the prompt is skipped there too.
 *
 *   node tools/test-import-payers.mjs
 */
import { readFileSync } from "node:fs";
import { appSource } from "./app-source.mjs";

const app = appSource();
const i18n = readFileSync("app/i18n.js", "utf8");

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

/* Only the import function's body, so the assertions cannot match a stray
   use of the same wording somewhere else in the file. */
const imp = app.slice(
  app.indexOf("function importText"),
  app.indexOf("function showImport"),
);

group("the prompt is offered only for JSON and a signed-in user", () => {
  ok("the JSON flag is captured once", imp.includes("var isJson = /"));
  ok("the signed-in name is read first", imp.includes("var me = myPayerName();"));
  ok("and the prompt is gated on both", imp.includes("if (isJson && me)"));
  ok("otherwise it proceeds without asking", imp.includes("finishImport(false);"));
});

group("the prompt offers the two choices", () => {
  ok("the body names the count", imp.includes('TXT("imp.payersBody", { n: made.length })'));
  ok("assign to me is the primary answer", imp.includes('ok: "imp.payersMe"'));
  ok("leave unassigned is the alternate answer", imp.includes('altKey: "imp.payersNone"'));
});

group("assigning credits the signed-in user at 100%", () => {
  ok("every imported row gets the payer", imp.includes('made[mi].payers = [{ name: me, share: 1 }]'));
  ok("and only when the assign choice was taken", imp.includes("if (assignToMe && me)"));
  ok("a whole share, not an amount", imp.includes("share: 1"));
});

group("the split is persisted after the sessions exist", () => {
  /* session_payers references sessions, so the payer writes must wait for the
     bulk upsert to settle or the first RPC hits a foreign-key miss. */
  ok("the bulk upsert settles first", imp.includes("syncSessions(made).then("));
  ok("each imported split is then synced", imp.includes("syncSessionPayers(made[sp])"));
  /* The payer loop sits inside the .then callback and is gated on the assign
     choice, so an "unassigned" import never fires a payer RPC at all. */
  const afterSync = imp.slice(imp.indexOf("syncSessions(made).then("));
  ok("only for the assign choice", /if \(assignToMe && me\)[\s\S]*?syncSessionPayers\(made\[sp\]\)/.test(afterSync));
});

group("cancelling the prompt aborts the import", () => {
  ok("a cancel is reported, not treated as a choice", imp.includes('showImport("bad", TXT("imp.payersCancelled")'));
});

group("every prompt string exists in all three languages", () => {
  for (const k of [
    "imp.payersTitle",
    "imp.payersBody",
    "imp.payersMe",
    "imp.payersNone",
    "imp.payersCancelled",
  ]) {
    is(k, (i18n.match(new RegExp('"' + k.replace(/\./g, "\\.") + '"', "g")) || []).length, 3);
  }
});

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
