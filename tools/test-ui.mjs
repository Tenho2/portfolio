/**
 * Tests for the rendering, accessibility and per-account scoping rules that a
 * function-level suite cannot see.
 *
 * Why this exists
 *   Most of these bugs produced no error at all. An element that should have been
 *   invisible was on screen permanently. Two accounts shared one another's
 *   storage key. A dialog could not be closed with Escape. A restored backup
 *   silently duplicated a charge. Every one of them was invisible to the unit
 *   suites and to `node --check`, and only a look at the markup, the CSS or the
 *   call order finds them.
 *
 *   Each assertion below names the specific defect it prevents from returning,
 *   because a test that does not say what it is guarding tends to be deleted the
 *   first time it fails for an unrelated reason.
 *
 *   node tools/test-ui.mjs
 */
import { readFileSync } from "node:fs";

const html = readFileSync("ev-tracker.html", "utf8");
const storage = readFileSync("app/storage.js", "utf8");

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

/* The <style> block only, so a rule mentioned in a comment is not mistaken for
   a real one. */
const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [null, ""])[1]
  /* comments can contain braces and selectors that look real */
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/<!--[\s\S]*?-->/g, "");

/** Strip line comments so prose is not read as code. */
const code = html
  .replace(/<!--[\s\S]*?-->/g, "")
  /* JS block comments, so prose naming a variable is not read as a reference. */
  .replace(/\/\*[\s\S]*?\*\//g, "");

group("the hidden attribute is not defeated by an author display rule", () => {
  /* The HTML spec puts [hidden] { display: none } in the user-agent stylesheet,
     so ANY author rule that sets display wins regardless of specificity. Seven
     elements carry `hidden` in markup or set it from script while their class set
     display, which left the red sync banner permanently on screen, an empty bin
     pill in the sidebar, and an account row with a live Log out button showing
     above the "you are not signed in" note. */
  ok("there is a global [hidden] guard", /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(style));

  /* Only a LATER !important can defeat the guard, so that is what is checked.
     The first version looked for any later rule setting display, which matched
     the file's own pre-existing `.chips[hidden] { display: none }` guards and
     reported three false problems. */
  const guardAt = style.search(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  ok("the guard exists", guardAt >= 0);
  if (guardAt >= 0) {
    /* Search AFTER the guard's closing brace. Starting at the guard itself made
       it match itself and report one override that does not exist. */
    const guardEnd = style.indexOf("}", guardAt) + 1;
    const after = style.slice(guardEnd);
    const late = [...after.matchAll(/\[hidden\][^{]*\{[^}]*!\s*important/g)];
    is(`no later rule overrides the guard (${late.length} found)`, late.length, 0);
  }
});

group("every element that sets hidden from script is not forced visible", () => {
  /* A belt-and-braces check on the specific offenders, independent of the
     cascade: every id whose hidden is toggled must not have a rule that could
     win against it. */
  const toggled = [...code.matchAll(/\$\("([A-Za-z0-9_]+)"\)\.hidden\s*=/g)].map(
    (m) => m[1],
  );
  ok(`script toggles hidden on several elements (${toggled.length})`, toggled.length > 5);
  const ids = [...code.matchAll(/id="([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
  for (const id of toggled)
    ok(`#${id} exists in the markup`, ids.includes(id));
});

group("the mobile nav keeps an accessible name", () => {
  /* Each nav button is an aria-hidden icon plus a label span. The label was hidden
     with display:none at <=820px, which removes it from the accessibility tree
     too, so the six most important controls were announced as bare "button".
     aria-current conveys position, not identity. */
  const navButtons = [...html.matchAll(/<button[^>]*data-go="([^"]+)"/g)];
  ok(`found ${navButtons.length} nav buttons`, navButtons.length >= 6);
  const hiding = style.match(/\.side-nav button[^{]*\{[^}]*display:\s*none[^}]*\}/);
  ok("the label span is still hidden on small screens", !!hiding);
  /* Set from script, because a literal in the markup would need a second
     translated string and would drift from the visible label. */
  ok("a helper assigns the names", /function syncNavButtonNames\(\)/.test(code));
  ok(
    "it reads the button's own translated label",
    /querySelector\("span\[data-i18n\]:not\(\.ic\)"\)/.test(code),
  );
  ok("it sets aria-label", /setAttribute\("aria-label",\s*text\)/.test(code));
  /* And it runs after the text is swapped, so the name is in the right
     language. */
  const idx = code.indexOf("window.renderI18n = function");
  const fn = code.slice(idx, idx + 2000);
  is(
    "renderI18n names the buttons before re-rendering",
    fn.indexOf("syncNavButtonNames()") > -1 &&
      fn.indexOf("syncNavButtonNames()") < fn.indexOf("render()"),
    true,
  );
});

group("the bin count is not hidden on a phone", () => {
  /* The exemption for .bin-count lost on specificity: the hiding rule counted
     (0,2,2) with :not(.ic) and the exemption only (0,2,1), so the count stayed
     invisible below 820px despite a comment claiming it was fixed. */
  const rules = [
    ...style.matchAll(/(\.side-nav button[^{]*)\{([^}]*)\}/g),
  ].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const hider = rules.find(
    (r) => /display:\s*none/.test(r.body) && /:not\(\.ic\)/.test(r.sel),
  );
  ok("there is a rule hiding non-icon spans", !!hider);
  ok(
    "that rule excludes the bin count",
    hider && hider.sel.includes(":not(.bin-count)"),
  );
});

group("every dialog can be dismissed with Escape and traps Tab", () => {
  const sheetIds = [
    "confirmSheet",
    "editSheet",
    "vehSheet",
    "syncPanel",
  ];
  for (const id of sheetIds) {
    ok(
      `Escape closes #${id}`,
      new RegExp(`\\$\\("${id}"\\)[\\s\\S]{0,120}?close`).test(code),
    );
    ok(
      `Tab is trapped in #${id}`,
      new RegExp(`\\$\\("${id}"\\)[\\s\\S]{0,120}?trapFocus`).test(code),
    );
  }
});

group("background inert is reference counted", () => {
  /* Two sheets can be open at once: the delete button on the edit sheet opens
     the confirmation dialog. With a boolean, the first release won, so the page
     behind an open dialog was un-inerted and focus was restored to the sheet
     that had just closed — Tab then walked out of the dialog. */
  ok("a counter exists", /var\s+backgroundLocks\s*=\s*0/.test(code));
  ok("lockBackground increments it", /backgroundLocks\s*\+=\s*on\s*\?\s*1\s*:\s*-1/.test(code));
  ok("the decision uses the counter, not the argument", /var\s+apply\s*=\s*backgroundLocks\s*>\s*0/.test(code));
});

group("every per-account cache is reloaded when the account changes", () => {
  /* load() was the only thing re-run after useAccount(). favs, locDefaults and
     shareNames were each read once at boot, when K still pointed at the
     signed-out bucket: a returning account's own saved values were never read,
     and changing one wrote the signed-out bucket's values into the account's key.
     shareNames was worse, since the whole map was rewritten, copying another
     bucket's usernames into the account's namespace. */
  const idx = code.indexOf("if (who !== lastAccount)");
  ok("the account-change block exists", idx > 0);
  const block = code.slice(idx, idx + 2200);
  for (const fn of ["load()", "loadFavs()", "loadLocDefaults()", "loadShareNames()"])
    ok(`the block calls ${fn}`, block.includes(fn));
  ok("the block clears the sharing caches", /shareCodeCache\s*=\s*\{\}/.test(block));
  ok("the block clears sharesChecked", /sharesChecked\s*=\s*false/.test(block));
});

group("the sign-out race guard can actually fire", () => {
  /* authTicket was documented as claimed by both paths but only ever
     incremented once, in the bootstrap, so every `ticket !== authTicket` check
     was permanently false. A slow getSession() could then showApp() the previous
     account after a successful sign-in, or sign the user straight back out. */
  /* The increment is a prefix: `var ticket = ++authTicket`. A pattern expecting
     the operator AFTER the name finds nothing. */
  const writes = [...code.matchAll(/(\+\+authTicket|authTicket\s*=\s*\d)/g)];
  ok(`authTicket is written in ${writes.length} places (needs >= 3)`, writes.length >= 3);
  const form = code.slice(code.indexOf("async function submitAuth"));
  ok("submitAuth claims a ticket", /\+\+authTicket/.test(form.slice(0, 3000)));
  const out = code.slice(code.indexOf("async function doLogout"));
  ok("doLogout claims a ticket", /\+\+authTicket/.test(out.slice(0, 2000)));
});

group("the sync panel state test checks the class, not a never-set attribute", () => {
  /* openSyncPanel and closeSyncPanel only toggle the "on" class, so a
     `$("syncPanel").hidden` guard was permanently true and the panel body was
     rebuilt on every status change for a dialog that was closed. */
  ok(
    "the guard uses classList.contains(\"on\")",
    /\$n?\("syncPanel"\)\.classList\.contains\("on"\)/.test(code),
  );
  is(
    "nothing assigns .hidden to the sync panel",
    [...code.matchAll(/\$\("syncPanel"\)\.hidden\s*=/g)].length,
    0,
  );
});

group("the favourites bin is persisted", () => {
  /* binned.favs was reset to [] on load and never written, so a deleted
     favourite was gone on the next reload and "start over" emptied the whole list
     irrecoverably while promising the bin still held it. */
  ok("storage publishes a bin-favourites key", /bf:\s*pre\s*\+\s*"binFavs"/.test(storage));
  ok("saveFavs writes it", /localStorage\.setItem\(K\.bf/.test(code));
  ok("loadFavs reads it", /localStorage\.getItem\(K\.bf/.test(code));
  const save = code.slice(code.indexOf("function saveFavs"));
  ok("loadFavs does not reset the bin to empty", !/binned\.favs\s*=\s*\[\]/.test(save.slice(0, 4000)));
});

group("restoring a backup cannot leave a row live and binned at once", () => {
  /* The restore replaced vehicles and sessions but left the bin alone, so a
     backup taken after a delete put that row back live while its binned copy
     stayed: it appeared twice, double-counted in the totals and the chart, and
     deleting the stale bin row deleted the live one from the server. */
  const idx = code.indexOf("$(\"restoreFile\").addEventListener");
  ok("the restore handler exists", idx > 0);
  const block = code.slice(idx, idx + 2600);
  ok("the bin is reset before the arrays are replaced", /binned\s*=\s*\{\s*vehicles:\s*\[\],\s*sessions:\s*\[\],\s*favs:\s*\[\]\s*\}/.test(block));
  ok("restoreSession is idempotent", /function restoreSession[\s\S]{0,700}sessionAnywhere\(id\)/.test(code));
  ok("restoreVehicle is idempotent", /function restoreVehicle[\s\S]{0,1400}vehById\(id\)/.test(code));
});

group("CSV header resolution uses the tested helper", () => {
  /* The CSV path had its own copy of the lookup, and it indexed the column array
     with a KEY, so any header matching two column lists threw a TypeError. The
     throw escaped into FileReader.onload, which has no try/catch, so the file
     appeared to do nothing at all: no panel, no toast, no error. */
  ok("resolveHead is defined", /function resolveHead\(/.test(code));
  const idx = code.indexOf("var head = rows[0].map(normHeader)");
  ok("the CSV header loop exists", idx > 0);
  const loop = code.slice(idx, idx + 2200);
  ok("it calls resolveHead", /resolveHead\(head\[c\]\)/.test(loop));
  is(
    "it does not index the column array by key",
    /IMPORT_COLS\[[a-z]+\]/.test(loop) ? 1 : 0,
    0,
  );
  /* Containment alone claimed "vehicleid" as "vehicle", which invented a vehicle
     named after a uuid and moved every restored session onto it. */
  const resolve = code.slice(code.indexOf("function resolveHead"));
  ok("the substring fallback requires the alias to be a prefix", /h\.indexOf\(a\)\s*!==?\s*0/.test(resolve.slice(0, 2200)));
});

group("the imported favourite flag uses the name every reader expects", () => {
  /* Written as `favourite`, read as `s.fav` everywhere: the log tag, the edit
     checkbox, the submit handler, the CSV export. The star was dropped on every
     round trip while the file looked lossless. */
  ok("the import writes fav", /fav:\s*isYes\(get\("favourite"\)\)/.test(code));
  is("nothing writes a .favourite property on a session", /\.favourite\s*=/.test(code) ? 1 : 0, 0);
});

group("a negative duration cannot reach the totals", () => {
  /* hmToHours only rejected NaN, so "-0:30" produced -0.5: the row subtracted
     from the Hours tile and rendered as "0-1:-30" in the log and in every CSV
     exported afterwards. */
  const idx = code.indexOf("function hmToHours");
  const fn = code.slice(idx, idx + 2000);
  ok("minutes are range checked", /m\s*>\s*59/.test(fn));
  ok("hours are range checked", /h\s*>\s*48/.test(fn));
  ok("hoursToHM clamps at zero", /function hoursToHM[\s\S]{0,200}Math\.max\(0/.test(code));
});

group("the chart instance is destroyed, not just dereferenced", () => {
  /* Chart.js keeps a global registry and its constructor throws if a canvas
     already has a chart, so nulling the variable left an instance alive:
     switching to a vehicle with no sessions and back made every later render
     throw and the chart stayed blank for the session. */
  const idx = code.indexOf("function say(msg)");
  ok("say() still exists", idx > 0);
  const fn = code.slice(idx, idx + 2200);
  ok("it destroys the chart", /monthChart\.destroy\(\)/.test(fn));
});

group("clicking the map writes the coordinates", () => {
  /* onDrag fired only from dragend, so tapping the map moved the pin while the
     stored coordinates stayed at the old point, and the submit saved the
     previous location. */
  const idx = code.indexOf('slot.map.on("click"');
  ok("the map click handler exists", idx > 0);
  const fn = code.slice(idx, idx + 1600);
  ok("it propagates the clicked coordinates", /onDrag\(e\.latlng\.lat,\s*e\.latlng\.lng\)/.test(fn));
  ok("the popup is unbound before rebinding", /unbindPopup/.test(code));
});

group("the export scope picker is filled outside the log view", () => {
  /* It lives in the Settings panel but was populated only inside the log-view
     branch, so a user opening Settings directly could not scope an export, and
     stale options silently exported nothing. */
  ok("a dedicated renderer exists", /function renderScopePicker\(\)/.test(code));
  ok("it is called from the panel list", /tryPanel\("scope",\s*renderScopePicker\)/.test(code));
  ok(
    "a stale selection falls back to all",
    /sl\.value\s*=\s*vehicles\.some[\s\S]{0,160}\?\s*keep\s*:\s*"all"/.test(code),
  );
  ok("the JSON export refuses to write an empty file", /toast\.nothing/.test(code.slice(code.indexOf("$(\"exJson\")"), code.indexOf("$(\"exJson\")") + 900)));
});

group("a transport failure never spends a push attempt", () => {
  /* MAX_PUSH_ATTEMPTS exists to tell "the server will never accept this" from
     "the network hiccuped". A dropped connection or a timeout spent one of the
     three, so three of them marked a real charging session as refused and
     offered a Discard button. */
  const idx = code.indexOf("function failPush");
  const fn = code.slice(idx, idx + 2600);
  ok("a timeout is detected", /isTimeout\(err\)/.test(fn));
  ok("it re-queues without counting", /if \(isTimeout\(err\)[^]*\{\s*markDirty/.test(fn));
  ok(
    "the attempt counter runs only after that check",
    /* "bumpAttempt(" with the open paren, not a bare prefix: failPush calls
       bumpAttemptPreview() in its diagnostics block, and a prefix search finds
       that instead and concludes the counter runs first. */
    fn.indexOf("bumpAttempt(kind") > fn.indexOf("isTimeout(err)"),
  );
});

group("the retry ticker is not leaked", () => {
  /* The 1 Hz countdown interval was a local inside armRetry, reachable only by
     the timeout callback, so every re-arm discarded it without clearing. It was
     re-entered from markDirty on each failed push and from scheduleRetry on each
     connectivity change, leaving a permanent 1 Hz timer per failure. */
  ok("the interval handle is module scope", /var\s+retryTick\s*=\s*null/.test(code));
  const idx = code.indexOf("function armRetry");
  const fn = code.slice(idx, idx + 2000);
  ok("armRetry clears it", /clearInterval\(retryTick\)/.test(fn));
  ok("the interval is assigned to the handle", /retryTick\s*=\s*setInterval/.test(code));
});

group("a queued row that left the device stops being counted", () => {
  /* Nothing removed a syncDirty entry whose row was gone, so pendingCount never
     reached zero, a retry timer was armed forever, and the panel listed a row
     marked "no longer on this device" with no way to clear it. */
  ok("there is a helper for it", /function forgetGoneRow\(/.test(code));
  ok("retryDirty uses it", /function retryDirty[\s\S]{0,900}forgetGoneRow/.test(code));
  ok("flushOneDirty uses it", /function flushOneDirty[\s\S]{0,2000}forgetGoneRow/.test(code));
  ok("purge uses it", /function binPurge[\s\S]{0,2600}forgetGoneRow/.test(code));
  ok("emptying the bin uses it", /function emptyBin[\s\S]{0,1400}forgetGoneRow/.test(code));
});

group("a pending delete is visible and drivable", () => {
  /* syncDeleted was consulted only on a pull: not counted, not listed, and the
     error object was discarded. A "delete forever" that failed was invisible
     and silently reverted by the next pull. */
  ok("it is counted", /function pendingDeleteCount\(\)/.test(code));
  ok("pendingCount includes it", /pendingCount\(\)\s*\+\s*pendingDeleteCount\(\)/.test(code));
  ok("flushOneDirty drives it", /function flushOneDirty[\s\S]{0,900}retryDeleted\(\)/.test(code));
  ok("the panel lists it", /function unsyncedRows[\s\S]{0,6000}syncDeleted\.vehicles/.test(code));
  ok("the error is recorded", /function syncDelete[\s\S]{0,2600}diag\("delete:/.test(code));
  ok("it is not discardable", /delete queued/.test(code));
});

group("a local delete survives a pull", () => {
  /* The bin was reset from the server's response while only the LIVE arrays
     were searched for local-only rows. A session deleted offline vanished from
     the device entirely, and one the server knew about came back live because
     the pulled copy carries deleted_at null — so the delete was pushed back as
     live and lost on the server too. */
  const idx = code.indexOf("function syncPull");
  const fn = code.slice(idx, idx + 14000);
  ok("local binned vehicles are kept", /localOnlyBinnedVehicles/.test(fn));
  ok("local binned sessions are kept", /localOnlyBinnedSessions/.test(fn));
  ok("a locally binned id wins over the server copy", /localBinnedIds\[r\.id\]/.test(fn));
});

group("the sync panel stays reachable", () => {
  /* These badges are the only way to open the sync panel. syncNote("") used to
     hide them, which was invisible only because a CSS bug kept them on screen as
     empty pills; fixing that bug therefore removed the sole affordance, and the
     panel became unreachable exactly when a user might want to check it. */
  const idx = code.indexOf("function syncNote");
  const fn = code.slice(idx, idx + 1600);
  ok(
    "an empty note does not hide the badges while sync is on",
    /if \(!text\)[\s\S]{0,500}?el\.hidden\s*=\s*!quiet/.test(fn),
  );
  ok("it shows a quiet label instead", /sync\.allGoodShort/.test(fn));
  ok("a success is stamped", /function stampSuccess\(/.test(code));
  ok("the report states the last successful pull", /last successful pull/.test(code));
  ok("the report states the last successful write", /last successful write/.test(code));
  /* And the empty case must read as success, not as silence. */
  ok(
    "an empty error log says so explicitly",
    /none - every write the server accepted/.test(code),
  );
  ok(
    "the section is labelled as errors, not events",
    /RECORDED ERRORS/.test(code) && !/lines\.push\("EVENTS/.test(code),
  );
});

group("the app can never fall back to a private of another module", () => {
  ok("the i18n module publishes EV_I18N", /window\.EV_I18N\s*=/.test(readFileSync("app/i18n.js","utf8")));
  ok("storage publishes only EV_STORAGE", /window\.EV_STORAGE\s*=/.test(storage));
  ok("no LANGS in the app script", !/(?<![.\w"'])LANGS\b/.test(code));
  ok("no ORDER in the app script", !/(?<![.\w"'])ORDER\b/.test(code));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}