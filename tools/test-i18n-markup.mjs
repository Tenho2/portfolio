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

const src = readFileSync("ev-tracker.html", "utf8");
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
