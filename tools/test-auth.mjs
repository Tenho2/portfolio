/**
 * Tests for the username -> Supabase email adapter and auth validation.
 *
 * Why this exists
 *   Supabase Auth wants an email-shaped identifier, while this app presents a
 *   username. Usernames may contain @ now, so the adapter must replace those
 *   characters inside the local part and still append the reserved fake domain.
 *   If it returns a raw address instead, a real email is silently stored; if the
 *   reverse step is missed, the account is displayed as "pekk_at_".
 *
 *   The form uses novalidate, so HTML minlength/pattern attributes cannot be
 *   relied on. The registration-only password check and the hint visibility are
 *   therefore asserted in the script itself.
 *
 *   node tools/test-auth.mjs
 */
import { readFileSync } from "node:fs";
import { appSource, fnSource } from "./app-source.mjs";

function constOf(name) {
  const m = appSource().match(new RegExp(`var ${name}\\s*=\\s*[^;]+;`));
  if (!m) throw new Error(`const ${name} not found`);
  return m[0];
}

const build = new Function(
  [
    constOf("AUTH_FAKE_DOMAIN"),
    fnSource("toFakeEmail"),
    fnSource("fromFakeEmail"),
    "return { toFakeEmail, fromFakeEmail };",
  ].join("\n\n"),
);
const { toFakeEmail, fromFakeEmail } = build();

const html = readFileSync("ev-tracker.html", "utf8");
const hud = readFileSync("tools/hud-body.html", "utf8");
const code = appSource();
const sql = readFileSync("supabase/04-roles.sql", "utf8");
const migration = readFileSync("supabase/17-invite-at-usernames.sql", "utf8");

let pass = 0;
const failures = [];
function is(label, actual, expected) {
  if (actual === expected) pass++;
  else failures.push(`${label}\n      expected ${expected}, got ${actual}`);
}
function ok(label, condition) {
  is(label, !!condition, true);
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

group("a plain username becomes a fake email", () => {
  is("lowercases", toFakeEmail("Hoija"), "hoija@evtracker.test");
  is("trims", toFakeEmail("  Hoija  "), "hoija@evtracker.test");
  is("an empty value stays empty", toFakeEmail(""), "");
});

group("@ is encoded inside the local part, never left as a real address", () => {
  is("trailing @", toFakeEmail("pekk@"), "pekk_at_@evtracker.test");
  is("embedded @", toFakeEmail("a@b@c"), "a_at_b_at_c@evtracker.test");
  is("the suffix is always the fake domain", toFakeEmail("a@b.com").endsWith("@evtracker.test"), true);
});

group("display restores what the user typed", () => {
  is("plain", fromFakeEmail("hoija@evtracker.test"), "hoija");
  is("encoded @", fromFakeEmail("pekk_at_@evtracker.test"), "pekk@");
  is("multiple encoded @", fromFakeEmail("a_at_b_at_c@evtracker.test"), "a@b@c");
  is("a non-fake address is left alone", fromFakeEmail("a@b.com"), "a@b.com");
});

group("the auth form exposes both hints accessibly", () => {
  for (const [name, doc] of [
    ["classic", html],
    ["hud", hud],
  ]) {
    ok(`${name}: username hint is linked`, /id="authUserHint"[\s\S]{0,100}data-i18n="auth\.usernameHint"/.test(doc));
    ok(`${name}: password hint is linked`, /aria-describedby="authPassHint"/.test(doc));
    ok(`${name}: password hint starts hidden`, /id="authPassHint"[\s\S]{0,100}hidden/.test(doc));
    ok(`${name}: Tesla hint starts hidden`, /id="authTeslaHint"[\s\S]{0,100}hidden/.test(doc));
    ok(`${name}: novalidate is still present`, /id="authForm" novalidate/.test(doc));
  }
});

group("validation runs in script, because the form is novalidate", () => {
  ok("the username is trimmed and lowercased", /var u = \$\("authUser"\)\.value\.trim\(\)\.toLowerCase\(\)/.test(code));
  ok("registration is the only mode that checks length", /if \(registering && p\.length < 8\)/.test(code));
  ok("the new error key is used", /auth\.errPassShort/.test(code));
  ok("the hint is hidden outside registration", /passHint\.hidden = authMode !== "up"/.test(code));
  ok(
    "the Tesla hint is hidden outside registration",
    /teslaHint\.hidden = authMode !== "up"/.test(code),
  );
});

group("the Settings password form is signed-in only and validates locally", () => {
  for (const [name, doc] of [
    ["classic", html],
    ["hud", hud],
  ]) {
    ok(`${name}: password row starts hidden`, /id="passwordRow" hidden/.test(doc));
    ok(`${name}: password form exists`, /id="passForm" novalidate/.test(doc));
    for (const id of ["curPass", "newPass", "confirmPass"])
      ok(`${name}: #${id} has a label`, new RegExp(`for="${id}"`).test(doc));
  }
  const fn = fnSource("changePassword");
  ok("it reauthenticates with the current password", /signInWithPassword\(\{[\s\S]{0,120}password: cur/.test(fn));
  ok("it changes the password only after reauthentication", /updateUser\(\{ password: next \}\)/.test(fn));
  ok("it enforces the minimum length", /next\.length < 8/.test(fn));
  ok("it rejects a mismatch", /next !== confirm/.test(fn));
  ok("it rejects reusing the current password", /next === cur/.test(fn));
  ok("it clears the fields after success", /clearPasswordFields\(\)/.test(fn));
  ok("it never logs a password", !/authLogErr|console\.(log|info|warn|error)/.test(fn));
});

group("the account panel shows and hides the password form with the session", () => {
  const fn = fnSource("renderAccountPanel");
  ok("it toggles the password row", /passRow\.hidden = !signed/.test(fn));
  ok("it clears fields when signed out", /clearPasswordFields\(\)/.test(fn));
  ok("the form is wired", /\$\("passForm"\)\.addEventListener\("submit", changePassword\)/.test(code));
});

group("sharing normalises an @ username the same way", () => {
  ok("the live migration normalises", /replace\(lower\(trim\(p_username\)\), '@', '_at_'\)/.test(sql));
  ok("the standalone migration normalises", /replace\(lower\(trim\(p_username\)\), '@', '_at_'\)/.test(migration));
});

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} assertions passed`);
if (failures.length) process.exit(1);
