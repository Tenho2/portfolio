/*
 * Finnish: a charging pole is "laturi", not "laite".
 *
 * Scope
 *   Exactly nine `st.*` strings, and nothing else. A blanket replace of
 *   "laite" would have been wrong: "tämä laite" (this device) is correct in
 *   every sync message and in `set.resetDevice`, and "laitteella" is the right
 *   form for "on this device". Only the CHARGING sense changes, so the script is
 *   keyed by string id and refuses to run if a key is missing.
 *
 * Each language block is located by its own header and rewritten in isolation,
 * back to front, so one language cannot be edited by another's offsets. Values
 * span one line or two because Prettier reflowed the long ones.
 *
 * Usage: node tools/fix-fi-charger-word.mjs   (idempotent)
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";

/** key -> new Finnish value. Only the charging sense. */
const FI = {
  "st.title": "Etsi laturi",
  "st.lead":
    "Etsii todellisia latureita lähelläsi. Mitään ei tallenneta eikä lähetetä mihään muuhun kuin karttapalveluun.",
  "st.find": "Etsi laturi",
  "st.found": "{n} laturia {r} km säteellä.",
  "st.none": "Ei vielä näytettäviä latureita.",
  "st.noneNear":
    "Lähelläsi ei ole kartoitettuja latureita {n} km säteellä.",
  "st.lookupFailed":
    "Laturipalvelu ei vastannut ({e}). Yritä hetken kuluttua uudelleen tai kirjoita nimi ja siirrä nappi.",
  "st.unnamed": "Laturi",
  "st.source":
    "Laturitiedot © OpenStreetMapin yhteisö, välityksellä Overpass. Kattavuus vaihtelee: jotkut alueet on kartoitettu tarkasti, toiset eivät lainkaan.",
};

/* Words that must survive untouched. Asserted, not assumed: these are the
   correct Finnish for "this device", and a careless replace would break them. */
const MUST_SURVIVE = [
  "sync.offline",
  "sync.syncFailed",
  "sync.lead",
  "set.accountOut",
  "set.accountMeta",
  "set.resetDevice",
  "set.resetDeviceHint",
  "set.resetQ1",
  "set.defGeo",
];

let src = readFileSync(FILE, "utf8");

function entryRe(key) {
  const k = key.replace(/\./g, "\\.");
  return {
    wrapped: new RegExp('^[ \\t]*"' + k + '":[ \\t]*\\r?\\n[ \\t]*"[^"]*",\\r?\\n', "m"),
    oneLine: new RegExp('^[ \\t]*"' + k + '":[ \\t]*"[^"]*",\\r?\\n', "m"),
  };
}

/** The Finnish block only. */
function fiBlock(text) {
  const marks = [...text.matchAll(/^\s*(en|fi|sv):\s*\{/gm)].map((m) => ({
    lang: m[1],
    at: m.index,
  }));
  const fi = marks.find((m) => m.lang === "fi");
  if (!fi) throw new Error("no fi block");
  const idx = marks.indexOf(fi);
  const end = idx + 1 < marks.length ? marks[idx + 1].at : text.length;
  return { start: fi.at, end, length: end - fi.at };
}

/** The current value of a key inside the fi block, or null. */
function fiValue(text, key) {
  const { start, end } = fiBlock(text);
  const blk = text.slice(start, end);
  const m = new RegExp('"' + key.replace(/\./g, "\\.") + '":[ \\t]*(?:"([^"]*)"|\\r?\\n[ \\t]*"([^"]*)")').exec(blk);
  return m ? (m[1] !== undefined ? m[1] : m[2]) : null;
}

const before = fiBlock(src);
let block = src.slice(before.start, before.end);
let changed = 0;

for (const [key, value] of Object.entries(FI)) {
  const { wrapped, oneLine } = entryRe(key);
  const re = wrapped.test(block) ? wrapped : oneLine;
  const m = block.match(re);
  if (!m) throw new Error("fi key not found: " + key);
  const indent = /^([ \t]*)/.exec(m[0])[1];
  const line = indent + '"' + key + '": ' + JSON.stringify(value) + ",\r\n";
  block = block.replace(re, line);
  changed++;
}

/* One language block, spliced back at its ORIGINAL length measured after the
   edit. Re-reading at the new length would duplicate the block's tail - which
   is how a fragment of a string ended up straddling a closing brace the last
   time this was done by script. */
src = src.slice(0, before.start) + block + src.slice(before.start + before.length);

let broke = 0;
for (const key of MUST_SURVIVE) {
  const now = fiValue(src, key);
  if (now === null || !/lait/i.test(now)) {
    console.log(`  BROKEN: ${key} = ${JSON.stringify(now)}`);
    broke++;
  }
}
if (broke) throw new Error(broke + " device-wording string(s) lost");

writeFileSync(FILE, src, "utf8");
console.log(`rewrote ${changed} Finnish charger strings; ${MUST_SURVIVE.length} device strings intact`);