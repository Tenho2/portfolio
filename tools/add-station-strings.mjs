/*
 * Add the station strings the new screen needs, in all three languages.
 *
 * Keyed by string id and required to be idempotent: every value already present
 * is left alone, so this can be re-run after a translation correction without
 * silently reverting it. Every key must exist in all three blocks or the
 * i18n completeness test fails - which is the point of requiring that here
 * rather than discovering it at the end.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";

const STRINGS = {
  en: {
    "st.lead":
      "Finds real charging stations near you. In Finland the list comes from Digitraffic's national registry; elsewhere from OpenStreetMap. Nothing is stored and nothing is sent anywhere but those map services.",
    "st.source":
      "Station details in Finland © Digitraffic / Fintraffic. Elsewhere © OpenStreetMap contributors, via Overpass. Coverage varies: city networks are thorough, rural ones patchy.",
    "st.found": "{n} station(s) within {r} km.",
    "st.foundCached": "{n} station(s) within {r} km, from the saved list.",
    "st.noneNear": "No mapped stations within {n} km.",
    "st.offline": "You are offline. Station search needs a connection.",
    "st.geoUnavailable": "This browser cannot share your position.",
    "st.away": "{d} m away",
    "st.poles": "{n} poles",
    "st.polesTitle": "Poles",
    "st.poleUnknown": "Connector type not stated",
    "st.moreCount": "Show {n} more",
    "st.cacheStale": "Using the saved list of {n} stations. Refreshing…",
    "st.noLive": "Live status is only published for Finland.",
    "st.liveLoading": "Checking live status…",
    "st.liveNone": "No live status is reported for this station.",
    "st.liveFail": "Could not reach the live status service.",
    "st.live": "{a} of {n} available. {rest}",
    "st.liveRest": "Status: {c}",
    "st.status_available": "{n} free",
    "st.status_charging": "{n} in use",
    "st.status_outoforder": "{n} out of order",
    "st.status_blocked": "{n} blocked",
    "st.status_reserved": "{n} reserved",
    "st.status_inoperative": "{n} not working",
    "st.status_planned": "{n} not yet in service",
    "st.status_unknown": "{n} unknown",
  },
  fi: {
    "st.lead":
      "Etsii todellisia latureita lähelläsi. Suomessa lähte on Digitrafficin valtakunnallinen rekisteri, muualla OpenStreetMap. Mitään ei tallenneta eikä lähetetä mihään muuhun kuin näihin karttapalveluihin.",
    "st.source":
      "Laturitiedot Suomessa © Digitraffic / Fintraffic. Muualla © OpenStreetMapin yhteisö, välityksellä Overpass. Kattavuus vaihtelee: kaupunkiverkot ovat kattavia, maaseudulla harvat.",
    "st.found": "{n} laturia {r} km säteellä.",
    "st.foundCached": "{n} laturia {r} km säteellä, tallennetusta listasta.",
    "st.noneNear": "Ei kartoitettuja latureita {n} km säteellä.",
    "st.offline": "Et ole verkossa. Laturihaku vaatii yhteyden.",
    "st.geoUnavailable": "Tämä selain ei voi jaka sijaintiasi.",
    "st.away": "{d} m päässä",
    "st.poles": "{n} laturia",
    "st.polesTitle": "Laturit",
    "st.poleUnknown": "Pistoketyyppiä ei ole ilmoitettu",
    "st.moreCount": "Näytä {n} muuta",
    "st.cacheStale": "Käytetään tallennettua {n} laturin listaa. Päivitetään…",
    "st.noLive": "Reaaliaikaista tilaa julkaistaan vain Suomessa.",
    "st.liveLoading": "Tarkistetaan reaaliaikaista tilaa…",
    "st.liveNone": "Tälle asemalle ei ilmoiteta reaaliaikaista tilaa.",
    "st.liveFail": "Reaaliaikaiseen tilapalveluun ei saatu yhteyttä.",
    "st.live": "{a} vapaana {n}:sta. {rest}",
    "st.liveRest": "Tila: {c}",
    "st.status_available": "{n} vapaana",
    "st.status_charging": "{n} käytössä",
    "st.status_outoforder": "{n} pois käytöstä",
    "st.status_blocked": "{n} estetty",
    "st.status_reserved": "{n} varattu",
    "st.status_inoperative": "{n} ei toimi",
    "st.status_planned": "{n} ei vielä käytössä",
    "st.status_unknown": "{n} tuntematon",
  },
  sv: {
    "st.lead":
      "Söker riktiga laddstationer runt dig. I Finland kommer listan från Digitraffics nationella register, annanstans från OpenStreetMap. Inget sparas och ingenting skickas till någon annan än de här karttjänsterna.",
    "st.source":
      "Laddstationsuppgifter i Finland © Digitraffic / Fintraffic. Annanstans © OpenStreetMap-gemenskapen, via Overpass. Täckningen varierar: stadsnät är täta, landsbygden tunnare.",
    "st.found": "{n} station(er) inom {r} km.",
    "st.foundCached": "{n} station(er) inom {r} km, från den sparade listan.",
    "st.noneNear": "Inga kartlagda stationer inom {n} km.",
    "st.offline": "Du är offline. Sökningen behöver en anslutning.",
    "st.geoUnavailable": "Den här webbläsaren kan inte dela din plats.",
    "st.away": "{d} m bort",
    "st.poles": "{n} laddare",
    "st.polesTitle": "Laddare",
    "st.poleUnknown": "Kontakttyp anges inte",
    "st.moreCount": "Visa {n} till",
    "st.cacheStale": "Använder den sparade listan med {n} stationer. Uppdaterar…",
    "st.noLive": "Live-status publiceras bara för Finland.",
    "st.liveLoading": "Kontrollerar live-status…",
    "st.liveNone": "Ingen live-status rapporteras för den här stationen.",
    "st.liveFail": "Kunde inte nå live-status tjänsten.",
    "st.live": "{a} av {n} lediga. {rest}",
    "st.liveRest": "Status: {c}",
    "st.status_available": "{n} lediga",
    "st.status_charging": "{n} i bruk",
    "st.status_outoforder": "{n} ur funktion",
    "st.status_blocked": "{n} blockerade",
    "st.status_reserved": "{n} reserverade",
    "st.status_inoperative": "{n} ur funktion",
    "st.status_planned": "{n} inte i drift än",
    "st.status_unknown": "{n} okända",
  },
};

let src = readFileSync(FILE, "utf8");
const marks = [...src.matchAll(/^\s*(en|fi|sv):\s*\{/gm)].map((m) => ({
  lang: m[1],
  at: m.index,
}));

let added = 0;
let replaced = 0;

/* Each block is parked behind a token and put back at the very end.
   Splicing edited text back at `start + originalLength` is wrong as soon as the
   edit changes the block's length - which inserting a key always does - and the
   result is a file where every language is written twice. Tokens cannot drift. */
const slots = [];
/* Walk the blocks from the LAST one backwards. `marks` holds offsets into the
   original text, so replacing a block invalidates every offset after it;
   editing in reverse means only offsets already passed are ever used. Doing it
   forwards silently re-reads a shifted slice and finds the wrong block. */
for (let i = marks.length - 1; i >= 0; i--) {
  const token = ` SLOT${i} `;
  const end = i + 1 < marks.length ? marks[i + 1].at : src.length;
  slots.unshift({
    token,
    lang: marks[i].lang,
    block: src.slice(marks[i].at, end),
  });
  src = src.slice(0, marks[i].at) + token + src.slice(end);
}

for (const slot of slots) {
  let block = slot.block;
  const lang = slot.lang;
  const strings = STRINGS[lang];
  if (!strings) continue;

  for (const [key, value] of Object.entries(strings)) {
    const esc = key.replace(/\./g, "\\.");
    /* Both the one-line and the wrapped form, because Prettier reflows the long
       ones and a script that only knows one shape silently skips half. */
    const oneLine = new RegExp('^[ \\t]*"' + esc + '":[ \\t]*"[^"]*",\\r?\\n', "m");
    const wrapped = new RegExp(
      '^[ \\t]*"' + esc + '":[ \\t]*\\r?\\n[ \\t]*"(?:[^"\\\\]|\\\\.)*",\\r?\\n',
      "m",
    );
    /* The regex that is actually present is used for the replacement. Written
       as `wrapped.test(b) || oneLine.test(b) ? wrapped : oneLine`, precedence
       makes this `(wrapped.test(b) || oneLine.test(b)) ? wrapped : oneLine`, so
       a key that is present on ONE line still selected `wrapped`, which then
       failed to match and rewrote a second, duplicate copy on every run. */
    const isWrapped = wrapped.test(block);
    const isOneLine = !isWrapped && oneLine.test(block);
    const re = isWrapped ? wrapped : isOneLine ? oneLine : null;
    if (re) {
      const indent = /^[ \t]*/.exec(block.match(re)[0])[0];
      block = block.replace(
        re,
        indent + '"' + key + '": ' + JSON.stringify(value) + ",\r\n",
      );
      replaced++;
      continue;
    }
    /* New: appended after the last st.* key in the block, so the group stays
       together rather than scattering new keys to the end of the file. */
    const anchors = [...block.matchAll(/^[ \t]*"st\.[a-zA-Z]+":/gm)];
    if (!anchors.length) throw new Error("no st.* anchor in " + lang);
    const at = anchors[anchors.length - 1].index;
    const lineEnd = block.indexOf("\n", at) + 1;
    const indent = /^[ \t]*/.exec(block.slice(at, lineEnd))[0];
    block =
      block.slice(0, lineEnd) +
      indent +
      '"' +
      key +
      '": ' +
      JSON.stringify(value) +
      ",\r\n" +
      block.slice(lineEnd);
    added++;
  }

  slot.block = block;
}

for (const slot of slots) {
  src = src.replace(slot.token, () => slot.block);
}

writeFileSync(FILE, src, "utf8");
console.log(`added ${added}, replaced ${replaced}`);