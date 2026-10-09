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

/**
 * The text between two markers, so an assertion describes one function's body
 * rather than the whole file. A missing marker yields an empty string and the
 * assertion fails loudly instead of silently matching somewhere else.
 */
function between(source, from, to) {
  const a = source.indexOf(from);
  if (a < 0) return "";
  const b = source.indexOf(to, a + from.length);
  return source.slice(a, b < 0 ? source.length : b);
}

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
ok("restoreSession is idempotent", /function restoreSession[\s\S]{0,900}alreadyLive/.test(code));
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

group("restoring a binned session actually restores it", () => {
  /* The idempotency guard tested sessionAnywhere(), which spans live AND bin,
     while the row being restored was still in the bin. It therefore always
     found the row itself: the restore branch was dead code, Restore deleted
     the bin entry, and the next pull re-imported it. Forever. */
  const fn = between(code, "function restoreSession", "function restoreVehicle");
  ok("it does not consult the live+bin helper", !/sessionAnywhere\(/.test(fn));
  ok("it does not look a session id up in vehicles", !/vehById\(/.test(fn));
  ok(
    "it tests the live session array instead",
    /for \(var li = 0; li < sessions\.length; li\+\+\)/.test(fn) &&
      /if \(sessions\[li\]\.id === id\) alreadyLive = true/.test(fn),
  );
  ok(
    "the restore branch is reachable",
    /if \(alreadyLive\) \{[\s\S]*?return;[\s\S]*?s\.deletedAt = null;/.test(fn),
  );
});

group("the confirm dialog is reachable above the sheet that raised it", () => {
  /* Both sheets were body children at z-index 80, so document order decided the
     winner and #syncPanel came second. A confirmation raised from inside the
     sync panel painted underneath it: its buttons were unclickable, and Escape
     closed the invisible one while the visible panel stayed put. */
  ok(
    "the confirm sheet stacks above the others",
    /#confirmSheet \{\s*z-index: 90;/.test(style),
  );
  /* Repeat confirmations must not accumulate background locks. The sheets are
     not themselves inert, so Discard inside the sync panel could raise a second
     askConfirm and leave backgroundLocks permanently above zero, stranding
     .wrap/.side/footer on inert for the session with only a reload recovering. */
  const ask = between(code, "function askConfirm", "function closeConfirm");
  ok(
    "a repeat request releases the lock it is replacing",
    /if \(confirmState\) \{[\s\S]*?confirmState\.resolve\(false\);[\s\S]*?lockBackground\(false\);[\s\S]*?\}/.test(
      ask,
    ),
  );
  ok(
    "lockBackground clamps at zero",
    /backgroundLocks < 0\) backgroundLocks = 0/.test(code),
  );
});

group("a pull never pushes the same row twice", () => {
  /* The vehicle loop gained a dirty guard; the session loop did not. retryDirty()
     had already queued every dirty session, so an offline-logged session was
     bulk-upserted twice per pull, and a refusal spends an attempt each time. */
  const pull = between(code, "localOnlySessions", "return true;\n            })\n              .catch");
  ok(
    "the session filter checks both stalled and dirty",
    /syncStalled\.sessions\[r\.id\]\) return false/.test(pull) &&
      /return !syncDirty\.sessions\[r\.id\]/.test(pull),
  );
  /* retryNow cleared the timeout but not the interval, and the successful-pull
     path re-arms neither, so the countdown woke the page once a second for the
     rest of the session. */
  const now = between(code, "function retryNow", "function renderRetryCountdown");
  ok("retryNow clears the interval as well", /clearInterval\(retryTick\)/.test(now));
});

group("restoring a backup replaces the whole bin, favourites included", () => {
  /* binned was reset, then loadFavs() re-read the untouched bin key and put the
     deleted favourites back, so the bin was only half-replaced. */
  const restore = between(code, "K.f,", "loadFavs();\n                render();");
  ok("the favourites bin key is cleared too", /K\.bf, JSON\.stringify\(\[\]\)/.test(restore));
  ok("the in-memory bin is re-cleared after loadFavs", /binned\.favs = \[\];/.test(restore));
});

group("the mobile sync badge cannot push the account name off screen", () => {
  /* The badge now reads "In sync" instead of an empty string, inside a nowrap
     scrollable strip. It must be the thing that shrinks, and never the header
     badge, which carries the full refusal text. */
  ok("the mini badge is allowed to shrink", /\.sync-badge-mini \{[^}]*min-width: 0/.test(style));
  ok("it ellipsises rather than overflowing", /\.sync-badge-mini \{[^}]*text-overflow: ellipsis/.test(style));
  const base = between(style, ".sync-badge {", ".sync-badge[data-kind");
  ok("the header badge is not clipped", !/text-overflow/.test(base));
});

group("no async result can cross accounts", () => {
  /* app/storage.js guarantees no localStorage KEY is shared between accounts.
     These are the missing half: no RESULT may cross either. A pull started by
     account A and finished after the user signed in as B appended A's vehicles
     and sessions to B's arrays, then save()d them under B's key - A's whole
     charging history on B's dashboard, persisted, and in B's export. */
  ok("there is an account generation counter", /var acctGen = 0;/.test(code));
  ok("it is checked through a helper", /function acctLive\(gen\)/.test(code));
  const pull = between(code, "function syncPull", "function syncSession");
  ok("the pull captures its generation before awaiting", /var gen = acctGen;/.test(pull));
  ok(
    "the pull re-checks before merging",
    /if \(!acctLive\(gen\)\) return false;[\s\S]*?var vrows/.test(pull),
  );
  ok(
    "the pull re-checks again immediately before save()",
    /if \(!acctLive\(gen\)\) return false;\s*save\(\);/.test(pull),
  );
  ok("a stale pull failure is not filed under the new account", /catch\(function \(e\) \{[\s\S]{0,200}?if \(!acctLive\(gen\)\) return false;/.test(pull));
  /* `shares` answers every permission question in the app. */
  const sh = between(code, "function loadShares", "function shareAdd");
  ok("loadShares is guarded", /if \(!acctLive\(gen\)\) return false;/.test(sh));
  const rc = between(code, "function redeemShareCode", "function doRedeem");
  ok("redeemShareCode is guarded", /if \(!acctLive\(gen\)\) return \{ status: "stale" \};/.test(rc));
  /* TOKEN_REFRESHED claimed no ticket, so it could undo a completed sign-out:
     the app re-opened itself as the account the user had just left. */
  ok(
    "the token refresh handler claims the auth ticket",
    /evt === "TOKEN_REFRESHED"\) \{[\s\S]{0,200}?var rticket = \+\+authTicket;/.test(code),
  );
});

group("an account switch tears down the previous account completely", () => {
  /* A direct A-to-B switch is a real path: Supabase broadcasts its session
     across same-origin tabs, so signing in as B in a second tab drives the first
     tab straight across with no signed-out moment in between. The sync-queue
     reset therefore used to be skipped entirely. */
  ok("the queue reset is a named function", /function resetSyncQueues\(\)/.test(code));
  const show = between(code, "if (who !== lastAccount) {", "lastAccount = who;");
  ok("it runs on any account change", /resetSyncQueues\(\);/.test(show));
  ok("the generation is bumped", /acctGen\+\+;/.test(show));
  /* Sheets are body-level siblings of <main class="wrap">, so the signed-out
     rule that hides the app does not touch them: signing out left the open Edit
     sheet rendered over the login form, complete with that session's notes. */
  for (const closer of ["closeEdit();", "closeVeh();", "closeSyncPanel();"])
    ok(`the switch closes ${closer.replace(/[();]/g, "")}`, show.includes(closer));
  ok("unsaved form values are cleared", /sf\.reset\(\)/.test(show));
  ok("the map instances are dropped", /maps = \{\};/.test(show));
  ok("the pinned coordinates are cleared", /locGeo = \{ lat: null, lng: null, label: "" \};/.test(show));
  /* Diagnostics carry the account and the vehicle name, and the report prints
     the probed uid - so they landed in the next account's support ticket. */
  ok("the diagnostics log is cleared", /diagLog = \[\];/.test(show));
  ok("the identity probe is reset", /whoAmI = \{ role: "unknown"/.test(show));
  /* The share code is a credential, and renderShare() was the only thing that
     hid the panel while every call site was guarded on the now-null target. */
  ok("the share panel is re-rendered", /shareTarget = null;[\s\S]{0,200}?renderShare\(\);/.test(show));
});

group("destructive bulk actions respect roles", () => {
  /* All of these were reachable by any signed-in account and touched every row,
     including other people's sessions on vehicles shared with this user - who
     then could not delete a single charge they had not written. */
  const gates = [
    ["doClearSessions", "canEditSession(sessions[ci])"],
    ["doWipe", "mayWriteVehicle(vehicles[wj].id)"],
    ["emptyBin", "mayWriteVehicle(binned.vehicles[ei].id)"],
    ["binPurge", "!mayWriteVehicle(id)"],
    ["restoreSession", "!canEditSession(s)"],
    ["restoreVehicle", "!mayWriteVehicle(id)"],
  ];
  for (const [fn, guard] of gates) {
    const body = between(code, `function ${fn}(`, "\n          function ");
    ok(`${fn} checks permission`, body.includes(guard));
    ok(`${fn} refuses rather than proceeding`, /toast\.notAllYours|toast\.noPermission/.test(body));
  }
  /* A driver could not fix a typo in, or delete, a charge they had just logged:
     the add form never stamped an author, so the comparison was
     undefined === "<uuid>". The RLS rule accepts it immediately. */
  const can = between(code, "function canEditSession", "function mayWriteVehicle");
  ok(
    "a locally created row counts as the caller's own",
    /r >= 2 && !!ownerId\(\)\) return !s\.userId \|\| s\.userId === ownerId\(\)/.test(can),
  );
});

group("the JSON round trip keeps the session to vehicle link", () => {
  /* The normaliser maps vehicleId onto the canonical key "vehicle", so after
     normalisation the raw id was simply gone and the "raw id wins" branch was
     dead code. Every round trip went down the name path instead, matched
     nothing, and MANUFACTURED a vehicle named after a uuid - leaving the real
     cars with empty histories and the history on ownerless phantom cars. */
  ok("the raw id is carried past the normaliser", /norm\.rawVehicleId = o\.vehicleId \? String\(o\.vehicleId\) : "";/.test(code));
  const sfo = between(code, "function sessionFromObject", "function importText");
  ok("it is read from there", /var raw = o\.rawVehicleId \|\| "";/.test(sfo));
  ok("the raw id is looked up", /if \(raw\) v = vehById\(raw\);/.test(sfo));
  ok("the name path is only for files with no id", /if \(!v && !raw\) v = vehicleForImport/.test(sfo));
  ok("an unresolvable id is refused, not invented", /if \(!v\) \{[\s\S]{0,120}?err\.noVehicle/.test(sfo));
});

group("a failed import destroys nothing", () => {
  /* Price, vehicles and favourites were written before the sessions were
     validated, so a file where every row failed still wiped the favourites list
     and left phantom vehicles in memory, while reporting "nothing imported". */
  const imp = between(code, "function importText", "function showImport");
  const bail = imp.indexOf("err.noneImported");
  const priceWrite = imp.indexOf("pendPrice !== null");
  ok("the price is committed after the bail-out", priceWrite > bail);
  ok("favourites are committed after the bail-out", imp.indexOf("if (pendFavs)") > bail);
  ok("vehicles are committed after the bail-out", imp.indexOf("pendVehAdds.length") > bail);
  ok("the pending values are collected, not applied", /var pendFavs = null;/.test(imp));
  /* Replacing favourites must replace their bin too, or loadFavs() re-reads the
     old one and a place ends up both live and binned. */
  ok("the favourites bin key is replaced as well", /localStorage\.setItem\(K\.bf, JSON\.stringify\(\[\]\)\);/.test(imp));
  /* The restore handler also accepts an Export JSON file, which has no
     favourites key at all; writing [] for a missing key wiped every saved
     charging location and every binned row, then synced the wipe. */
  ok(
    "a file without favourites cannot delete them",
    /if \(Array\.isArray\(d\.favourites\)\)\s*try \{[\s\S]{0,120}?localStorage\.setItem\(\s*K\.f,/.test(code),
  );
});

﻿group("an admin can edit a shared vehicle, but never reassign it", () => {
  const sql = readFileSync("supabase/04-roles.sql", "utf8");
  /* A with check only sees the NEW row, so `user_id = auth.uid()` there did not
     mean "the owner may not change" - it meant "only the owner may write at
     all". An admin editing somebody else's vehicle correctly leaves user_id as
     the owner's, so every admin edit was refused with 42501. The UI offers the
     control, so the rename saved, showed, and then offered to DISCARD the
     vehicle and all its sessions after three retries. */
  const pol = sql.slice(
    sql.indexOf('create policy "vehicles editable by owner or admin"'),
    sql.indexOf('create policy "vehicles removable by owner"'),
  );
  ok("the policy still admits rank >= 3", /using\s+\(public\.can_edit_vehicle\(id\)\)/.test(pol));
  ok("the policy does not pin the owner to the caller", !/with check[^;]*auth\.uid\(\)/.test(pol));
  /* Immutability has to move to a trigger: the only place the old row is still
     readable. */
  ok("there is an owner-immutability function", /create or replace function public\.vehicles_owner_is_immutable\(\)/.test(sql));
  ok(
    "it compares the new owner against the old one",
    /if new\.user_id is distinct from old\.user_id then[\s\S]{0,200}?raise exception/.test(sql),
  );
  ok("it reports a refusal the client already classifies", /errcode = '42501'/.test(sql));
  ok(
    "it is attached before update on vehicles",
    /create trigger vehicles_owner_immutable[\s\S]{0,60}?before update on public\.vehicles/.test(sql),
  );
  ok("attaching it is idempotent", /drop trigger if exists vehicles_owner_immutable/.test(sql));
  /* 05-trash.sql claimed the with check held because user_id never changes. True
     for the owner, false for the admin - which is the case that broke. */
  ok(
    "05-trash no longer asserts the old reasoning",
    !/with check still holds/i.test(readFileSync("supabase/05-trash.sql", "utf8")),
  );
});

group("a row the server has forgotten is not written as an update forever", () => {
  /* `confirmed` is a latch: set when a write succeeds, persisted with the row,
     and never cleared. A vehicle pushed once and later hard-deleted on the
     server - cleaned up by hand, or purged from another device - therefore kept
     taking the update path against a row that no longer existed: three retries,
     the red banner, and a Discard button that would have taken the vehicle and
     every session under it. Observed live: four rows reported `confirmed: yes`
     while a direct query for those ids returned no rows. */
  const sv = between(code, "function syncVehicle", "function syncSession");
  ok(
    "a 42501 on the update path is retried once as an insert",
    /!isCreate && !v\.confirmedRetry && e\.code === "42501"/.test(sv),
  );
  ok("the latch is cleared for that retry", /v\.confirmed = false;/.test(sv));
  ok(
    "the retry cannot recurse",
    /v\.confirmedRetry = true;[\s\S]{0,400}?return syncVehicle\(v\);/.test(sv),
  );
  ok(
    "the fallback runs before the row is reported as refused",
    /v\.confirmedRetry[\s\S]{0,700}?failPush\(/.test(sv),
  );
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
  /* buildStamp() is a date string compiled into the source, so it reads
     identically on every build and cannot tell a support report which code is
     actually running. Every fix ships with a VERSION bump precisely so that this
     can be verified. */
  const rep = between(code, "function diagnosticsReport", "function copyDiagnostics");
  ok("the report names the service worker version", /service worker: " \+ \(swVersionCache/.test(rep));
  ok(
    "the version is asked for before the text is built",
    /function copyDiagnostics\(\) \{[\s\S]{0,400}?askSwVersion\(\)[\s\S]{0,400}?copyText\(diagnosticsReport\(\)\)/.test(
      code,
    ),
  );
  /* Nothing else in the report names the account unless an error fired, so two
     accounts' wildly different row counts could not be told apart. */
  ok("the report names the signed-in account", /lines\.push\(\s*"account: " \+/.test(rep));
  /* askWhoAmI() runs once after sign-in and only fills whoAmI if it completed,
     so a clean report said "not probed" - which reads as a fault rather than a
     race. Priming it here makes the identity line trustworthy. */
  ok(
    "the identity probe is primed before the text is built",
    /function copyDiagnostics\(\) \{[\s\S]{0,600}?askWhoAmI\(\)[\s\S]{0,400}?copyText\(diagnosticsReport\(\)\)/.test(
      code,
    ),
  );
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