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

const enStart = src.indexOf("\n          en: {");
const fiStart = src.indexOf("\n          fi: {");
if (enStart < 0 || fiStart < 0) throw new Error("en/fi language blocks not found");
const enBlock = src.slice(enStart, fiStart);

const defined = new Set([...enBlock.matchAll(/"([A-Za-z0-9_.]+)":/g)].map((m) => m[1]));
/* This codebase also uses unquoted keys, e.g. `db:`. */
for (const m of enBlock.matchAll(/^\s{12}([A-Za-z0-9_.]+):/gm)) defined.add(m[1]);

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
