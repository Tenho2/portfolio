/*
 * Adds the layout-switcher strings to all three languages.
 *
 * Keys go next to set.dataLead, the panel the picker lives in. Scripted rather
 * than done by hand because the three dictionaries are separate blocks in one
 * 2,000-line file, the same key has to land in each, and a miss is invisible
 * until the i18n completeness test fails on some later build.
 *
 * Each language is located by its block header, never by "the first
 * set.dataLead": the anchor string appears once per dictionary, so an unanchored
 * search would drop all three sets of strings into the English block.
 *
 * Usage: node tools/add-layout-i18n.mjs   (idempotent)
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";
const ANCHOR = '"set.dataLead":';

const STRINGS = {
  en: {
    "set.layout": "Layout",
    "set.layoutHint":
      "Two arrangements of the same app. Nothing is moved or re-imported when you switch, and your data and account are the same in both.",
    "set.layoutClassic": "Classic (side rail)",
    "set.layoutWide": "Wide (top bar)",
  },
  fi: {
    "set.layout": "Asettelu",
    "set.layoutHint":
      "Sama sovellus kahdessa asettelussa. Vaihdettaessa mitään ei siirretä eikä tuoda uudelleen, ja tietosi sekä tilisi ovat molemmissa samat.",
    "set.layoutClassic": "Klassinen (sivupalkki)",
    "set.layoutWide": "Leveä (yläpalkki)",
  },
  sv: {
    "set.layout": "Layout",
    "set.layoutHint":
      "Samma app i två layouter. Ingenting flyttas eller importeras om när du byter, och dina data och ditt konto är desamma i båda.",
    "set.layoutClassic": "Klassisk (sidopanel)",
    "set.layoutWide": "Bred (toppfält)",
  },
};

const src = readFileSync(FILE, "utf8");
const eol = src.includes("\r\n") ? "\r\n" : "\n";

/** The offset of the next `lang: {` block header at or after `from`. */
function blockStart(lang, from) {
  const re = new RegExp(`^\\s*${lang}:\\s*\\{`, "m");
  const rest = src.slice(from);
  const m = rest.match(re);
  if (!m) throw new Error(`no ${lang} block at or after ${from}`);
  return from + m.index;
}

/** Insert `lines` immediately after the anchor line inside [start, end). */
function insertIn(start, end, missing) {
  /* Search within this block only. An unbounded indexOf finds the first
     set.dataLead in the file, which is always the English one, so Finnish and
     Swedish were reported as already complete and never received their keys -
     and the whole-file existence check that "proved" it was the bug. */
  const block = src.slice(start, end);
  const first = block.indexOf(ANCHOR);
  if (first < 0) throw new Error("anchor not inside the block");
  if (block.indexOf(ANCHOR, first + ANCHOR.length) >= 0)
    throw new Error("anchor appears more than once in the block");
  const lineEnd = src.indexOf("\n", start + first);
  const insert = missing
    .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join(eol);
  return src.slice(0, lineEnd) + eol + insert + src.slice(lineEnd);
}

let out = src;
let total = 0;
const order = ["en", "fi", "sv"];

for (let i = 0; i < order.length; i++) {
  const lang = order[i];
  const start = blockStart(lang, 0);
  const end = i + 1 < order.length ? blockStart(order[i + 1], start + 1) : out.length;
  /* Scoped to this block, not the whole file. A whole-file search finds the
     English set.layoutClassic and concludes Finnish is done, which is how two
     languages silently ship with no translation and fall back to English. */
  const blockText = out.slice(start, end);
  const missing = Object.entries(STRINGS[lang]).filter(
    ([k]) => !blockText.includes(`"${k}":`),
  );
  if (!missing.length) {
    console.log(`  ${lang}: already complete`);
    continue;
  }
  out = insertIn(start, end, missing);
  total += missing.length;
  console.log(`  ${lang}: +${missing.length} keys`);
}

writeFileSync(FILE, out, "utf8");
console.log(`\nadded ${total} keys to ${FILE}`);