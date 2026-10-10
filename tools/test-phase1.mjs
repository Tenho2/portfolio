/*
 * Phase 1: the five corrections.
 *
 *   A  the duration default - 30 minutes until five charges are logged, then
 *      your average, at minute resolution
 *   B  the charger and camera finders search on a coarse fix and say how coarse
 *   F  the location-defaults explanation, in language a person can read
 *   G  entering kWh produces a cost when a price is already known
 *   H  the tag on a derived cost says what the number actually is
 *
 * Each of these was a report from using the app, not a hypothetical, so each
 * is tested through the real function where one exists and through the source
 * where the behaviour is a wiring decision.
 *
 *   node tools/test-phase1.mjs
 */
import { readFileSync } from "node:fs";
import { appSource, fnSource, varSource } from "./app-source.mjs";

let pass = 0;
const failures = [];
function ok(label, condition) {
  if (condition) pass++;
  else failures.push(label);
}
function is(label, actual, expected) {
  if (Object.is(actual, expected)) pass++;
  else failures.push(`${label}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
async function group(name, fn) {
  const before = failures.length;
  await fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

const app = appSource();
const html = readFileSync("ev-tracker.html", "utf8");
const wide = readFileSync("ev-tracker-wide.html", "utf8");
const i18 = readFileSync("app/i18n.js", "utf8");

const HOURS = (min) => min / 60;

/* One word per language that means "this is not kept". Checking English only
   would pass while the Finnish said nothing of the kind. */
const PRIVACY = {
  en: "discard|not (be )?(stored|kept)",
  fi: "tallenneta|ei s?ily",
  sv: "sparas inte|anv?nds bara",
};


/* Build the real functions against stubs for the app globals they touch. */
function build(extra = {}) {
  const state = { sessions: extra.sessions || [], els: {} };
  const num = (v) => {
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  };
  const isNum = (v) => v !== null && v !== undefined && v !== "" && isFinite(+v);
  const pad = (n) => String(n).padStart(2, "0");
  const TXT = (k, vars) => (vars ? `${k}:${JSON.stringify(vars)}` : k);
  const $ = (id) => state.els[id] || null;
  const hour = (v) => {
    const t = Math.max(0, Math.round((+v || 0) * 3600));
    const hh = Math.floor(t / 3600);
    const mm = Math.floor((t % 3600) / 60);
    const ss = t % 60;
    let out = pad(hh) + ":" + pad(mm);
    if (ss > 0) out += ":" + pad(ss);
    return out;
  };
  const factory = new Function(
    ["num", "isNum", "pad", "TXT", "$", "hoursToHM", "sessions"],
    [
      fnSource("hoursToHM").replace("function hoursToHM", "function _unusedHoursToHM"),
      fnSource("avgDuration"),
      /* The threshold and the fallback live at module scope, so extracting only
         the function body left them undefined and every call threw. Read from
         the source rather than restated here: a test that hard-codes 5 and 30
         keeps passing after someone changes both. */
      varSource("DURATION_SAMPLE_MIN"),
      varSource("DURATION_FALLBACK_H"),
      fnSource("toWholeMinute"),
      fnSource("durationDefault"),
      "let lastHint = null;",
      "function setDurationHint(d) { lastHint = d; }",
      "function defaultDuration() {",
      "  var el = $('duration');",
      "  if (!el) return;",
      "  var d = durationDefault(sessions);",
      "  el.value = hoursToHM(d.hours);",
      "  setDurationHint(d);",
      "}",
      "return { avgDuration, durationDefault, defaultDuration, get hint() { return lastHint; }, el: $('duration') };",
    ].join("\n"),
  );
  const api = factory(num, isNum, pad, TXT, $, hour, state.sessions);
  api.state = state;
  api.hour = hour;
  return api;
}

/* ---------- A: the duration default ---------- */

await group("A: the flat default holds until five charges are logged", () => {
  /* The reported case: the average of one or two charges describes those
     charges, not this driver. A single 90-minute session prefilled every later
     charge with an hour and a half. */
  for (const n of [0, 1, 2, 3, 4]) {
    const s = Array.from({ length: n }, (_, i) => ({ id: "s" + i, hours: HOURS(90) }));
    const d = build({ sessions: s }).durationDefault(s);
    is(`${n} charges -> not the average`, d.fromAverage, false);
    is(`${n} charges -> 30 minutes`, d.hours, HOURS(30));
  }
  const five = Array.from({ length: 5 }, (_, i) => ({ id: "s" + i, hours: HOURS(90) }));
  const d5 = build({ sessions: five }).durationDefault(five);
  is("5 charges -> the average", d5.fromAverage, true);
  is("5 charges -> that average", d5.hours, HOURS(90));
  is("and the count is reported", d5.n, 5);
});

await group("A: the threshold counts charges that really have a duration", () => {
  /* Four 30-minute charges and one row with no duration at all is four pieces
     of evidence, not five. Counting the empty one would switch to an average
     built from four samples, which is what the threshold exists to avoid. */
  const mixed = [
    { id: "a", hours: HOURS(30) },
    { id: "b", hours: HOURS(30) },
    { id: "c", hours: HOURS(30) },
    { id: "d", hours: HOURS(30) },
    { id: "e", hours: 0 },
  ];
  const d = build({ sessions: mixed }).durationDefault(mixed);
  is("an undated-length row does not count", d.n, 4);
  is("so the default still applies", d.fromAverage, false);
  is("and the value is the default", d.hours, HOURS(30));

  /* Null and undefined lengths are the same case. */
  const nulls = [
    { id: "a", hours: HOURS(30) },
    { id: "b", hours: null },
    { id: "c", hours: undefined },
    { id: "d", hours: "" },
  ];
  is("null, undefined and blank all count as no duration", build({ sessions: nulls }).durationDefault(nulls).n, 1);
});

await group("A: the average is minute-resolution and never shows :00", () => {
  /* Reported as "00:30:00" for a 30-minute default. avgDuration rounds to a
     whole minute, so asking hoursToHM for seconds appended a zero that carried
     no information at all. */
  const sessions = Array.from({ length: 6 }, (_, i) => ({ id: "s" + i, hours: HOURS(30) }));
  const b = build({ sessions });
  b.state.els.duration = { value: "" };
  b.defaultDuration();
  is("the field holds no seconds", b.state.els.duration.value, "00:30");
  ok("and specifically not a :00 suffix", !/:00$/.test(b.state.els.duration.value));

  /* An average that lands on a whole minute is the common case and is the one
     that looked wrong. */
  const even = Array.from({ length: 8 }, (_, i) => ({ id: "s" + i, hours: HOURS(45) }));
  const b2 = build({ sessions: even });
  b2.state.els.duration = { value: "" };
  b2.defaultDuration();
  is("45 minutes renders as 00:45", b2.state.els.duration.value, "00:45");
});

await group("A: seconds are counted in the average even though they are hidden", () => {
  /* Explicitly asked for: use the seconds in the calculation, just not in the
     field. So the mean itself must carry them - which it did not, because
     avgDuration rounded to a whole minute and 30 min 20 s was discarded on the
     way in. The mean is now full precision and only the readout rounds. */
  const oneWithSeconds = [
    { id: "a", hours: (30 * 60 + 20) / 3600 },
    ...Array.from({ length: 5 }, (_, i) => ({ id: "s" + i, hours: HOURS(30) })),
  ];
  const allWhole = Array.from({ length: 6 }, (_, i) => ({ id: "s" + i, hours: HOURS(30) }));
  const b1 = build({ sessions: oneWithSeconds });
  const b2 = build({ sessions: allWhole });

  /* At full precision the two differ: the seconds are in the mean. */
  ok(
    "the mean itself carries the seconds",
    b1.avgDuration(oneWithSeconds).hours > b2.avgDuration(allWhole).hours,
  );

  /* Twenty seconds is under half a minute, so the rounded result is
     legitimately identical - that is what "not shown" means. */
  is(
    "twenty seconds do not change the rounded default",
    b1.durationDefault(oneWithSeconds).hours,
    b2.durationDefault(allWhole).hours,
  );

  /* Enough of them do move it: 40 s each crosses the half-minute. This is the
     case where a wrong rounding would show a visibly stale number. */
  const allWithSeconds = Array.from({ length: 6 }, (_, i) => ({
    id: "s" + i,
    hours: (30 * 60 + 40) / 3600,
  }));
  is(
    "forty seconds each move the rounded default",
    build({ sessions: allWithSeconds }).durationDefault(allWithSeconds).hours,
    HOURS(31),
  );
  /* And it still never carries a second into the field. */
  const b3 = build({ sessions: allWithSeconds });
  b3.state.els.duration = { value: "" };
  b3.defaultDuration();
  ok("and the field is still whole minutes", !/:/.test(b3.state.els.duration.value.replace(/^\d{2}:/, "")));
});

await group("A: the hint says which of the two is in the field", () => {
  const sessions = Array.from({ length: 6 }, (_, i) => ({ id: "s" + i, hours: HOURS(42) }));
  const b = build({ sessions });
  b.state.els.duration = { value: "" };
  b.defaultDuration();
  is("with an average the hint says so", b.hint.fromAverage, true);
  is("and carries the sample count", b.hint.n, 6);

  const few = Array.from({ length: 2 }, (_, i) => ({ id: "s" + i, hours: HOURS(42) }));
  const b2 = build({ sessions: few });
  b2.state.els.duration = { value: "" };
  b2.defaultDuration();
  is("below the threshold it says default", b2.hint.fromAverage, false);
  is("and still carries the count", b2.hint.n, 2);

  ok("both hint strings exist", /"durHintAvg":/.test(i18) && /"durHintDefault":/.test(i18));
  /* Both take the count, so neither can render a bare placeholder. */
  ok("the average hint names the count", /"durHintAvg": "[^"]*\{n\}/.test(i18));
  ok("the default hint names the count", /"durHintDefault": "[^"]*\{n\}/.test(i18));
});

await group("A: a language switch cannot wipe the dynamic half of the hint", () => {
  /* #durHintNow must not carry data-i18n. It carries text that exists only at
     runtime, so a translator would have nothing to translate, and applyI18n
     would overwrite the value with a raw key or leave it stale. */
  ok("the hint exists on both pages", /id="durHintNow"/.test(html) && /id="durHintNow"/.test(wide));
  const i = html.indexOf('id="durHintNow"');
  const tag = html.slice(html.lastIndexOf("<", i), html.indexOf(">", i) + 1);
  ok("and it has no data-i18n", !/data-i18n/.test(tag));
  /* The static half still does, or the field would lose its explanation. */
  ok("the static half keeps data-i18n", /<span data-i18n="as\.durHint"><\/span>/.test(html));
  /* And the static half no longer promises an average it may not use. */
  ok("the static text no longer claims an average", !/Defaults to your average/.test(i18));
});

/* ---------- B: the fix is reported, not refused ---------- */

await group("B: the charger search runs on a coarse fix", () => {
  const fn = app.slice(app.indexOf("function findStationsNearMe"), app.indexOf("function loadCameras") > 0 ? app.indexOf("function loadCameras") : app.indexOf("function runStationSearch"));
  ok("it still asks the device", /getCurrentPosition/.test(fn));
  ok("it records the reported accuracy", /stationFixM = isNum\(p\.coords\.accuracy\)/.test(fn));
  /* The gate that produced "Location was not precise enough (103 m), so
     nothing was filled in" and no results at all. */
  ok("it no longer refuses on accuracy", !/LOC_MAX_ACCURACY_M/.test(fn));
  ok("and never shows that refusal", !/geoTooCoarse/.test(fn));
  ok("it proceeds to the search", /runStationSearch\(p\.coords\.latitude/.test(fn));
});

await group("B: the camera search runs on a coarse fix too", () => {
  const fn = app.slice(app.indexOf("function findCamerasNearMe"), app.indexOf("function loadCameras"));
  ok("it records the reported accuracy", /cameraFixM = isNum\(p\.coords\.accuracy\)/.test(fn));
  ok("it no longer refuses on accuracy", !/LOC_MAX_ACCURACY_M/.test(fn));
  ok("and never shows that refusal", !/geoTooCoarse/.test(fn));
  /* Reusing the station fix means reusing its accuracy too, or the camera
     result claims a precision it never had. */
  ok("a reused fix keeps its accuracy", /cameraFixM = stationFixM/.test(fn));
});

await group("B: the automatic background fill keeps its gate", () => {
  /* This one was kept deliberately. It fills the form without the user asking,
     so a wrong pin there would go unnoticed. */
  const fn = app.slice(app.indexOf("function tryNearbyFavourite"), app.indexOf("function applyLocationDefaults"));
  ok("it still refuses a coarse fix", /LOC_MAX_ACCURACY_M/.test(fn));
  ok("and still says so", /geoTooCoarse/.test(fn));
});

await group("B: the quality is stated, but only when it is worth stating", () => {
  ok("there is a helper", /function fixNote\(/.test(app));
  const fn = app.slice(app.indexOf("function fixNote("), app.indexOf("function drawStationPins"));
  ok("it returns the clean message for a good fix", /return clean/.test(fn));
  ok("it returns the rough one past the same 50 m line", /fixM <= LOC_MAX_ACCURACY_M/.test(fn));
  ok("and rounds for reading", /Math\.round\(fixM\)/.test(fn));
  /* A status line that always carries a caveat reads as a warning about
     everything, so the good case must stay clean. */
  const st = app.slice(app.indexOf("function runStationSearch"));
  ok("the found line goes through it", /fixNote\(/.test(st));
  ok("the empty line does too", /st\.noneRough/.test(st));
  ok("a new key exists for each case", /"st\.foundRough":/.test(i18) && /"st\.noneRough":/.test(i18) && /"cam\.foundRough":/.test(i18));
  /* Every rough variant carries {a} or it prints the placeholder. */
  for (const k of ["st.foundRough", "st.foundRoughCached", "st.noneRough", "cam.foundRough"]) {
    ok(`${k} names the accuracy`, new RegExp('"' + k + '":\\s*"(?:[^"\\\\]|\\\\.)*\\{a\\}').test(i18));
  }
});

/* ---------- F: the explanation ---------- */

await group("F: the location-defaults text says one plain thing", () => {
  /* Reported as confusing even to someone reading it carefully. The old text
     carried three ideas at once: a 100 m match radius, a 50 m accuracy
     rejection, and a privacy note - plus a remark about desktops, which is
     irrelevant to the phone user reading it. */
  const three = ["en", "fi", "sv"].map((lang) => {
    const marks = [...i18.matchAll(/^\s*(en|fi|sv):\s*\{/gm)];
    const i = marks.findIndex((m) => m[1] === lang);
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : i18.length;
    const m = /"set\.defGeoHint":\s*"((?:[^"\\]|\\.)*)"/.exec(i18.slice(start, end));
    return { lang, text: m ? m[1] : null };
  });
  for (const { lang, text } of three) {
    ok(`${lang} is defined`, !!text);
    if (!text) continue;
    /* One sentence, roughly. The old ones ran to three. */
    ok(`${lang} is short`, text.length < 150);
    const sentences = text.split(/[.!?]/).filter((s) => s.trim()).length;
    ok(`${lang} is at most two sentences`, sentences <= 2);
    ok(`${lang} does not mention a desktop`, !/desktop/i.test(text));
    /* No bare implementation numbers. */
    ok(`${lang} states no radius`, !/\b100 ?m\b/.test(text));
    ok(`${lang} states no accuracy limit`, !/\b50 ?m\b/.test(text));
    /* The privacy part survives - it is the part that matters. Checked per
       language, because a single English pattern silently passes two of three
       blocks without looking at either. */
    ok(`${lang} still says the position is not kept`, new RegExp(PRIVACY[lang], "i").test(text));
  }
  ok("it still names the setting", /"set\.defGeo"/.test(i18));
});


/* ---------- G: the cost on kWh ---------- */

await group("G: entering kWh produces a cost when a price is known", () => {
  /* The reported flow: type kWh, nothing happens; type a price, the cost
     appears. The price is not unknown - syncCents prefilled it from the saved
     setting when the form opened - so the cost was withheld for no reason. */
  const fn = app.slice(app.indexOf("function recalcFromEnergy"), app.indexOf("function syncHints"));
  ok("there is a branch for the untouched case", /else if \(e > 0 && price > 0\)/.test(fn));
  ok("it writes the cost", fn.includes('$("cost").value = (e * price).toFixed(2)'));
  ok("and marks the cost as derived", /costAuto = true/.test(fn));
  /* Both existing branches are untouched, or the other two flows break. */
  ok("a derived cost still recomputes", /if \(costAuto\)[\s\S]{0,160}?e \* price/.test(fn));
  ok("an entered cost still back-computes the price", /else if \(priceAuto\)/.test(fn));
  /* No price means nothing to calculate, which is not the same as zero. */
  ok("and a zero price produces nothing", /e > 0 && price > 0/.test(fn));
});

await group("G: the same fix applies on the edit sheet", () => {
  /* The edit sheet has its own inputs and shares the recalculation, so the
     same behaviour applies. Worth pinning: a fix that only covered the add
     form would leave editing inconsistent with it. */
  ok("edit uses the same energy input", app.includes('$("energy").addEventListener("input", recalcFromEnergy)'));
  ok("and commitEdit reads cost from the field", app.includes('$("eCost")'));
});

/* ---------- H: the tag says what the number is ---------- */

await group("H: the tag describes what was actually done", () => {
  /* Reported as misleading: it is not an estimate. It is the user's own kWh
     multiplied by the user's own saved price, which is exact for the price in
     force. */
  const three = ["en", "fi", "sv"].map((lang) => {
    const marks = [...i18.matchAll(/^\s*(en|fi|sv):\s*\{/gm)];
    const i = marks.findIndex((m) => m[1] === lang);
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : i18.length;
    const m = /"tag\.est":\s*"((?:[^"\\]|\\.)*)"/.exec(i18.slice(start, end));
    return { lang, text: m ? m[1] : null };
  });
  for (const { lang, text } of three) {
    ok(`${lang} is defined`, !!text);
    if (!text) continue;
    ok(`${lang} no longer says "estimated"`, !/estimat|arvio/i.test(text));
    ok(`${lang} is short enough for a pill`, text.length <= 24);
  }
  /* They must actually agree in meaning, which they did not before: Swedish
     already said "calculated" while English and Finnish said "estimated". */
  const set = new Set(three.map((t) => (t.text || "").toLowerCase()));
  ok("all three describe the same thing", set.size === 3 && !three.some((t) => !t.text));
  /* The CSV column agrees with the tag rather than reintroducing the word.
     Matched as a quoted literal, not as bare text: the word appears in the
     comment explaining the change, and a substring search scored that comment
     as the bug it was describing. */
  const csv = app.slice(app.indexOf("function toCSV"), app.indexOf("function doCSV"));
  ok("the CSV basis column agrees", csv.includes('"at your price ("'));
  ok("and does not ship the old wording", !csv.includes('"estimated at "'));
});

/* The suite is only meaningful while it is running. */
if (pass < 80) {
  console.log(`\nonly ${pass} assertions ran - the suite has gone quiet`);
  failures.push("too few assertions to be trustworthy");
}

console.log(failures.length ? "\nFAILED:" : "");
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);