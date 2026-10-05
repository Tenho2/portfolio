/**
 * Fails when the app shell changed but the service worker version did not.
 *
 * Why this exists
 *   The service worker is cache-first, so ev-tracker.html is served from the
 *   cache and only re-fetched when the worker itself changes. Bump VERSION in
 *   sw.js is the ONLY signal a phone gets that a new build exists.
 *
 *   This was got wrong repeatedly, and always the same way: a change was made to
 *   ev-tracker.html, sw.js was left alone, the pre-commit hook noticed at commit
 *   time, and by then the change had already been tested on a device against the
 *   old cached shell. A whole feature went missing that way. The user reported
 *   a button as "hidden somewhere again" when it had never reached their phone.
 *
 *   Putting it in the check suite rather than only in the commit hook means the
 *   failure happens while the change is still in the working tree, before it can
 *   be deployed or tested.
 *
 *   node tools/test-sw-bump.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/* Anything the precache list serves as the shell. Changing any of these without
   a new VERSION leaves devices on the old build. */
const SHELL = [
  "ev-tracker.html",
  "index.html",
  "sw.js",
  "manifest.json",
  "app/i18n.js",
  "app/storage.js",
];

let pass = 0;
const failures = [];
function is(label, actual, expected) {
  if (actual === expected) pass++;
  else failures.push(`${label}\n      expected ${expected}, got ${actual}`);
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch (e) {
    return null;
  }
}

const changedAll = git(["diff", "--name-only", "HEAD"]);
const untracked = git(["ls-files", "--others", "--exclude-standard"]);

if (changedAll === null || untracked === null) {
  /* Not a git checkout, or git is unavailable. Say so rather than pretending
     the check passed, because a silent pass is how this class of bug survives. */
  failures.push(
    "could not run git, so the stale-service-worker check could not run\n" +
      "      run this inside the repository, or check VERSION in sw.js by hand",
  );
} else {
  const touched = new Set(
    [...changedAll.split("\n"), ...untracked.split("\n")]
      .map((s) => s.trim())
      .filter(Boolean),
  );

  /* sw.js being touched is NOT enough. Its comment block is edited on most
     changes, and accepting that as the signal is precisely how the original bug
     slipped through: the version comment was rewritten while VERSION stayed put.
     The only thing that counts is that the VERSION value itself differs. */
  const workingVersion = /const VERSION = "([^"]+)"/.exec(
    readFileSync("sw.js", "utf8"),
  );
  const committed = git(["show", "HEAD:sw.js"]);
  const committedVersion = committed
    ? /const VERSION = "([^"]+)"/.exec(committed)
    : null;

  is("sw.js declares a VERSION", workingVersion ? true : false, true);

  const versionChanged =
    !committedVersion || !workingVersion
      ? true
      : committedVersion[1] !== workingVersion[1];

  /* A new shell file only counts if the page actually loads it, otherwise an
     unrelated scratch file would demand a version bump. */
  const pageText = touched.has("ev-tracker.html")
    ? readFileSync("ev-tracker.html", "utf8")
    : "";

  const shellTouched = SHELL.filter((f) => {
    if (!touched.has(f)) return false;
    if (f === "sw.js") return false;
    /* An added file under app/ only matters once it is referenced. */
    if (f.startsWith("app/") && !pageText.includes(f.split("/").pop())) {
      is(`${f} is present but not loaded by the page`, "loaded", "not loaded");
      return false;
    }
    return true;
  });

  if (shellTouched.length && !versionChanged) {
    failures.push(
      `${shellTouched.join(", ")} changed but VERSION in sw.js is still ` +
        `"${workingVersion ? workingVersion[1] : "(none)"}"\n` +
        "      devices serve the cached shell, so nothing you changed will\n" +
        "      reach a phone. Bump VERSION in sw.js.",
    );
  } else {
    pass++;
    is(
      shellTouched.length
        ? `VERSION bumped alongside ${shellTouched.length} shell file(s)`
        : "no shell change needing a version bump",
      true,
      true,
    );
  }
}

console.log(
  `${failures.length ? "FAIL" : "ok  "}  the service worker version is not stale`,
);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
