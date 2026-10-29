/**
 * Favourite "home" checkbox contract.
 *
 * Home is not a per-favourite flag: it is the existing locDefaults.loc / default
 * place. The checkbox must write that one source of truth, update Settings, and
 * mark the saved list without creating a second state that can drift.
 */
import { readFileSync } from "node:fs";
import { fnSource } from "./app-source.mjs";
const shared = readFileSync("ev-tracker.html", "utf8");
const hud = readFileSync("tools/hud-body.html", "utf8");
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
  console.log((failures.length - before ? "FAIL" : "ok  ") + "  " + name);
}

group("the shared and HUD favourite forms offer a home checkbox", () => {
  for (const [name, doc] of [
    ["shared", shared],
    ["HUD", hud],
  ]) {
    ok(`${name}: the checkbox exists`, /id="fHome"/.test(doc));
    ok(`${name}: it has a label`, /<label for="fHome" data-i18n="fav\.home"/.test(doc));
    ok(`${name}: it has a hint`, /data-i18n="fav\.homeHint"/.test(doc));
  }
  for (const key of ["fav.home", "fav.homeHint"])
    ok(`${key} is translated three times`, (i18n.match(new RegExp(`"${key.replace(/\./g, "\\.")}"`, "g")) || []).length === 3);
});

group("the form follows the existing default-place state", () => {
  ok(
    "fill checks the current home",
    /locDefaults\.loc === f\.id/.test(fnSource("fillFavForm")) &&
      /\$\("fHome"\)\.checked/.test(fnSource("fillFavForm")),
  );
  ok("clear unchecks the box", /fHome.*checked = false/.test(fnSource("clearFavForm")));
});

group("saving writes only locDefaults.loc", () => {
  const save = fnSource("saveFavourite");
  ok("it reads the checkbox before the form is reset", /makeHome/.test(save) && /fHome/.test(save));
  ok("checking sets the default place", /locDefaults\.loc = f\.id/.test(save));
  ok("unchecking the current home clears it", /locDefaults\.loc = null/.test(save));
  ok("it persists the default place", /saveLocDefaults\(\)/.test(save));
  ok("it refreshes the Settings picker", /renderLocDefaults\(\)/.test(save));
});

group("the saved list marks the home favourite", () => {
  const list = fnSource("renderFavs");
  ok("it compares against locDefaults.loc", /locDefaults\.loc === f\.id/.test(list));
  ok("it renders the existing home tag", /class="tag t-home"/.test(list));
});

group("the retro dirty snapshot includes the checkbox", () => {
  const dirty = fnSource("retroDirtyValue");
  ok("fHome is part of the snapshot", /"fHome"/.test(dirty));
  ok("checkbox state is recorded, not its static value", /fel\.type === "checkbox"/.test(dirty));
});

console.log("\n" + pass + " passed, " + failures.length + " failed");
if (failures.length) {
  for (const failure of failures) console.error("  FAIL " + failure);
  process.exit(1);
}
