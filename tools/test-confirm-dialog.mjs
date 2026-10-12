/*
 * The shared confirmation dialog, rendered against a real DOM.
 *
 * Why this suite exists
 *   askConfirm() is the one dialog every destructive action in the app goes
 *   through, and until now every test of it used a STUB that recorded the
 *   options it was handed. That is enough to check what a caller asked for, and
 *   completely blind to what askConfirm then did with it.
 *
 *   Which is how a real bug survived: confirmMileage passed bare translation
 *   keys as its button labels, askConfirm passed them to TXT with no values,
 *   and t() only substitutes {placeholders} when it is handed some. The odometer
 *   dialog therefore rendered its two buttons as the literal text
 *   "Use {f} km" and "Save {d} km anyway" - while the message above them read
 *   perfectly, because that one did get its values.
 *
 *   Reverting the fix left every assertion green. A test that cannot fail on
 *   the bug it was written for is worse than no test, because it reports
 *   confidence it has not earned. So this loads the real page into jsdom and
 *   asks the resulting DOM what a person would actually read.
 *
 *   node tools/test-confirm-dialog.mjs
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { fnSource } from "./app-source.mjs";

const html = readFileSync("ev-tracker.html", "utf8");
const dom = new JSDOM(html, { url: "https://example.test/" });
const { document } = dom.window;

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

/**
 * The real askConfirm, compiled against the page.
 *
 * Only three things are stubbed, and none of them is what the test is about: the
 * translation function (so placeholders are visible), the background lock, and
 * the resolution of the promise - the dialog is inspected while it is open,
 * which is the only moment its text matters.
 */
function buildAskConfirm() {
  const src = `
    var document = __document;
    var confirmExpectWord = "";
    var confirmState = null;
    var lockBackground = function(){};
    var backgroundLocks = 0;
    /* A translation stub that DOES substitute, exactly as the real one does.
       Returning the key when given nothing is what let the bug through, so the
       stub has to reproduce that: no vars, no substitution. */
    function TXT(k, vars){
      var D = __strings;
      var s = (D && D[k] !== undefined) ? D[k] : k;
      if (vars) s = String(s).replace(/\\{(\\w+)\\}/g, function(m, name){
        return vars[name] !== undefined ? String(vars[name]) : m;
      });
      return s;
    }
    function $(id){ return document.getElementById(id); }
    ${fnSource("askConfirm")}
    return askConfirm;
  `;
  return new Function(
    "__document",
    "__strings",
    src,
  )(document, STRINGS);
}

const STRINGS = {
  "confirm.title": "Are you sure?",
  "confirm.ok": "OK",
  "confirm.cancel": "Cancel",
  "confirm.body": "This cannot be undone.",
  "confirm.typeToConfirm": "Type it to continue",
  "confirm.expectHint": "Type {w}",
  "odo.title": "Check the odometer",
  "odo.useSuggested": "Use {f} km",
  "odo.keepAnyway": "Save {d} km anyway",
};

group("the odometer dialog renders real numbers, not its own template", () => {
  /* The reported bug, verbatim: "Käytä {f} km" and "Tallenna silti {d} km" on
     screen as the literal braces and letters. */
  const ask = buildAskConfirm();
  ask("That reading is lower than the one before it.", {
    heading: "odo.title",
    vars: { f: "110 150", d: "100" },
    ok: "odo.useSuggested",
    altKey: "odo.keepAnyway",
    cancel: "confirm.cancel",
  });
  const okBtn = document.getElementById("confirmOk");
  const altBtn = document.getElementById("confirmAlt");
  is("the primary button shows the corrected reading", okBtn.textContent, "Use 110 150 km");
  is("the second shows the typed one", altBtn.textContent, "Save 100 km anyway");
  ok("no button leaks a {placeholder}", !/\{[a-z]+\}/i.test(okBtn.textContent + altBtn.textContent));
});

group("a label with no values is left exactly as translated", () => {
  /* The other direction, and the reason a naive fix would break: the dialog is
     shared, and most callers pass no variables at all. Those labels must come
     through untouched rather than being blanked. */
  const ask = buildAskConfirm();
  ask("Delete this vehicle?", { heading: "confirm.title", ok: "confirm.ok" });
  is("the button keeps its text", document.getElementById("confirmOk").textContent, "OK");
  is("the cancel button appears", document.getElementById("confirmCancel").textContent, "Cancel");
});

group("a third action only appears when one is asked for", () => {
  const ask = buildAskConfirm();
  ask("Plain question.", { heading: "confirm.title", ok: "confirm.ok" });
  const alt = document.getElementById("confirmAlt");
  ok("the third button is hidden", alt.hidden === true);
  ask("Two answers.", { heading: "confirm.title", ok: "confirm.ok", altKey: "odo.keepAnyway" });
  ok("and shown when it is", document.getElementById("confirmAlt").hidden === false);
});

group("the dialog is reachable and labelled", () => {
  /* It is an alertdialog, so the title and body must name it for a screen
     reader or the user hears an unlabelled interruption. */
  const sheet = document.getElementById("confirmSheet");
  const box = sheet.querySelector("[role]");
  is("it is an alertdialog", box.getAttribute("role"), "alertdialog");
  is("labelled by its heading", box.getAttribute("aria-labelledby"), "confirmTitle");
  is("described by its body", box.getAttribute("aria-describedby"), "confirmBody");
  /* Closed on load. Checked against the MARKUP rather than the live DOM,
     because an earlier group in this run has already opened it - and "it
     starts closed" is a statement about the page, not about test order. */
  ok("the markup does not ship it open", !/class="sheet on"/.test(html));
  /* And it does open, which is the other half of the same contract. */
  ok("and asking opens it", sheet.classList.contains("on"));
});

group("the heading takes the caller's key", () => {
  const ask = buildAskConfirm();
  ask("Body text.", { heading: "odo.title" });
  is("the odometer heading", document.getElementById("confirmHeading").textContent, "Check the odometer");
  ask("Body text.", {});
  is("and the generic one by default", document.getElementById("confirmHeading").textContent, "Are you sure?");
});

group("an irreversible action says so in the body", () => {
  const ask = buildAskConfirm();
  ask("Delete this vehicle?", { heading: "confirm.title", irreversible: "confirm.never" });
  const body = document.getElementById("confirmBody");
  ok("the warning is inside the body", body.textContent.includes("confirm.never"));
});

group("reusing the dialog does not stack text", () => {
  /* One body element, rebuilt every time. Appending without clearing would put
     the second message under the first. */
  const ask = buildAskConfirm();
  ask("First question.", { heading: "confirm.title", irreversible: "confirm.never" });
  ask("Second question.", { heading: "confirm.title" });
  const body = document.getElementById("confirmBody").textContent;
  is("only the latest message is there", body, "Second question.");
});

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);