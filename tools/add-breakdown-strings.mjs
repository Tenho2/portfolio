/*
 * Strings for the payer breakdown sheet.
 *
 *   node tools/add-breakdown-strings.mjs
 *
 * Idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";

const STRINGS = {
  en: {
    "pay.breakdown": "Payer breakdown",
    "pay.rangeAll": "All",
    "pay.rangeMonth": "This month",
    "pay.rangeYear": "This year",
    "pay.rangeLast": "Past year",
    "pay.total": "total",
    "pay.sessions": "{n} charges",
    "pay.unassignedShort": "Unassigned",
    "pay.nothingInRange": "No charges in this period.",
    "pay.undatedNote": "{n} charges without a usable date are only counted under All.",
  },
  fi: {
    "pay.breakdown": "Maksajien jako",
    "pay.rangeAll": "Kaikki",
    "pay.rangeMonth": "Tämä kuukausi",
    "pay.rangeYear": "Tämä vuosi",
    "pay.rangeLast": "Viime vuosi",
    "pay.total": "yhteensä",
    "pay.sessions": "{n} latausta",
    "pay.unassignedShort": "Määritelemätön",
    "pay.nothingInRange": "Ei latauksia tältä jaksolta.",
    "pay.undatedNote": "{n} latausta ilman kelvollista päivämäärää lasketaan vain valinnassa Kaikki.",
  },
  sv: {
    "pay.breakdown": "Fördelning mellan betalare",
    "pay.rangeAll": "Alla",
    "pay.rangeMonth": "Den här månaden",
    "pay.rangeYear": "I år",
    "pay.rangeLast": "Senaste året",
    "pay.total": "totalt",
    "pay.sessions": "{n} laddningar",
    "pay.unassignedShort": "Obestämd",
    "pay.nothingInRange": "Inga laddningar under den här perioden.",
    "pay.undatedNote": "{n} laddningar utan användbart datum räknas bara under Alla.",
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

function put(block, key, value) {
  const oneLine = new RegExp('^[ \\t]*"' + key.replace(/\./g, "\\.") + '":[ \\t]*"[^"]*",\\r?\\n', "m");
  const wrapped = new RegExp(
    '^[ \\t]*"' + key.replace(/\./g, "\\.") + '":[ \\t]*\\r?\\n[ \\t]*"(?:[^"\\\\]|\\\\.)*",\\r?\\n',
    "m",
  );
  const re = wrapped.test(block) ? wrapped : oneLine.test(block) ? oneLine : null;
  if (re) {
    const indent = /^[ \t]*/.exec(block.match(re)[0])[0];
    return { block: block.replace(re, indent + '"' + key + '": ' + JSON.stringify(value) + ",\r\n"), wrote: true };
  }
  const anchors = [...block.matchAll(/^[ \t]*"pay\.[a-zA-Z0-9]+":/gm)];
  if (!anchors.length) throw new Error("no pay. anchor for " + key);
  const at = anchors[anchors.length - 1].index;
  const lineEnd = block.indexOf("\n", at) + 1;
  const indent = /^[ \t]*/.exec(block.slice(at, lineEnd))[0];
  return { block: block.slice(0, lineEnd) + indent + '"' + key + '": ' + JSON.stringify(value) + ",\r\n" + block.slice(lineEnd), wrote: false };
}

let inserted = 0;
let written = 0;
for (const slot of slots) {
  let block = slot.block;
  for (const [key, value] of Object.entries(STRINGS[slot.lang] || {})) {
    const r = put(block, key, value);
    block = r.block;
    if (r.wrote) written++;
    else inserted++;
  }
  slot.block = block;
}
for (const slot of slots) src = src.replace(slot.token, () => slot.block);

writeFileSync(FILE, src, "utf8");
console.log(`inserted ${inserted}, written ${written}`);
