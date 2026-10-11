/*
 * Strings for the consumption work: usable battery capacity, and the tile
 * provenance lines.
 *
 *   node tools/add-consumption-strings.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";

const STRINGS = {
  en: {
    /* capacity editor */
    "set.capacity": "Battery capacity",
    "set.capTimes": "× 95% =",
    "set.capUsable": "Usable capacity used for the maths",
    "set.capGrossMode": "Gross — the number on the spec sheet",
    "set.capNetMode": "Usable — the number I know",
    "set.capHintGross":
      "Estimated usable capacity: about {n} kWh. Edit it if you know the real figure.",
    "set.capHintNet": "Using {n} kWh as the usable capacity.",
    "set.capHintNone":
      "No capacity set, so consumption is measured from charged energy instead.",
    "ph.capGross": "e.g. 77.4",
    "ph.capUsable": "e.g. 73.53",
    "grp.capacity": "Battery capacity",
    /* tile provenance */
    "tile.fromBattery": "from battery level, {n} legs",
    "tile.fromCharging": "from charging, {n} charges ({v} kWh/100km)",
    "tile.disagree": "the two do not agree",
    "tile.noLegs": "{n} kWh not yet measured",
    "tile.costLegs": "over {n} charges",
  },
  fi: {
    "set.capacity": "Akun kapasiteetti",
    "set.capTimes": "× 95 % =",
    "set.capUsable": "Laskennassa käytettävä käyttökapasiteetti",
    "set.capGrossMode": "Brutto — tyypinumerot",
    "set.capNetMode": "Käyttö — tarkka lukema",
    "set.capHintGross":
      "Arvioitu käyttökapasiteetti: noin {n} kWh. Muokkaa, jos tiedät oikean lukeman.",
    "set.capHintNet": "Käytetään {n} kWh käyttökapasiteettina.",
    "set.capHintNone":
      "Kapasiteettia ei ole asetettu, joten kulutus lasketaan ladatusta energiasta.",
    "ph.capGross": "esim. 77,4",
    "ph.capUsable": "esim. 73,53",
    "grp.capacity": "Akun kapasiteetti",
    "tile.fromBattery": "akon tason mukaan, {n} osuutta",
    "tile.fromCharging": "latauksen mukaan, {n} latausta ({v} kWh/100km)",
    "tile.disagree": "menetelmät eivät täsmää",
    "tile.noLegs": "{n} kWh ei mitattu vielä",
    "tile.costLegs": "{n} latauksen yli",
  },
  sv: {
    "set.capacity": "Batterikapacitet",
    "set.capTimes": "× 95 % =",
    "set.capUsable": "Användbar kapacitet som används i beräkningen",
    "set.capGrossMode": "Brutto — siffran på databladet",
    "set.capNetMode": "Användbar — den siffra jag känner till",
    "set.capHintGross":
      "Uppskattad användbar kapacitet: cirka {n} kWh. Ändra den om du vet det exakta värdet.",
    "set.capHintNet": "Använder {n} kWh som användbar kapacitet.",
    "ph.capGross": "t.ex. 77,4",
    "ph.capUsable": "t.ex. 73,53",
    "grp.capacity": "Batterikapacitet",
    "tile.fromBattery": "från batterinivå, {n} sträckor",
    "tile.fromCharging": "från laddning, {n} laddningar ({v} kWh/100km)",
    "tile.disagree": "metoderna stämmer inte överens",
    "tile.noLegs": "{n} kWh ännu inte mätta",
    "tile.costLegs": "över {n} laddningar",
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
  let anchors = [...block.matchAll(new RegExp('^[ \\t]*"' + group + "\\.[a-zA-Z0-9]+:", "gm"))];
  if (!anchors.length) anchors = [...block.matchAll(/^[ \t]*"(set|tile|ph|grp)\.[a-zA-Z0-9]+":/gm)];
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
  slot.block = block;
}
for (const slot of slots) src = src.replace(slot.token, () => slot.block);

writeFileSync(FILE, src, "utf8");
console.log(`inserted ${inserted}, written ${written}`);