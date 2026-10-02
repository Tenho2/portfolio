/**
 * Account isolation tests for the storage keys.
 *
 * Regression cover for the bug where localStorage used one global set of keys
 * for every account. Signing out of one account and into another carried the
 * first account's vehicles and sessions into the new one, which then appeared
 * labelled "shared vehicle" and could never be pushed, because the new account
 * was not allowed to write them.
 *
 *   node tools/test-storage.mjs
 */
import { readFileSync } from "node:fs";

const html = readFileSync("ev-tracker.html", "utf8");

function fnSource(name) {
  const start = html.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in ev-tracker.html`);
  let i = html.indexOf("{", start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

const build = new Function(
  [
    `var K_THEME = "theme";`,
    fnSource("keysFor"),
    `var K = keysFor(null);`,
    fnSource("useAccount"),
    `return { keysFor, useAccount, current: function () { return K; } };`,
  ].join("\n\n"),
);

const { keysFor, useAccount, current } = build();

let pass = 0;
const failures = [];
function is(label, actual, expected) {
  if (actual === expected) pass++;
  else failures.push(`${label}\n      expected ${expected}, got ${actual}`);
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(
    `${failures.length - before ? "FAIL" : "ok  "}  ${name}`,
  );
}

const SLOTS = ["v", "s", "p", "f", "n"];
const A = "aaaaaaaa-1111-1111-1111-111111111111";
const B = "bbbbbbbb-2222-2222-2222-222222222222";

group("two accounts never share a key", () => {
  for (const slot of SLOTS)
    is(`account A and B differ on "${slot}"`, keysFor(A)[slot] === keysFor(B)[slot], false);
});

group("the signed-out bucket is separate from every account", () => {
  for (const slot of SLOTS) {
    is(`local vs A "${slot}"`, keysFor(null)[slot] === keysFor(A)[slot], false);
    is(`local vs B "${slot}"`, keysFor(null)[slot] === keysFor(B)[slot], false);
  }
});

group("keys carry the account id, so they are self-describing", () => {
  for (const slot of SLOTS) {
    is(`A "${slot}" mentions A`, keysFor(A)[slot].includes(A), true);
    is(`B "${slot}" mentions B`, keysFor(B)[slot].includes(B), true);
  }
});

group("every slot in one bucket is distinct", () => {
  for (const who of [null, A, B]) {
    const seen = new Set(SLOTS.map((s) => keysFor(who)[s]));
    is(`no collisions for ${who || "local"}`, seen.size, SLOTS.length);
  }
});

group("theme is a device preference, not account data", () => {
  is("A matches local", keysFor(A).t, keysFor(null).t);
  is("B matches local", keysFor(B).t, keysFor(null).t);
});

group("useAccount swaps the live bucket and reports the change", () => {
  useAccount(null);
  is("first switch to A is a change", useAccount(A), true);
  is("bucket is now A", current().v, keysFor(A).v);
  is("switching to A again is not a change", useAccount(A), false);
  is("switch to B is a change", useAccount(B), true);
  is("bucket is now B", current().v, keysFor(B).v);
  is("signing out is a change", useAccount(null), true);
  is("bucket is now local", current().v, keysFor(null).v);
  is("signing out twice is not a change", useAccount(null), false);
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}