/**
 * Permission tests for the sharing roles.
 *
 * The role helpers live inline in ev-tracker.html, so they cannot be imported.
 * This pulls them out of the file by name, runs them against stubbed state, and
 * asserts the whole permission matrix. If a role name, a rank or a status check
 * is edited in the app, this fails until the expectations here are updated too.
 *
 *   node tools/test-roles.mjs        (or: npm test)
 */
import { appSource, fnSource } from "./app-source.mjs";

/** The role ladder constants, which are a var literal rather than a function. */
function constSource(name) {
  const m = appSource().match(new RegExp(`var ${name}\\s*=\\s*\\{[^}]*\\}`));
  if (!m) throw new Error(`var ${name} not found`);
  return m[0];
}

const ME = "user-me";
const THEM = "user-them";

const VEHICLES = {
  own: { id: "own", userId: ME },
  admin: { id: "admin", userId: THEM },
  driver: { id: "driver", userId: THEM },
  viewer: { id: "viewer", userId: THEM },
  pending: { id: "pending", userId: THEM },
  rejected: { id: "rejected", userId: THEM },
  none: { id: "none", userId: THEM },
  /* Created on this device, so it has no userId yet. */
  local: { id: "local", name: "Local" },
};

const SHARES = {
  admin: [{ user_id: ME, role: "admin", status: "accepted" }],
  driver: [{ user_id: ME, role: "driver", status: "accepted" }],
  viewer: [{ user_id: ME, role: "viewer", status: "accepted" }],
  pending: [{ user_id: ME, role: "viewer", status: "pending" }],
  rejected: [{ user_id: ME, role: "viewer", status: "rejected" }],
  none: [],
  own: [],
  local: [],
};

const NAMES = [
  "ownsVehicle",
  "rankOf",
  "myShare",
  "myRole",
  "myRank",
  "isPending",
  "canView",
  "canAddSession",
  "canEditVehicle",
  "canEditSession",
  "mayWriteVehicle",
];

const build = new Function(
  "shares",
  "vehById",
  "ownerId",
  "vehicleAnywhere",
  [
    constSource("ROLE_RANK"),
    ...NAMES.map(fnSource),
    `return { ${NAMES.join(", ")} };`,
  ].join("\n\n"),
);

const api = build(
  SHARES,
  (id) => VEHICLES[id] || null,
  () => ME,
  /* mayWriteVehicle resolves a row through vehicleAnywhere, so a binned vehicle
     is still found after doRemoveVehicle has moved it out of the live array.
     VEHICLES is flat here, so the same lookup serves both. */
  (id) => VEHICLES[id] || null,
);

let pass = 0;
const failures = [];

function is(label, actual, expected) {
  if (actual === expected) pass++;
  else failures.push(`${label}\n      expected ${expected}, got ${actual}`);
}

function group(name, fn) {
  const before = failures.length;
  fn();
  const bad = failures.length - before;
  console.log(`${bad ? "FAIL" : "ok  "}  ${name}`);
}

/* The ladder in supabase/04-roles.sql: owner 4, admin 3, driver 2, viewer 1. */
group("role ladder matches the database", () => {
  is("owner rank", api.rankOf("owner"), 4);
  is("admin rank", api.rankOf("admin"), 3);
  is("driver rank", api.rankOf("driver"), 2);
  is("viewer rank", api.rankOf("viewer"), 1);
  is("unknown role rank", api.rankOf("nonsense"), 0);
  is("undefined role rank", api.rankOf(undefined), 0);
});

group("myRole resolves the role that actually grants access", () => {
  is("owner", api.myRole("own"), "owner");
  is("admin", api.myRole("admin"), "admin");
  is("driver", api.myRole("driver"), "driver");
  is("viewer", api.myRole("viewer"), "viewer");
  is("pending is not a role yet", api.myRole("pending"), null);
  is("rejected is not a role", api.myRole("rejected"), null);
  is("no share is not a role", api.myRole("none"), null);
});

group("viewer is read-only", () => {
  is("can view", api.canView("viewer"), true);
  is("cannot add a session", api.canAddSession("viewer"), false);
  is("cannot edit the vehicle", api.canEditVehicle("viewer"), false);
  is("cannot edit anyone's session", api.canEditSession({ vehicleId: "viewer", userId: ME }), false);
});

group("driver may add sessions and manage only their own", () => {
  is("can add a session", api.canAddSession("driver"), true);
  is("cannot edit the vehicle", api.canEditVehicle("driver"), false);
  is(
    "can edit their own session",
    api.canEditSession({ vehicleId: "driver", userId: ME }),
    true,
  );
  is(
    "cannot edit another driver's session",
    api.canEditSession({ vehicleId: "driver", userId: THEM }),
    false,
  );
});

group("admin may edit any session and the vehicle settings", () => {
  is("can edit the vehicle", api.canEditVehicle("admin"), true);
  is("can add a session", api.canAddSession("admin"), true);
  is(
    "can edit somebody else's session",
    api.canEditSession({ vehicleId: "admin", userId: THEM }),
    true,
  );
});

group("owner outranks admin", () => {
  is("can edit the vehicle", api.canEditVehicle("own"), true);
  is(
    "can edit somebody else's session",
    api.canEditSession({ vehicleId: "own", userId: THEM }),
    true,
  );
  is("can add a session", api.canAddSession("own"), true);
});

group("a pending requester can see the car but nothing else", () => {
  is("can view", api.canView("pending"), true);
  is("cannot add a session", api.canAddSession("pending"), false);
  is("cannot edit the vehicle", api.canEditVehicle("pending"), false);
  is(
    "cannot edit any session",
    api.canEditSession({ vehicleId: "pending", userId: ME }),
    false,
  );
});

group("a rejected requester has no access at all", () => {
  is("cannot view", api.canView("rejected"), false);
  is("cannot add a session", api.canAddSession("rejected"), false);
});

group("a non-member has no access", () => {
  is("cannot view", api.canView("none"), false);
  is("cannot add a session", api.canAddSession("none"), false);
  is("cannot edit the vehicle", api.canEditVehicle("none"), false);
});

group("vehicle rows the app may write to the server", () => {
  is("own vehicle", api.mayWriteVehicle("own"), true);
  is("admin may edit the vehicle row", api.mayWriteVehicle("admin"), true);
  is("driver may not write the vehicle row", api.mayWriteVehicle("driver"), false);
  /* The bug this guards: a pending placeholder was being re-pushed on every
     pull, failing RLS and leaving the sync badge stuck on. */
  is("pending placeholder is not re-pushed", api.mayWriteVehicle("pending"), false);
  is("local-only row is pushed", api.mayWriteVehicle("local"), true);
  is("unknown vehicle is not pushed", api.mayWriteVehicle("ghost"), false);
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}