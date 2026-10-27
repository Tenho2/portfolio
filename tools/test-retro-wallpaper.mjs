/**
 * Retro desktop wallpaper contract.
 *
 * The wallpaper is a body background, not a window background. Hot Dog must
 * remove it so the flat red desktop remains, and both compressed files must be
 * in the offline shell (the second is cache-only until a selector exists).
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

const baseRule = (() => {
  const m = /body\[data-layout="retro-desktop"\]\s*\{([^}]*background-image[^}]*)\}/.exec(css);
  return m ? m[1] : "";
})();
const hotdogAt = css.indexOf('body.hotdog[data-layout="retro-desktop"]');
const hotdog = hotdogAt >= 0 ? css.slice(hotdogAt, css.indexOf("}", hotdogAt)) : "";

group("the compressed wallpaper is the body desktop background", () => {
  ok("the active compressed file exists", existsSync("app/ui/wallpaper/retro-desk-wallpaper-comp.jpg"));
  ok("the alternate compressed file exists", existsSync("app/ui/wallpaper/retro-desk-wallpaper-2comp.jpg"));
  ok("the CSS references the compressed active file", /background-image:\s*url\("wallpaper\/retro-desk-wallpaper-comp\.jpg"\)/.test(baseRule));
  ok("it uses cover sizing", /background-size:\s*cover/.test(baseRule));
  ok("it anchors at center bottom", /background-position:\s*center bottom/.test(baseRule));
  ok("it does not repeat", /background-repeat:\s*no-repeat/.test(baseRule));
  ok("the wallpaper is pixelated", /image-rendering:\s*pixelated/.test(baseRule));
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

group("Hot Dog removes the wallpaper", () => {
  ok("the Hot Dog block exists", hotdogAt >= 0);
  ok("the override comes after the wallpaper rule", hotdogAt > css.indexOf(baseRule));
  ok("it removes the image", /background-image:\s*none/.test(hotdog));
  ok("it restores the solid Hot Dog colour", /background-color:\s*var\(--win-teal\)/.test(hotdog));
});

group("both compressed wallpapers are cached offline", () => {
  for (const file of [
    "./app/ui/wallpaper/retro-desk-wallpaper-comp.jpg",
    "./app/ui/wallpaper/retro-desk-wallpaper-2comp.jpg",
  ]) {
    ok(`sw.js caches ${file}`, sw.includes(file));
    ok(`test-sw-bump lists ${file}`, swTest.includes(file.replace("./", "")));
  }
  ok(
    "the alternate is explicitly cache-only",
    /CACHE_ONLY_ASSETS\s*=\s*new Set\(\[[\s\S]{0,200}?retro-desk-wallpaper-2comp\.jpg/.test(
      swTest,
    ),
  );
  ok("the active file is referenced by CSS", css.includes("retro-desk-wallpaper-comp.jpg"));
});

group("the service worker version is current", () => {
  ok("sw.js is v92", /const VERSION = "v92"/.test(sw));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
