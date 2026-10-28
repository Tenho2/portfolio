/**
 * Retro desktop wallpaper contract.
 *
 * The wallpaper is a fixed viewport layer, not a body or window background, so
 * a tall mobile window cannot resize or drag the scene down. Hot Dog must hide
 * it so the flat red desktop remains, and both compressed files must be in the
 * offline shell. Portrait phones use the alternate because its car and charger
 * are near the centre of the narrow crop.
 */
import { existsSync, readFileSync } from "node:fs";

const css = readFileSync("app/ui/retro-desktop.css", "utf8");
const sw = readFileSync("sw.js", "utf8");
const swTest = readFileSync("tools/test-sw-bump.mjs", "utf8");

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

const bodyRule = (() => {
  const m = /body\[data-layout="retro-desktop"\]\s*\{([^}]*)\}/.exec(css);
  return m ? m[1] : "";
})();
const layerRule = (() => {
  const m = /body\[data-layout="retro-desktop"\]::before\s*\{([^}]*)\}/.exec(css);
  return m ? m[1] : "";
})();
const portraitRule =
  /@media \(max-width: 820px\) and \(orientation: portrait\)\s*\{[\s\S]{0,400}?body\[data-layout="retro-desktop"\]::before\s*\{[^}]*background-image:\s*url\("wallpaper\/retro-desk-wallpaper-2comp\.jpg"\)[^}]*\}/.exec(
    css,
  );
const hotdogAt = css.indexOf('body.hotdog[data-layout="retro-desktop"]::before');
const hotdog = hotdogAt >= 0 ? css.slice(hotdogAt, css.indexOf("}", hotdogAt)) : "";

group("the compressed wallpaper is a fixed desktop layer", () => {
  ok("the active compressed file exists", existsSync("app/ui/wallpaper/retro-desk-wallpaper-comp.jpg"));
  ok("the alternate compressed file exists", existsSync("app/ui/wallpaper/retro-desk-wallpaper-2comp.jpg"));
  ok("the CSS references the compressed active file", /background-image:\s*url\("wallpaper\/retro-desk-wallpaper-comp\.jpg"\)/.test(layerRule));
  ok("it uses cover sizing", /background-size:\s*cover/.test(layerRule));
  ok("it anchors at center bottom", /background-position:\s*center bottom/.test(layerRule));
  ok("it does not repeat", /background-repeat:\s*no-repeat/.test(layerRule));
  ok("the wallpaper is pixelated", /image-rendering:\s*pixelated/.test(layerRule));
  ok("it is fixed to the viewport", /position:\s*fixed/.test(layerRule));
  ok("it fills the viewport", /inset:\s*0/.test(layerRule));
  ok("it sits behind the desktop content", /z-index:\s*-1/.test(layerRule));
  ok("it does not intercept input", /pointer-events:\s*none/.test(layerRule));
  ok("the body keeps viewport height when the desktop is empty", /min-height:\s*100vh/.test(bodyRule));
  ok("dynamic viewport height is used where supported", /min-height:\s*100dvh/.test(bodyRule));
  ok("the body itself no longer scales the image", !/background-image/.test(bodyRule));
});

group("portrait phones use the car-centred alternate wallpaper", () => {
  ok("portrait media query selects the alternate", !!portraitRule);
  ok("the portrait crop is shifted toward the car", /background-position:\s*75% bottom/.test(portraitRule[0]));
  ok("the alternate file exists", existsSync("app/ui/wallpaper/retro-desk-wallpaper-2comp.jpg"));
  ok("the desktop layer still uses the main image", /retro-desk-wallpaper-comp\.jpg/.test(layerRule));
});

group("content images stay sharp while the wallpaper is pixelated", () => {
  ok(
    "images reset to auto rendering",
    /body\[data-layout="retro-desktop"\] img[\s\S]{0,120}?image-rendering:\s*auto/.test(css),
  );
  ok(
    "canvases reset to auto rendering",
    /body\[data-layout="retro-desktop"\] canvas[\s\S]{0,120}?image-rendering:\s*auto/.test(css),
  );
});

group("Hot Dog hides the wallpaper layer", () => {
  ok("the Hot Dog layer override exists", hotdogAt >= 0);
  ok("the override comes after the wallpaper layer", hotdogAt > css.indexOf(layerRule));
  ok("it hides the fixed layer", /display:\s*none/.test(hotdog));
  ok(
    "the body still paints the solid Hot Dog colour",
    /body\.hotdog\[data-layout="retro-desktop"\]\s*\{[^}]*background-color:\s*var\(--win-teal\)/.test(css),
  );
});

group("both compressed wallpapers are cached offline", () => {
  for (const file of [
    "./app/ui/wallpaper/retro-desk-wallpaper-comp.jpg",
    "./app/ui/wallpaper/retro-desk-wallpaper-2comp.jpg",
  ]) {
    ok(`sw.js caches ${file}`, sw.includes(file));
    ok(`test-sw-bump lists ${file}`, swTest.includes(file.replace("./", "")));
  }
  ok("the active file is referenced by CSS", css.includes("retro-desk-wallpaper-comp.jpg"));
  ok("the alternate is referenced by the portrait CSS", !!portraitRule);
});

group("the service worker version is current", () => {
  ok("sw.js is v96", /const VERSION = "v96"/.test(sw));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
