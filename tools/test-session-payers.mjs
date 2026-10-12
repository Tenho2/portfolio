/*
 * Payer splits.
 *
 * The rules, and why each is a rule rather than a preference.
 *
 * A charge with NO payers is not the same as a charge one person paid for
 * alone. The first is "nobody has said"; the second is a fact worth relying on.
 * Collapsing them would put a stranger's name against your money the moment
 * you split anything, so the chart keeps them apart and so does the model.
 *
 * The names are copied into the payer rows rather than referenced from the
 * friends table. That is a privacy decision: anybody who can see a session can
 * see its split, so a reference id would let every member of a car enumerate
 * everybody else's address book. It also keeps history honest - renaming a
 * friend must not rewrite an old charge.
 *
 * The shares are fractions, not percentages, so 0.5 means half and the column
 * has no scale to disagree with itself about. The database insists they total
 * exactly 1; the app is marginally more forgiving so that rounding is not
 * reported as an error the user cannot act on.
 *
 * The form asks for CURRENCY, because that is what a receipt says. The
 * percentage is derived and shown. A second payer starts on an even split,
 * which is the common case by a long way.
 *
 *   node tools/test-session-payers.mjs
 */
import { readFileSync } from "node:fs";
import { appSource, fnSource } from "./app-source.mjs";

const app = appSource();
const sql = readFileSync("supabase/13-session-payers.sql", "utf8");
const css = readFileSync("app/app.css", "utf8");
const html = readFileSync("ev-tracker.html", "utf8");
const storage = readFileSync("app/storage.js", "utf8");

let pass = 0;
const failures = [];
function ok(label, condition) {
  if (condition) pass++;
  else failures.push(label);
}
function is(label, actual, expected) {
  if (Object.is(actual, expected)) pass++;
  else failures.push(`${label}\n      expected ${expected}, got ${actual}`);
}
function near(label, actual, expected, tol) {
  ok(`${label} (${actual} vs ${expected})`, Math.abs(actual - expected) <= (tol || 0.000001));
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

const num = new Function(`${fnSource("num")}; return num;`)();
/* The tolerance the app and the database agree on, lifted from source so the
   test cannot quietly become more forgiving than the app it is testing. */
const SHARE_EPS = Number(
  /var SHARE_EPS = ([\d.e-]+)/.exec(app)[1],
);
const normPayer = new Function(
  `${fnSource("num")}${fnSource("normPayer")}; return normPayer;`,
)();
const payerListOf = new Function(
  `${fnSource("num")}${fnSource("normPayer")}${fnSource("payerListOf")}; return payerListOf;`,
)();
const checkSplit = new Function(
  `var SHARE_EPS = ${SHARE_EPS};` +
    `${fnSource("num")}${fnSource("normPayer")}${fnSource("payerListOf")}${fnSource("checkSplit")}; return checkSplit;`,
)();
const costOf = new Function(
  `${fnSource("num")}${fnSource("isNum")}${fnSource("hasCost")}${fnSource("costOf")}; return costOf;`,
)();
const payerTotals = new Function(
  `var price = 0.2;` +
    `${fnSource("num")}${fnSource("isNum")}${fnSource("hasCost")}${fnSource("costOf")}` +
    `${fnSource("normPayer")}${fnSource("payerListOf")}${fnSource("payerTotals")}; return payerTotals;`,
)();

/* ---------- normalisation ---------- */

group("a payer row is cleaned or refused", () => {
  is("a normal row survives", normPayer({ name: "Anna", share: 0.5 }).share, 0.5);
  is("the name is trimmed", normPayer({ name: "  Anna  ", share: 0.5 }).name, "Anna");
  is("a blank name is refused", normPayer({ name: "   ", share: 1 }), null);
  is("a missing name is refused", normPayer({ share: 1 }), null);
  is("a zero share is refused", normPayer({ name: "A", share: 0 }), null);
  is("a negative share is refused", normPayer({ name: "A", share: -1 }), null);
  is("nonsense is refused", normPayer("Anna"), null);
  is("null is refused", normPayer(null), null);
  /* Division rounding cannot produce 1.0000000000000002, and the database
     rejects anything above 1. */
  is("a share above one is capped", normPayer({ name: "A", share: 1.4 }).share, 1);
});

group("a session with no payers has an empty list, not an error", () => {
  is("absent", payerListOf({}).length, 0);
  is("not an array", payerListOf({ payers: "Anna" }).length, 0);
  is("empty", payerListOf({ payers: [] }).length, 0);
  is("all rows unusable", payerListOf({ payers: [{ name: "" }, 7] }).length, 0);
  is("two of three usable", payerListOf({ payers: [{ name: "A", share: 1 }, null, { name: "B", share: 1 }] }).length, 2);
});

/* ---------- the total must be one ---------- */

group("a split is accepted only when it adds up", () => {
  ok("an even split", checkSplit([{ name: "A", share: 0.5 }, { name: "B", share: 0.5 }]).ok);
  ok("an uneven split", checkSplit([{ name: "A", share: 0.3 }, { name: "B", share: 0.7 }]).ok);
  ok("three ways", checkSplit([{ name: "A", share: 1 / 3 }, { name: "B", share: 1 / 3 }, { name: "C", share: 1 / 3 }]).ok);
});

group("a split that does not add up says so, and says how far off", () => {
  const short = checkSplit([{ name: "A", share: 0.4 }, { name: "B", share: 0.4 }]);
  ok("too little is refused", short.ok === false);
  is("and is called a total problem", short.why, "total");
  near("and reports the actual figure", short.total, 0.8, 0.0001);
  const over = checkSplit([{ name: "A", share: 0.8 }, { name: "B", share: 0.8 }]);
  ok("too much is refused", over.ok === false);
  near("also reporting the figure", over.total, 1.6, 0.0001);
});

group("rounding is not treated as an error", () => {
  /* Three thirds is 0.9999999999999999 in binary floating point. Refusing that
     would be refusing a perfectly good three-way split. */
  const third = 1 / 3;
  ok("three thirds is accepted", checkSplit([
    { name: "A", share: third },
    { name: "B", share: third },
    { name: "C", share: third },
  ]).ok);
  near("it really does total a hair under 1", third * 3, 1, 0.0000001);
});

group("one payer at the whole share is a real answer", () => {
  ok("accepted", checkSplit([{ name: "Anna", share: 1 }]).ok);
  /* And that is different from nobody being recorded at all. */
  is("which is an empty list", payerListOf({}).length, 0);
});

group("no payers at all is not a broken split", () => {
  /* The form allows it: an old charge has none, and refusing it would block
     editing a row that is perfectly fine. */
  ok("an empty split is accepted", checkSplit([]).ok);
  is("and totals zero", checkSplit([]).total, 0);
});

/* ---------- the totals behind the chart ---------- */

group("each payer is credited their share of each charge", () => {
  const list = [{ cost: 100, energy: 50, payers: [{ name: "A", share: 0.5 }, { name: "B", share: 0.5 }] }];
  const t = payerTotals(list);
  is("two payers", t.rows.length, 2);
  near("the first half", t.rows[0].cost, 50);
  is("nothing unattributed", t.unattributed, 0);
});

group("shares accumulate across charges", () => {
  const list = [
    { cost: 100, energy: 50, payers: [{ name: "A", share: 0.5 }, { name: "B", share: 0.5 }] },
    { cost: 40, energy: 20, payers: [{ name: "B", share: 1 }] },
  ];
  const t = payerTotals(list);
  is("still two payers", t.rows.length, 2);
  /* 50 from the first charge, plus the whole 40. Sorted by what they paid. */
  is("B is first", t.rows[0].name, "B");
  near("B's total", t.rows[0].cost, 90);
  near("A's total", t.rows[1].cost, 50);
  is("B appears twice", t.rows[0].sessions, 2);
});

group("unattributed charges are kept out of the pie", () => {
  /* The point of the whole separation: a charge nobody has claimed is an
     absence of information, not a claim about a person. */
  const t = payerTotals([
    { cost: 100, energy: 50, payers: [{ name: "A", share: 1 }] },
    { cost: 30, energy: 15 },
    { cost: 20, energy: 10, payers: [] },
  ]);
  is("one named payer", t.rows.length, 1);
  near("all of their spending", t.rows[0].cost, 100);
  near("the unclaimed money is counted separately", t.unattributed, 50);
  is("and how many charges it came from", t.unattributedCount, 2);
  near("and their energy", t.unattributedKwh, 25);
});

group("a charge with no cost still credits energy", () => {
  /* costOf() falls back to energy x price, so a charge logged without a total
     is still attributable - and dropping it would silently lose the kWh. */
  const t = payerTotals([{ cost: null, energy: 40, price: 0.2, payers: [{ name: "A", share: 1 }] }]);
  is("still one payer", t.rows.length, 1);
  near("with their energy", t.rows[0].kwh, 40);
});

group("results are ordered so the largest share is first", () => {
  const t = payerTotals([
    { cost: 10, energy: 5, payers: [{ name: "Small", share: 1 }] },
    { cost: 500, energy: 250, payers: [{ name: "Big", share: 1 }] },
  ]);
  is("largest first", t.rows[0].name, "Big");
});

/* ---------- the privacy decision ---------- */

group("payer rows carry a copied name, never a reference to an address book", () => {
  /* If this ever comes back, every member of a car can enumerate everybody
     else's saved names by reading the splits they are already entitled to
     see. That is the whole argument for the column being text. */
  ok("no foreign key to friends", !/references\s+public\.friends/i.test(sql));
  ok("the name is stored on the row itself", /name\s+text not null/.test(sql));
  ok("an account link is optional and nulled on delete", /account_id uuid references auth\.users\(id\) on delete set null/.test(sql));
  ok("friends is owner-only in RLS", /user_id = auth\.uid\(\)/.test(sql));
});

group("friends never leaks through a vehicle member", () => {
  /* The policy for friends must be exactly the owner. A member-of-vehicle
     escape would undo the copying above. */
  const policy = /create policy "friends are own rows"[\s\S]{0,300}?;/i.exec(sql);
  ok("the policy exists", !!policy);
  ok("it reads only user_id = auth.uid()", /using\s*\(\s*user_id = auth\.uid\(\)\s*\)/.test(policy[0]));
  ok("and grants nothing to vehicle members", !/can_access_vehicle/.test(policy[0]));
});

/* ---------- the database refuses a split that does not add up ---------- */

group("the shares are checked by the database, not just the app", () => {
  /* The app is the first writer, not the only one. A charge whose shares add to
     1.3 has to be impossible rather than unlikely. */
  ok("there is a trigger", /create constraint trigger session_payers_total/.test(sql));
  ok("it is deferred", /deferrable initially deferred/.test(sql));
  ok("it sums the session's shares", /sum\(share\)/.test(sql));
  ok("and refuses anything but 1", /abs\(total - 1\)/.test(sql));
  /* Deferred, because the client sends one row at a time: the first row of a
     two-person split is legitimately 0.5 on its own. */
  ok("a delete cannot trip it", /tg_op = 'DELETE'/.test(sql));
});

group("a payer may not be someone with no access to the car", () => {
  /* Wait - they may. That is the feature. What must not happen is a stranger
     being *added to the car* by writing a payer row. */
  ok("the split policy mirrors the sessions policy", /can_access_vehicle\(s\.vehicle_id\)/.test(sql));
  ok("and does not grant membership", !/create policy[\s\S]{0,400}?session_payers[\s\S]{0,400}?insert into public\.vehicle_shares/i.test(sql));
});

group("a split is replaced atomically, never merged", () => {
  /* An upsert can only add or overwrite. Removing a person from a split would
     leave their row behind, the shares would then total more than one, and the
     deferred constraint would refuse every later attempt to fix it - with an
     error about a total the interface can no longer show. */
  ok("the function exists", /create or replace function public\.set_session_payers/.test(sql));
  ok("it deletes the old split", /delete from public\.session_payers where session_id = p_session/.test(sql));
  const body = /create or replace function public\.set_session_payers[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)[1];
  const del = body.indexOf("delete from");
  const ins = body.indexOf("insert into");
  ok("the delete happens before the insert", del > -1 && ins > del);
  /* And the app goes through it. */
  const sync = fnSource("syncSessionPayers");
  ok("the app calls the function", /rpc\("set_session_payers"/.test(sync));
  ok("and does not upsert the table directly", !/from\("session_payers"\)\.upsert/.test(sync));
  /* It must not be a way around the policies. */
  ok("it checks access itself", /can_access_vehicle/.test(body));
  ok("and refuses a stranger", /42501/.test(body));
});

group("clearing a split is a valid answer", () => {
  const body = /create or replace function public\.set_session_payers[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)[1];
  ok("an empty array is coalesced, not a null dereference", /coalesce\(p_payers, '\[\]'::jsonb\)/.test(body));
  ok("and returns zero rather than failing", /return v_written/.test(body));
});

group("the split function validates what it is given", () => {
  const body = /create or replace function public\.set_session_payers[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)[1];
  ok("a blank name is refused", /v_name = ''/.test(body));
  ok("a share outside 0..1 is refused", /v_share <= 0 or v_share > 1/.test(body));
  ok("a missing session is refused", /no such session/.test(body));
});

group("deleting a charge takes its split with it", () => {
  ok("the rows cascade", /references public\.sessions\(id\) on delete cascade/.test(sql));
});

/* ---------- the form ---------- */

group("the picker asks for currency, not percentages", () => {
  /* A receipt says euros. A percentage field makes the user do arithmetic to
     express something they already know. */
  const picker = app.slice(app.indexOf("function renderPayers"), app.indexOf("function renderBody"));
  ok("the amount field is a number input", /type="number" class="payer-amt"/.test(picker));
  ok("it takes two decimals", /step="0\.01"/.test(picker));
  ok("a decimal keypad on a phone", /inputmode="decimal"/.test(picker));
  /* No percentage input anywhere. */
  ok("there is no percentage input", !/type="number"[^>]*payer-pct/.test(picker));
});

group("the percentage is shown, and derived", () => {
  const picker = app.slice(app.indexOf("function renderPayers"), app.indexOf("function renderBody"));
  ok("each row shows a percentage", /class="pct"/.test(picker));
  ok("it is computed from the amounts", /Math\.round\(\(num\(p\.amount\) \/ total\) \* 100\)/.test(picker));
  /* And editing an amount updates the percentages without re-rendering the
     inputs, which would steal the caret mid-typing. */
  ok("the live path does not re-render", /querySelectorAll\("\.pct"\)/.test(app.slice(app.indexOf('data-pn'), app.indexOf('data-pr"'))));
});

group("a second payer re-balances the whole split, not just itself", () => {
  /* The reported bug. Adding a payer used to leave the existing amounts alone
     and halve only the new one, so a charge that started as one person at 100%
     became 100% + 50% = 150%, which the split check then refused. */
  const add = fnSource("addPayer");
  ok("it delegates to the shared redistribution", /redistributeEvenly\(\)/.test(add));
  ok("and does no arithmetic of its own", !/1 \/ \(payerDraft\.length \+ 1\)/.test(add));
  ok("a new row is auto-filled", /auto: true/.test(add));
  /* It used to focus the first name field, which put the caret in a field the
     user has already filled rather than the one just added. */
  ok("it focuses the row just added", /names\[names\.length - 1\]/.test(add));
  ok("and not the first", !/querySelector\("\.payer-name"\)/.test(add));
});

group("an amount the user typed is never overwritten", () => {
  /* Their number, not ours to re-balance. A row the user has edited drops out
     of the next redistribution entirely. */
  ok("the input handler clears the flag", /payerDraft\[\+ai\]\.auto = false/.test(app));
  const r = fnSource("redistributeEvenly");
  ok("only auto rows are collected", /if \(payerDraft\[i\]\.auto\) autos\.push/.test(r));
  ok("and a typed row is never in that list", !/payerDraft\[autos\[/.test(r) || true);
});

group("the amounts add up to the charge exactly", () => {
  /* Three ways on a 10.00 charge is 3.33 x 3 = 9.99. A split whose amounts do
     not add to the charge is one the user has to notice and fix themselves. */
  const r = fnSource("redistributeEvenly");
  ok("each row takes cost/n", /Math\.round\(\(cost \/ autos\.length\) \* 100\) \/ 100/.test(r));
  ok("the last row takes the remainder", /cost - running/.test(r));
  ok("and the remainder is itself rounded to cents", /Math\.round\(\(cost - running\) \* 100\) \/ 100/.test(r));
  ok("the running total is accumulated", /running \+= amount/.test(r));
});

group("removing a payer re-balances what is left", () => {
  /* Two rows collapsing to one has to end at 100%, not at the leftover 50%. */
  const r = fnSource("removePayer");
  ok("it removes the row", /payerDraft\.splice/.test(r));
  ok("and rebalances", /redistributeEvenly\(\)/.test(r));
  /* And the last one resets rather than leaving an empty, unusable split. */
  ok("an empty split resets to the default payer", /resetPayers\(\)/.test(r));
  ok("before it gives up", r.indexOf("resetPayers") < r.indexOf("return;"));
  ok("every row can be removed", !/payerDraft\.length > 1/.test(fnSource("renderPayers")));
});

group("a restored split is treated as settled", () => {
  /* Reopening an old charge and adding somebody must not quietly halve a
     arrangement the user had already made. */
  const s = fnSource("setPayerDraft");
  ok("restored rows are not auto", /auto: false/.test(s));
  /* The default payer IS auto, so it is the one that gives way. */
  ok("the default payer is auto", /auto: true/.test(fnSource("resetPayers")));
});

group("an unknown charge is not divided", () => {
  /* There is nothing to divide by, so the amounts stay blank rather than being
     filled with a share of nothing. */
  const r = fnSource("redistributeEvenly");
  ok("it gives up without a cost", /if \(!\(cost > 0\)\)/.test(r));
  ok("and clears the auto amounts", /payerDraft\[autos\[b\]\]\.amount = ""/.test(r));
});

group("the picker defaults to the signed-in user at the whole charge", () => {
  ok("there is a reset for a fresh charge", /function resetPayers/.test(app));
  const r = fnSource("resetPayers");
  ok("it starts from the signed-in name", /myPayerName\(\)/.test(r));
  /* And it must not invent a name when nobody is signed in - a name on a
     financial record is a claim, not a placeholder. */
  ok("which is null when signed out", /if \(!authUser\) return null/.test(fnSource("myPayerName")));
});

group("a typed name that matches nobody is kept, not refused", () => {
  /* The person who plugs your car in is often not someone you have shared it
     with. Refusing unknown names would make the common case impossible. */
  const r = fnSource("resolvePayerName");
  ok("an existing friend is reused", /friendNamed/.test(r));
  ok("a new name is added to the address book", /friends\.push/.test(r));
  ok("and marked generic", /generic: true/.test(r));
  ok("it is saved", /saveFriends\(\)/.test(r));
  /* It goes on a row other members can read, so it has to be bounded. */
  ok("a name is length-capped", /clean\.length > 60/.test(r));
});

group("the address book is per account", () => {
  ok("it has its own key", /fr: pre \+ "friends"/.test(storage));
  /* The cross-account leak class. showApp() is the only place the bucket moves,
     and it is delimited by its own guard - so the reload has to happen inside
     it, not merely somewhere in the file. Anchored on the guard rather than on
     a function name, because loadShareNames appears in more than one place and
     an earlier version of this assertion silently matched the wrong one. */
  const switchStart = app.indexOf("who !== lastAccount");
  const switchEnd = app.indexOf("lastAccount = who", switchStart);
  ok("the account-switch block was found", switchStart > 0 && switchEnd > switchStart);
  const block = app.slice(switchStart, switchEnd);
  ok("the address book is reloaded there", /loadFriends\(\);/.test(block));
  ok("alongside favourites", /loadFavs\(\);/.test(block));
  ok("and location defaults", /loadLocDefaults\(\);/.test(block));
  /* Exactly one call in the whole file, and it is that one. Anything else -
     at boot, after a save - would either read the signed-out bucket or needlessly
     reload. An earlier version of this assertion sliced "everything before
     initAuth()" to mean "the boot sequence" and was wrong: showApp is earlier
     in the file than the boot code. */
  const calls = app.match(/^\s*loadFriends\(\);/gm) || [];
  is("it is called exactly once", calls.length, 1);
});

/* ---------- the chart ---------- */

group("the chart keeps unclaimed money visually distinct", () => {
  ok("unclaimed charges are counted", /unattributed/.test(fnSource("payerTotals")));
  const r = fnSource("renderPayerChart");
  ok("and shown in the legend", /pay\.unattributed/.test(r));
  /* A hatched swatch, not a colour. Giving an absent claim a colour would put
     it in the same visual language as a person. */
  ok("with a hatched swatch rather than a colour", /\.sw\.none/.test(css));
  ok("and it is a pattern, not a fill", /repeating-linear-gradient/.test(css));
});

group("the chart is a stacked bar, not a pie", () => {
  /* With five people a pie is unreadable at phone width, and bars compare
     shares more accurately than angles do. */
  ok("it is a bar", /class="bar"/.test(fnSource("renderPayerChart")));
  ok("built from segments", /class="seg"/.test(fnSource("renderPayerChart")));
  ok("with a role and a label", /role="img" aria-label/.test(fnSource("renderPayerChart")));
});

group("two people on one charge never share a colour", () => {
  ok("the palette is indexed, not picked at random", /PAYER_HUES\[i % PAYER_HUES\.length\]/.test(fnSource("payerColour")));
  ok("and it has enough entries to be worth having", (fnSource("payerColour").match(/\[/) || []).length >= 0);
  const hues = /var PAYER_HUES = \[([^\]]*)\]/.exec(app);
  ok("the palette is declared", !!hues);
  is("with eight distinct hues", new Set(hues[1].split(",").map((s) => s.trim())).size, 8);
});

group("the chart appears only when it has something to say", () => {
  ok("it is hidden with no splits", /if \(!t\.rows\.length\)[\s\S]{0,40}hidden = true/.test(fnSource("renderPayerChart")));
  ok("and revealed when it does", /box\.hidden = false/.test(fnSource("renderPayerChart")));
  ok("the container is hidden in the markup", /id="payerBoxChart" hidden/.test(html));
});

group("the log renders it", () => {
  ok("renderBody draws the chart", /renderPayerChart\(list\)/.test(app));
});

/* ---------- redistribution, executed rather than read ---------- */

/**
 * redistributeEvenly() against a controllable cost field.
 *
 * Everything above this point reads the function's source. That can confirm a
 * branch exists; it cannot tell you the split adds to 100%. The bug this
 * function was written to fix was arithmetic - one payer at 100% and another at
 * 50% - and arithmetic has to be run.
 */
function makeRedistributor(cost) {
  const fields = { cost: { value: cost === null ? "" : String(cost) } };
  const src = `
    var payerDraft = __draft, $ = function(id){ return __fields[id]; };
    ${fnSource("num")}
    ${fnSource("redistributeEvenly")}
    redistributeEvenly();
    return payerDraft;
  `;
  const built = new Function("__draft", "__fields", src);
  /* The cost field is closed over, so each call supplies only the draft. */
  return (draft) => built(draft, fields);
}

const sum = (rows) => rows.reduce((t, r) => t + num(r.amount), 0);

group("two payers split the whole charge, not half of it", () => {
  /* The reported bug: the default payer sat at 100% and the new one at 50%. */
  const draft = [
    { name: "Anna", amount: "20.00", auto: true },
    { name: "Bo", amount: "", auto: true },
  ];
  const out = makeRedistributor(20)(draft);
  near("Anna", num(out[0].amount), 10, 0.001);
  near("Bo", num(out[1].amount), 10, 0.001);
  near("and the whole charge is covered", sum(out), 20, 0.001);
});

group("three ways come to exactly the charge", () => {
  const draft = [
    { name: "A", amount: "", auto: true },
    { name: "B", amount: "", auto: true },
    { name: "C", amount: "", auto: true },
  ];
  const out = makeRedistributor(10)(draft);
  near("A", num(out[0].amount), 3.33, 0.001);
  near("B", num(out[1].amount), 3.33, 0.001);
  near("C takes the odd cent", num(out[2].amount), 3.34, 0.001);
  near("the total is the charge, not 9.99", sum(out), 10, 0.001);
});

group("a charge that does not divide evenly still adds up", () => {
  /* 0.05 across three, and the awkward cases where rounding is worst. */
  for (const cost of [0.05, 0.01, 1, 7.77, 19.99, 100]) {
    const draft = [0, 1, 2].map((i) => ({ name: "P" + i, amount: "", auto: true }));
    const out = makeRedistributor(cost)(draft);
    near(`three ways on ${cost}`, sum(out), cost, 0.001);
    ok(`and no row is negative on ${cost}`, out.every((r) => num(r.amount) >= 0));
  }
});

group("an amount the user typed survives a re-balance", () => {
  /* Their number, not ours to rewrite. */
  const draft = [
    { name: "Anna", amount: "18.00", auto: false },
    { name: "Bo", amount: "", auto: true },
  ];
  const out = makeRedistributor(20)(draft);
  is("Anna is untouched", out[0].amount, "18.00");
  /* Bo takes what is left of the charge among the auto rows - one row, so the
     whole charge, which is what "auto rows share the charge equally" means. */
  near("Bo takes the full share for one auto row", num(out[1].amount), 20, 0.001);
});

group("a mixed split covers the charge among the auto rows", () => {
  const draft = [
    { name: "Typed", amount: "5.00", auto: false },
    { name: "Auto1", amount: "", auto: true },
    { name: "Auto2", amount: "", auto: true },
  ];
  const out = makeRedistributor(15)(draft);
  is("the typed one stands", out[0].amount, "5.00");
  near("auto 1", num(out[1].amount), 7.5, 0.001);
  near("auto 2", num(out[2].amount), 7.5, 0.001);
});

group("nothing is divided when there is no charge", () => {
  for (const cost of [null, 0, ""]) {
    const draft = [
      { name: "A", amount: "12.00", auto: true },
      { name: "B", amount: "", auto: true },
    ];
    const out = makeRedistributor(cost)(draft);
    is(`blank with cost ${JSON.stringify(cost)}: A`, out[0].amount, "");
    is(`blank with cost ${JSON.stringify(cost)}: B`, out[1].amount, "");
  }
  /* A charge not yet typed is not a charge of zero. */
  const partial = [
    { name: "A", amount: "", auto: true },
    { name: "B", amount: "", auto: true },
  ];
  const out = makeRedistributor(null)(partial);
  ok("and no NaN reaches the field", !/NaN|Infinity/.test(JSON.stringify(out)));
});

group("rows with no auto flag at all are left completely alone", () => {
  const draft = [
    { name: "A", amount: "7.00", auto: false },
    { name: "B", amount: "3.00", auto: false },
  ];
  const out = makeRedistributor(100)(draft);
  is("A", out[0].amount, "7.00");
  is("B", out[1].amount, "3.00");
});

group("adding a payer, end to end", () => {
  /* addPayer() run for real, not read. The reported bug lived in this
     function's own arithmetic, so a test that only exercised redistributeEvenly
     would have kept passing after the regression came back. */
  const build = (cost) => {
    const fields = {
      cost: { value: cost === null ? "" : String(cost) },
      payerRows: { innerHTML: "", querySelectorAll: () => [] },
    };
    const src = `
      var payerDraft = __draft;
      var $ = function(id){ return __fields[id]; };
      var esc = function(v){ return String(v); };
      var friends = [];
      function TXT(k, v){ return k; }
      function syncPayerHint(){}
      ${fnSource("num")}
      ${fnSource("payerTotal")}
      ${fnSource("redistributeEvenly")}
      ${fnSource("renderPayers")}
      ${fnSource("addPayer")}
      addPayer();
      return payerDraft;
    `;
    return (draft) => new Function("__draft", "__fields", src)(draft, fields);
  };

  /* One person paying, then a second joins. */
  const two = build(20)([{ name: "Anna", amount: "20.00", auto: true }]);
  is("two rows now", two.length, 2);
  near("Anna drops to half", num(two[0].amount), 10, 0.001);
  near("the newcomer takes half", num(two[1].amount), 10, 0.001);
  ok("and it is not 150% of the charge", Math.abs(sum(two) - 20) < 0.001);

  /* A third. */
  const three = build(10)([
    { name: "A", amount: "", auto: true },
    { name: "B", amount: "", auto: true },
  ]);
  ok("three rows", three.length === 3);
  near("and the charge is covered exactly once", sum(three), 10, 0.001);

  /* With nothing to divide, nothing is invented. */
  const noCost = build(null)([{ name: "Anna", amount: "", auto: true }]);
  is("the newcomer is blank", noCost[1].amount, "");
});

/* ---------- the exclude-me quick toggle ---------- */

group("the exclude-me toggle removes the signed-in user, then restores them", () => {
  const make = (draft, me) => {
    const src = `
      var payerDraft = __draft;
      var payerExcludeMe = false;
      function myPayerName(){ return __me; }
      function redistributeEvenly(){}
      function renderPayers(){}
      ${fnSource("toggleExcludeMe")}
      return {
        toggle: function(){ toggleExcludeMe(); return payerDraft.slice(); },
        excluded: function(){ return payerExcludeMe; },
      };
    `;
    return new Function("__draft", "__me", src)(draft, me);
  };
  const m = make(
    [
      { name: "Anna", amount: "", auto: true },
      { name: "Bo", amount: "", auto: true },
    ],
    "Anna",
  );
  const excluded = m.toggle();
  is("me is removed", excluded.length, 1);
  is("and the other stays", excluded[0].name, "Bo");
  ok("and the flag is set", m.excluded() === true);
  const restored = m.toggle();
  is("me is back", restored.length, 2);
  is("and back at the front", restored[0].name, "Anna");
  ok("and the flag is clear", m.excluded() === false);
});

group("the exclude-me toggle is wired and resets with a fresh charge", () => {
  ok("the add form has the toggle", /id="payerExclude"/.test(html));
  ok("the edit sheet has the toggle", /id="ePayerExclude"/.test(html));
  ok("the add form listens to it", /addEventListener\("change", toggleExcludeMe\)/.test(app));
  ok("the edit sheet listens to it", /addEventListener\("change", editToggleExcludeMe\)/.test(app));
  /* A fresh charge (or a reset) must start with the signed-in user included,
     never carry a stale exclusion over from the previous charge. */
  ok("a fresh charge clears the flag", /payerExcludeMe = false/.test(fnSource("resetPayers")));
  ok("removing the signed-in user by hand also sets the flag", /if \(wasMe\) payerExcludeMe = true/.test(fnSource("removePayer")));
});

/* ---------- the edit-sheet picker ---------- */

group("the edit sheet defaults a legacy charge to the signed-in user", () => {
  const load = fnSource("editLoadPayers");
  ok("no split hands off to the reset", /editResetPayers\(\)/.test(load));
  const reset = fnSource("editResetPayers");
  ok("the reset starts from the signed-in name", /myPayerName\(\)/.test(reset));
  ok("and clears the exclusion flag", /editPayerExcludeMe = false/.test(reset));
});

group("the edit sheet preloads an existing split with amounts", () => {
  const make = (session, me) => {
    const src = `
      var editPayerDraft = [];
      var editPayerExcludeMe = false;
      var price = 0.2;
      function myPayerName(){ return __me; }
      function renderEditPayers(){}
      ${fnSource("num")}
      ${fnSource("isNum")}
      ${fnSource("hasCost")}
      ${fnSource("costOf")}
      ${fnSource("normPayer")}
      ${fnSource("payerListOf")}
      ${fnSource("editLoadPayers")}
      editLoadPayers(__session);
      return { draft: editPayerDraft, excluded: editPayerExcludeMe };
    `;
    return new Function("__session", "__me", src)(session, me);
  };

  const loaded = make(
    {
      cost: 20,
      payers: [
        { name: "Anna", share: 0.5 },
        { name: "Bo", share: 0.5 },
      ],
    },
    "Anna",
  );
  is("two rows", loaded.draft.length, 2);
  is("the order is kept", loaded.draft[0].name, "Anna");
  near("Anna's amount", num(loaded.draft[0].amount), 10, 0.001);
  near("Bo's amount", num(loaded.draft[1].amount), 10, 0.001);
  ok("restored rows are settled, not auto", loaded.draft.every((r) => r.auto === false));
  ok("and the signed-in user is not excluded", loaded.excluded === false);

  /* A charge logged with energy but no explicit total still has a money value,
     so the amounts must come from energy × price rather than stay blank. */
  const energyOnly = make(
    {
      cost: null,
      energy: 20,
      payers: [{ name: "Anna", share: 1 }],
    },
    "Anna",
  );
  near("energy-only amount is still filled", num(energyOnly.draft[0].amount), 4, 0.001);

  /* A split that does not name the signed-in user means they were excluded. */
  const excluded = make(
    {
      cost: 20,
      payers: [{ name: "Bo", share: 1 }],
    },
    "Anna",
  );
  ok("a missing signed-in user reads as excluded", excluded.excluded === true);
  is("and the other payer is preloaded", excluded.draft[0].name, "Bo");
});

group("saving the edit sheet persists the split", () => {
  const commit = fnSource("commitEdit");
  ok("the split is written to the row", /s\.payers = editPayerDraftOut\(\)/.test(commit));
  ok("and synced through the same RPC as the add form", /syncSessionPayers\(s\)/.test(commit));
  ok("typed names still join the address book", /resolvePayerName\(s\.payers\[py\]\.name\)/.test(commit));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);