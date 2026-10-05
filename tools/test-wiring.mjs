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
  for (const [lang, s] of samples) is(`${lang}: ${s}`, src.includes(s), true);
});

group("line endings are consistent", () => {
  const crlf = (src.match(/\r\n/g) || []).length;
  const bareLf = (src.match(/(?<!\r)\n/g) || []).length;
  is(`no mixed endings (crlf=${crlf}, bare lf=${bareLf})`, bareLf, 0);
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

group("the app module does not reach into the i18n module's scope", () => {
  /* Two bugs came from this: `lang is not defined` and, before it, `LANGS is
     not defined`. Both are variables declared inside the i18n module's IIFE,
     which the application script cannot see. They surface as a thrown
     ReferenceError that blanks a panel rather than as a build error, so they
     are worth asserting on directly. */
  const i18nEnd = src.indexOf("window.EV_I18N =");
  is("the i18n module boundary was found", i18nEnd > 0, true);
  if (i18nEnd < 0) return;

  /* Everything after the i18n module is the application script. */
  const app = src.slice(src.indexOf("<script>", i18nEnd));
  /* Only names that are long enough to be unambiguous. Single letters like the
     i18n module's `t` and `D` are useless here: they match ordinary local names
     and string fragments throughout the app. */
  const privateNames = ["LANGS", "ORDER", "lang"];
  const before = failures.length;
  for (const name of privateNames) {
    /* A bare reference, not a property access or an object key. */
    const re = new RegExp(`(?<![.\\w"'])${name}\\b`, "g");
    const hits = [...app.matchAll(re)];
    for (const h of hits) {
      const line = app.slice(0, h.index).split("\n").length;
      /* Inside the test file's own extraction helpers is fine; this is the
         page, so anything here is a genuine reference. */
      fail(
        `"${name}" is not visible to the app script`,
        `referenced around app line ${line}`,
      );
    }
  }
  if (failures.length === before) pass++;
  else
    failures.push(
      `${failures.length - before} out-of-scope reference(s); see above`,
    );
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
