/*
 * The mileage sanity check.
 *
 * The rule being tested, and why it is not the obvious one:
 *
 *   An odometer only ever counts up. So a session dated AFTER another, with a
 *   LOWER reading, is almost always a typo. But the comparison cannot be against
 *   the highest reading on record, because that forbids backfilling: a session
 *   you forgot to log last week would be permanently unloggable, since its
 *   reading is lower than the one you reached this week. The user would have to
 *   edit today's row instead of filling in the gap.
 *
 *   So the floor is the highest reading among sessions dated STRICTLY EARLIER
 *   than this one. That is exactly where the mistake shows up - 9 Oct at 1,000
 *   km, then 10 Oct at 100 km - and backfilling into a genuine gap stays free.
 *
 * It warns rather than refuses. The dialog offers three answers, and the promise
 * resolves with distinct values: true (used the previous reading), the string
 * "alt" (kept the value), false (cancelled). The string is deliberate: any
 * object would read as "yes" to the older two-button callers, which test
 * truthiness, so they would silently start saving on a cancel.
 *
 *   node tools/test-mileage.mjs
 */
import { readFileSync } from "node:fs";
import { appSource, fnSource } from "./app-source.mjs";

const html = readFileSync("ev-tracker.html", "utf8");

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
/* Async-aware on purpose. An earlier version of this suite had a synchronous
   `group()`, so every async body ran detached from the tally: the report said
   15 passed while ~45 assertions had actually been made, and any failure inside
   an async group was printed as a pass because the count was already taken.
   Awaiting here is what makes the total trustworthy. */
async function group(name, fn) {
  const before = failures.length;
  await fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

const VEH = "v1";
const OTHER = "v2";

/** Sessions under test. Order is irrelevant; the function must sort by date. */
function makeState(sessions, vehicles) {
  return { sessions, vehicles };
}

/* Build the real functions against a stub of the app's globals. `num` and
   `validDate` are the app's own, pulled from source, so a change to either is a
   change to what is being tested rather than a silent divergence. */
function build(overrides = {}) {
  const state = overrides.state || makeState([], []);
  const asked = [];
  const askConfirm = (message, opts) => {
    asked.push({ message, opts });
    return Promise.resolve(overrides.answer);
  };
  const toast = (t) => {
    state.toasts = (state.toasts || []).concat([t]);
  };
  const TXT = (k, vars) => (vars ? `${k}:${JSON.stringify(vars)}` : k);
  const num = (v) => {
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  };
  const isNum = (v) => v !== "" && v !== null && v !== undefined && isFinite(+v);
  const pad = (n) => String(n).padStart(2, "0");
  /* validDate uses the app's pad(), so it is compiled alongside it rather than
     closed over - otherwise the stub and the real function could differ. */
  const validDate = new Function(
    ["pad"],
    `${fnSource("pad")}\n${fnSource("validDate")}\nreturn validDate;`,
  )(pad);
  /* veh() is the whole form's context in the app. Only its id matters here. */
  const veh = () => state.vehicles.find((v) => v.id === (overrides.selected || VEH)) || null;
  const factory = new Function(
    [
      "state",
      "asked",
      "askConfirm",
      "toast",
      "TXT",
      "num",
      "isNum",
      "pad",
      "validDate",
      "LOCALE",
      "veh",
    ],
    [
      fnSource("confirmMileage"),
      fnSource("mileageFloor"),
      `let sessions = state.sessions;
       let vehicles = state.vehicles;
       let editId = null;
       return { confirmMileage, mileageFloor };`,
    ].join("\n"),
  );
  const api = factory(state, asked, askConfirm, toast, TXT, num, isNum, pad, validDate, "en-GB", veh);
  return { ...api, asked, state, toast, TXT, num, validDate };
}

/** A minimal field bag, shaped like the real one. */
function fields(mileage, date) {
  return {
    mileage: { value: mileage },
    date: { value: date },
    location: { value: "" },
    energy: { value: "" },
    cost: { value: "" },
    socStart: { value: "" },
    socEnd: { value: "" },
    notes: { value: "" },
    fav: { checked: false, value: "" },
    favName: { value: "" },
    fast: { checked: false },
    home: { checked: false },
    reset() {},
  };
}

const HISTORY = [
  { id: "s1", vehicleId: VEH, date: "2026-10-01", mileage: 80000, deletedAt: null },
  { id: "s2", vehicleId: VEH, date: "2026-10-09", mileage: 100000, deletedAt: null },
  { id: "s3", vehicleId: VEH, date: "2026-10-10", mileage: 100100, deletedAt: null },
];

await group("the floor is the highest EARLIER reading, not the highest overall", () => {
  /* The case that matters: logging the 10th while the 12th already exists. A
     global maximum would demand more than 102,000 and refuse a session that is
     in fact correct - the 10th sits between the 9th and the 12th. */
  const { mileageFloor } = build({
    state: makeState(HISTORY.concat([{ id: "s4", vehicleId: VEH, date: "2026-10-12", mileage: 102000, deletedAt: null }]), [{ id: VEH, initialOdometer: 0 }]),
  });
  const floor = mileageFloor(VEH, "2026-10-10");
  is("the 12th session does not constrain the 10th", floor.value, 100000);
  is("the label names the session it came from", floor.label, "2026-10-09");

  /* The 10th's own row is on the same date, so it is not its own floor either:
     the 9th at 100,000 is the last reading before it. */
  is("a row does not bound itself", mileageFloor(VEH, "2026-10-11").value, 100100);

  /* Backfilling before all of them: nothing earlier exists. */
  const early = mileageFloor(VEH, "2026-09-01");
  is("nothing to compare against means zero", early.value, 0);
  /* The label is the sentence's "recorded on {v}". An empty one rendered as
     "…is lower than the 50 000 km recorded on ." */
  ok("and it still names where the floor came from", !!early.label);
});

await group("same-day and undated rows do not raise the floor", () => {
  const sameDay = [
    { id: "a", vehicleId: VEH, date: "2026-10-10", mileage: 150000, deletedAt: null },
  ];
  const { mileageFloor } = build({
    state: makeState(sameDay.concat(HISTORY), [{ id: VEH, initialOdometer: 0 }]),
  });
  /* 150,000 on the same date may simply be the later charge that day. Refusing
     it would punish a perfectly ordinary pair of sessions. */
  is("a same-day reading is excluded", mileageFloor(VEH, "2026-10-10").value, 100000);

  /* An imported row with no date cannot be shown to predate anything, so it
     must not become the floor. This one was a real bug: it let a date-less
     import outrank every genuine reading. */
  const undated = [{ id: "u", vehicleId: VEH, date: "", mileage: 999000, deletedAt: null }];
  const u = build({ state: makeState(undated, [{ id: VEH, initialOdometer: 0 }]) });
  is("an undated reading is excluded", u.mileageFloor(VEH, "2026-10-10").value, 0);

  /* And when the session being entered is itself undated there is no ordering
     to appeal to at all. */
  is("an undated session has no floor either", u.mileageFloor(VEH, "").value, 0);
});

await group("other vehicles, deleted rows and empty readings are not floors", () => {
  const s = [
    { id: "mine", vehicleId: VEH, date: "2026-10-01", mileage: 1000, deletedAt: null },
    { id: "theirs", vehicleId: OTHER, date: "2026-10-01", mileage: 900000, deletedAt: null },
    { id: "gone", vehicleId: VEH, date: "2026-10-02", mileage: 888888, deletedAt: 123 },
    { id: "blank", vehicleId: VEH, date: "2026-10-02", mileage: null, deletedAt: null },
    { id: "zero", vehicleId: VEH, date: "2026-10-02", mileage: 0, deletedAt: null },
  ];
  const { mileageFloor } = build({ state: makeState(s, [{ id: VEH, initialOdometer: 0 }, { id: OTHER, initialOdometer: 0 }]) });
  const floor = mileageFloor(VEH, "2026-10-05");
  is("only this vehicle's own rows count", floor.value, 1000);
  /* 888888 was in the bin, and 0 means "never written down", not "brand new". */
  ok("a deleted row is not a floor", floor.value !== 888888);
});

await group("the vehicle's starting odometer is a floor in its own right", () => {
  const { mileageFloor } = build({
    state: makeState([], [{ id: VEH, initialOdometer: 45000 }]),
  });
  const floor = mileageFloor(VEH, "2026-10-10");
  is("the starting reading is used", floor.value, 45000);
  /* It has no date, so the label must describe the source rather than be
     empty - the dialog interpolates it into "recorded on {v}". */
  ok("and the label names the source", !!floor.label);
  ok("and mentions the starting reading", /start|alku|startmätar/i.test(floor.label));

  /* A real earlier charge above the start wins, because it is higher. */
  const later = build({
    state: makeState([{ id: "s", vehicleId: VEH, date: "2026-10-01", mileage: 50000, deletedAt: null }], [{ id: VEH, initialOdometer: 45000 }]),
  });
  is("the higher earlier reading wins", later.mileageFloor(VEH, "2026-10-10").value, 50000);
});

await group("editing a session does not make it argue with itself", () => {
  /* The trap. A row holding 92,000 compared against itself is "lower than
     92,000", so every save of a correct row would raise the dialog. */
  const s = [{ id: "editing", vehicleId: VEH, date: "2026-10-01", mileage: 92000, deletedAt: null }];
  const { mileageFloor } = build({ state: makeState(s, [{ id: VEH, initialOdometer: 0 }]) });
  is("excluding the row leaves nothing to compare", mileageFloor(VEH, "2026-10-01", "editing").value, 0);

  /* And an edit that genuinely lowers the reading is still caught: the excluded
     row is the high one, and a separate earlier row remains as the floor. */
  const pair = [
    { id: "editing", vehicleId: VEH, date: "2026-10-20", mileage: 5000, deletedAt: null },
    { id: "older", vehicleId: VEH, date: "2026-10-01", mileage: 92000, deletedAt: null },
  ];
  const p = build({ state: makeState(pair, [{ id: VEH, initialOdometer: 0 }]) });
  is("an earlier row is still a floor while editing", p.mileageFloor(VEH, "2026-10-20", "editing").value, 92000);
});

await group("a warning is raised, and it names both readings", async () => {
  const m = build({
    state: makeState(HISTORY, [{ id: VEH, initialOdometer: 0 }]),
    answer: "alt",
  });
  let ran = false;
  /* 100 km on the 11th, when the 10th recorded 100,100. */
  await m.confirmMileage(null, fields("100", "2026-10-11"), () => (ran = true));
  ok("the save is held back until the question is answered", ran);
  is("the dialog was opened once", m.asked.length, 1);
  is("it has its own heading", m.asked[0].opts.heading, "odo.title");
  is("the third action is the keep-anyway branch", m.asked[0].opts.altKey, "odo.keepAnyway");
  is("the primary action fills in the previous reading", m.asked[0].opts.ok, "odo.usePrevious");
  ok("the message carries the reading being entered", /100/.test(m.asked[0].message));
  /* Formatted for reading, so the separator is locale-dependent. */
  ok("and the reading it contradicts", /100[,.\u00a0 ]?100/.test(m.asked[0].message));
  ok("and the date that reading came from", /2026-10-10/.test(m.asked[0].message));
});

await group("choosing the previous reading writes it into the field", async () => {
  const m = build({
    state: makeState(HISTORY, [{ id: VEH, initialOdometer: 0 }]),
    answer: true,
  });
  const d = fields("100", "2026-10-11");
  let ran = false;
  await m.confirmMileage(null, d, () => (ran = true));
  ok("the save proceeds", ran);
  is("the field now holds the previous reading", d.mileage.value, "100100");
});

await group("cancelling saves nothing and leaves the field alone", async () => {
  const m = build({
    state: makeState(HISTORY, [{ id: VEH, initialOdometer: 0 }]),
    answer: false,
  });
  const d = fields("100", "2026-10-11");
  let ran = false;
  await m.confirmMileage(null, d, () => (ran = true));
  ok("the save does not proceed", !ran);
  is("the typed value is untouched", d.mileage.value, "100");
});

await group("an absent reading saves without a question", async () => {
  /* Refusing a charge because the odometer was not written down would lose the
     whole session over a field the app has never required. */
  for (const raw of ["", "   "]) {
    const m = build({
      state: makeState(HISTORY, [{ id: VEH, initialOdometer: 0 }]),
      answer: "alt",
    });
    let ran = false;
    await m.confirmMileage(null, fields(raw, "2026-10-11"), () => (ran = true));
    ok(`"${raw}" saves straight away`, ran);
    is(`"${raw}" opens no dialog`, m.asked.length, 0);
  }
});

await group("a sensible reading is never questioned", async () => {
  const m = build({ state: makeState(HISTORY, [{ id: VEH, initialOdometer: 0 }]), answer: "alt" });
  let ran = false;
  await m.confirmMileage(null, fields("100200", "2026-10-11"), () => (ran = true));
  ok("a reading above the floor saves", ran);
  is("with no dialog", m.asked.length, 0);

  /* Exactly equal is not a mistake, and must not nag. */
  const eq = build({ state: makeState(HISTORY, [{ id: VEH, initialOdometer: 0 }]), answer: "alt" });
  let ran2 = false;
  await eq.confirmMileage(null, fields("100100", "2026-10-11"), () => (ran2 = true));
  ok("a reading equal to the floor saves", ran2);
  is("with no dialog", eq.asked.length, 0);
});

/* The three answers are distinguishable, which is the whole point. The older
   two-button callers test truthiness only, so the "keep anyway" branch must not
   be a truthy object or it would save on a cancel. */
await group("every answer leads to the right outcome", async () => {
  const ask = async (answer) => {
    const m = build({
      state: makeState(HISTORY, [{ id: VEH, initialOdometer: 0 }]),
      answer,
    });
    const d = fields("100", "2026-10-11");
    let ran = false;
    await m.confirmMileage(null, d, () => (ran = true));
    return { d, ran, opened: m.asked.length };
  };

  /* confirmMileage is new, so nothing depends on the shape of its answer: it
     reports plainly whether the save proceeded. The three-WAY answer lives one
     layer down, in askConfirm, which every older dialog shares - see below. */
  const alt = await ask("alt");
  ok("keep-anyway saves", alt.ran);
  is("and leaves the typed reading in place", alt.d.mileage.value, "100");

  const yes = await ask(true);
  ok("using the previous reading saves", yes.ran);
  is("and overwrites the field with it", yes.d.mileage.value, "100100");

  const no = await ask(false);
  ok("cancel does not save", !no.ran);
  is("and changes nothing", no.d.mileage.value, "100");
  is("but it did ask, so false is a refusal rather than a shortcut", no.opened, 1);

  /* The no-dialog paths resolve too, so a caller awaiting this can never hang. */
  const m = build({ state: makeState(HISTORY, [{ id: VEH, initialOdometer: 0 }]), answer: false });
  ok("a clean reading saves", await m.confirmMileage(null, fields("999999", "2026-10-11"), () => true) === true);
  ok("an absent reading saves", await m.confirmMileage(null, fields("", "2026-10-11"), () => true) === true);
});

/* The load-bearing detail, and the reason the third button resolves a STRING.
   Every dialog that predates it tests truthiness only, so "alt" has to be truthy
   (it is a deliberate yes) while a cancel resolves false - and must never be
   === true, or every older caller would read a cancel as a confirmation. */
await group("the shared dialog keeps its three answers apart", () => {
  const src = appSource();
  ok('the third button closes with the string "alt"', /closeConfirm\("alt"\)/.test(src));
  ok("the plain confirmation still closes with true", /closeConfirm\(true\)/.test(src));
  ok("and cancellation still closes with false", /closeConfirm\(false\)/.test(src));
  ok('the opt-in is named altKey', /opts\.altKey/.test(src));
  ok("the button is hidden when no third action is asked for", /alt\.hidden = true/.test(src));
  ok("the button exists in the markup", /id="confirmAlt"/.test(html));
});

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);

/* Guards against the suite going quiet. A regression that made a function
   return "" would make `fnSource` throw, and one that made it return a stub
   would silently pass everything; requiring a floor catches both. */
if (pass < 40) {
  console.log(`\nonly ${pass} assertions ran - the suite has gone quiet`);
  process.exit(1);
}