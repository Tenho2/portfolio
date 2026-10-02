/**
 * Syntax-check the inline <script> blocks in the HTML pages.
 *
 * The EV tracker keeps all of its JavaScript inline, so there is no .js file for
 * eslint or `node --check` to look at. This compiles each inline block with
 * vm.Script, which catches the mistakes that matter when editing a large single
 * file: an unbalanced brace, a stray template literal, a missing paren.
 *
 * Compile only. Nothing is executed, so no app code runs and nothing is written.
 */
import { readFileSync, readdirSync } from "node:fs";
import { extname } from "node:path";
import vm from "node:vm";

/** Inline scripts only: an external one has no body to parse. */
const SKIP_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "importmap",
  "text/template",
]);

function inlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (type && SKIP_TYPES.has(type.toLowerCase())) continue;
    if (!body.trim()) continue;
    out.push({
      body,
      line: html.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

const pages = readdirSync(process.cwd()).filter((f) => extname(f) === ".html");
let failed = 0;

for (const page of pages) {
  const blocks = inlineScripts(readFileSync(page, "utf8"));
  if (!blocks.length) continue;
  for (const [i, block] of blocks.entries()) {
    try {
      new vm.Script(block.body, { filename: `${page}#inline-${i + 1}` });
    } catch (err) {
      failed++;
      console.error(
        `\n${page}: inline script #${i + 1} (starts near line ${block.line})`,
      );
      console.error(String(err.message).split("\n").slice(0, 6).join("\n"));
    }
  }
  console.log(`${page}: ${blocks.length} inline script block(s) parsed`);
}

if (failed) {
  console.error(`\n${failed} inline script block(s) failed to compile.`);
  process.exit(1);
}
console.log("All inline scripts parse.");