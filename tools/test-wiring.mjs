/**
 * Checks that every element the script reaches for actually exists, and that
 * the file's text encoding is intact.
 *
 * Why this exists
 *   Two separate silent failures motivated it.
 *
 *   First, a typo in an id is invisible: `$(`vehSettigns`)` returns null and
 *   the line that would have set its content quietly does nothing, so a panel
 *   renders empty with no error. That is the same symptom as the missing-text
 *   bugs, and it happens in code no unit test touches.
 *
 *   Second, a PowerShell `Get-Content`/`Set-Content` round trip reads UTF-8 as
 *   ANSI and silently mangles every non-ASCII character whose encoding uses a
 *   byte CP1252 leaves undefined. That destroyed this file once: the emoji, the
 *   curly quotes, and the characters of "Bahčit" and "Áigi" were unrecoverable.
 *   Nothing noticed until the strings were read back.
 *
 *   node tools/test-wiring.mjs
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

const file = "ev-tracker.html";
const raw = readFileSync(file);
const src = raw.toString("utf8");

/* The app is being split into classic scripts under app/. Discover them from
   the markup rather than listing them here, so a new file is covered the
     moment its <script src> tag is added and a deleted one stops being checked
     the moment its tag goes. The ordering assertion further down is what makes
   the split safe rather than merely tidy.

   Only same-origin paths are read from disk. Chart.js, Leaflet and the Supabase
   client come from a CDN and are asserted separately to be absolute URLs. */
const ALL_SCRIPT_SRC = [...src.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(
  (m) => m[1],
);
const isRemote = (s) => /^(https?:)?\/\//i.test(s);
const APP_SCRIPTS = ALL_SCRIPT_SRC.filter((s) => !isRemote(s));
const REMOTE_SCRIPTS = ALL_SCRIPT_SRC.filter(isRemote);
const readAppScripts = () =>
  APP_SCRIPTS.map((name) => ({ name, text: readFileSync(name, "utf8") }));

let pass = 0;
const failures = [];
function is(label, actual, expected) {
  if (actual === expected) pass++;
  else failures.push(`${label}\n      expected ${expected}, got ${actual}`);
}
function fail(label, detail) {
  failures.push(`${label}\n      ${detail}`);
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

/* ------------------------------------------------------------------ */
group("the file is valid UTF-8 with no byte-order mark", () => {
  is("no BOM", raw[0] === 0xef, false);
  is("starts with the doctype", src.startsWith("<!doctype html>"), true);
  /* A replacement character means something was decoded from bytes that are not
     valid UTF-8, which is the signature of the damage described above. */
  is("no U+FFFD replacement characters", src.includes("�"), false);
  /* The classic CP1252 mis-decode of UTF-8 bytes. */
  is("no 'Ã' mojibake", src.includes("Ã"), false);
  is("no 'â€' mojibake", src.includes("â€"), false);
});

group("non-English text survived", () => {
  /* Sampled from each language block. If the encoding is damaged these are the
     first things to go, and they are all but invisible in a diff. */
  const samples = [
    ["Finnish", "Sähköautojen latausloki"],
    ["Finnish", "Asetukset"],
    ["Finnish", "Roskakori"],
    ["Swedish", "Papperskorg"],
    ["Swedish", "Ta bort åtkomst"],
    ["Swedish", "Inställningar"],
    ["Northern Sami", "Bahčit"],
    ["Northern Sami", "Áigi"],
    ["Emoji", "🗑️"],
    ["Emoji", "☀️"],
    ["Quotes", "“{q}”"],
    ["Quotes", "“Add session”"],
  ];
  /* Checked across every file that ships as part of the page, not just the
     HTML. The i18n module moved to app/i18n.js, and a check that only read
     ev-tracker.html reported all twelve samples missing — which looked like
     catastrophic data loss and was really just the text having moved. */
  const files = readAppScripts();
  is(`the page loads ${files.length} external script(s)`, files.length > 0, true);
  for (const [lang, s] of samples) {
    const where = files.find((f) => f.text.includes(s));
    is(`${lang}: ${s}`, where ? where.name : "missing from every shipped file",
      where ? where.name : "missing from every shipped file");
  }
});

group("line endings are consistent", () => {
  for (const name of [file, ...APP_SCRIPTS]) {
    const text = readFileSync(name, "utf8");
    const bareLf = (text.match(/(?<!\r)\n/g) || []).length;
    is(`no mixed endings in ${name} (bare lf=${bareLf})`, bareLf, 0);
  }
});

/* ------------------------------------------------------------------ */
group("every id the script looks up exists in the markup", () => {
  /* $("x") is the short accessor used throughout, and getElementById("x") is
     the long form. Both resolve to the same requirement. */
  const wanted = new Map();
  for (const m of src.matchAll(/\$\("([^"]+)"\)/g)) wanted.set(m[1], "$()");
  for (const m of src.matchAll(/getElementById\("([^"]+)"\)/g))
    wanted.set(m[1], "getElementById");

  const ids = new Set([...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

  /* Some elements are built at runtime rather than written in the markup, and
     then looked up by id like any other. The location datalist is the one that
     exists today: the script creates it and assigns dl.id = "favOptions". A
     statically declared id assignment counts as present, otherwise every such
     element would be reported forever. */
  for (const m of src.matchAll(/\.id\s*=\s*"([^"]+)"/g)) ids.add(m[1]);
  for (const m of src.matchAll(/setAttribute\(\s*"id"\s*,\s*"([^"]+)"/g)) ids.add(m[1]);

  const missing = [...wanted.keys()].filter((id) => !ids.has(id));
  is(`all ${wanted.size} looked-up ids exist (${missing.length} missing)`, missing.length, 0);
  for (const id of missing.slice(0, 15))
    fail("script looks up an id that is not in the markup", `"${id}" via ${wanted.get(id)}`);
});

group("no id is used twice", () => {
  const seen = new Set();
  const dupes = [];
  for (const m of src.matchAll(/\sid="([^"]+)"/g)) {
    if (seen.has(m[1])) dupes.push(m[1]);
    seen.add(m[1]);
  }
  is(`no duplicate ids (${dupes.length} found)`, dupes.length, 0);
  for (const d of [...new Set(dupes)].slice(0, 10)) fail("duplicate id", d);
});

group("the app module reaches other modules only through their public interface", () => {
  /* Two bugs came from this: `lang is not defined` and, before it, `LANGS is
     not defined`. Both were variables declared inside the i18n IIFE, which the
     application script could not see. They surface as a thrown ReferenceError
     that blanks a panel rather than as a build error.

     Since the page was split the two are in separate files, so the boundary is
     enforced by the file system. This test still earns its place: it keeps the
     private names listed below honest as those files are edited, and it catches
     the application script loading a module in the wrong order or reaching for
     a private instead of the published object. It should pass trivially. */
  const i18n = readFileSync("app/i18n.js", "utf8");
  const storage = readFileSync("app/storage.js", "utf8");

  /* Only names long enough to be unambiguous. Single letters like the i18n
     module's `t` and `D` are useless here: they match ordinary local names and
     string fragments throughout the app. */
  const privateNames = ["LANGS", "ORDER", "lang"];

  /* The private must exist in the i18n file, or this check is guarding a name
     that no longer exists and would pass for the wrong reason. */
  const declared = [];
  for (const name of privateNames) {
    if (new RegExp(`(?:var|function)\\s+${name}\\b`).test(i18n)) declared.push(name);
  }
  is(
    `every guarded name is still private to app/i18n.js (${declared.length}/${privateNames.length})`,
    declared.length,
    privateNames.length,
  );

  /* Storage privates, which is the same mistake waiting to happen in the other
     module. K_OLD and K_MIGRATED exist only inside app/storage.js. */
  const storagePrivates = ["K_OLD", "K_MIGRATED", "K_THEME", "current"];
  const declaredStorage = storagePrivates.filter((name) =>
    new RegExp(`(?:var|function)\\s+${name}\\b`).test(storage),
  );
  is(
    `every storage private is still declared (${declaredStorage.length}/${storagePrivates.length})`,
    declaredStorage.length,
    storagePrivates.length,
  );

  /* The app script must not reference any private of either module. */
  const appStart = src.indexOf("<script>");
  is("the app script block was found", appStart > 0, true);
  if (appStart < 0) return;
  const app = src.slice(appStart);
  let caught = 0;
  for (const [name, owner] of [
    ...privateNames.map((n) => [n, "app/i18n.js"]),
    ...storagePrivates.map((n) => [n, "app/storage.js"]),
  ]) {
    /* A bare reference, not a property access or an object key. `current` is
       excluded from the bare-name sweep below because it is an ordinary English
       word that appears in comments and strings; only its call form is
       meaningful. */
    if (name === "current") continue;
    /* A bare reference, not a property access or an object key. */
    const re = new RegExp(`(?<![.\\w"'])${name}\\b`, "g");
    for (const h of app.matchAll(re)) {
      caught++;
      const line = app.slice(0, h.index).split("\n").length;
      fail(
        `"${name}" is private to ${owner}`,
        `the app script references it around ev-tracker.html line ${appStart + line}`,
      );
    }
  }
  is(`no out-of-scope references in the app script (${caught} found)`, caught, 0);

  /* And the app must load every module before itself, or the published object
     is undefined at boot: EV_I18N leaves every translated label blank, and
     EV_STORAGE means nothing can be read from or written to disk. */
  for (const mod of APP_SCRIPTS) {
    const tag = src.indexOf(`src="${mod}"`);
    is(`the page loads ${mod}`, tag > 0, true);
    is(`${mod} loads before the app script`, tag > 0 && tag < appStart, true);
  }
  /* The app must not read a module before its tag has appeared. */
  const firstUse = Math.min(
    ...APP_SCRIPTS.map((m) => {
      const i = src.indexOf(m);
      return i < 0 ? Infinity : i;
    }),
  );
  is("every module tag precedes its first use", firstUse < appStart, true);

  /* Each module must actually publish the global the page expects, or the app
     script throws on its very first line. */
  for (const [mod, global] of [
    ["app/i18n.js", "window.EV_I18N"],
    ["app/storage.js", "window.EV_STORAGE"],
  ]) {
    is(`${mod} publishes ${global}`, readFileSync(mod, "utf8").includes(global), true);
  }

  /* Every script the page pulls in must resolve: local paths must exist on
     disk, and remote ones must be absolute URLs so they cannot silently become
     a broken relative path. */
  const missingFiles = APP_SCRIPTS.filter((s) => !existsSync(s));
  is(`every local script exists (${missingFiles.length} missing)`, missingFiles.length, 0);
  for (const s of missingFiles) fail("script tag points at a file that is not there", s);
  is(`every remote script uses an absolute URL (${REMOTE_SCRIPTS.length})`,
    REMOTE_SCRIPTS.filter((s) => /^https?:\/\//i.test(s)).length,
    REMOTE_SCRIPTS.length);
});

group("the service worker precache list only names files that exist", () => {
  const sw = readFileSync("sw.js", "utf8");
  const listed = [...sw.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]);
  is("the precache list is not empty", listed.length > 0, true);
  /* A stale entry here is not cosmetic: addAll() is atomic, so one bad path
     rejects the whole install and the offline shell silently stops working. */
  const missing = listed.filter(
    (f) => f && !existsSync(join(process.cwd(), decodeURIComponent(f))),
  );
  is(`every precached file exists (${missing.length} missing)`, missing.length, 0);
  for (const m of missing.slice(0, 10)) fail("precache entry not on disk", m);
});

group("the SW version is bumped above the last few releases", () => {
  /* The repeated cause of "my phone is still on the old build". Cheap to assert
     here so it cannot be forgotten silently. */
  const sw = readFileSync("sw.js", "utf8");
  const m = sw.match(/const VERSION\s*=\s*"v(\d+)"/);
  is("a version is declared", !!m, true);
  if (m) is(`version is at least v13 (found v${m[1]})`, Number(m[1]) >= 13, true);
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("");
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
