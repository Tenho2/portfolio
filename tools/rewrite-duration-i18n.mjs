/*
 * Rewrites the duration-seconds strings now that the checkbox is gone.
 *
 * The "add seconds" tickbox chose between two hints, so both collapse into one.
 * `ed.durHintSec` goes too, since the edit sheet no longer has a granularity
 * switch to describe.
 *
 * Why a script and not fifteen hand edits: the three language blocks are
 * separate regions of one 2,000-line file, the keys are near-identical in all
 * three, and a whole-file replace would hit all three at once - which is how the
 * previous attempt here left two languages stale while the English block looked
 * finished. Each block is rewritten in isolation and every replacement asserts
 * that it matched, so a silent no-op is impossible.
 *
 * Values span one line or two, because Prettier reflowed the long ones:
 *     "key": "value",
 *   or
 *     "key":
 *       "value",
 * Both forms are handled; matching only the single-line form left a dangling
 * `"key":` behind and broke the file.
 *
 * Usage: node tools/rewrite-duration-i18n.mjs   (idempotent)
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/i18n.js";

const HINT = {
  en: {
    as: "Hour, minute and second. Defaults to your average session length.",
    ed: "Hour, minute and second.",
  },
  fi: {
    as: "Tunti, minuutti ja sekunti. Oletuksena keskimääräinen latausaika.",
    ed: "Tunti, minuutti ja sekunti.",
  },
  sv: {
    as: "Timme, minut och sekund. Förvalet är din genomsnittliga sessionstid.",
    ed: "Timme, minut och sekund.",
  },
};

const DROP = ["as.durSec", "as.durHintSec", "ed.durHintSec"];
const SET = ["as.durHint", "ed.durHint"];

let src = readFileSync(FILE, "utf8");

/**
 * A regex matching a key's whole entry, in either shape.
 *
 * The wrapped form is tried first. Prettier put the newline between the key and
 * its value, so the single-line pattern - which expects a quote straight after
 * the colon - sees a carriage return there and matches nothing at all.
 */
function entryRe(key) {
  const k = key.replace(/\./g, "\\.");
  return {
    wrapped: new RegExp('^[ \\t]*"' + k + '":[ \\t]*\\r?\\n[ \\t]*"[^"]*",\\r?\\n', "m"),
    oneLine: new RegExp('^[ \\t]*"' + k + '":[ \\t]*"[^"]*",\\r?\\n', "m"),
  };
}

function drop(block, key) {
  const { wrapped, oneLine } = entryRe(key);
  if (wrapped.test(block)) return block.replace(wrapped, "");
  if (oneLine.test(block)) return block.replace(oneLine, "");
  throw new Error("cannot drop " + key);
}

function replaceValue(block, key, value) {
  const { wrapped, oneLine } = entryRe(key);
  const re = wrapped.test(block) ? wrapped : oneLine;
  const m = block.match(re);
  if (!m) throw new Error("cannot set " + key);
  const indent = /^([ \t]*)/.exec(m[0])[1];
  return block.replace(re, indent + '"' + key + '": ' + JSON.stringify(value) + ",\r\n");
}

const starts = [...src.matchAll(/^\s*(en|fi|sv):\s*\{/gm)].map((m) => ({
  lang: m[1],
  at: m.index,
}));
if (starts.length !== 3) throw new Error("expected three language blocks");

/* Back to front, for two reasons that each broke the file on the first attempt.

   1. Rewriting a block shortens it, so every offset recorded before that point
      goes stale. Editing last-to-first means the offsets of the blocks still to
      be done are untouched.

   2. The splice must be measured against the ORIGINAL slice length. Splicing
      with `at + block.length` re-reads from inside the region just replaced, so
      the tail of every block was written back a second time - which is how a
      fragment of a string ended up straddling the closing brace. */
for (let i = starts.length - 1; i >= 0; i--) {
  const { lang, at } = starts[i];
  const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
  const origLen = end - at;
  let block = src.slice(at, end);
  for (const key of DROP) block = drop(block, key);
  for (const key of SET) {
    const short = key.startsWith("as.") ? "as" : "ed";
    block = replaceValue(block, key, HINT[lang][short]);
  }
  src = src.slice(0, at) + block + src.slice(at + origLen);
}

/* An earlier script run left a doubled carriage return on three lines. Valid
   JavaScript, so nothing failed, but the committed bytes were not the intended
   ones and a second pass through it would have doubled them again. */
src = src.replace(/\r\r\n/g, "\r\n").replace(/\r\r/g, "");

writeFileSync(FILE, src, "utf8");
console.log("duration strings rewritten in all three languages");