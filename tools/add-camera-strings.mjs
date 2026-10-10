/*
 * Add the camera strings in all three languages.
 *
 * The same rules as the station strings: keyed by id, idempotent, and blocks
 * parked behind tokens because splicing edited text back at a pre-edit offset
 * is what duplicated every language the first time.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";

const STRINGS = {
  en: {
    "cam.find": "Cameras nearby",
    "cam.loading": "Looking for cameras…",
    "cam.found": "{n} road camera(s) within {r} km. Showing the nearest {n2}.",
    "cam.none": "No road cameras within {r} km.",
    "cam.failed": "The camera service did not answer ({e}).",
    "cam.open": "Open the full picture from {v}",
    "cam.alt": "Road condition camera {v}",
    "cam.ageMinutes": "{n} min ago",
    "cam.ageHours": "{n} h ago",
    "cam.ageDays": "{n} days ago",
    "cam.ageUnknown": "time unknown",
    "cam.nearStation": "Cameras near this charger",
    "cam.note":
      "Road-condition cameras, not speed cameras. Nothing is uploaded and no image is stored.",
  },
  fi: {
    "cam.find": "Lähellä olevat kamerat",
    "cam.loading": "Etsitään kameroita…",
    "cam.found": "{n} tiekameraa {r} km säteellä. Näytetään {n2} lähintä.",
    "cam.none": "Ei tiekameraita {n} km säteellä.",
    "cam.failed": "Kamerapalvelu ei vastannut ({e}).",
    "cam.open": "Avaa koko kuva: {v}",
    "cam.alt": "Tiekamera {v}",
    "cam.ageMinutes": "{n} min sitten",
    "cam.ageHours": "{n} t sitten",
    "cam.ageDays": "{n} päivää sitten",
    "cam.ageUnknown": "aika tuntematon",
    "cam.nearStation": "Kamerat tämän laturin lähellä",
    "cam.note":
      "Tiekamerat, ei nopeuskamerat. Mitään ei lähetetä eikä kuvaa tallenneta.",
  },
  sv: {
    "cam.find": "Kameror i närheten",
    "cam.loading": "Söker kameror…",
    "cam.found": "{n} vägkamera/-or inom {r} km. Visar de {n2} närmaste.",
    "cam.none": "Inga vägkameror inom {n} km.",
    "cam.failed": "Kameratjänsten svarade inte ({e}).",
    "cam.open": "Öppna hela bilden från {v}",
    "cam.alt": "Vägförhållandekamera {v}",
    "cam.ageMinutes": "{n} min sedan",
    "cam.ageHours": "{n} tim sedan",
    "cam.ageDays": "{n} dagar sedan",
    "cam.ageUnknown": "tiden okänd",
    "cam.nearStation": "Kameror nära den här laddaren",
    "cam.note":
      "Vägkameror, inte hastighetskameror. Ingenting skickas och ingen bild sparas.",
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

let added = 0;
let replaced = 0;
for (const slot of slots) {
  let block = slot.block;
  for (const [key, value] of Object.entries(STRINGS[slot.lang] || {})) {
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
      block = block.replace(re, indent + '"' + key + '": ' + JSON.stringify(value) + ",\r\n");
      replaced++;
      continue;
    }
    /* Anchored on the camera group, which is where a correction belongs; falls
       back to the station group on the first run. */
    let anchors = [...block.matchAll(/^[ \t]*"cam\.[a-zA-Z]+":/gm)];
    if (!anchors.length) anchors = [...block.matchAll(/^[ \t]*"st\.[a-zA-Z]+":/gm)];
    if (!anchors.length) throw new Error("no anchor in " + slot.lang);
    const at = anchors[anchors.length - 1].index;
    const lineEnd = block.indexOf("\n", at) + 1;
    const indent = /^[ \t]*/.exec(block.slice(at, lineEnd))[0];
    block = block.slice(0, lineEnd) + indent + '"' + key + '": ' + JSON.stringify(value) + ",\r\n" + block.slice(lineEnd);
    added++;
  }
  slot.block = block;
}
for (const slot of slots) src = src.replace(slot.token, () => slot.block);
writeFileSync(FILE, src, "utf8");
console.log(`added ${added}, replaced ${replaced}`);