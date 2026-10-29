/**
 * Behavioural smoke test for the retro desktop window lifecycle.
 *
 * The markup contract lives in test-retro-window-manager.mjs. This test boots
 * the generated page in jsdom and drives the same buttons a user would, so the
 * state machine, taskbar buttons and dirty-close prompt cannot drift silently.
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const html = readFileSync("ev-tracker-retro-desktop.html", "utf8");
const dom = new JSDOM(html, {
  url: "https://example.test/ev-tracker-retro-desktop.html",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;
/* A minimal local session so the Edit sheet can be opened without auth. */
window.localStorage.setItem(
  "ev.v1.local.vehicles",
  JSON.stringify([{ id: "v-test", name: "Test car", icon: "T", odo: 0 }]),
);
window.localStorage.setItem(
  "ev.v1.local.sessions",
  JSON.stringify([
    {
      id: "s-test",
      vehicleId: "v-test",
      date: "2026-10-28",
      time: "12:00",
      duration: 3600,
      energy: 10,
      cost: 2,
      location: "Test charger",
    },
  ]),
);
window.scrollTo = () => {};
window.matchMedia =
  window.matchMedia ||
  (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
window.supabase = {
  createClient() {
    return {
      auth: {
        onAuthStateChange() {},
        getSession() {
          return Promise.resolve({ data: { session: null } });
        },
        getUser() {
          return Promise.resolve({ data: { user: null } });
        },
        signOut() {
          return Promise.resolve();
        },
      },
    };
  },
};
window.console = console;

for (const file of ["app/i18n.js", "app/storage.js", "app/stations.js", "app/app.js"])
  window.eval(readFileSync(file, "utf8"));

let pass = 0;
const failures = [];
function ok(label, condition) {
  if (condition) pass++;
  else failures.push(label);
}
async function group(name, fn) {
  const before = failures.length;
  await fn();
  console.log(`${failures.length - before ? "FAIL" : "ok  "}  ${name}`);
}
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const onViews = () => [...doc.querySelectorAll(".view.on")].map((v) => v.id);
const taskButtons = () => [...doc.querySelectorAll("[data-retro-task-toggle]")];
const taskFor = (id) =>
  taskButtons().find((b) => b.getAttribute("data-retro-task-toggle") === id);

await wait(120);

await group("the window chrome boots on the retro page", () => {
  ok("one title bar per shared view", doc.querySelectorAll("[data-retro-window-titlebar]").length === 7);
  ok("every title bar has minimize and close", doc.querySelectorAll("[data-retro-window-titlebar]").length === 7 &&
    doc.querySelectorAll("[data-retro-window-minimize]").length === 7 &&
    doc.querySelectorAll("[data-retro-window-close]").length === 7);
  ok("no window starts open", onViews().length === 0);
  ok("the taskbar starts empty", taskButtons().length === 0);
});

await group("the retro desktop boots left-handed without saving a preference", () => {
  ok("the taskbar uses the left-handed order", doc.body.getAttribute("data-nav-align") === "left");
  ok("the inferred default was not persisted", window.localStorage.getItem("navAlign") === null);
});

await group("the taskbar clock is the only Hot Dog route", async () => {
  const clock = doc.getElementById("retro-clock");
  ok("the clock is a button", clock && clock.tagName === "BUTTON");
  ok("Hot Dog starts off", !doc.body.classList.contains("hotdog"));

  clock.click();
  await wait();
  ok("clicking the clock opens the app confirmation", doc.getElementById("confirmSheet").classList.contains("on"));
  const prompt = doc.getElementById("confirmBody").textContent;
  ok("the prompt asks to toggle the theme", /Do you want to toggle the 'Hot Dog Stand' theme\?/.test(prompt));
  ok("the prompt explains the history", /Originally introduced in Windows 3\.1/.test(prompt));
  ok("the prompt mentions the retro meme", /retro tech meme/.test(prompt));

  doc.getElementById("confirmCancel").click();
  await wait();
  ok("cancel leaves Hot Dog off", !doc.body.classList.contains("hotdog"));
  ok("cancel leaves no saved choice", window.localStorage.getItem("retroHotDog") === null);

  clock.click();
  await wait();
  doc.getElementById("confirmOk").click();
  await wait();
  ok("accepting turns Hot Dog on", doc.body.classList.contains("hotdog"));
  ok("accepting saves the on choice", window.localStorage.getItem("retroHotDog") === "on");

  clock.click();
  await wait();
  doc.getElementById("confirmOk").click();
  await wait();
  ok("accepting again turns Hot Dog off", !doc.body.classList.contains("hotdog"));
  ok("accepting again saves the off choice", window.localStorage.getItem("retroHotDog") === "off");
});

await group("the first opened window starts from an empty desktop", async () => {
  doc.querySelector('#retro-start-menu [data-go="add-session"]').click();
  await wait();
  ok("add-session is foreground", onViews().join(",") === "add-session");
  ok("only add-session has a taskbar button", taskButtons().length === 1);
  ok("the add-session button is pressed", taskFor("add-session").getAttribute("aria-pressed") === "true");
});

await group("minimize preserves the form and the taskbar button", async () => {
  const location = doc.getElementById("location");
  location.value = "Draft charger";
  doc.getElementById("add-session").querySelector("[data-retro-window-minimize]").click();
  await wait();
  ok("nothing is foreground", onViews().length === 0);
  ok("the minimized button remains", !!taskFor("add-session"));
  ok("the form value survives", location.value === "Draft charger");
  taskFor("add-session").click();
  await wait();
  ok("the taskbar button restores the window", onViews().join(",") === "add-session");
  ok("the value still survives", location.value === "Draft charger");
});

await group("closing dirty work asks and cancel keeps it", async () => {
  doc.getElementById("add-session").querySelector("[data-retro-window-close]").click();
  await wait();
  ok("the app confirmation opens", doc.getElementById("confirmSheet").classList.contains("on"));
  ok("the prompt names the window", /Add session/.test(doc.getElementById("confirmBody").textContent));
  ok("the prompt says changes are lost", /Unsaved changes/.test(doc.getElementById("confirmBody").textContent));
  doc.getElementById("confirmCancel").click();
  await wait();
  ok("cancel leaves the window open", onViews().join(",") === "add-session");
  ok("cancel leaves the draft alone", doc.getElementById("location").value === "Draft charger");
});

await group("confirmed close removes the button and resets the instance", async () => {
  doc.getElementById("add-session").querySelector("[data-retro-window-close]").click();
  await wait();
  doc.getElementById("confirmOk").click();
  await wait();
  ok("the window is closed", onViews().length === 0);
  ok("its taskbar button is gone", !taskFor("add-session"));
  ok("the taskbar is empty again", taskButtons().length === 0);
  ok("the form was reset", doc.getElementById("location").value === "");
});

await group("a clean window closes without a prompt", async () => {
  doc.querySelector('#retro-start-menu [data-go="settings"]').click();
  await wait();
  ok("settings is foreground", onViews().join(",") === "settings");
  doc.getElementById("settings").querySelector("[data-retro-window-close]").click();
  await wait();
  ok("no confirmation appeared", !doc.getElementById("confirmSheet").classList.contains("on"));
  ok("settings is closed", !onViews().includes("settings"));
});

await group("the Edit Session sheet gets managed retro controls", async () => {
  doc.querySelector('.side-nav button[data-go="view-data"]').click();
  await wait();
  const edit = doc.querySelector('#view-data [data-edit]');
  ok("the session row offers Edit", !!edit);
  if (!edit) return;
  edit.click();
  await wait();
  const sheet = doc.getElementById("editSheet");
  const controls = doc.getElementById("editWindowControls");
  ok("the Edit sheet opens", sheet.classList.contains("on"));
  ok("the controls are revealed on retro", controls && !controls.hidden);
  ok("the minimize button exists", !!doc.querySelector("[data-retro-edit-minimize]"));
  ok("the minimize button shows a dash", doc.querySelector("[data-retro-edit-minimize]").textContent.trim() === "–");
  ok("the close button exists", !!doc.querySelector("[data-retro-edit-close]"));
  ok(
    "the title text is translated",
    !!doc.getElementById("editTitleText").textContent.trim() &&
      !/ed\.title/.test(doc.getElementById("editTitleText").textContent),
  );
  ok("the taskbar entry exists", !!taskFor("edit-session"));

  doc.querySelector("[data-retro-edit-minimize]").click();
  await wait();
  ok("minimize hides the sheet", !sheet.classList.contains("on"));
  ok("the edit taskbar entry remains", !!taskFor("edit-session"));
  ok("the minimized entry is not pressed", taskFor("edit-session").getAttribute("aria-pressed") === "false");
  ok("the form value survives", doc.getElementById("eLocation").value === "Test charger");

  taskFor("edit-session").click();
  await wait();
  ok("the taskbar entry restores the sheet", sheet.classList.contains("on"));
  ok("the restored entry is pressed", taskFor("edit-session").getAttribute("aria-pressed") === "true");

  doc.querySelector("[data-retro-edit-close]").click();
  await wait();
  ok("close hides the sheet", !sheet.classList.contains("on"));
  ok("close removes the edit taskbar entry", !taskFor("edit-session"));

  doc.getElementById("view-data").querySelector("[data-retro-window-close]").click();
  await wait();
  ok("closing View Data leaves an empty desktop", onViews().length === 0);
  ok("the taskbar is empty again", taskButtons().length === 0);
});

await group("the Sync sheet gets managed retro controls", async () => {
  doc.querySelector('#retro-start-menu [data-retro-sync]').click();
  await wait();
  const panel = doc.getElementById("syncPanel");
  const controls = doc.getElementById("syncWindowControls");
  ok("the Sync sheet opens", panel.classList.contains("on"));
  ok("the controls are revealed on retro", controls && !controls.hidden);
  ok("the minimize button exists", !!doc.querySelector("[data-retro-sync-minimize]"));
  ok("the minimize button shows a dash", doc.querySelector("[data-retro-sync-minimize]").textContent.trim() === "–");
  ok("the close button exists", !!doc.querySelector("[data-retro-sync-close]"));
  ok("the title text is translated", !!doc.getElementById("syncTitleText").textContent.trim());
  ok("the sync taskbar entry exists", !!taskFor("sync-panel"));

  doc.querySelector("[data-retro-sync-minimize]").click();
  await wait();
  ok("minimize hides the sheet", !panel.classList.contains("on"));
  ok("the sync taskbar entry remains", !!taskFor("sync-panel"));
  ok("the minimized entry is not pressed", taskFor("sync-panel").getAttribute("aria-pressed") === "false");

  taskFor("sync-panel").click();
  await wait();
  ok("the taskbar entry restores the sheet", panel.classList.contains("on"));
  ok("the restored entry is pressed", taskFor("sync-panel").getAttribute("aria-pressed") === "true");

  doc.querySelector("[data-retro-sync-close]").click();
  await wait();
  ok("close hides the sheet", !panel.classList.contains("on"));
  ok("close removes the sync taskbar entry", !taskFor("sync-panel"));
  ok("the desktop is empty again", onViews().length === 0 && taskButtons().length === 0);
});

console.log(`\n${pass} passed, ${failures.length} failed`);
window.close();
if (failures.length) {
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
