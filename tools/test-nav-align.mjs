/**
 * Navigation handedness defaults and persistence.
 *
 * The retro desktop is left-handed by default because its taskbar puts Start on
 * the left. Every other layout keeps the right-handed mobile/Focus default.
 *
 * The subtle failure this suite guards against is persisting the LAYOUT default
 * as if it were a user choice. Visiting retro-desktop once would then write
 * "left" and every later Focus/classic page would inherit it. Only an explicit
 * left/right value may reach localStorage.
 *
 *   node tools/test-nav-align.mjs
 */
import { appSource, fnSource } from "./app-source.mjs";

const app = appSource();

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

const navAlignFor = new Function(
  `${fnSource("navAlignFor")}; return navAlignFor;`,
)();

/* Exercise the real function with the smallest possible browser surface. */
const applyNavAlign = new Function(
  "document",
  "localStorage",
  "K",
  "currentLayout",
  "navAlignFor",
  `${fnSource("applyNavAlign")}; return applyNavAlign;`,
);

function run(want, layout) {
  const writes = [];
  const body = {
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
  };
  const apply = applyNavAlign(
    { body },
    {
      setItem(key, value) {
        writes.push([key, value]);
      },
    },
    { na: "navAlign" },
    () => layout,
    navAlignFor,
  );
  apply(want);
  return { value: body.attrs["data-nav-align"], writes };
}

group("no saved preference uses the layout default", () => {
  is("retro desktop defaults to the left", navAlignFor(null, "retro-desktop"), "left");
  is("an empty value still means the default", navAlignFor("", "retro-desktop"), "left");
  is("an unknown value still means the default", navAlignFor("centre", "retro-desktop"), "left");
  for (const layout of ["classic", "focus", "modern", "hud", "brutal", "editorial", "win31"])
    is(`${layout} keeps the right default`, navAlignFor(null, layout), "right");
});

group("an explicit saved preference is respected everywhere", () => {
  for (const layout of ["retro-desktop", "focus", "classic", "win31"]) {
    is(`${layout} respects left`, navAlignFor("left", layout), "left");
    is(`${layout} respects right`, navAlignFor("right", layout), "right");
  }
});

group("the inferred default is not persisted", () => {
  const retro = run(null, "retro-desktop");
  is("the retro body attribute is left", retro.value, "left");
  is("nothing was written to storage", retro.writes.length, 0);

  const focus = run(null, "focus");
  is("the focus body attribute stays right", focus.value, "right");
  is("nothing was written for focus either", focus.writes.length, 0);

  const invalid = run("centre", "retro-desktop");
  is("an invalid value falls back to the layout default", invalid.value, "left");
  is("an invalid value is not persisted", invalid.writes.length, 0);
});

group("only a real choice is written", () => {
  const right = run("right", "retro-desktop");
  is("the explicit right value applies", right.value, "right");
  is("it is written to the global key", JSON.stringify(right.writes), JSON.stringify([["navAlign", "right"]]));

  const left = run("left", "focus");
  is("the explicit left value applies", left.value, "left");
  is("it is written to the global key", JSON.stringify(left.writes), JSON.stringify([["navAlign", "left"]]));
});

group("boot reads the saved key and the change handler writes it", () => {
  ok("boot passes the stored value into applyNavAlign", /applyNavAlign\(localStorage\.getItem\(K\.na\)\)/.test(app));
  ok("the change handler passes the select value", /\$\("navAlignSel"\)\.addEventListener\("change"[\s\S]{0,120}?applyNavAlign\(this\.value\)/.test(app));
  ok("the body attribute is always applied", /setAttribute\("data-nav-align",\s*v\)/.test(fnSource("applyNavAlign")));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
