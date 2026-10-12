/*
 * Strings for payer splits.
 *
 *   node tools/add-payer-strings.mjs
 *
 * Idempotent: a second run reports nothing inserted.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";

const STRINGS = {
  en: {
    "grp.payers": "Who paid",
    "as.paidBy": "Split this charge between",
    "as.addPayer": "Add someone",
    "as.payerName": "Name",
    "as.payerAmount": "Amount paid",
    "as.payerRemove": "Remove {v} from this split",
    "as.payerNone": "Nobody recorded yet.",
    "as.payerTotal": "Together: {v}",
    "as.payerBadTotal": "Together {v} — adjust the amounts to split this charge.",
    "pay.unattributed": "{n} charges with nobody recorded",
    "pay.chartLabel": "Who paid for {v}",
  },
  fi: {
    "grp.payers": "Kuka maksoi",
    "as.paidBy": "Jaa tämä lataus henkilöille",
    "as.addPayer": "Lisää henkilö",
    "as.payerName": "Nimi",
    "as.payerAmount": "Maksettu summa",
    "as.payerRemove": "Poista {v} tästä jaosta",
    "as.payerNone": "Kukaan ei ole vielä kirjattu.",
    "as.payerTotal": "Yhteensä: {v}",
    "as.payerBadTotal": "Yhteensä {v} — muokkaa summia jakaaksesi latauksen.",
    "pay.unattributed": "{n} latausta, joista kukaan ei ole kirjattu",
    "pay.chartLabel": "Kuka maksoi autolle {v}",
  },
  sv: {
    "grp.payers": "Vem betalade",
    "as.paidBy": "Dela den här laddningen mellan",
    "as.addPayer": "Lägg till person",
    "as.payerName": "Namn",
    "as.payerAmount": "Betalt belopp",
    "as.payerRemove": "Ta bort {v} från den här delningen",
    "as.payerNone": "Ingen registrerad än.",
    "as.payerTotal": "Tillsammans: {v}",
    "as.payerBadTotal": "Tillsammans {v} — justera beloppen för att dela laddningen.",
    "pay.unattributed": "{n} laddningar utan registrerad person",
    "pay.chartLabel": "Vem betalade för {v}",
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
  let anchors = [...block.matchAll(/^[ \t]*"(as|pay|grp)\.[a-zA-Z0-9]+":/gm)];
  if (!anchors.length) anchors = [...block.matchAll(/^[ \t]*"[a-z]+\.[a-zA-Z0-9]+":/gm)];
  if (!anchors.length) throw new Error("no anchor for " + key);
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
