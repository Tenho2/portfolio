/*
 * Phase 1 strings: duration hint (A), fix-quality wording (B), the plain
 * location-defaults text (F), and the cost tag (H).
 *
 * Same rules as the earlier string scripts: keyed by id, idempotent, and each
 * language block parked behind a token. Splicing edited text back at a
 * pre-edit offset duplicates every language - that happened twice.
 *
 * `mustReplace` lists keys whose existing value is deliberately overwritten.
 * Everything else is only inserted when missing, so a translation correction
 * made afterwards is not silently reverted by re-running this.
 *
 *   node tools/add-phase1-strings.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";

const STRINGS = {
  en: {
    /* A */
    "durHintAvg": "Showing your average of {n} logged charges.",
    "durHintDefault": "Showing 30 minutes until you have logged {n}.",
    /* B */
    "st.foundRough": "{n} station(s) within {r} km. Your location was accurate to about {a} m.",
    "st.foundRoughCached":
      "{n} station(s) within {r} km, from the saved list. Your location was accurate to about {a} m.",
    "st.noneRough": "No mapped stations within {n} km. Your location was accurate to about {a} m, so there may be some nearby.",
    "cam.foundRough":
      "{n} road camera(s) within {r} km, showing the nearest {n2}. Your location was accurate to about {a} m.",
    /* H */
    "tag.est": "At your price",
  },
  fi: {
    "durHintAvg": "Näytetään keskiarvo {n} kirjatusta latauksesta.",
    "durHintDefault": "Näytetään 30 minuuttia, kunnes sinulla on {n} kirjattua latausta.",
    "st.foundRough":
      "{n} laturia {r} km säteellä. Sijaintisi oli tarkkuudelta noin {a} m.",
    "st.foundRoughCached":
      "{n} laturia {r} km säteellä tallennetusta listasta. Sijaintisi oli tarkkuudelta noin {a} m.",
    "st.noneRough":
      "Ei kartoitettuja latureita {n} km säteellä. Sijaintisi oli tarkkuudelta noin {a} m, joten lähellä voi olla.",
    "cam.foundRough":
      "{n} tiekameraa {r} km säteellä, näytetään {n2} lähintä. Sijaintisi oli tarkkuudelta noin {a} m.",
    "tag.est": "Laskettu hinnallasi",
  },
  sv: {
    "durHintAvg": "Visar ditt genomsnitt av {n} loggade laddningar.",
    "durHintDefault": "Visar 30 minuter tills du har loggat {n}.",
    "st.foundRough":
      "{n} station(er) inom {r} km. Din plats var noggrann till ungefär {a} m.",
    "st.foundRoughCached":
      "{n} station(er) inom {r} km, från den sparade listan. Din plats var noggrann till ungefär {a} m.",
    "st.noneRough":
      "Inga kartlagda stationer inom {n} km. Din plats var noggrann till ungefär {a} m, så det kan finnas några i närheten.",
    "cam.foundRough":
      "{n} vägkamera/-or inom {r} km, visar de {n2} närmaste. Din plats var noggrann till ungefär {a} m.",
    "tag.est": "Beräknat med ditt pris",
  },
};

/* Deliberate overwrites: the current wording is what is being fixed. */
const MUST_REPLACE = {
  "set.defGeoHint": {
    en:
      "Fills in the charging location for you when you are at one of your saved places. Your position is used for the match and then discarded.",
    fi: "Täyttää latauspaikan puolestasi, kun olet jollakin tallentamallasi paikalla. Sijaintiasi käytetään vain vertailuun, eikä sitä tallenneta.",
    sv: "Fyller i laddplatsen åt dig när du är på någon av dina sparade platser. Din position används bara för matchningen och sparas inte.",
  },
  /* A: the old hint claimed the field always defaults to your average, which
     is now only true once there are enough logged charges. */
  "as.durHint": {
    en: "Hour, minute and second.",
    fi: "Tunti, minuutti ja sekunti.",
    sv: "Timme, minut och sekund.",
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

/** Write one key into a block, in place or appended after its group. */
function put(block, key, value, group) {
  const esc = key.replace(/\./g, "\\.");
  const oneLine = new RegExp('^[ \\t]*"' + esc + '":[ \\t]*"[^"]*",\\r?\\n', "m");
  const wrapped = new RegExp(
    '^[ \\t]*"' + esc + '":[ \\t]*\\r?\\n[ \\t]*"(?:[^"\\\\]|\\\\.)*",\\r?\\n',
    "m",
  );
  /* Two separate tests. Written as `wrapped.test(b) || oneLine.test(b) ? ...`
     the ternary binds to the whole OR, so a one-line key selected `wrapped`,
     which then failed to match and wrote a duplicate on every run. */
  const isWrapped = wrapped.test(block);
  const re = isWrapped ? wrapped : oneLine.test(block) ? oneLine : null;
  if (re) {
    const indent = /^[ \t]*/.exec(block.match(re)[0])[0];
    return block.replace(re, indent + '"' + key + '": ' + JSON.stringify(value) + ",\r\n");
  }
  let anchors = [...block.matchAll(new RegExp("^[ \\t]*\"" + group + "\\.[a-zA-Z]+\":", "gm"))];
  if (!anchors.length) {
    anchors = [...block.matchAll(/^[ \t]*"(st|cam|odo)\.[a-zA-Z]+":/gm)];
  }
  if (!anchors.length) throw new Error("no anchor for " + group);
  const at = anchors[anchors.length - 1].index;
  const lineEnd = block.indexOf("\n", at) + 1;
  const indent = /^[ \t]*/.exec(block.slice(at, lineEnd))[0];
  return block.slice(0, lineEnd) + indent + '"' + key + '": ' + JSON.stringify(value) + ",\r\n" + block.slice(lineEnd);
}

let inserted = 0;
let updated = 0;
for (const slot of slots) {
  let block = slot.block;
  for (const [key, value] of Object.entries(STRINGS[slot.lang] || {})) {
    const group = key.split(".")[0];
    const before = block;
    block = put(block, key, value, group);
    if (block === before) continue;
    if (new RegExp('^[ \\t]*"' + key.replace(/\./g, "\\.") + '":').test(before)) updated++;
    else inserted++;
  }
  for (const [key, byLang] of Object.entries(MUST_REPLACE)) {
    if (!byLang[slot.lang]) continue;
    const group = key.split(".")[0];
    block = put(block, key, byLang[slot.lang], group);
    updated++;
  }
  slot.block = block;
}
for (const slot of slots) src = src.replace(slot.token, () => slot.block);

writeFileSync(FILE, src, "utf8");
console.log(`inserted ${inserted}, written ${updated}`);