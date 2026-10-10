/*
 * Phase 4 strings: the nearby-charger list under the location field, and the
 * camera wording.
 *
 *   node tools/add-phase4-strings.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";

const STRINGS = {
  en: {
    "locNearUsed": "Charged here before",
    "locNearSaved": "Your favourites",
    "locNearStation": "Chargers nearby",
    "cam.usedStationFix":
      "Could not read your location, so these are around the last place searched.",
  },
  fi: {
    "locNearUsed": "Lataettu täällä aiemmin",
    "locNearSaved": "Suosikkisi",
    "locNearStation": "Lähellä olevat laturit",
    "cam.usedStationFix":
      "Sijaintia ei saatu, joten nämä ovat viimeisimmän haun paikan ympärillä.",
  },
  sv: {
    "locNearUsed": "Laddat här förut",
    "locNearSaved": "Dina favoriter",
    "locNearStation": "Laddare i närheten",
    "cam.usedStationFix":
      "Din plats kunde inte läsas, så dessa är kring platsen för den senaste sökningen.",
  },
};

/* Copy that is deliberately being replaced: the old camera note described what
   is NOT stored in terms nobody had asked about, and never said what the
   cameras actually are - which is the thing a driver needs to know. */
const MUST_REPLACE = {
  "cam.note": {
    en: "These are road-condition cameras, not speed cameras. Images are loaded from Digitraffic and nothing is stored.",
    fi: "Nämä ovat tiekamerat, eivät nopeuskamerat. Kuvat haetaan Digitrafficista eikä mitään tallenneta.",
    sv: "Det här är vägförhållandekameror, inte hastighetskameror. Bilderna hämtas från Digitraffic och ingenting sparas.",
  },
};

let src = readFileSync(FILE, "utf8");
const marks = [...src.matchAll(/^\s*(en|fi|sv):\s*\{/gm)].map((m) => ({ lang: m[1], at: m.index }));

const slots = [];
for (let i = marks.length - 1; i >= 0; i--) {
  const token = ` SLOT${i} `;
  const end = i + 1 < marks.length ? marks[i + 1].at : src.length;
  slots.unshift({ token, lang: marks[i].lang, block: src.slice(marks[i].at, end) });
  src = src.slice(0, marks[i].at) + token + src.slice(end);
}

function put(block, key, value, group) {
  const esc = key.replace(/\./g, "\\.");
  const oneLine = new RegExp('^[ \\t]*"' + esc + '":[ \\t]*"[^"]*",\\r?\\n', "m");
  const wrapped = new RegExp(
    '^[ \\t]*"' + esc + '":[ \\t]*\\r?\\n[ \\t]*"(?:[^"\\\\]|\\\\.)*",\\r?\\n',
    "m",
  );
  const isWrapped = wrapped.test(block);
  const re = isWrapped ? wrapped : oneLine.test(block) ? oneLine : null;
  if (re) {
    const indent = /^[ \t]*/.exec(block.match(re)[0])[0];
    return block.replace(re, indent + '"' + key + '": ' + JSON.stringify(value) + ",\r\n");
  }
  let anchors = [...block.matchAll(new RegExp('^[ \\t]*"' + group + "\\.[a-zA-Z]+:", "gm"))];
  if (!anchors.length) anchors = [...block.matchAll(/^[ \t]*"(st|cam|toast)\.[a-zA-Z]+":/gm)];
  if (!anchors.length) throw new Error("no anchor for " + group);
  const at = anchors[anchors.length - 1].index;
  const lineEnd = block.indexOf("\n", at) + 1;
  const indent = /^[ \t]*/.exec(block.slice(at, lineEnd))[0];
  return block.slice(0, lineEnd) + indent + '"' + key + '": ' + JSON.stringify(value) + ",\r\n" + block.slice(lineEnd);
}

let inserted = 0;
let written = 0;
for (const slot of slots) {
  let block = slot.block;
  for (const [key, value] of Object.entries(STRINGS[slot.lang] || {})) {
    const group = key.split(".")[0];
    const before = block;
    block = put(block, key, value, group);
    if (block === before) continue;
    if (new RegExp('^[ \\t]*"' + key.replace(/\./g, "\\.") + '":').test(before)) written++;
    else inserted++;
  }
  for (const [key, byLang] of Object.entries(MUST_REPLACE)) {
    if (!byLang[slot.lang]) continue;
    block = put(block, key, byLang[slot.lang], key.split(".")[0]);
    written++;
  }
  slot.block = block;
}
for (const slot of slots) src = src.replace(slot.token, () => slot.block);

writeFileSync(FILE, src, "utf8");
console.log(`inserted ${inserted}, written ${written}`);