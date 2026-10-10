/*
 * Phase 2 strings: leaving a shared car, and showing who logged a charge.
 *
 * Same rules as before: keyed by id, idempotent, blocks parked behind tokens.
 * `MUST_REPLACE` is for copy that is deliberately being changed.
 *
 *   node tools/add-phase2-strings.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";

const STRINGS = {
  en: {
    "set.leave": "Leave",
    "set.cancelRequest": "Cancel request",
    "set.clearRequest": "Clear request",
    "a11y.leaveVeh": "Stop using {v}, or remove your request for it",
    "confirm.leaveCar": "Leave this car?",
    "confirm.cancelRequest": "Withdraw this request?",
    "toast.leaveQ":
      "Stop using {v}? The car leaves your list. {n} charging session(s) you can see go to this device's bin, where you can still read them until you empty it. The owner keeps everything, and the server will not show you these sessions again.",
    "toast.leavePendingQ":
      "Withdraw your request for {v}? The owner will no longer see it waiting.",
    "toast.leftCar": "Left {v}. {n} session(s) are in this device's bin.",
    "toast.requestCancelled": "Request for {v} withdrawn",
    "toast.leaveBlocked": "Could not leave. Nothing was changed.",
    "toast.leaveNeedsSql":
      "The database would not allow it yet. Migration 10-leave-share.sql has to be run first.",
    "toast.leaveOffline": "Could not leave: no connection to the server.",
    "toast.leaveSignedOut": "Sign in to leave a shared car.",
    "log.by": "by {n}",
    "log.byYou": "by you",
    "log.byUnknown": "by a member who has since left",
  },
  fi: {
    "set.leave": "Poistu",
    "set.cancelRequest": "Peruuta pyyntö",
    "set.clearRequest": "Poista pyyntö",
    "a11y.leaveVeh": "Lopeta {v} käyttö tai poista pyyntösi siihen",
    "confirm.leaveCar": "Poistutko tästä autosta?",
    "confirm.cancelRequest": "Peruutetaanko pyyntö?",
    "toast.leaveQ":
      "Lopetetaanko {v} käyttö? Auto poistuu listaltasi. Näkyvissäsi olevaa {n} latausta siirtyy laitteesi roskakoriin, jossa ne ovat luettavissa, kunnes tyhjennät sen. Omistaja säilyttää kaiken, eikä palvelin enää näytä näitä latauksia sinulle.",
    "toast.leavePendingQ":
      "Peruutetaanko pyyntösi ajoneuvoon {v}? Omistaja ei enää näe sitä odottavana.",
    "toast.leftCar": "Poistuit ajoneuvosta {v}. {n} latausta on laitteesi roskakorissa.",
    "toast.requestCancelled": "Pyyntö ajoneuvoon {v} peruutettu",
    "toast.leaveBlocked": "Poistuminen ei onnistunut. Mitään ei muutettu.",
    "toast.leaveNeedsSql":
      "Tietokanta ei vielä sallinut tätä. Ensin on ajettava siirtymä 10-leave-share.sql.",
    "toast.leaveOffline": "Ei onnistunut: yhteys palvelimeen puuttuu.",
    "toast.leaveSignedOut": "Kirjaudu sisään poistaaksesi jaetun ajoneuvon.",
    "log.by": "— {n}",
    "log.byYou": "— sinä",
    "log.byUnknown": "— jäseneltä, joka on poistunut",
  },
  sv: {
    "set.leave": "Lämna",
    "set.cancelRequest": "Avbryt förfrågan",
    "set.clearRequest": "Rensa förfrågan",
    "a11y.leaveVeh": "Sluta använda {v}, eller ta bort din förfrågan om den",
    "confirm.leaveCar": "Lämna den här bilen?",
    "confirm.cancelRequest": "Ta tillbaka förfrågan?",
    "toast.leaveQ":
      "Sluta använda {v}? Bilen försvinner från din lista. De {n} laddningar du kan ser flyttas till den här enhetens papperskorg, där du fortfarande kan läsa dem tills du tömmer den. Ägaren behåller allt, och servern visar dig inte dessa laddningar igen.",
    "toast.leavePendingQ":
      "Ta tillbaka din förfrågan om {v}? Ägaren ser den inte längre som väntande.",
    "toast.leftCar": "Lämnade {v}. {n} laddningar finns i den här enhetens papperskorg.",
    "toast.requestCancelled": "Förfrågan om {v} återkallad",
    "toast.leaveBlocked": "Kunde inte lämna. Inget ändrades.",
    "toast.leaveNeedsSql":
      "Databasen tillåter det inte än. Migrationen 10-leave-share.sql måste köras först.",
    "toast.leaveOffline": "Kunde inte lämna: ingen anslutning till servern.",
    "toast.leaveSignedOut": "Logga in för att lämna en delad bil.",
    "log.by": "av {n}",
    "log.byYou": "av dig",
    "log.byUnknown": "av en medlem som har lämnat",
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
  if (!anchors.length) anchors = [...block.matchAll(/^[ \t]*"(set|toast|log)\.[a-zA-Z]+":/gm)];
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