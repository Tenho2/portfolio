/*
 * A negative check that would otherwise pass on an empty string.
 *
 * This suite reads a function body out of app/app.js and asserts it does not
 * contain something. If the slice comes back empty - because the function was
 * renamed, moved, or inlined - every `!slice.includes(bad)` assertion is true and
 * the test reports success while checking nothing.
 *
 * That is not hypothetical: it is what the layout tests did on their first run,
 * having silently passed against markup after the application moved out of the
 * page. Three suites in a row reported "0 failed" while testing no code at all.
 *
 * A negative assertion therefore has to prove it looked at something. Each one
 * pairs with a positive check on the same slice, and each slice is bounded by two
 * named markers with an explicit length check.
 *
 * Usage: node tools/test-guard.mjs
 */
import { readFileSync } from "node:fs";

const appJs = readFileSync("app/app.js", "utf8");

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

/**
 * The text between two function declarations.
 *
 * Throws rather than returning "" on a missing marker. A suite that needs the
 * body of a real function should fail loudly at the extraction step, where the
 * cause is obvious, rather than silently skip the assertions that follow.
 */
function between(from, to) {
  const a = appJs.indexOf(`function ${from}(`);
  if (a < 0) throw new Error(`function ${from} not found in app/app.js`);
  const b = appJs.indexOf(`function ${to}(`, a);
  if (b < 0) throw new Error(`function ${to} not found after ${from}`);
  return appJs.slice(a, b);
}

group("a slice that matched nothing cannot report success", () => {
  /* The two marker pairs the suites depend on. If either function disappears,
     the guard below fails here rather than in a downstream assertion. */
  const pairs = [
    ["renderLayoutPicker", "renderBuildRow"],
    ["syncVehicle", "syncSession"],
    ["canEditSession", "mayWriteVehicle"],
    ["diagnosticsReport", "copyDiagnostics"],
  ];
  for (const [from, to] of pairs) {
    let slice = "";
    let threw = "";
    try {
      slice = between(from, to);
    } catch (e) {
      threw = e.message;
    }
    ok(`${from} .. ${to} resolves to real source`, slice.length > 0 && !threw);
    /* A body this small is a truncated match, not a real function. */
    ok(`${from} .. ${to} is a plausible length (>200 chars)`, slice.length > 200);
  }
});

group("a missing function is an error, not an empty string", () => {
  let result = null;
  try {
    result = between("noSuchFunctionAnywhere", "renderBuildRow");
  } catch (e) {
    result = "threw";
  }
  ok("extraction throws for a function that does not exist", result === "threw");
});

group("the slices the layout switcher is checked with are real", () => {
  const picker = between("renderLayoutPicker", "renderBuildRow");
  /* The positive control: this is the code the negatives below are reasoning
     about, so if it ever stops matching, they stop meaning anything. */
  ok("the picker really does navigate", /location\.href/.test(picker));
  ok("the picker really does read the fragment", /location\.hash/.test(picker));
  /* The negatives, which are the ones worth guarding. */
  ok("the picker writes nothing to storage", !/localStorage/.test(picker));
  ok("the picker saves no preference", !/setItem/.test(picker));
  ok("the picker deletes nothing", !/removeItem/.test(picker));
  /* And the slice must not have grown to cover half the application, which
     would make the negatives pass for the wrong reason. */
  ok("the picker slice is under 3k characters", picker.length < 3000);
});

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);