/** The retro desktop window manager contract. */
import { readFileSync } from "node:fs";

const app = readFileSync("app/app.js", "utf8");
const css = readFileSync("app/ui/retro-desktop.css", "utf8");
const page = readFileSync("ev-tracker-retro-desktop.html", "utf8");
const shared = readFileSync("ev-tracker.html", "utf8");
const hud = readFileSync("tools/hud-body.html", "utf8");
const win31 = readFileSync("ev-tracker-win31.html", "utf8");
const win31Css = readFileSync("app/ui/win31.css", "utf8");
const shell = readFileSync("app/shell.mjs", "utf8");
const emit = readFileSync("tools/emit-pages.mjs", "utf8");
const i18n = readFileSync("app/i18n.js", "utf8");
const sw = readFileSync("sw.js", "utf8");

let pass = 0;
const failures = [];
function ok(label, condition) {
  if (condition) pass++;
  else failures.push(label);
}
function group(name, fn) {
  const before = failures.length;
  fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}

/** The body of a top-level function, by brace matching. */
function fnBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return "";
}

group("the retro page owns the taskbar and Start menu", () => {
  for (const id of [
    "retro-taskbar",
    "retro-task-windows",
    "retro-clock",
    "retro-clock-time",
    "retro-start-btn",
    "retro-start-menu",
  ])
    ok(`${id} exists exactly once`, (page.match(new RegExp(`id="${id}"`, "g")) || []).length === 1);
  ok("classic has no retro chrome", !shared.includes("retro-taskbar") && !shared.includes("retro-start-menu"));
  ok("win31 has no retro chrome", !win31.includes("retro-taskbar") && !win31.includes("retro-start-menu"));
  ok("the chrome is before the script block", page.indexOf('id="retro-taskbar"') < page.indexOf("scripts:begin"));
  ok("the chrome is after the shared main content", page.indexOf('id="retro-taskbar"') > page.indexOf("</main>"));
  const menu = page.match(/<nav id="retro-start-menu"[\s\S]*?<\/nav>/);
  const menuText = menu ? menu[0] : "";
  const menuOrder = ["dashboard", "add-session", "view-data", "stations", "settings"];
  const menuPositions = menuOrder.map((id) => menuText.indexOf('data-go="' + id + '"'));
  ok("the Start menu has Dashboard", menuPositions[0] >= 0);
  ok("the Start menu has Add session", menuPositions[1] >= 0);
  ok("the Start menu has Charge history", menuPositions[2] >= 0);
  ok("the Start menu has Find charger", menuPositions[3] >= 0);
  ok("the Start menu has Settings", menuPositions[4] >= 0);
  ok(
    "the menu order is Dashboard, Add session, Charge history, Find charger, Settings",
    menuPositions.every((p, i) => p >= 0 && (i === 0 || p > menuPositions[i - 1])),
  );
  ok("Sync stays after Settings", menuText.indexOf("data-retro-sync") > menuPositions[4]);
  ok("the History item has a translated label", /data-i18n="retro\.history"/.test(menuText));
  ok(
    "the Find charger item is label-only",
    /data-go="stations">\s*<span data-i18n="st\.findCharger">Find charger<\/span>\s*<\/button>/.test(menuText),
  );
  ok("the Start menu is icon-free", !/<svg|class="ic"/.test(menuText));
  ok("the Start menu has no Hot Dog route", !/data-retro-theme/.test(menuText));
  ok("the clock is a native button", /id="retro-clock"[^>]*type="button"/.test(page));
  ok("the clock contains the live time", /id="retro-clock-time"/.test(page));
  ok("the Start menu starts hidden", /id="retro-start-menu"[^>]*hidden/.test(page));
  ok(
    "retro hides the shared theme field",
    /body\[data-layout="retro-desktop"\] #themeField\s*\{[^}]*display:\s*none/.test(css),
  );
  ok(
    "win31 hides its header theme button and theme field",
    /body\[data-layout="win31"\] #themeBtn,[\s\S]{0,120}?#themeField\s*\{[^}]*display:\s*none/.test(
      win31Css,
    ),
  );
});

group("the retro desktop boots to an empty desktop", () => {
  const boot = fnBody(app, "initialView");
  ok("boot uses the initial-view helper", /initialView\(\);/.test(app));
  ok("retro without a hash clears the current view", /isRetroDesktop\(\) && !start/.test(boot) && /view = ""/.test(boot));
  ok("it clears the shared Dashboard .on class", /classList\.remove\("on"\)/.test(boot));
  ok("it empties the taskbar", /syncRetroTaskbar\(\)/.test(boot));
  ok("a hash still opens its target", /go\(document\.getElementById\(start\) \? start : "dashboard"\)/.test(boot));
  ok("other layouts still fall back to Dashboard", /: "dashboard"/.test(boot));
  ok("the old unconditional Dashboard boot is gone", !/var start = location\.hash\.slice\(1\);\s*go\(document\.getElementById\(start\)/.test(app));
});

group("the generator injects retro chrome only", () => {
  ok("shell exports bodyExtrasFor", /export function bodyExtrasFor\(layout\)/.test(shell));
  ok("only retro gets extras", /if \(layout !== "retro-desktop"\) return \[\]/.test(shell));
  ok("emit-pages inserts the extras", /\.\.\.bodyExtrasFor\(layout\)/.test(emit));
});

group("the title bar is created for every shared view at runtime", () => {
  ok("the title bar helper exists", /function ensureRetroWindowChrome\(\)/.test(app));
  ok("it walks the shared .view nodes", /querySelectorAll\("\.view"\)/.test(app));
  ok("it adds the title bar marker", /data-retro-window-titlebar/.test(app));
  ok("it adds a minimize control", /data-retro-window-minimize/.test(app));
  ok("it adds a close control", /data-retro-window-close/.test(app));
  ok("the controls have translated labels", /retro\.minimizeWindow/.test(app) && /retro\.closeWindow/.test(app));
  ok("the window titles follow the nav labels", /function retroTitleFor\(id\)/.test(app));
});

group("the Edit Session sheet has real retro window controls", () => {
  ok("the title text is a span", /id="editTitle"[\s\S]{0,300}?id="editTitleText"[^>]*data-i18n="ed.title"/.test(page));
  ok("the title controls exist", /data-retro-edit-minimize/.test(page) && /data-retro-edit-close/.test(page));
  ok("the minimize control shows a dash", /data-retro-edit-minimize[\s\S]{0,100}?[–-]\s*<\/button>/.test(page));
  ok("the controls are hidden outside retro", /id="editWindowControls"[^>]*hidden/.test(page));
  ok("the controls sit at the right end of the title bar", /body\[data-layout="retro-desktop"\] #editWindowControls,[\s\S]{0,100}?#syncWindowControls\s*\{[^}]*margin-left:\s*auto/.test(css));
  ok("retro reveals the controls", /editControls\.hidden = false/.test(app));
  ok("the decorative title box is suppressed", /body\[data-layout="retro-desktop"\] #editTitle::after\s*\{[^}]*content:\s*none/.test(css));
  ok("opening the sheet registers the taskbar state", /retroEditState = "normal"/.test(fnBody(app, "openEdit")));
  ok("closing clears the taskbar state", /retroEditState = null/.test(fnBody(app, "closeEdit")));
  ok("minimize releases the modal lock", /lockBackground\(false\)/.test(fnBody(app, "minimizeRetroEdit")));
  ok("restore locks the modal again", /lockBackground\(true\)/.test(fnBody(app, "restoreRetroEdit")));
  ok("the taskbar handles the edit pseudo-window", /id === RETRO_EDIT_ID/.test(fnBody(app, "toggleRetroTaskbarWindow")));
  ok("the taskbar includes the edit entry", /RETRO_EDIT_ID/.test(fnBody(app, "syncRetroTaskbar")));
  ok("the close control calls closeEdit", /data-retro-edit-close[\s\S]{0,140}?closeEdit\(\)/.test(app));
  ok("sign-out closes the edit sheet", /closeEdit\(\)/.test(fnBody(app, "showApp")));
});

group("the Sync sheet has real retro window controls", () => {
  ok("the title text is a span", /id="syncPanelTitle"[\s\S]{0,300}?id="syncTitleText"[^>]*data-i18n="sync.title"/.test(page));
  ok("the title controls exist", /data-retro-sync-minimize/.test(page) && /data-retro-sync-close/.test(page));
  ok("the minimize control shows a dash", /data-retro-sync-minimize[\s\S]{0,100}?[–-]\s*<\/button>/.test(page));
  ok("the controls are hidden outside retro", /id="syncWindowControls"[^>]*hidden/.test(page));
  ok("retro reveals the sync controls", /syncControls\.hidden = false/.test(app));
  ok("the decorative title box is suppressed", /body\[data-layout="retro-desktop"\] #syncPanelTitle::after\s*\{[^}]*content:\s*none/.test(css));
  ok("opening registers the taskbar state", /retroSyncState = "normal"/.test(fnBody(app, "openSyncPanel")));
  ok("closing clears the taskbar state", /retroSyncState = null/.test(fnBody(app, "closeSyncPanel")));
  ok("minimize releases the modal lock", /lockBackground\(false\)/.test(fnBody(app, "minimizeRetroSync")));
  ok("restore locks the modal again", /lockBackground\(true\)/.test(fnBody(app, "restoreRetroSync")));
  ok("the taskbar handles the sync pseudo-window", /id === RETRO_SYNC_ID/.test(fnBody(app, "toggleRetroTaskbarWindow")));
  ok("the taskbar includes the sync entry", /RETRO_SYNC_ID/.test(fnBody(app, "syncRetroTaskbar")));
  ok("the top close control calls closeSyncPanel", /data-retro-sync-close[\s\S]{0,140}?closeSyncPanel\(\)/.test(app));
  ok("sign-out closes the sync sheet", /closeSyncPanel\(\)/.test(fnBody(app, "showApp")));
});

group("the lifecycle has real open, minimized and closed states", () => {
  ok("state is keyed by view", /var retroWindows = \{\}/.test(app));
  ok("there is one foreground window", /var retroForeground = null/.test(app));
  ok("minimize sets minimized", /setRetroWindowState\(id, "minimized"\)/.test(fnBody(app, "minimizeRetroWindow")));
  ok("minimize hides the view", /classList\.remove\("on"\)/.test(fnBody(app, "minimizeRetroWindow")));
  ok("minimize does not reset the form", !/resetRetroWindow|resetSessionFormState|clearFavForm/.test(fnBody(app, "minimizeRetroWindow")));
  ok("taskbar toggles minimized back open", /if \(w\.state === "minimized"\) activateRetroWindow\(id\)/.test(fnBody(app, "toggleRetroTaskbarWindow")));
  ok("taskbar toggles foreground to minimized", /else if \(w\.state === "normal"\) minimizeRetroWindow\(id, true\)/.test(fnBody(app, "toggleRetroTaskbarWindow")));
  ok("fresh open runs the one-time view initializer", /isFresh[\s\S]{0,700}?enterView\(id, \{ preserveStations: true \}\)/.test(fnBody(app, "activateRetroWindow")));
  ok("restore skips the initializer", /if \(isFresh\)[\s\S]{0,500}?else \{[\s\S]{0,220}?restoreRetroViewExtras\(id\)/.test(fnBody(app, "activateRetroWindow")));
  ok("close deletes the window", /delete retroWindows\[id\]/.test(fnBody(app, "closeRetroWindow")));
  ok("close removes the taskbar button", /syncRetroTaskbar\(\)/.test(fnBody(app, "closeRetroWindow")));
});

group("closing a dirty window asks before discarding", () => {
  const close = fnBody(app, "closeRetroWindow");
  ok("close checks the dirty snapshot", /isRetroWindowDirty\(id\)/.test(close));
  ok("close uses the app confirmation dialog", /askConfirm\(/.test(close));
  ok("the prompt names unsaved changes", /retro\.closeDirty/.test(close));
  ok("the confirm button discards", /retro\.closeAnyway/.test(close));
  ok("cancel returns false", /return yes \? finish\(\) : false/.test(close));
});

group("dirty state is tracked only for unsaved work", () => {
  ok("there is a snapshot function", /function retroDirtyValue\(id\)/.test(app));
  ok("add-session snapshots its form", /id === "add-session"[\s\S]{0,700}?\$\("sForm"\)/.test(fnBody(app, "retroDirtyValue")));
  ok("add-session includes payer controls", /form\.elements/.test(fnBody(app, "retroDirtyValue")));
  ok("add-session includes the map pin", /locGeo/.test(fnBody(app, "retroDirtyValue")));
  ok("favourites snapshots its fields", /fName[\s\S]{0,300}?fPriceCents/.test(fnBody(app, "retroDirtyValue")));
  ok("settings excludes auto-saving appearance controls", !/themeSel|layoutSel|navAlignSel/.test(fnBody(app, "retroDirtyValue")));
  ok("settings keeps password fields", /curPass/.test(fnBody(app, "retroDirtyValue")));
  ok("read-only views are clean", /return "";/.test(fnBody(app, "retroDirtyValue")));
});

group("lifecycle hooks preserve and refresh the right state", () => {
  ok("edit favourite guards a preserved draft", /isRetroWindowDirty\("favourites"\)/.test(fnBody(app, "editFavById")));
  ok("the guard confirms before replacing", /retro\.discardDraft/.test(fnBody(app, "editFavById")));
  ok("a saved favourite is clean again", /markRetroWindowClean\("favourites"\)/.test(fnBody(app, "saveFavourite")));
  ok("a saved session is clean again", /markRetroWindowClean\("add-session"\)/.test(fnBody(app, "commitSession")));
  ok("the session form has a reusable reset", /function resetSessionFormState\(\)/.test(app));
  ok("the auto date ticker does not touch an open retro Add window", /isRetroDesktop\(\) && retroWindow\("add-session"\)/.test(app));
  ok("station state is reset when its window closes", /stationResults = \[\]/.test(fnBody(app, "resetRetroWindow")));
});

group("the window manager reuses routing and modal behavior", () => {
  ok(
    "Start menu view items use the shared delegated data-go route",
    /data-go="dashboard"/.test(page) &&
      /data-go="add-session"/.test(page) &&
      /data-go="view-data"/.test(page) &&
      /data-go="stations"/.test(page) &&
      /data-go="settings"/.test(page),
  );
  ok("Sync uses the existing panel opener", /openSyncPanel\(startBtn\)/.test(fnBody(app, "initRetroChrome")));
  ok("the clock click asks the Hot Dog dialog", /clockBtn\.addEventListener\("click"[\s\S]{0,120}?askHotdog\(\)/.test(fnBody(app, "initRetroChrome")));
  ok("no Start-menu theme route remains", !/data-retro-theme|syncRetroThemeMenu/.test(app));
  ok("outside clicks close the Start menu", /!menu\.contains\(target\)/.test(fnBody(app, "initRetroChrome")));
  ok("Escape closes the Start menu", /e\.key !== "Escape"/.test(fnBody(app, "initRetroChrome")));
  ok("taskbar buttons toggle through one delegated handler", /data-retro-task-toggle/.test(fnBody(app, "initRetroChrome")));
  ok("the taskbar is inert under a modal", /retroBar = \$\("retro-taskbar"\)[\s\S]{0,260}?\[app, side, foot, retroBar, retroMenu\]\.forEach/.test(app));
  ok("the clock is updated from the active language", /function updateRetroClock\(\)/.test(app) && /currentLang/.test(fnBody(app, "updateRetroClock")));
});

group("Hot Dog is a clock-only Easter egg", () => {
  const ask = fnBody(app, "askHotdog");
  ok("the clock uses the shared confirmation dialog", /askConfirm\(TXT\("retro\.hotdogPrompt"\)/.test(ask));
  ok("the dialog has a heading and confirm labels", /retro\.hotdogTitle/.test(ask) && /retro\.hotdogOn/.test(ask) && /retro\.hotdogOff/.test(ask));
  ok("the theme changes only after confirmation", /if \(yes\) toggleHotdog\(\)/.test(ask));
  ok("the Settings selector cannot toggle it on retro layouts", /function applyThemeSel[\s\S]{0,400}?if \(isRetroLayout\(\)\) return;/.test(app));
  ok("the header button cannot toggle it on retro layouts", /if \(isRetroLayout\(\)\) return;[\s\S]{0,160}?var d = document\.body\.classList\.toggle\("dark"\)/.test(app));
  ok("the shared storage key still remembers the choice", /localStorage\.setItem\(K\.hotdog, on \? "on" : "off"\)/.test(app));
  ok(
    "the exact history text is translated",
    i18n.includes(
      "Do you want to toggle the 'Hot Dog Stand' theme?\\n\\nOriginally introduced in Windows 3.1 to help users with visual impairments, its eye-searing high-contrast red and yellow colors made it a legendary (and infamous) retro tech meme.",
    ),
  );
});

group("the CSS hides modern chrome only on retro", () => {
  ok("the top header is hidden", /body\[data-layout="retro-desktop"\] \.top,[\s\S]{0,80}?body\[data-layout="retro-desktop"\] \.side\s*\{[^}]*display:\s*none/.test(css));
  ok("the wrap clears the rail", /body\[data-layout="retro-desktop"\] \.wrap\s*\{[^}]*margin-left:\s*0/.test(css));
  ok("the taskbar is fixed to the bottom", /\.retro-taskbar\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*0/.test(css));
  ok("the taskbar is below modal overlays", /\.retro-taskbar\s*\{[^}]*z-index:\s*50/.test(css));
  ok("the Start menu opens above the taskbar, bottom right", /\.retro-start-menu\s*\{[^}]*position:\s*fixed[^}]*right:\s*6px[\s\S]{0,160}?left:\s*auto[\s\S]{0,120}?z-index:\s*55/.test(css));
  ok("left-handed mode anchors the menu bottom-left", /body\[data-layout="retro-desktop"\]\[data-nav-align="left"\] \.retro-start-menu\s*\{[^}]*right:\s*auto[^}]*left:\s*6px/.test(css));
  ok("title bars use the navy chrome", /\.retro-window-titlebar\s*\{[^}]*background:\s*var\(--win-navy\)/.test(css));
  ok("window controls use the hard bevel", /\.retro-window-controls button\s*\{[^}]*box-shadow:\s*var\(--bevel-out\)/.test(css));
  ok("the taskbar is hidden while signed out", /body\.need-auth\[data-layout="retro-desktop"\] #retro-taskbar/.test(css));
});

group("the retro window keeps a readable desktop width", () => {
  ok(
    "the width is a token",
    /body\[data-layout="retro-desktop"\]\s*\{[^}]*--retro-window-w:\s*50rem/.test(
      css,
    ),
  );
  const view = /body\[data-layout="retro-desktop"\] \.view\s*\{([^}]*)\}/.exec(css);
  const rule = view ? view[1] : "";
  ok("the window fills its container", /width:\s*100%/.test(rule));
  ok(
    "the window stops growing on a desktop",
    /max-width:\s*var\(--retro-window-w\)/.test(rule),
  );
  ok(
    "the phone layout does not remove the cap",
    !/@media \(max-width: 820px\)[\s\S]{0,2500}?\.view\s*\{[^}]*max-width:\s*none/.test(
      css,
    ),
  );
});

group("the outer view is the only window; panels are flat content", () => {
  ok("panels have no raised bevel", /body\[data-layout="retro-desktop"\] \.view \.panel\s*\{[^}]*box-shadow:\s*none/.test(css));
  ok("panels have no window background", /body\[data-layout="retro-desktop"\] \.view \.panel\s*\{[^}]*background:\s*transparent/.test(css));
  ok("panel headings are plain group labels", /body\[data-layout="retro-desktop"\] \.view \.panel > h2\s*\{[^}]*background:\s*transparent[^}]*border-bottom:\s*1px solid/.test(css));
  ok("panel headings have no fake close box", /\.view \.panel > h2::after\s*\{[^}]*display:\s*none/.test(css));
  ok("dialogs are still windows", /\.sheet-box,[\s\S]{0,90}?\.confirm-box,[\s\S]{0,90}?\.auth-box\s*\{[^}]*box-shadow:\s*var\(--bevel-out\)/.test(css));
});

group("taskbar order follows the existing handedness setting", () => {
  ok("right-handed clock is first", /\.retro-clock\s*\{[^}]*order:\s*1/.test(css));
  ok("right-handed start is last", /\.retro-start-btn\s*\{[^}]*order:\s*3/.test(css));
  ok("left-handed start is first", /body\[data-layout="retro-desktop"\]\[data-nav-align="left"\] \.retro-start-btn\s*\{[^}]*order:\s*1/.test(css));
  ok("left-handed clock is last", /body\[data-layout="retro-desktop"\]\[data-nav-align="left"\] \.retro-clock\s*\{[^}]*order:\s*3/.test(css));
  ok("window buttons stay in the middle", /\.retro-task-windows\s*\{[^}]*order:\s*2/.test(css));
  ok("the clock is bold", /\.retro-clock\s*\{[^}]*font-weight:\s*bold/.test(css));
});

group("the new chrome strings exist in all three languages", () => {
  const keys = [
    "retro.start",
    "retro.startMenu",
    "retro.taskbar",
    "retro.windows",
    "retro.minimizeWindow",
    "retro.restoreWindow",
    "retro.closeWindow",
    "retro.closeDirty",
    "retro.closeTitle",
    "retro.closeAnyway",
    "retro.discardDraft",
    "retro.discardDraftTitle",
    "retro.discardDraftOk",
    "retro.hotdogTitle",
    "retro.hotdogPrompt",
    "retro.hotdogOn",
    "retro.hotdogOff",
  ];
  for (const key of keys)
    ok(`${key} is translated in all three packs`, (i18n.match(new RegExp(`"${key.replace(/\./g, "\\.")}"`, "g")) || []).length === 3);
});

group("the edit sheet keeps its title bar fixed while the body scrolls", () => {
  for (const [name, doc] of [
    ["shared", shared],
    ["HUD", hud],
    ["retro page", page],
  ]) {
    const sheet = doc.slice(
      doc.indexOf('id="editSheet"'),
      doc.indexOf('id="payBreakSheet"'),
    );
    ok(name + ": the edit sheet has a scroll body", /class="sheet-body"/.test(sheet));
    ok(
      name + ": the title stays outside the scroll body",
      sheet.indexOf('id="editTitle"') >= 0 &&
        sheet.indexOf('id="editTitle"') < sheet.indexOf('class="sheet-body"'),
    );
    ok(
      name + ": the form is inside the scroll body",
      /class="sheet-body"[\s\S]*?id="editForm"/.test(sheet),
    );
  }
  ok(
    "the box is a flex column",
    /body\[data-layout="retro-desktop"\] #editSheet \.sheet-box \{[^}]*display:\s*flex[^}]*flex-direction:\s*column/.test(
      css,
    ),
  );
  ok(
    "the box clips instead of scrolling",
    /body\[data-layout="retro-desktop"\] #editSheet \.sheet-box \{[^}]*overflow:\s*hidden/.test(
      css,
    ),
  );
  ok(
    "only the body scrolls",
    /body\[data-layout="retro-desktop"\] #editSheet \.sheet-body \{[^}]*overflow-y:\s*auto/.test(
      css,
    ),
  );
});

group("the service worker is bumped for the window manager", () => {
  ok("sw.js is v107", /const VERSION = "v107"/.test(sw));
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
