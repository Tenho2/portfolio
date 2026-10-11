/*
 * Two station bugs reported from a phone.
 *
 * 1. The station names were unreadable in dark mode.
 *    `.station-name` is a <button>. The stylesheet has no universal button
 *    reset, and this class was the only one that did not set a background, so
 *    it kept the user agent's ButtonFace - a light grey - while dark mode
 *    painted the text #f8fafc on it. That is about 1.1:1, which is what
 *    "almost completely white" describes. Every other button in the app sets
 *    its own background deliberately, which is why nothing else broke.
 *
 * 2. Choosing a station from the map did not update the panel below it.
 *    The pins bound a popup and nothing else. The station id was never attached
 *    to the marker, so there was nothing for a handler to look up, and
 *    openStationDetail had exactly one caller - the delegated click on a list
 *    row. Worse, a circle marker is a Leaflet Path and its clicks bubble to the
 *    map, whose handler places a session pin and zooms to level 16, so tapping
 *    a charger also tried to put a draggable pin on it.
 *
 *   node tools/test-station-ui.mjs
 */
import { readFileSync } from "node:fs";
import { appSource, fnSource, pageSource } from "./app-source.mjs";

const app = appSource();
const html = pageSource();
const css = readFileSync("app/app.css", "utf8");
/* Translations live in their own module now, not in the app script. */
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

/* ---------- contrast, computed rather than eyeballed ---------- */

function hex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum(rgb) {
  const a = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function ratio(fg, bg) {
  const a = hex(fg),
    b = hex(bg);
  if (!a || !b) return null;
  const l1 = lum(a),
    l2 = lum(b);
  const hi = Math.max(l1, l2),
    lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pull a custom property out of a selector's block. */
function token(selector, name, from) {
  const src = from || css;
  const i = src.indexOf(selector + " {");
  if (i < 0) return null;
  const block = src.slice(i, src.indexOf("}", i));
  const m = new RegExp(name + ":\\s*([^;]+);").exec(block);
  return m ? m[1].trim() : null;
}

const darkVar = (name) => token("body.dark", name);
const lightVar = (name) => token(":root", name) || token("body", name);

group("the station name button carries a background of its own", () => {
  /* The defect. A button with no background keeps the user agent's. */
  const rule = /\.station-name \{([^}]*)\}/.exec(css);
  ok("the .station-name rule exists", !!rule);
  ok("it sets a background", /background:\s*none/.test(rule[1]));
  ok("it drops the button border", /border:\s*0/.test(rule[1]));
  ok("it inherits the page font", /font:\s*inherit/.test(rule[1]));
  ok("it shows a pointer", /cursor:\s*pointer/.test(rule[1]));
  /* And nothing may reintroduce the user-agent background later. */
  const after = css.slice(css.indexOf(".station-name {"));
  ok(
    "no later rule paints the button face back in",
    !/\.station-name[^{]*\{[^}]*background:\s*(?!none)/.test(after.slice(0, 600)),
  );
});

group("the station name is readable in dark mode", () => {
  const text = darkVar("--text");
  /* With the reset in place the button is transparent, so the colour it has to
     survive is the row behind it. */
  const rowBg = darkVar("--surface-2");
  const muted = darkVar("--text-muted");
  ok("the dark text token exists", !!text);
  ok("the dark row token exists", !!rowBg);

  const r = ratio(text, rowBg);
  ok(`name on its row: ${r && r.toFixed(2)}:1 meets AA`, r !== null && r >= 4.5);
  const rm = ratio(muted, rowBg);
  ok(`operator line on its row: ${rm && rm.toFixed(2)}:1 meets AA`, rm !== null && rm >= 4.5);
});

group("the selected station row is readable in dark mode", () => {
  /* --surface-3 is #3b82f6 in dark mode. Painting the name over it was 3.5:1,
     and the muted operator line 2.5:1 - below AA for body text and below even
     the 3:1 floor for large text. */
  const surface3 = darkVar("--surface-3");
  const text = darkVar("--text");
  const muted = darkVar("--text-muted");
  const naive = ratio(text, surface3);
  ok(
    `the token alone would give only ${naive && naive.toFixed(2)}:1`,
    naive !== null && naive < 4.5,
  );
  /* So dark mode must not use that token for the selected row. */
  const over = /body\.dark \.station-row\.on \{([^}]*)\}/.exec(css);
  ok("there is a dark-mode override for it", !!over);
  if (over) {
    ok("the override sets a background", /background:/.test(over[1]));
    /* And the colour it lands on has to pass. */
    const chosen = /background:\s*([^;]+)/.exec(over[1])[1].trim();
    const resolved = chosen.includes("var(")
      ? darkVar(chosen.match(/var\((--[a-z0-9-]+)\)/)[1])
      : chosen;
    const r = ratio(text, resolved);
    ok(`name on the selected row: ${r && r.toFixed(2)}:1 meets AA`, r !== null && r >= 4.5);
    /* Selection still has to be visible, or the fix is just quieter. */
    ok("selection is shown by something other than a colour swap", /box-shadow/.test(over[1]));
  }
});

group("light mode was not broken by this", () => {
  const text = lightVar("--text");
  const rowBg = lightVar("--surface-2");
  ok("light tokens exist", !!text && !!rowBg);
  const r = ratio(text, rowBg);
  ok(`light name on its row: ${r && r.toFixed(2)}:1 meets AA`, r !== null && r >= 4.5);
});

group("a pin opens the same panel the list opens", () => {
  const pins = fnSource("drawStationPins");
  ok("the marker carries the station id", /_stationId\s*=\s*s\.id/.test(pins));
  ok("there is a click handler", /\.on\(\s*"click"/.test(pins));
  ok("it opens the station detail", /openStationDetail\(\s*sid\s*\)/.test(pins));
  /* Reading the id off the marker rather than closing over the loop variable,
     which would capture the last station for every pin. */
  ok("the id is read from the marker, not the loop variable", /this\s*&&\s*this\._stationId/.test(pins));
  ok("and it bails out without one", /if \(!sid\) return;/.test(pins));
});

group("tapping a pin does not also place a session pin", () => {
  /* A circle marker is a Path; its clicks bubble to the map by default, and the
     map handler for every map drops a draggable pin and zooms to 16. */
  const pins = fnSource("drawStationPins");
  ok("the marker opts out of bubbling", /bubblingMouseEvents:\s*false/.test(pins));
});

group("the selected station is highlighted whichever way it was chosen", () => {
  const detail = fnSource("openStationDetail");
  ok("it records the open station", /stationOpen\s*=\s*id/.test(detail));
  /* The highlight lives in the list, which is a separate function. The map path
     never went through it, so the list kept marking a row that the panel was
     no longer showing. */
  ok("it refreshes the list", /renderStations\(\)/.test(detail));
  const list = fnSource("renderStations");
  ok("the list marks the open row", /stationOpen\s*===\s*s\.id/.test(list));
  /* And it must not recurse: rendering the list must not reopen the panel. */
  ok("rendering the list does not open the panel", !/openStationDetail\(/.test(list));
  ok("rendering the list does not rewrite the panel", !/stationDetail/.test(list));
});

group("the panel is reachable from the pin", () => {
  const pins = fnSource("drawStationPins");
  ok("it scrolls the panel into view", /scrollIntoView/.test(pins));
  ok("the popup invites the tap", /TXT\("st\.openDetails"\)/.test(pins));
  ok("the string exists in all three languages", (i18n.match(/"st\.openDetails"/g) || []).length === 3);
  /* The panel itself is shared markup and must exist on both pages. */
  is("the classic page has it", /id="stationDetail"/.test(html), true);
  is(
    "the wide page has it",
    /id="stationDetail"/.test(readFileSync("ev-tracker-wide.html", "utf8")),
    true,
  );
});

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);