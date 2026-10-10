import { readFileSync, writeFileSync } from "node:fs";

/*
 * Report exactly which lines carry a bare LF, so the fix can be reviewed.
 * A bare LF inside an otherwise CRLF file is invisible in an editor and in a
 * diff summary, and it is what `test-ui` checks for. Guessing the line number
 * from an error message alone is how the wrong line gets "fixed".
 */
const FILE = process.argv[2] || "app/app.js";
const buf = readFileSync(FILE);
/* The list is useful when fixing one file and unreadable when this runs over
   four of them, so it only prints when asked. */
const VERBOSE = !!process.env.VERBOSE;

const bare = [];
let line = 1;
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x0a) {
    if (i === 0 || buf[i - 1] !== 0x0d) bare.push({ line, at: i });
    line++;
  }
}

console.log(`${FILE}: ${bare.length} bare LF line(s)`);
if (VERBOSE) {
  for (const b of bare) {
    const start = buf.lastIndexOf(0x0a, b.at - 1) + 1;
    const end = buf.indexOf(0x0a, b.at);
    const text = buf.slice(start, end).toString("utf8");
    console.log(`  line ${b.line}: ${text.replace(/\r$/, "").trim().slice(0, 100)}`);
  }
}

if (bare.length) {
  const fixed = buf.toString("binary").replace(/\r?\n/g, "\r\n");
  writeFileSync(FILE, Buffer.from(fixed, "binary"));
  console.log("normalised to CRLF");
}