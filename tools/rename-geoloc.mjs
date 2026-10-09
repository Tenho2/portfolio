/*
 * Puts the geolocation icon into markup and renames the button.
 *
 * `as.myloc` carried its emoji inside the translation string ("🧭 My location"),
 * so every language had to carry a pictogram, and the glyph was editable text
 * as far as a screen reader and the DOM were concerned. Every other icon in the
 * app is a `<span class="ic" aria-hidden="true">` in the markup with the label
 * beside it, and this button was the only one that had drifted from that.
 *
 * Usage: node tools/rename-geoloc.mjs   (idempotent)
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";

const NEW = {
  en: "Near me",
  fi: "Lähellä",
  sv: "Near mig",
};

let src = readFileSync(FILE, "utf8");
const starts = [...src.matchAll(/^\s*(en|fi|sv):\s*\{/gm)].map((m) => ({
  lang: m[1],
  at: m.index,
}));
if (starts.length !== 3) throw new Error("expected three language blocks");

let changed = 0;
/* Back to front, so the offsets of the blocks still to do cannot move. */
for (let i = starts.length - 1; i >= 0; i--) {
  const { lang, at } = starts[i];
  const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
  const origLen = end - at;
  let block = src.slice(at, end);
  /* Both shapes: Prettier reflowed the long Finnish one. */
  const wrapped = /^([ \t]*)"as\.myloc":[ \t]*\r?\n[ \t]*"[^"]*",\r?\n/m;
  const oneLine = /^([ \t]*)"as\.myloc":[ \t]*"[^"]*",\r?\n/m;
  const re = wrapped.test(block) ? wrapped : oneLine;
  const m = block.match(re);
  if (!m) throw new Error("as.myloc not found in " + lang);
  block = block.replace(re, `${m[1]}"as.myloc": ${JSON.stringify(NEW[lang])},\r\n`);
  changed++;
  src = src.slice(0, at) + block + src.slice(at + origLen);
}

writeFileSync(FILE, src, "utf8");
console.log("as.myloc renamed in " + changed + " languages");