/**
 * Checks that every data-i18n* key used in markup exists in the English block.
 *
 * The TXT() call check in the other suites cannot see these: a `data-i18n`
 * attribute whose key is missing renders as a blank element with no error
 * anywhere, which is how a whole panel ends up with no text in it. This caught
 * two such keys the moment they were written.
 *
 *   node tools/test-i18n-markup.mjs
 */
import { readFileSync } from "node:fs";

/* Both layout pages, and the application script.
   The markup used to carry the TXT() calls inline, so reading only the page was
   enough. Now the calls live in app/app.js and the markup only carries the
   data-i18n attributes - which is why the TXT() count collapsed to zero and this
   suite quietly stopped checking every toast, hint and panel title. */
const src = [
  readFileSync("ev-tracker.html", "utf8"),
  readFileSync("ev-tracker-wide.html", "utf8"),
  readFileSync("app/app.js", "utf8"),
].join("\n");
/* The English block moved to app/i18n.js when the page was split. Indentation
   is derived from the match rather than hard-coded, so re-indenting that file
   cannot silently turn this check into a no-op. */
const dict = readFileSync("app/i18n.js", "utf8");

const langStart = [...dict.matchAll(/^(\s*)([a-z]{2}): \{/gm)];
if (langStart.length < 2) throw new Error("no language blocks found in app/i18n.js");
const en = langStart.find((m) => m[2] === "en");
const fi = langStart.find((m) => m[2] === "fi");
if (!en || !fi) throw new Error("en/fi language blocks not found in app/i18n.js");

const indent = en[1];
const enStart = en.index;
const enEnd = fi.index;
const enBlock = dict.slice(enStart, enEnd);

const defined = new Set([...enBlock.matchAll(/"([A-Za-z0-9_.]+)":/g)].map((m) => m[1]));
/* This codebase also uses unquoted keys, e.g. `db:`, which sit two levels in
   from the language name. */
for (const m of enBlock.matchAll(
  new RegExp(`^${indent} {2}([A-Za-z0-9_.]+):`, "gm"),
))
  defined.add(m[1]);
if (defined.size < 100)
  throw new Error(
    `only ${defined.size} keys parsed from the en block; the pattern is wrong`,
  );

const used = new Map();
for (const m of src.matchAll(/data-i18n(?:-aria|-ph|-html)?="([^"]+)"/g)) {
  if (!used.has(m[1])) used.set(m[1], []);
  used.get(m[1]).push(src.slice(0, m.index).split("\n").length);
}

const missing = [...used.keys()].filter((k) => !defined.has(k)).sort();

/* Keys assembled at runtime from a prefix, which cannot be matched statically. */
const dynamicPrefixes = new Set(
  [...src.matchAll(/data-i18n(?:-aria|-ph|-html)?="([A-Za-z0-9_.]*?)\$\{/g)].map(
    (m) => m[1],
  ),
);
const reallyMissing = missing.filter((k) => {
  for (const p of dynamicPrefixes) if (k.startsWith(p)) return false;
  return true;
});

console.log(
  `data-i18n keys used: ${used.size} | defined in en: ${defined.size} | dynamic prefixes: ${
    [...dynamicPrefixes].join(", ") || "(none)"
  }`,
);

if (reallyMissing.length) {
  console.error(`\n${reallyMissing.length} markup key(s) have no English text:`);
  for (const k of reallyMissing) {
    const l = used.get(k);
    console.error(
      `  ${k}  (line ${l[0]}${l.length > 1 ? ` and ${l.length - 1} more` : ""})`,
    );
  }
  process.exit(1);
}
console.log("Every markup i18n key resolves.");

/* --------------------------------------------------------------------------
 * Keys used from script rather than from markup.
 *
 * The check above only sees data-i18n attributes, so it cannot catch a key that
 * disappears from the dictionary while TXT("...") still asks for it. That is
 * not hypothetical: editing app/i18n.js destroyed toast.legacyMoved exactly
 * that way, and every other suite stayed green, because a missing key renders as
 * the raw key string at runtime and nothing fails at build time.
 *
 * TXT() is the only accessor the application script uses. Its argument is a
 * plain literal in almost every call; the ones built from a prefix are listed
 * below so the sweep does not report them as missing.
 * ----------------------------------------------------------------------- */
const dynamicCodePrefixes = new Set(
  [
    ...src.matchAll(/\bTXT\(\s*"([A-Za-z0-9_.]*?)\$\{/g),
    /* sync.reason.<kind> where kind comes from classifyRefusal(). */
    ...src.matchAll(/"sync\.reason\."\s*\+/g),
    /* TXT(someVariable) - a computed key cannot be resolved statically. */
    ...src.matchAll(/\bTXT\(\s*[a-zA-Z_$][\w$]*\s*[,)]/g),
  ].map((m) => m[1] || "(computed)"),
);

const usedInCode = new Map();
/* The lookahead rejects a literal that is immediately concatenated, such as
   TXT("sync.reason." + kind). Those are prefixes, not whole keys, and are
   reported separately below instead. */
for (const m of src.matchAll(/\bTXT\(\s*"([^"${]+)"(?!\s*\+)/g)) {
  if (!usedInCode.has(m[1])) usedInCode.set(m[1], []);
  usedInCode.get(m[1]).push(src.slice(0, m.index).split("\n").length);
}

const codeMissing = [...usedInCode.keys()].filter((k) => !defined.has(k)).sort();

/* ------------------------------------------------------------------
 * fi and sv must be complete. se is deliberately partial and falls back.
 *
 * A missing key renders as the English text at runtime with no error anywhere,
 * which is how the sign-out confirmation ended up in English inside an
 * otherwise Finnish flow — the one dialog that names the account, to guard
 * against signing out of the wrong one.
 * ------------------------------------------------------------------ */
const required = ["fi", "sv"];

/* Both key forms are used in this file: most are quoted, a handful are not
   (db:, foot:). The first version of this check only read quoted keys, so it
   reported those as missing translations when they were present and correct. */
function keysIn(start, end) {
  const body = dict.slice(start, end);
  const keys = new Set(
    [...body.matchAll(/"([A-Za-z0-9_.]+)":/g)].map((m) => m[1]),
  );
  for (const m of body.matchAll(/^[ \t]{6}([A-Za-z0-9_.]+)\s*:/gm)) {
    keys.add(m[1]);
  }
  return keys;
}

const enKeys = keysIn(langStart.find((m) => m[2] === "en").index, langStart[1].index);

const incomplete = required.filter((L) => {
  const start = langStart.find((m) => m[2] === L);
  if (!start) return true;
  const others = langStart
    .filter((m) => m[2] !== L && m[0] > start[0])
    .map((m) => m.index);
  const end = others.length ? Math.min(...others) : dict.length;
  const keys = keysIn(start.index, end);
  const missing = [...enKeys].filter((k) => !keys.has(k));
  if (missing.length)
    console.error(`  ${L} is missing ${missing.length}: ${missing.slice(0, 12).join(", ")}`);
  return missing.length > 0;
});

if (incomplete.length) {
  console.error(
    `\n${incomplete.join(", ")} must translate every key; missing entries fall back to English`,
  );
  process.exit(1);
}
console.log(`fi and sv are complete (${required.join(", ")}).`);

console.log(
  `TXT() keys used: ${usedInCode.size} | computed (not checked): ${dynamicCodePrefixes.size}`,
);

if (codeMissing.length) {
  console.error(
    `\n${codeMissing.length} key(s) are asked for by script but missing from en:`,
  );
  for (const k of codeMissing) {
    const l = usedInCode.get(k);
    console.error(
      `  ${k}  (line ${l[0]}${l.length > 1 ? ` and ${l.length - 1} more` : ""})`,
    );
  }
  process.exit(1);
}
console.log("Every TXT() key resolves.");
