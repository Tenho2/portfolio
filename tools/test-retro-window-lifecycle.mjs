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
  ok("the dashboard starts foreground", onViews().join(",") === "dashboard");
  ok("the dashboard has a taskbar button", !!taskFor("dashboard"));
  ok("the dashboard button is pressed", taskFor("dashboard").getAttribute("aria-pressed") === "true");
});

await group("opening another window minimizes the foreground, not the old form", async () => {
  doc.querySelector('#retro-start-menu [data-go="add-session"]').click();
  await wait();
  ok("add-session is foreground", onViews().join(",") === "add-session");
  ok("dashboard is still open", !!taskFor("dashboard"));
  ok("dashboard is no longer pressed", taskFor("dashboard").getAttribute("aria-pressed") === "false");
  ok("there are two taskbar buttons", taskButtons().length === 2);
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
  ok("the form was reset", doc.getElementById("location").value === "");
  ok("the dashboard button remains", !!taskFor("dashboard"));
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

console.log(`\n${pass} passed, ${failures.length} failed`);
window.close();
if (failures.length) {
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
