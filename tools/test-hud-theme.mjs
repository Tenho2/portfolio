/**
 * The HUD's two visual modes and the switch between them.
 *
 * Why this exists
 *   The HUD is the one layout whose header button is not a light/dark toggle:
 *   it is a night-vision red switch, and the whole palette is re-skinned by
 *   token. That is easy to "fix" back into the shared behaviour by accident, and
 *   the symptom would be a neon-green cockpit and a button that stops working on
 *   every other layout. These assertions pin the contract.
 *
 *   They are deliberately about the HUD sheet and the HUD page, not the shared
 *   design system, which is why they live here rather than in test-layouts.mjs.
 *
 *   node tools/test-hud-theme.mjs
 */
import { readFileSync } from "node:fs";
import { fnSource } from "./app-source.mjs";

const css = readFileSync("app/ui/hud.css", "utf8");
const base = readFileSync("app/ui/base.css", "utf8");
const app = readFileSync("app/app.js", "utf8");
const storage = readFileSync("app/storage.js", "utf8");
const i18n = readFileSync("app/i18n.js", "utf8");
const hud = readFileSync("tools/hud-body.html", "utf8");
const classic = readFileSync("ev-tracker.html", "utf8");

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
/** The block of a CSS rule, so a value is checked in the right scope. */
function block(selector) {
  const i = css.indexOf(selector);
  if (i < 0) return "";
  const open = css.indexOf("{", i);
  const close = css.indexOf("}", open);
  return open < 0 || close < 0 ? "" : css.slice(open + 1, close);
}

group("the default cockpit is a relaxed, low-glare green", () => {
  const root = block(":root {");
  ok("the neon mint is gone", !/#34f5c5/.test(css));
  ok("the primary is the sage green", /--primary:\s*#52b788/.test(root));
  ok("the body text is the humble pale green", /--text:\s*#adc1b7/.test(root));
  ok("the muted text is legible", /--text-muted:\s*#7a998c/.test(root));
  ok("the rules are barely-visible", /--line:\s*#121f1a/.test(root));
  ok("the background is near black", /--bg:\s*#040608/.test(root));
  ok("surfaces step up only slightly", /--surface:\s*#06090a/.test(root) && /--surface-2:\s*#090d0e/.test(root) && /--surface-3:\s*#0c1214/.test(root));
});

group("the glow and the scanlines are dim and token-driven", () => {
  const root = block(":root {");
  ok("the glow is a token", /--glow:/.test(root));
  ok("the scanline tint is a token", /--scan:/.test(root));
  ok("the wash reads the token, not a literal colour", /var\(--scan\)/.test(css) && !/rgb\(52 245 197/.test(css));
  ok("the figures read the token", /text-shadow:\s*0 0 10px var\(--glow\)/.test(css));
  /* A dimmed cockpit: the glow is a whisper, not a halo. */
  const glow = (root.match(/--glow:\s*rgb\([^)]*\/\s*([\d.]+)\)/) || [])[1];
  ok("the glow alpha is faint (<= 0.2)", !!glow && Number(glow) <= 0.2);
  /* But the scanlines are opt-in, so when they ARE on they have to be visible.
     At 0.012 the checkbox made no perceptible difference and looked broken. */
  const scan = (root.match(/--scan-alpha:\s*([\d.]+)/) || [])[1];
  ok("the scanline alpha is perceptible (>= 0.02)", !!scan && Number(scan) >= 0.02);
  ok("and still subtle (<= 0.08)", !!scan && Number(scan) <= 0.08);
  ok("the lines are close-set, like the original cockpit", /transparent 1px,\s*transparent 3px/.test(css));
});

group("red mode re-skins the whole palette by token", () => {
  const red = block("body.red-mode {");
  ok("the block exists", red.length > 0);
  ok("the primary is the subdued warning red", /--primary:\s*#d9383a/.test(red));
  ok("the text is a soft reddish pink", /--text:\s*#e09f9f/.test(red));
  ok("the muted text is deep crimson", /--text-muted:\s*#803b3d/.test(red));
  ok("the rules are almost black-red", /--line:\s*#240c0d/.test(red));
  ok("the surface is near-black red", /--surface:\s*#0a0303/.test(red));
  ok("the glow is retinted to red", /--glow:\s*rgb\(217 56 58/.test(red));
  /* Nothing else has to change: the components read the tokens. */
  ok("no component rule is duplicated for red mode", (css.match(/body\.red-mode/g) || []).length <= 2);
});

group("red mode is a HUD-only, device-remembered switch", () => {
  ok("storage carries a global redMode key", /var K_REDMODE = "redMode"/.test(storage));
  ok("and publishes it on the key set", /rm:\s*K_REDMODE/.test(storage));
  /* Global, so two accounts on one device share the choice, exactly like theme. */
  ok("the key is not account-scoped", !/pre\s*\+\s*"redMode"/.test(storage));

  ok("the layout is detected", /function isHud\(\)/.test(app));
  ok("the switch toggles the body class", /classList\.toggle\("red-mode"\)/.test(app));
  ok("the choice is persisted", /localStorage\.setItem\(K\.rm,/.test(app));
  /* Boot restores it through bootClasses, which returns the class only on the
     HUD; restoreAppearance then toggles it before the first paint. */
  ok("boot restores it, on the HUD only", /red: !!hud && s\.redMode === "on"/.test(app));
  ok("and the restore runs at boot", /restoreAppearance\(\)/.test(app));

  /* The shared layouts keep the sun/moon behaviour. */
  ok("the old dark toggle survives for other layouts", /classList\.toggle\("dark"\)/.test(app));
  ok("the click handler branches on the layout", /if \(isHud\(\)\)\s*\{\s*toggleRedMode\(\)/.test(app));
});

group("the switch announces itself and survives a language change", () => {
  ok("the icon and the pressed state are set", /querySelector\("\.ic"\)/.test(app) && /aria-pressed/.test(app));
  ok(
    "the accessible name flips with the state",
    /TXT\(on \? "aria\.redModeDisable" : "aria\.redModeEnable"\)/.test(app),
  );
  /* applyI18n resets aria-label to the generic theme label, so the red-mode
     label has to be re-applied after it. */
  ok(
    "renderI18n re-syncs the button",
    /window\.renderI18n[\s\S]{0,2600}syncThemeButton\(\)/.test(app),
  );
  for (const k of ["aria.redModeEnable", "aria.redModeDisable", "set.redMode"]) {
    ok(`${k} is translated in all three languages`, (i18n.match(new RegExp(`"${k}":`, "g")) || []).length === 3);
  }
});

group("scanlines are an opt-in, adjustable texture", () => {
  ok("the wash is gated on the body class", /body\.show-scanlines::before/.test(css));
  ok("there is no unconditional body::before rule", !/(^|\n)body::before\s*\{/.test(css));
  ok("the HUD settings have the intensity select", /id="scanlinesSel"/.test(hud));
  ok(
    "the select is labelled with a translated string",
    /for="scanlinesSel"[^>]*data-i18n="set\.scanlines"/.test(hud),
  );
  for (const level of ["0", "10", "20", "30", "40"]) {
    ok(`the ${level} option is offered`, new RegExp(`value="${level}"`).test(hud));
  }
  ok(
    "the key is global, like the theme",
    /var K_SCANLINES = "scanlines"/.test(storage) &&
      /scan:\s*K_SCANLINES/.test(storage) &&
      !/pre\s*\+\s*"scanlines"/.test(storage),
  );
  ok("the choice is persisted", /localStorage\.setItem\(K\.scan,/.test(app));
  const restore = fnSource("restoreAppearance");
  ok(
    "each appearance class is toggled independently, never by assigning className",
    !/className\s*=/.test(restore) &&
      /classList\.toggle\("dark"/.test(restore) &&
      /classList\.toggle\("red-mode"/.test(restore) &&
      /classList\.toggle\("show-scanlines"/.test(restore),
  );
  ok("absent means off", /scan: !!hud \? normaliseScanlineLevel\(s\.scanlines\) : 0/.test(app));
  ok(
    "the pre-slider value still works",
    /value === "on"[\s\S]{0,40}return 20/.test(fnSource("normaliseScanlineLevel")),
  );
  ok(
    "the select reflects the active level after a render",
    /function scanlineLevel\(\)/.test(app) && /sc\.value = String\(scanlineLevel\(\)\)/.test(app),
  );
  /* Each level has its own alpha, so the control actually changes something. */
  for (const [level, alpha] of [
    ["10", "0.02"],
    ["20", "0.03"],
    ["30", "0.05"],
    ["40", "0.16"],
  ]) {
    ok(
      `level ${level} has its own strength`,
      new RegExp(
        `body\\.show-scanlines\\[data-scanlines="${level}"\\][^{]*\\{[^}]*--scan-alpha:\\s*${alpha}`,
      ).test(css),
    );
  }
  /* HUD-only markup, so every other layout must wire it defensively. */
  ok("the shared pages wire nothing", /if \(\$\("scanlinesSel"\)\)/.test(app));
});

group("destructive buttons are readable on the dark cockpit", () => {
  /* hud.css replaces base.css's red fill with the faint tint, but the dark ink
     base.css pairs with that fill was still inherited. The result was dark red
     on near-black: the delete button read as blank. */
  const tint = css.indexOf(".btn:not(.ghost),");
  const dgr = css.indexOf(".btn.dgr {");
  ok("hud.css declares .btn.dgr", dgr > 0);
  ok("and does so after the tint rule", dgr > tint);
  const rule = block(".btn.dgr {");
  ok("the ink is the danger colour", /color:\s*var\(--danger\)/.test(rule));
  ok("the fill is the tint, not the old red", /background:\s*var\(--tint\)/.test(rule));
  ok("the border still marks it destructive", /border-color:\s*var\(--danger\)/.test(rule));
  /* The warning buttons ("Restore backup", "Clear sessions") hit the same
     collision one step earlier: the tint replaces the amber fill, leaving
     base.css's dark ink unreadable on the dark cockpit. */
  const warn = css.indexOf(".btn.warn {");
  ok("hud.css declares .btn.warn", warn > 0);
  ok("and does so after the tint rule", warn > tint);
  const warnRule = block(".btn.warn {");
  ok("the warning ink is the warning colour", /color:\s*var\(--warn\)/.test(warnRule));
  ok("the warning fill is the tint", /background:\s*var\(--tint\)/.test(warnRule));
  ok("the warning border marks it", /border-color:\s*var\(--warn\)/.test(warnRule));
});

group("default buttons are readable on the dark cockpit", () => {
  /* The tint rule replaces the primary fill, but the default button inherited
     the dark primary-ink. The Save button in the edit modal was black-on-black. */
  const rule = block(".btn {");
  ok("the default button exists", rule.length > 0);
  ok("its ink is the accent colour", /color:\s*var\(--primary\)/.test(rule));
  ok(
    "the destructive and warning overrides still win",
    /\.btn\.dgr\s*\{[^}]*color:\s*var\(--danger\)/.test(css) &&
      /\.btn\.warn\s*\{[^}]*color:\s*var\(--warn\)/.test(css),
  );
});

group("the phone bar reads Log before Add", () => {
  /* Reading what was logged is the more common visit; Add moves one slot
     further from the thumb. */
  ok("Add session is third", /li:nth-child\(2\)\s*\{\s*order:\s*3;/.test(css));
  ok("Log is second", /li:nth-child\(3\)\s*\{\s*order:\s*2;/.test(css));
  ok(
    "the other tabs keep their slots",
    /li:nth-child\(1\)\s*\{\s*order:\s*1;/.test(css) &&
      /\.nav-stations\s*\{\s*display:\s*block;\s*order:\s*4;/.test(css) &&
      /li:nth-child\(6\)\s*\{\s*order:\s*5;/.test(css),
  );
});

group("the button markup is the HUD's, not the shared layouts'", () => {
  ok("the HUD button is the red-mode control", /class="tgl hud-red-btn"/.test(hud));
  ok("it shows a target icon", /<span class="ic" aria-hidden="true">◎<\/span>/.test(hud));
  ok("it carries a visible label", /hud-red-label/.test(hud) && /data-i18n="set.redMode"/.test(hud));
  ok("the HUD hides the redundant Appearance selector", /hud-theme-field/.test(hud) && /\.hud-theme-field\s*\{\s*display:\s*none/.test(css));
  /* The shared pages must NOT have picked any of this up. */
  ok("classic keeps its sun/moon button", /id="themeBtn"[\s\S]{0,180}<span aria-hidden="true">☀️<\/span>/.test(classic));
  ok("classic has no red-mode button", !/hud-red-btn/.test(classic));
});

group("the HUD dashboard leads with figures, not duplicated buttons", () => {
  /* The launcher must come after the readouts and the chart in the markup, and
     the grid must place it last, or "below the stats and chart" is only true by
     accident of a media query. */
  const scope = hud.indexOf("hud-cell-scope");
  const launch = hud.indexOf("hud-cell-launch");
  ok("the scope comes before the launcher", scope > 0 && launch > scope);
  ok(
    "the grid stacks the launcher last",
    /grid-template-areas:\s*"fleet scope"\s*"launch launch"/.test(css),
  );
  /* The mid-screen duplicates are permanently hidden; the ids stay in the DOM
     because app.js fills #thumbVeh and the id-parity guard requires them. */
  ok(
    "the thumb zone is permanently hidden",
    /\.hud-stage \.thumb-actions\s*\{\s*display:\s*none/.test(css),
  );
});

group("the vehicle rows wrap instead of overflowing", () => {
  /* The overflow was base.css only: app.css already wrapped, which is why the
     classic family was fine and the UI themes were not. */
  ok(
    "base.css .item allows wrapping",
    /\.item\s*\{[^}]*flex-wrap:\s*wrap/.test(base),
  );
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
