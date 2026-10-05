/**
 * Static checks for the SQL migrations.
 *
 * Why this exists
 *   There is no PostgreSQL on this machine and no psql, so nothing else in the
 *   repository can tell whether a migration parses. Five files shipped broken
 *   while `npm run check` stayed green:
 *
 *     1. drop constraint if exists X on table      -- not a PostgreSQL statement
 *     2. 'f'::regprocedure for a 0-arg function    -- 22P02
 *     3. select u.active from auth.users           -- 42703, no such column
 *     4. cmd = 'insert' against pg_policies        -- silent false negative
 *     5. session_user as a column name             -- 42601, reserved word
 *
 *   Every one was found by the user running them. This cannot prove a migration
 *   runs, but it catches these five classes before anyone has to.
 *
 *   node tools/check-sql.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
const failures = [];
function is(label, actual, expected) {
  if (actual === expected) pass++;
  else failures.push(`${label}\n      expected ${expected}, got ${actual}`);
}
function fail(label, detail) {
  failures.push(`${label}\n      ${detail}`);
}

/* Words PostgreSQL reserves. Using one bare as a column or table name is a
   syntax error. Names taken from this list are what broke 11-probe-logging.sql. */
const RESERVED = new Set([
  "all", "analyse", "analyze", "and", "any", "array", "as", "asc", "both",
  "case", "cast", "check", "collate", "column", "constraint", "create",
  "current_catalog", "current_date", "current_role", "current_schema",
  "current_time", "current_timestamp", "current_user", "default",
  "deferrable", "desc", "distinct", "do", "else", "end", "except", "false",
  "fetch", "for", "foreign", "from", "grant", "group", "having", "in",
  "initially", "intersect", "into", "lateral", "leading", "limit",
  "localtime", "localtimestamp", "not", "null", "offset", "on", "only", "or",
  "order", "placing", "primary", "references", "returning", "select",
  "session_user", "some", "symmetric", "table", "then", "to", "trailing",
  "true", "union", "unique", "user", "using", "variadic", "when", "where",
  "window", "with",
]);

const files = readdirSync("supabase")
  .filter((f) => f.endsWith(".sql"))
  .sort();

is("there are SQL files to check", files.length > 0, true);

/** Replace comment content with spaces, so offsets and line numbers survive. */
function blankComments(sql) {
  return sql
    .replace(/--[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/** Line number of a character offset, for reporting. */
function lineOf(sql, index) {
  return sql.slice(0, index).split("\n").length;
}

for (const name of files) {
  const path = join("supabase", name);
  const raw = readFileSync(path, "utf8");
  /* Comments are blanked rather than removed, so a word quoted in prose is not
     mistaken for code while line numbers stay true to the file. */
  const sql = blankComments(raw);

  /* ---- 1. standalone DROP CONSTRAINT, which is not valid PostgreSQL ----
     The two-line form
         alter table public.t
           drop constraint if exists x;
     is valid, and is not a semicolon-terminated statement on its own. So rather
     than joining lines, look backwards from each match to the previous statement
     boundary: if an `alter table` appears there, this is a sub-clause. */
  for (const m of sql.matchAll(/drop\s+constraint\b[^\n]*/gi)) {
    const before = sql.slice(0, m.index);
    const boundary = Math.max(before.lastIndexOf(";"), before.lastIndexOf("$$"));
    const statement = before.slice(boundary + 1);
    if (!/\balter\s+table\b/i.test(statement)) {
      fail(
        `${name}: DROP CONSTRAINT is not a standalone statement`,
        `line ${lineOf(sql, m.index)}: ${m[0].trim()}\n` +
          "      use: alter table <t> drop constraint if exists <name>;",
      );
    }
  }
  pass++;

  /* ---- 2. regprocedure cast without an argument list ---- */
  for (const m of raw.matchAll(/'([\w.]+)'::regprocedure/g)) {
    if (!/\(\)/.test(m[1])) {
      fail(
        `${name}: regprocedure cast needs the argument list`,
        `line ${lineOf(raw, m.index)}: '${m[1]}'::regprocedure\n` +
          `      a zero-argument function must be written '${m[1]}()'::regprocedure`,
      );
    }
  }
  pass++;

  /* ---- 3. columns on auth.* that do not exist ----
     auth.users is owned by Supabase and its shape changes between projects and
     over time. The stable, documented surface is small, so referencing anything
     outside it is a migration that will fail on somebody's database.

     Resolved by finding the aliases bound to auth.users first, then checking
     every qualified column read through one of them. */
  const AUTH_USERS_COLUMNS = new Set([
    "id", "email", "phone", "confirmed_at", "email_confirmed_at",
    "confirmation_sent_at", "recovery_sent_at", "last_sign_in_at",
    "raw_app_meta_data", "raw_user_meta_data", "is_super_admin",
    "created_at", "updated_at", "role", "aud", "encrypted_password",
    "invite_token", "new_email", "is_sso_user", "deleted_at",
  ]);
  const aliases = new Set(["users"]);
  for (const a of sql.matchAll(/auth\.users\s+(?:as\s+)?(\w+)/gi)) {
    aliases.add(a[1].toLowerCase());
  }
  for (const a of aliases) {
    for (const m of sql.matchAll(
      new RegExp(`\\b${a}\\.([a-z_][a-z0-9_]*)\\b`, "gi"),
    )) {
      const col = m[1].toLowerCase();
      if (!AUTH_USERS_COLUMNS.has(col)) {
        fail(
          `${name}: unknown column on auth.users`,
          `line ${lineOf(sql, m.index)}: ${a}.${m[1]} is not part of the ` +
            "documented shape\n      and will fail with 42703 on some projects",
        );
      }
    }
  }
  pass++;

  /* ---- 4. case-sensitive comparison against pg_policies.cmd ---- */
  /* lower(cmd) = 'insert' is the correct form, so it must not be flagged. */
  for (const m of sql.matchAll(/(?<!lower\()\bcmd\s*=\s*'([a-z]+)'/gi)) {
    const v = m[1];
    if (v !== v.toUpperCase()) {
      fail(
        `${name}: pg_policies.cmd is uppercase`,
        `line ${lineOf(sql, m.index)}: cmd = '${v}' matches nothing and reports\n` +
          `      "no policies" when they are all there. Use lower(cmd) = '${v}'.`,
      );
    }
  }
  pass++;

  /* ---- 5. reserved words used as column names ----
     Table-level constraints (primary key, unique, foreign key, check) start at
     the same indent as a column and are not column names. */
  const NOT_COLUMNS = new Set([
    "primary", "unique", "foreign", "check", "constraint", "exclude", "like",
  ]);
  for (const m of raw.matchAll(
    /create\s+table(?:\s+if\s+not\s+exists)?\s+[\w.]+\s*\(([\s\S]*?)\n\);/gi,
  )) {
    const body = m[1];
    for (const c of body.matchAll(/^[ \t]{2}([a-z_][a-z0-9_]*)\s/gim)) {
      const name2 = c[1].toLowerCase();
      if (NOT_COLUMNS.has(name2)) continue;
      if (RESERVED.has(name2)) {
        fail(
          `${name}: reserved word used as a column name`,
          `line ${lineOf(raw, m.index + c.index)}: "${c[1]}"\n` +
            "      quote it or rename it, for example db_" + c[1] + "",
        );
      }
    }
  }
  pass++;

  /* ---- 6. unbalanced dollar quoting ---- */
  const fences = (raw.match(/\$\$/g) || []).length;
  if (fences % 2 !== 0) {
    fail(`${name}: unbalanced $$ quoting`, `${fences} occurrences, expected an even number`);
  }
  pass++;

  /* ---- 7. a transaction that opens but never closes ---- */
  const opens = (sql.match(/^\s*begin\s*;/gim) || []).length;
  const closes = (sql.match(/^\s*commit\s*;/gim) || []).length;
  if (opens !== closes) {
    fail(
      `${name}: transaction is not balanced`,
      `${opens} begin vs ${closes} commit, so a run would roll back silently`,
    );
  }
  pass++;

  /* ---- 8. every referenced migration file exists ---- */
  /* Any two-digit prefix, not just 0x: a header saying "run this after
     42-something.sql" is just as broken as a missing one. */
  for (const m of raw.matchAll(/\b\d{2}-[a-z][a-z0-9-]*\.sql\b/g)) {
    const ref = m[0];
    if (!files.includes(ref)) {
      fail(
        `${name}: references a migration that is not in supabase/`,
        `line ${lineOf(raw, m.index)}: ${ref}`,
      );
    }
  }
  pass++;
}

console.log(
  `${failures.length ? "FAIL" : "ok  "}  SQL migrations pass the static checks`,
);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
