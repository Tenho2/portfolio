/*
 * Shared test helper: where the application source lives.
 *
 * The application's functions and constants used to be inline in
 * ev-tracker.html, so every functional suite read that file and sliced a
 * function body out of it. They now live in app/app.js, and the suites that
 * still read the page found nothing - a helper that throws on a missing
 * function is a loud failure, which is why these were caught rather than
 * silently passing, but the fix is the same everywhere: read the module.
 *
 * Kept as a real module rather than a copy pasted into each suite, because five
 * copies is five places to forget the next time the source moves.
 */
import { readFileSync } from "node:fs";

/** The application script, as the browser would see it: one classic file. */
export const appSource = () => readFileSync("app/app.js", "utf8");

/** The markup of a layout page. Defaults to the classic one. */
export const pageSource = (file = "ev-tracker.html") => readFileSync(file, "utf8");

/**
 * The body of a top-level function, by brace matching.
 *
 * `name` is the bare identifier, e.g. "syncVehicle" for `function syncVehicle(`.
 */
export function fnSource(name) {
  const src = appSource();
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in app/app.js`);
  /* The slice starts at the `function` keyword, not at the opening brace. These
     sources are concatenated into a Function body, where a bare `{ ... }` is a
     block and not a declaration - so returning the body alone silently produced
     a function that declared nothing, and the failure surfaced much later as
     "x is not defined". */
  let depth = 0;
  for (let j = src.indexOf("{", start); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

/** The initialiser of a top-level `var`, up to the terminating semicolon. */
export function varSource(name) {
  const src = appSource();
  const i = src.indexOf(`var ${name}`);
  if (i < 0) throw new Error(`var ${name} not found in app/app.js`);
  const end = src.indexOf(";", i);
  if (end < 0) throw new Error(`var ${name} has no terminating semicolon`);
  return src.slice(i, end + 1);
}
