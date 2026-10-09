/*
 * Adds the station-search strings to all three languages.
 *
 * Each language block is located by its own header and rewritten in isolation,
 * back to front, so one language cannot be edited by another's offsets. Values
 * are handled in both the single-line and the wrapped form because Prettier
 * reflowed the long ones, and a single-line-only regex leaves a dangling
 * `"key":` behind - which is what broke the file twice while writing this.
 *
 * Usage: node tools/add-station-i18n.mjs   (idempotent)
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";

const STRINGS = {
  en: {
    "st.title": "Find a charging station",
    "st.lead":
      "Searches real charging stations around you from OpenStreetMap. Nothing is stored and nothing is sent anywhere but the map service.",
    "st.find": "Find station",
    "st.findNear": "Stations near me",
    "st.searching": "Finding your position…",
    "st.found": "{n} station(s) within {r} km.",
    "st.none": "No stations to show yet.",
    "st.noneNear": "No charging stations are mapped within {n} km of you.",
    "st.lookupFailed": "The station service did not answer ({e}). Try again in a moment, or type the name and drag the pin.",
    "st.geoFail": "Could not read your position ({n}).",
    "st.use": "Use",
    "st.chosen": "{v} — pin and name filled in.",
    "st.unnamed": "Charging station",
    "st.plugs": "{n} plug(s)",
    "st.paid": "paid",
    "st.free": "free",
    "st.source":
      "Station data © OpenStreetMap contributors, via Overpass. Coverage varies: some areas are mapped in detail, others not at all.",
  },
  fi: {
    "st.title": "Etsi latauslaite",
    "st.lead":
      "Etsii todellisia latauslaitteita lähelläsi OpenStreetMapista. Mitään ei tallenneta eikä lähetetä mihään muuhun kuin karttapalveluun.",
    "st.find": "Etsi laite",
    "st.findNear": "Lähellä olevat",
    "st.searching": "Etsitään sijaintiasi…",
    "st.found": "{n} latauslaitetta {r} km säteellä.",
    "st.none": "Ei vielä näytettäviä laitteita.",
    "st.noneNear": "Lähelläsi ei ole kartoitettuja latauslaitteita {n} km säteellä.",
    "st.lookupFailed": "Latauslaitepalvelu ei vastannut ({e}). Yritä hetken kuluttua uudelleen tai kirjoita nimi ja siirrä nappi.",
    "st.geoFail": "Sijaintia ei saatu ({n}).",
    "st.use": "Käytä",
    "st.chosen": "{v} — nappi ja nimi täytetty.",
    "st.unnamed": "Latauslaite",
    "st.plugs": "{n} pistoketta",
    "st.paid": "maksullinen",
    "st.free": "ilmainen",
    "st.source":
      "Laitetiedot © OpenStreetMapin yhteisö, välityksellä Overpass. Kattavuus vaihtelee: jotkut alueet on kartoitettu tarkasti, toiset eivät lainkaan.",
  },
  sv: {
    "st.title": "Hitta laddstation",
    "st.lead":
      "Söker riktiga laddstationer runt dig från OpenStreetMap. Inget sparas och ingenting skickas till någon annan än karttjänsten.",
    "st.find": "Hitta station",
    "st.findNear": "Stationer nära mig",
    "st.searching": "Söker din position…",
    "st.found": "{n} station(er) inom {r} km.",
    "st.none": "Inga stationer att visa än.",
    "st.noneNear": "Inga laddstationer är kartlagda inom {n} km från dig.",
    "st.lookupFailed": "Stationstjänsten svarade inte ({e}). Försök igen om en stund, eller skriv namnet och dra nålen.",
    "st.geoFail": "Kunde inte läsa din position ({n}).",
    "st.use": "Använd",
    "st.chosen": "{v} — nål och namn ifyllda.",
    "st.unnamed": "Laddstation",
    "st.plugs": "{n} stickpropp(ar)",
    "st.paid": "avgift",
    "st.free": "gratis",
    "st.source":
      "Stationsdata © OpenStreetMap-bidragsgivare, via Overpass. Täckningen varierar: vissa områden är kartlagda i detalj, andra inte alls.",
  },
};

let src = readFileSync(FILE, "utf8");

function entryRe(key) {
  const k = key.replace(/\./g, "\\.");
  return {
    wrapped: new RegExp('^[ \\t]*"' + k + '":[ \\t]*\\r?\\n[ \\t]*"[^"]*",\\r?\\n', "m"),
    oneLine: new RegExp('^[ \\t]*"' + k + '":[ \\t]*"[^"]*",\\r?\\n', "m"),
  };
}

/** Insert or update one key inside a block. */
function put(block, key, value) {
  const { wrapped, oneLine } = entryRe(key);
  const re = wrapped.test(block) ? wrapped : oneLine.test(block) ? oneLine : null;
  if (re) {
    const indent = /^([ \t]*)/.exec(block.match(re)[0])[1];
    return block.replace(re, indent + '"' + key + '": ' + JSON.stringify(value) + ",\r\n");
  }
  /* New key: placed after the last entry in the block, so the file keeps its
     shape rather than growing a stray section. */
  const lines = block.split("\n");
  let last = -1;
  lines.forEach((l, i) => {
    if (/^[ \t]*"[^"]+":/.test(l)) last = i;
  });
  if (last < 0) throw new Error("no anchor line in block for " + key);
  const indent = /^([ \t]*)/.exec(lines[last])[1];
  lines.splice(last + 1, 0, indent + '"' + key + '": ' + JSON.stringify(value) + ",");
  return lines.join("\n");
}

const starts = [...src.matchAll(/^\s*(en|fi|sv):\s*\{/gm)].map((m) => ({
  lang: m[1],
  at: m.index,
}));
if (starts.length !== 3) throw new Error("expected three language blocks");

let added = 0;
/* Back to front: rewriting a block lengthens it, so the offsets of the blocks
   not yet done must not move underneath us. */
for (let i = starts.length - 1; i >= 0; i--) {
  const { lang, at } = starts[i];
  const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
  const origLen = end - at;
  let block = src.slice(at, end);
  for (const [key, value] of Object.entries(STRINGS[lang])) {
    const before = block;
    block = put(block, key, value);
    if (block !== before) added++;
  }
  src = src.slice(0, at) + block + src.slice(at + origLen);
}

writeFileSync(FILE, src, "utf8");
console.log("station strings written for all three languages (" + added + " entries)");