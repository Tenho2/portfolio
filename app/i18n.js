/* Translations.
 *
 * Keys are shared by every language. If a key is missing from the chosen
 * language the English text is used, so the interface never breaks.
 *
 * Northern Sami (se) is deliberately PARTIAL. An automatic draft was
 * rejected because it mixed Skolt Sami characters into a Northern Sami
 * slot and used invented morphology. Only terms that are unambiguously
 * Northern Sami are present; every other key falls back to English until
 * a native speaker completes i18n/se-translation-template.json.
 *
 * This is a classic script rather than an ES module so the app still opens
 * from a file:// path with no server and no build step. Everything it
 * declares stays private to this file; the application script can only
 * reach what is published on window.EV_I18N. That boundary is what stops an
 * out-of-scope reference such as `lang` from reaching production.
 */
/* ---------- translations ----------
   Keys are shared by every language. If a key is missing from the chosen
   language the English text is used, so the interface never breaks.

   Northern Sami (se) is deliberately PARTIAL. An automatic draft was
   rejected because it mixed Skolt Sami characters into a Northern Sami
   slot and used invented morphology. Only terms that are unambiguously
   Northern Sami are present; every other key falls back to English until
   a native speaker completes i18n/se-translation-template.json. */
(function () {
  "use strict";
  var D = {
    en: {
      "ed.for": "Vehicle {n} - created {d}",
      "fav.update": "Update favourite",
      "toast.looking": "Looking up “{q}”…",
      "toast.found": "Found: {v}",
      brand: "EV Multi-Tracker",
      "nav.dashboard": "Dashboard",
      "nav.add": "Add session",
      "veh.sessions": "{n} session(s)",
      "nav.log": "Charge log",
      "nav.fav": "Favourites",
      "nav.set": "Settings",
      db: "Local storage · {n} session(s) · {v} vehicle(s)",
      "dash.lead":
        "Totals for the selected vehicle. All counters start at zero.",
      "dash.pick": "Select vehicle",
      "qa.import": "Import data",
      "qa.addVehicle": "Add vehicle",
      "tile.kwh": "Energy charged",
      "tile.dist": "Distance covered",
      "tile.distEst": "Distance (since first reading)",
      "tile.distEstHelp":
        "No starting odometer was given for this vehicle, so distance is measured from the first logged reading.",
      "tile.distHelp":
        "Distance from the starting odometer you set for this vehicle.",
      "tile.cost": "Total cost",
      "tile.time": "Total charging time",
      "tile.kwh100": "Avg kWh / 100 km",
      "tile.cost100": "Avg cost / 100 km",
      "tile.speed": "Avg charge speed",
      "tile.duravg": "Avg session duration",
      "as.title": "Add charging session",
      "as.date": "Date",
      "as.time": "Time",
      "as.dur": "Session duration",
      "as.durHint": "Hour, minute and second.",
      "as.mileage": "Mileage (km)",
      "as.location": "Location / station",
      "as.find": "📍 Find",
      "as.myloc": "Near me",
      "as.mapDrag":
        "Drag the pin to adjust the position, or click the map.",
      "as.mapOff":
        "Map unavailable offline. The address is still saved with the session.",
      "as.energy": "Energy charged (kWh)",
      "as.socStart": "Start %",
      "as.socEnd": "End %",
      "ph.soc": "e.g. 20",
      "as.total": "Total amount",
      "as.price": "Price per kWh",
      "as.centsUnit": "cents / kWh",
      "as.priceHint1":
        "Whole euro cents, so 35 means 0,35 € per kWh. Enter the total amount or the price and the other one is worked out for you.",
      "as.notes": "Notes",
      "as.fast": "Fast charging session",
      "as.home": "Home charging session",
      "as.saveFav": "Save this location as a favourite",
      "as.favName": "Favourite name",
      "as.favHint":
        "Leave empty to use the location text. You can add a map position later in Favourites.",
      "ph.loc": "Start typing an address…",
      "ph.mileage": "e.g. 45000",
      "ph.energy": "e.g. 52.4",
      "ph.auto": "auto",
      "ph.notes": "e.g. 150 kW, 24 °C, battery 20 → 80 %",
      "ph.favname": "e.g. Home, Vaasa S1",
      "cl.lead": "Stored sessions, newest first.",
      "cl.none": "No sessions yet — add one from “Add session”.",
      "th.date": "Date",
      "th.time": "Time",
      "th.dur": "Duration",
      "th.loc": "Location",
      "th.energy": "Energy",
      "th.speed": "Avg. speed",
      "th.mileage": "Mileage",
      "th.cost": "Cost",
      "th.tags": "Tags",
      "th.notes": "Notes",
      "th.del": "Del",
      "tag.fast": "Fast",
      "tag.home": "Home",
      "tag.fav": "★ Favourite",
      "tag.est": "At your price",
      "fav.title": "Favourite locations",
      "fav.lead":
        "Name your usual charging spots, look up the address and drop a pin on the map.",
      "fav.name": "Name",
      "fav.address": "Address",
      "fav.find": "Find",
      "fav.findHint":
        "Type an address and press Find. Uses OpenStreetMap when you are online.",
      "fav.lat": "Latitude",
      "fav.lng": "Longitude",
      "fav.mapOff":
        "Map unavailable offline. You can still enter coordinates by hand.",
      "fav.save": "Save favourite",
      "fav.clear": "Clear form",
      "fav.saved": "Saved",
      "fav.geoMissing": "Look up missing coordinates",
      "toast.geoNoneMissing":
        "Every saved place already has coordinates ({s} checked).",
      "toast.geoDone":
        "Looked up {n}, could not place {f}. {s} already had coordinates and were left alone.",
      "toast.geoProgress": "Looking up {d} of {t}… {n} found",
      "fav.use": "Use",
      "fav.edit": "Edit",
      "fav.map": "Map",
      "fav.del": "Delete",
      "fav.noCoords": " · no coordinates",
      "fav.uses": "{n} use(s)",
      "fav.empty":
        "No favourites yet — name one above, or tick “Save this location as a favourite” when logging a session.",
      "set.vehicles": "Vehicles",
      "set.vehiclesLead":
        "Vehicles are shown as a switcher only when you have more than one.",
      "set.saveVehicle": "Save vehicle",
      "set.rename": "Rename",
      "set.remove": "Remove",
      "set.price": "Energy price",
      "set.priceLead":
        "Used for any session where the cost is left empty. The same value is editable in whole euro cents on the Add session page.",
      "set.priceEur": "Price per kWh (€)",
      "set.priceCents": "Same price in cents",
      "set.export": "Export data",
      "set.exportLead":
        "Download the charge log as a file. The scope decides which vehicle the file covers.",
      "set.scope": "Scope",
      "set.allVehicles": "All vehicles",
      "set.exportCsv": "Export CSV",
      "set.exportJson": "Export JSON",
      "set.tplCsv": "CSV template",
      "set.tplJson": "JSON template",
      "set.data": "Data",
      "set.dataLead": "Backup, restore and cleanup.",
    "set.layout": "Layout",
    "set.layoutHint": "Two arrangements of the same app. Nothing is moved or re-imported when you switch, and your data and account are the same in both.",
    "set.layoutClassic": "Classic (side rail)",
    "set.layoutWide": "Wide (top bar)",
      "set.backup": "Backup JSON",
      "set.diag": "Copy diagnostics",
      "set.diagCopied": "Diagnostics copied. Paste them into a bug report.",
      "set.diagFailed": "Could not copy. Open the browser console and report there.",
      "set.restore": "Restore backup",
      "set.clear": "Clear sessions",
      "set.wipe": "Delete everything",
      "im.title": "Import charge data",
      "im.lead":
        "Load sessions from a file. Supported: <strong>.csv</strong>, <strong>.tsv</strong> and <strong>.json</strong>. Existing sessions are kept; the imported ones are added to the vehicle in the <em>Vehicle</em> column, or to the currently selected vehicle when that column is missing or empty.",
      "im.choose": "Choose a file",
      "im.go": "Import file",
      "im.tplNote": "Templates for a new file are in Export data, above.",
      "how.title": "How the file must be formatted",
      "how.cols": "Column names (CSV / TSV)",
      "how.p1":
        "The first row must be a header row. Column names are matched case-insensitively and spaces, underscores and dashes are ignored, so <code>Energy (kWh)</code>, <code>energy_kwh</code> and <code>ENERGY</code> all work.",
      "how.th1": "Column",
      "how.th2": "Required",
      "how.th3": "Accepted values",
      "how.date": "YYYY-MM-DD, e.g. <code>2026-09-28</code>",
      "how.time": "HH:MM 24-hour, e.g. <code>08:15</code>",
      "how.loc": "Any text, e.g. <code>Supercharger Vaasa</code>",
      "how.energy": "Number in kWh, e.g. <code>52.4</code>",
      "how.dur":
        "<code>HH:MM</code> or decimal hours, e.g. <code>00:45</code> or <code>0.75</code>",
      "how.mileage": "Number in km, e.g. <code>45000</code>",
      "how.cost":
        "Number in euros, e.g. <code>12.50</code>. Leave empty to use your price per kWh",
      "how.vehicle":
        "Vehicle name. A new vehicle is created for an unknown name",
      "how.notes": "Any text",
      "how.flags":
        "<code>yes</code>/<code>no</code>, <code>true</code>/<code>false</code>, or <code>1</code>/<code>0</code>",
      "how.csv": "Example CSV",
      "how.tsvTitle": "TSV",
      "how.tsv":
        "Identical to CSV but the columns are separated by a tab character. Saving a CSV as “Tab separated (.tsv)” from Excel or Google Sheets works.",
      "how.json": "JSON",
      "how.jsonP":
        "Either a plain array of session objects, or a file previously produced by <em>Backup JSON</em> (which may also contain <code>vehicles</code>, <code>favourites</code> and <code>pricePerKwh</code>).",
      "how.notes2": "Notes",
      "how.n1":
        "The first line of a UTF-8 file may include a byte order mark; it is ignored.",
      "how.n2":
        'Text containing a comma, a semicolon or a quote must be wrapped in double quotes (<code>"Name, Inc."</code>).',
      "how.n3":
        "Rows that are missing a date, time, location or a numeric energy value are skipped and listed with the reason, so nothing is imported silently.",
      "ed.title": "Edit charging session",
      "ed.durHint": "Hour, minute and second.",
      "ed.cost": "Cost (€)",
      "ed.fav": "Saved as favourite location",
      "ed.save": "Save changes",
      "ed.cancel": "Cancel",
      "ed.del": "Delete",
      "aria.theme": "Switch colour theme",
      "aria.map": "Map",
      "aria.sessMap": "Map of the selected location",
      "aria.edit": "Edit session",
      "aria.del": "Delete session",
      "aria.newveh": "New vehicle name",
      "aria.addr": "Address",
      "aria.cents": "Price per kWh in euro cents",
      foot: "EV Multi-Tracker · data stays in this browser",
      "ph.vehname": "Vehicle name, e.g. Tesla Model 3",
      "ph.addr": "Street, city, country",
      "tag.yes": "yes",
      "tag.no": "no",
      "toast.storage": "Storage full — session not saved",
      "toast.favSave": "Could not save favourites",
      "toast.saved": "Session saved to {v}",
      "toast.savedFav": "Session saved to {v} · favourite updated",
      "toast.updated": "Session updated",
      "toast.deleted": "Session deleted",
      "toast.delFav": "Favourite deleted",
      "toast.vehAdd": "{v} added",
      "toast.vehRem": "{v} removed",
      "toast.vehName": "Give the vehicle a name",
      "toast.csv": "{n} session(s) exported as CSV",
      "toast.json": "{n} session(s) exported",
      "toast.nothing": "Nothing to export yet",
      "toast.backup": "Backup downloaded",
      "toast.restore": "Restored {n} session(s) and {f} favourite(s)",
      "toast.restoreOrphans":
        "Restored {n} session(s) and {f} favourite(s) · {o} session(s) skipped because their vehicle was missing",
      "toast.badRestore": "That file is not a valid backup",
      "toast.cleared": "Sessions cleared",
      "toast.wiped": "Everything deleted",
      "toast.clearQ":
        "Delete all {n} stored session(s)? Vehicles and favourites stay.",
      "toast.wipeQ":
        "Delete all vehicles, every stored session and all favourites? This cannot be undone.",
      "toast.remQ": "Remove {v} and its {n} session(s)?",
      "toast.delQ": "Delete this session at {loc}?",
      "toast.renQ": "New name for {v}",
      "toast.delFavQ": "Delete the favourite “{n}”?",
      "toast.imported": "{n} session(s) imported",
        "toast.notAllYours": "{n} row(s) belong to someone else and were left alone",
      "toast.tplCsv": "CSV template downloaded",
      "toast.tplJson": "JSON template downloaded",
      "toast.locFirst": "Type an address first",
      "toast.offline":
        "You appear to be offline. Enter coordinates by hand or use the map.",
      "toast.noMatch": "No match found for “{q}”. Try a fuller address.",
      "toast.geoFail":
        "Address lookup failed (offline or blocked). You can still drop a pin on the map or type coordinates.",
      "toast.locFirst2": "Type an address first.",
      "toast.offline2":
        "You are offline — the address is still saved with the session.",
      "toast.noMatch2": "No match found for “{q}”.",
      "toast.geoFail2": "Address lookup failed (offline or blocked).",
      "toast.geoNone": "This browser cannot share your location.",
      "toast.geoWait": "Waiting for location permission…",
      "toast.geoDenied":
        "Location permission was denied. You can still search for the address.",
      "toast.geoUnavail": "Your location is not available right now.",
      "toast.geoError": "Could not read your location.",
      "toast.geoPerm": "You can still search for the address.",
      "toast.geoNear": "Near {v} — {d} m away, used as the location.",
      "toast.geoNearF":
        "Nearest saved place is {v}, {d} m away. Pin set to your position — adjust if needed.",
      "toast.geoNoNear":
        "No saved charging location nearby. Pin set to your position — type the station name or drag the pin.",
      "toast.showing": "Showing {v}",
      "toast.pinMoved": "Pin moved to {a}, {b}",
      "toast.favName": "Add a name or an address",
      "toast.favCoords": "Latitude and longitude must both be filled in",
      "toast.favSavedMap": "{v} saved with map position",
      "toast.favSavedNo": "{v} saved — add a map position later",
      "toast.priceNow":
        "Whole euro cents, so 35 means 0,35 € per kWh. Currently {v} per kWh",
      "toast.priceFromTotal": " — price worked out from the total.",
      "toast.priceFromPrice": " — total worked out from this.",
      "toast.priceEnergy": "kWh",
      "toast.priceNeed": "energy needed",
      "toast.priceHint": "Leave empty to use {v} per kWh",
      "toast.priceNeedE": "Enter the charged energy to see the total.",
      "toast.centsMirror": "{c} cents = {v} / kWh",
      "err.json": "Could not read the file as JSON.",
      "err.jsonBad": "The file is not valid JSON: {m}",
      "err.jsonShape":
        "Expected an array of sessions, or a backup object with a sessions array.",
      "err.rowObj": "row {n}: not an object",
      "err.empty": "Nothing to import.",
      "err.emptyMore":
        "The file needs a header row and at least one data row.",
      "err.cols": "The header row is missing required columns.",
      "err.colsReq": "Required columns: date, time, location, energy.",
      "err.colsFound": "Found: {c}",
      "err.ignored": "ignored unrecognised column(s): {c}",
      "err.noneImported": "Nothing was imported ({n} problem(s) found).",
      "err.date": "row {n}: missing or invalid date (use YYYY-MM-DD)",
      "err.time":
        "row {n}: missing or invalid time (use HH:MM, 00:00-23:59)",
      "err.loc": "row {n}: missing location",
      "err.energy": "row {n}: energy must be a number in kWh",
      "err.energyNeg": "row {n}: energy cannot be negative",
      "err.dur": "row {n}: duration must be HH:MM or decimal hours",
    "err.noVehicle": "row {n}: the vehicle it belongs to is not in this file",
      "err.mileage": "row {n}: mileage must be a number",
      "err.cost": "row {n}: cost must be a number",
      "err.fileOpen": "Could not read the file.",
      "err.open": "The file could not be opened.",
      more: "… and {n} more",
      "veh.created": "{v} created",
      "imp.note": "Imported {n} session(s).",
      "log.for": "{n} session(s) stored for {v}, newest first.",
      "log.none": "No sessions stored for {v} yet.",
      yes: "yes",
      no: "no",
      lang: "Language",
      "a11y.skip": "Skip to main content",
      "a11y.nav": "Main navigation",
      "a11y.stats": "Totals for the selected vehicle",
      "a11y.vehList": "Vehicle selection",
      "a11y.picked": "Selected: {v}",
      "a11y.editSession": "Edit session: {v}, {d}",
      "a11y.deleteSession": "Delete session: {v}, {d}",
      "a11y.useFav": "Use favourite location: {v}",
      "a11y.editFav": "Edit favourite: {v}",
      "a11y.deleteFav": "Delete favourite: {v}",
      "a11y.renameVeh": "Rename vehicle: {v}",
      "a11y.removeVeh": "Remove vehicle: {v}",
      "grp.when": "When the session happened",
      "grp.duration": "How long and how far",
      "grp.soc": "State of charge, start and end",
      "grp.coords": "Map coordinates",
      "grp.vehicle": "Vehicle details",
      "chart.title": "Energy and cost per month",
      "chart.energy": "Energy (kWh)",
      "chart.cost": "Cost (EUR)",
      "chart.empty":
        "No sessions for this vehicle yet. Add one to see the monthly chart.",
      "chart.loading": "Loading…",
      "chart.offline":
        "The chart library could not be loaded (no internet connection?). Everything else works normally.",
      "how.soc":
        "Battery charge level before and after the session, in percent (0-100). Leave empty if unknown.",
      "err.soc":
        "Row {n}: battery percentage is not a number, left empty.",
      "set.editVehicle": "Edit vehicle",
      "set.initialOdoLead":
        'The initial odometer is the "ground zero" for the distance total: distance = highest logged reading − this value.',
      "as.initialOdo": "Initial odometer (km)",
      "ph.initialodo": "e.g. 45000",
      "aria.initialodo": "initial odometer reading in kilometres",
      "as.vehicle": "Vehicle name",
      "auth.lead": "Sign in to sync your vehicles and sessions.",
      "auth.username": "Username",
      "auth.usernameHint": "No email address needed.",
      "auth.password": "Password",
      "auth.signIn": "Sign in",
      "auth.createAccount": "Create account",
      "auth.logout": "Log out",
      "confirm.title": "Please confirm",
      "confirm.body": "Are you sure?",
      "confirm.ok": "Yes, continue",
      "confirm.cancel": "Cancel",
      "confirm.delete": "Delete",
      "confirm.remove": "Remove vehicle",
      "confirm.deleteEverything": "Delete everything",
      "confirm.removeVehicle": "Remove this vehicle?",
      "confirm.deleteSession": "Delete this session?",
      "confirm.deleteFav": "Delete this favourite?",
      "confirm.clearSessions": "Clear all sessions?",
      "confirm.wipe": "Delete everything?",
      "auth.needAccount": "Need an account? Register",
      "auth.haveAccount": "Already registered? Sign in",
      "auth.working": "Please wait…",
      "auth.privacy":
        "Your username is stored with a non-deliverable domain appended, so no real email address is ever sent or stored.",
      "auth.ok": "Signed in.",
      "auth.checkMail":
        "Account created. Confirm it in Supabase, then sign in.",
      "auth.notConfigured":
        "Supabase is not configured yet. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
      "auth.noLib":
        "Could not load the Supabase library. Check your connection and reload.",
      "auth.missing": "Enter a username and a password.",
      "auth.shortPw": "Choose a password of at least 8 characters.",
      "auth.badLogin": "Wrong username or password.",
      "auth.notConfirmed":
        'This account still needs an email confirmation, which can never arrive because usernames use a fake domain. Turn off "Confirm email" in Supabase, then register again.',
      "auth.exists":
        "That username is already registered. Sign in instead.",
      "auth.logoutQ": "Sign out of {u}?",
      "auth.expired":
        "Your session has expired, so nothing could be saved. Sign in again.",
      "auth.rate": "Too many attempts. Wait a minute and try again.",
      "auth.failed": "Something went wrong. Please try again.",
      "veh.default": "Vehicle 1",
      "sync.pending": "Saved locally · {n} change(s) waiting to sync",
      "sync.retryNow": "Retry now",
      "sync.banner":
        "{n} change(s) could not be saved to the server. Open to see why.",
      "sync.nextTry": "Next try in {n}s",
      "set.build": "Build",
      "set.sw": "SW",
      "set.swNone": "none (not installed)",
      "set.vehNameHelp":
        "The name you see in the app and in the vehicle list.",
      "set.initialOdoHelp":
        "Distance is measured from this reading. Leave it at 0 if you do not know it.",
      "set.panelError":
        "Part of this page failed to load. The rest still works.",
      "set.account": "Account",
      "set.accountOut":
        "Not signed in. Your data stays on this device until you sign in.",
      "set.accountMeta": "{n} vehicle(s) · {s} session(s) on this device",
      "set.theme": "Appearance",
      "set.themeLight": "Light",
      "set.themeDark": "Dark",
      "set.resetDevice": "Sign out and clear this device",
      "set.resetDeviceHint":
        "Removes this device's copy of every account, then signs you out. Nothing is deleted on the server.",
      "set.resetContinue": "Continue",
      "set.resetQ1":
        "Clear all data on this device and sign out of {u}? Anything saved only here, and not yet on the server, will be lost.",
      "set.resetQ2": "Type RESET to confirm",
      "set.resetMismatch":
        "That did not match. Nothing was deleted — type RESET exactly, in capitals.",
      "set.defTitle": "Location defaults",
      "set.defLead":
        "Pre-fill the charging location when you add a session. It only ever fills an empty field, so you can always type something else.",
      "set.defLoc": "Default place",
      "set.defLocHint": "Taken from your favourite locations.",
      "set.defNone": "None",
      "set.defHour": "Use it after",
      "set.defNever": "Never",
      "set.defHourHint": "Your own local clock.",
      "set.defGeo": "Use my device location instead",
      "set.defGeoHint": "Fills in the charging location for you when you are at one of your saved places. Your position is used for the match and then discarded.",
      "set.defApplied": "Default place filled in: {v}",
      "set.geoMatched": "Near a saved place: {v}",
      "set.geoAmbiguous":
        "Two saved places are equally close. Used {v} without its price — check and adjust.",
      "set.geoTooCoarse":
        "Location was not precise enough ({n} m), so nothing was filled in.",
      "toast.defSaved": "Location default saved",
      "toast.geoAllowed": "Location access granted",
      "toast.geoDenied":
        "Location access was refused, so automatic matching is off",
      "toast.codeTimeout":
        "The server did not answer in time. Check your connection and try the code again.",
      "sync.open": "Show sync details",
      "sync.title": "Sync status",
      "sync.allGoodShort": "In sync",
      "sync.lead":
        "Everything here is saved on this device and has not reached the server yet.",
      "sync.allGood":
        "Everything is on the server. Nothing is waiting to sync.",
      "sync.discard": "Discard",
      "sync.stalledHint":
        "The server refused these, so waiting will not help. The exact reason is shown under each one. Discard to remove it from this device, or open it and save again to try a fresh copy.",
      "sync.heldHint":
        "These are fine and will upload by themselves once the owner approves your access. Do not discard them: nothing is wrong with them.",
      "sync.reason.offline":
        "waiting for a connection",
      "sync.reason.queued": "waiting to be sent",
      "sync.reason.rejected": "refused by the server",
      "sync.reason.notYet":
        "waiting for the owner to approve your access",
      "sync.reason.wrong":
        "the server would not accept this row (row-level security)",
      "toast.legacyMoved":
        "{n} piece(s) of unsynced data from an earlier version were moved to the signed-out area. Sign out to see them.",
      "toast.discardQ": "Discard {v} and {n} item(s) from this device?",
      "toast.discarded": "Discarded from this device",
      "toast.deletedForever": "Deleted for good",
      "sync.loading": "Syncing…",
      "sync.offline": "Offline · changes stay on this device",
      "sync.syncFailed":
        "Could not reach the server · changes stay on this device",
      "fav.price": "Price per kWh (€)",
      "fav.priceHint":
        "Leave empty to use the default price. A favourite price is applied automatically when you pick the place.",
      "im.target": "Import into vehicle",
      "im.targetLead":
        "Rows that name a vehicle in the file keep that vehicle. Rows without one are imported here.",
      "set.share": "Share",
      "set.shareLead":
        "Let other people add charging sessions to this vehicle. They cannot rename or delete it.",
      "set.shareWith": "Driver username",
      "set.shareInvite": "Invite",
      "set.shareHint":
        "The username is the part before the domain. No email address is needed and none is stored.",
      "set.shareNone": "No other drivers yet.",
      "set.shareRemove": "Remove",
      "set.shareCanEdit": "Can add sessions",
      "set.shareNotOwner": "Only the owner of a vehicle can share it.",
      "set.shareSignedOut":
        "Sign in to share a vehicle with someone else.",
      "set.shareNoSupport":
        "Sharing is not set up on the server yet. Run the sharing SQL in Supabase and reload.",
      "set.shareLoading": "Checking sharing…",
      "set.shareNotSaved":
        "This vehicle has not reached the server yet, so it has no code. Open the sync panel to see why the save is stuck.",
      "set.shareTimeout":
        "The server did not answer in time. Check your connection and try again.",
      "set.shareFailed":
        "Could not get a code for this vehicle. Copy diagnostics from Settings for the details.",
      "a11y.shareVeh": "Share vehicle: {v}",
      "a11y.unshare": "Remove access for {v}",
      "a11y.acceptShare": "Approve access for {v}",
      "a11y.setRole": "Role for {v}",
      "a11y.rejectShare": "Refuse access for {v}",
      "role.viewer": "Viewer",
      "role.driver": "Driver",
      "role.admin": "Admin",
      "set.sharePendingTitle": "Pending requests",
      "set.sharePendingLead":
        "These people entered a share code. They cannot see or change anything until you accept them.",
      "set.shareMembersTitle": "People with access",
      "set.shareAccept": "Accept",
      "set.shareReject": "Refuse",
      "set.pendingTag": "Awaiting your approval",
      "set.pendingNoHistory":
        "Nothing to show yet. You are waiting for the owner to approve your request for this vehicle.",
      "nav.bin": "Bin",
      "bin.title": "Bin",
      "bin.lead":
        "Deleted items wait here instead of disappearing, so a mistake can be undone. Restoring puts a charging session back in its original place.",
      "bin.empty": "Empty the bin",
      "bin.emptyHint":
        "Nothing is ever removed automatically. Items stay here until you delete them for good.",
      "bin.emptyBody":
        "The bin is empty. Anything you delete will wait here so you can put it back.",
      "bin.vehicles": "Vehicles",
      "bin.sessions": "Charging sessions",
      "bin.favs": "Favourite locations",
      "bin.restore": "Restore",
      "bin.purge": "Delete forever",
      "toast.vehBinned": "{v} moved to the bin",
      "toast.favBinned": "Moved to the bin",
      "toast.restored": "Restored",
      "toast.binEmptied": "Bin emptied",
      "toast.purged": "Deleted forever",
      "toast.emptyBinQ":
        "Delete {n} item(s) from the bin for good? This cannot be undone.",
      "toast.purgeQ": "Delete {v} and {n} item(s) for good?",
      "set.pendingNoAddLead":
        "Waiting for the owner to approve your request. You can see the car, but not its history.",
      "set.viewerNoAddLead":
        "You have read-only access to this vehicle.",
      "toast.shareAccepted": "{u} now has access",
      "toast.shareRejected": "{u} was refused",
      "toast.shareRoleOk": "{u} is now {r}",
      "toast.rejectQ":
        "Refuse access for {u}? They will need a new code and a new request.",
      "toast.noPermission": "You do not have permission for that",
      "toast.pendingNoAdd":
        "You are waiting for approval, so you cannot add sessions yet.",
      "toast.codePending":
        "Request sent to {v}. You will get access when the owner approves it.",
      "toast.codeAlreadyMember": "You already have access to {v}",
      "toast.codeAlreadyPending":
        "Your request for {v} is already waiting for approval.",
      "confirm.rejectShare": "Refuse access",
      "confirm.reject": "Refuse",
      "confirm.irreversibleSession":
        "This goes to the bin, not away. You can put it back until you empty the bin — but until then it is still stored on the server. Use “Delete forever” if you need it gone now.",
      "confirm.irreversibleClear":
        "Every charging session goes to the bin and stays on the server until you empty it. You can restore them all until then.",
      "confirm.irreversibleWipe":
        "Everything goes to the bin: every vehicle, every session and every favourite. They stay on the server until you empty the bin.",
      "confirm.irreversibleUnshare":
        "They lose access immediately and cannot see the vehicle again. The sessions they already added stay, but they can no longer change them.",
      "confirm.irreversibleVehicle":
        "The vehicle and its sessions go to the bin, and stay on the server until you empty it. Use “Delete forever” to remove them now.",
      "confirm.emptyBin": "Empty the bin",
      "confirm.deleteForever": "Delete forever",
      "confirm.toBin": "Move to bin",
      "confirm.close": "Close",
      "confirm.logout": "Sign out",
      "confirm.discard": "Discard",
      "confirm.irreversibleEmptyBin":
        "This cannot be undone. Everything in the bin is deleted from this device and from the database for good. There is no backup and no undo.",
      "confirm.irreversiblePurge":
        "This cannot be undone. The item is deleted from this device and from the database for good.",
      "confirm.irreversibleDiscard":
        "This cannot be undone. The item never reached the server, so discarding it deletes it from this device for good.",
      "confirm.resetDevice": "Clear this device",
      "confirm.typeToConfirm": "Type the word to confirm",
      "confirm.expectHint": "The button unlocks when you type {w} exactly.",
      "confirm.irreversibleReset":
        "This cannot be undone. Everything stored in this browser is deleted, for every account. Anything already saved on the server is not affected and comes back when you sign in.",
      "ph.shareuser": "e.g. anna",
      "ph.favprice": "e.g. 0.30",
      "toast.favPrice": "Price set to {p} per kWh",
      "toast.shareOk": "{u} can now add sessions to {v}",
      "toast.shareFail":
        "Could not share. Check the username, and that you own the vehicle.",
      "toast.shareNoName": "Enter a username first",
      "toast.unshareQ": "Remove access for {u}?",
      "toast.unshareOk": "Access removed for {u}",
      "fav.priceCents": "Price in cents",
      "ph.favcents": "e.g. 35",
      "aria.favcents": "price per kWh in whole euro cents",
      "set.shareCodeLabel": "Your code for this vehicle",
      "set.shareCodeNone": "loading…",
      "set.shareCopy": "Copy code",
      "set.shareRotate": "New code",
      "set.shareCodeHint":
        "Anyone with this code can add the vehicle to their own account. A new code stops the old one working; everyone who already added the vehicle keeps their access.",
      "set.redeem": "Add a shared vehicle",
      "set.redeemLead":
        "Somebody gave you a code for their vehicle. Enter it here and the vehicle appears in your list, where you can add charging sessions to it.",
      "set.redeemLabel": "Code",
      "set.redeemGo": "Add vehicle",
      "set.redeemHint":
        "Six characters, letters and digits, for example K7M2QX. The 0/O and 1/I are left out so it can be read aloud.",
      "set.sharedTag": "shared",
      "aria.redeemcode":
        "share code of a vehicle somebody shared with you",
      "ph.redeemcode": "e.g. K7M2QX",
      "toast.codeOk": "{v} added to your vehicles",
      "toast.codeAlready": "{v} was already on your list",
      "toast.codeNoSuch":
        "No vehicle matches the code {c}. Check it with the person who gave it to you.",
      "toast.codeEmpty": "Type the code first",
      "toast.codeLooking": "Looking up the code…",
      "toast.codeOwn": "{v} is your own vehicle",
      "toast.codeUnavailable":
        "Codes are not available on the server yet. Run the sharing-codes SQL in Supabase and reload.",
      "toast.codeCopied": "Code {c} copied",
      "toast.codeCopyFail": "Copy failed. The code is {c}",
      "toast.codeRotated": "New code: {c}",
      "toast.codeRotateQ":
        "Issue a new code? The old one stops working immediately.",
      "toast.codeFail": "Could not change the code.",
      "set.leave": "Leave",
      "set.cancelRequest": "Cancel request",
      "set.clearRequest": "Clear request",
      "set.capacity": "Battery capacity",
      "set.capTimes": "× 95% =",
      "set.capUsable": "Usable capacity used for the maths",
      "set.capGrossMode": "Gross — the number on the spec sheet",
      "set.capNetMode": "Usable — the number I know",
      "set.capHintGross": "Estimated usable capacity: about {n} kWh. Edit it if you know the real figure.",
      "set.capHintNet": "Using {n} kWh as the usable capacity.",
      "set.capHintNone": "No capacity set, so consumption is measured from charged energy instead.",
      "ph.capGross": "e.g. 77.4",
      "ph.capUsable": "e.g. 73.53",
      "grp.capacity": "Battery capacity",
      "tile.fromBattery": "from battery level, {n} legs",
      "tile.fromCharging": "from charging, {n} charges ({v} kWh/100km)",
      "tile.disagree": "the two do not agree",
      "tile.noLegs": "{n} kWh not yet measured",
      "tile.costLegs": "over {n} charges",
      "toast.leaveQ": "Stop using {v}? The car leaves your list. {n} charging session(s) you can see go to this device's bin, where you can still read them until you empty it. The owner keeps everything, and the server will not show you these sessions again.",
      "toast.leavePendingQ": "Withdraw your request for {v}? The owner will no longer see it waiting.",
      "toast.leftCar": "Left {v}. {n} session(s) are in this device's bin.",
      "toast.requestCancelled": "Request for {v} withdrawn",
      "toast.leaveBlocked": "Could not leave. Nothing was changed.",
      "toast.leaveNeedsSql": "The database would not allow it yet. Migration 10-leave-share.sql has to be run first.",
      "toast.leaveOffline": "Could not leave: no connection to the server.",
      "toast.leaveSignedOut": "Sign in to leave a shared car.",
      "log.by": "by {n}",
      "log.byYou": "by you",
      "log.byUnknown": "by a member who has since left",
      "confirm.cancelRequest": "Withdraw this request?",
      "confirm.leaveCar": "Leave this car?",
      "a11y.leaveVeh": "Stop using {v}, or remove your request for it",
      "confirm.shareRotate": "New code?",
      "confirm.yes": "Yes, continue",
      "odo.title": "Check the odometer",
      "odo.lowerThanHistory":
        "{d} km is lower than the {f} km recorded on {v}. That usually means a typo. Use {f} km, save {d} km anyway, or cancel to change nothing.",
      "odo.usePrevious": "Use {f} km",
      "odo.keepAnyway": "Save {d} km anyway",
      "odo.savedWithout": "Saved without a reading. You can add the odometer later.",
      "st.title": "Find a charging station",
      "st.lead": "Finds real charging stations near you. In Finland the list comes from Digitraffic's national registry; elsewhere from OpenStreetMap. Nothing is stored and nothing is sent anywhere but those map services.",
      "st.find": "Find station",
      "st.findNear": "Stations near me",
      "st.searching": "Finding your position…",
      "st.found": "{n} station(s) within {r} km.",
      "st.none": "No stations to show yet.",
      "st.noneNear": "No mapped stations within {n} km.",
      "st.lookupFailed": "The station service did not answer ({e}). Try again in a moment, or type the name and drag the pin.",
      "st.geoFail": "Could not read your position ({n}).",
      "st.use": "Use",
      "st.chosen": "{v} — pin and name filled in.",
      "st.unnamed": "Charging station",
      "st.plugs": "{n} plug(s)",
      "st.paid": "paid",
      "st.free": "free",
      "st.source": "Station details in Finland © Digitraffic / Fintraffic. Elsewhere © OpenStreetMap contributors, via Overpass. Coverage varies: city networks are thorough, rural ones patchy.",
      "st.foundCached": "{n} station(s) within {r} km, from the saved list.",
      "st.offline": "You are offline. Station search needs a connection.",
      "st.geoUnavailable": "This browser cannot share your position.",
      "st.away": "{d} m away",
      "st.openDetails": "Tap the pin for details",
      "st.poles": "{n} poles",
      "st.polesTitle": "Poles ({n})",
      "st.poleUnknown": "Connector type not stated",
      "st.moreCount": "Show {n} more",
      "st.cacheStale": "Using the saved list of {n} stations. Refreshing…",
      "st.noLive": "Live status is only published for Finland.",
      "st.liveLoading": "Checking live status…",
      "st.liveNone": "No live status is reported for this station.",
      "st.liveFail": "Could not reach the live status service.",
      "st.live": "{a} of {n} available. {rest}",
      "st.liveRest": "Status: {c}",
      "st.polesMore": "and {n} more not listed",
      "cam.find": "Cameras nearby",
      "cam.loading": "Looking for cameras…",
      "cam.found": "{n} road camera(s) within {r} km. Showing the nearest {n2}.",
      "cam.none": "No road cameras within {r} km.",
      "cam.failed": "The camera service did not answer ({e}).",
      "cam.open": "Open the full picture from {v}",
      "cam.alt": "Road condition camera {v}",
      "cam.ageMinutes": "{n} min ago",
      "cam.ageHours": "{n} h ago",
      "cam.ageDays": "{n} days ago",
      "cam.ageUnknown": "time unknown",
      "cam.nearStation": "Cameras near this charger",
      "cam.note": "These are road-condition cameras, not speed cameras. Images are loaded from Digitraffic and nothing is stored.",
      "cam.foundRough": "{n} road camera(s) within {r} km, showing the nearest {n2}. Your location was accurate to about {a} m.",
      "st.statusOther": "{n} {s}",
      "st.foundRough": "{n} station(s) within {r} km. Your location was accurate to about {a} m.",
      "st.foundRoughCached": "{n} station(s) within {r} km, from the saved list. Your location was accurate to about {a} m.",
      "st.noneRough": "No mapped stations within {n} km. Your location was accurate to about {a} m, so there may be some nearby.",
      "cam.usedStationFix": "Could not read your location, so these are around the last place searched.",
      "locNearStation": "Chargers nearby",
      "locNearSaved": "Your favourites",
      "locNearUsed": "Charged here before",
      "odo.startReading": "this vehicle's starting odometer",
      "durHintDefault": "Showing 30 minutes until you have logged {n}.",
      "durHintAvg": "Showing your average of {n} logged charges.",
      "st.status_unknown": "{n} unknown",
      "st.status_planned": "{n} not yet in service",
      "st.status_inoperative": "{n} not working",
      "st.status_reserved": "{n} reserved",
      "st.status_blocked": "{n} blocked",
      "st.status_outoforder": "{n} out of order",
      "st.status_charging": "{n} in use",
      "st.status_available": "{n} free",
    },
    fi: {
      "ed.for": "Ajoneuvo {n} - luotu {d}",
      "fav.update": "Päivitä suosikki",
      "toast.looking": "Haetaan “{q}”…",
      "toast.found": "Löytyi: {v}",
      brand: "Sähköautojen latausloki",
      "nav.dashboard": "Kojelauta",
      "nav.add": "Lisää lataus",
      "veh.sessions": "{n} sessiota",
      "nav.log": "Latausloki",
      "nav.fav": "Suosikit",
      "nav.set": "Asetukset",
      db: "Selaintila · {n} latausta · {v} ajoneuvoa",
      "dash.lead":
        "Valitun ajoneuvon summat. Kaikki laskurit alkavat nollasta.",
      "dash.pick": "Valitse ajoneuvo",
      "qa.import": "Tuo dataa",
      "qa.addVehicle": "Lisää ajoneuvo",
      "tile.kwh": "Ladattu energia",
      "tile.dist": "Ajettu matka",
      "tile.distEst": "Matka (ensimmäisestä lukemasta)",
      "tile.distEstHelp":
        "Ajoneuvolle ei ole asetettu aloitusmatkamittaria, joten matka lasketaan ensimmäisestä kirjatusta lukemasta.",
      "tile.distHelp":
        "Matka ajoneuvulle asettamastasi aloitusmatkamittarista.",
      "tile.cost": "Kokonaiskustannus",
      "tile.time": "Kokonaislatausaika",
      "tile.kwh100": "keskim. kWh / 100 km",
      "tile.cost100": "keskim. €/100 km",
      "tile.speed": "keskim. latausteho",
      "tile.duravg": "keskim. latausaika",
      "as.title": "Lisää lataus",
      "as.date": "Päivämäärä",
      "as.time": "Aika",
      "as.dur": "Latausaika",
      "as.durHint": "Tunti, minuutti ja sekunti.",
      "as.mileage": "Matkamittarilukema (km)",
      "as.location": "Paikka / laturi",
      "as.find": "📍 Etsi",
      "as.myloc": "Lähellä",
      "as.mapDrag":
        "Vedä nappia säätääksesi sijaintia tai napsauta karttaa.",
      "as.mapOff":
        "Kartta ei ole käytettävissä offline-tilassa. Osoite tallennetaan silti lataukseen.",
      "as.energy": "Ladattu energia (kWh)",
      "as.socStart": "Aloitus %",
      "as.socEnd": "Lopetus %",
      "ph.soc": "esim. 20",
      "as.total": "Summa",
      "as.price": "Hinta per kWh",
      "as.centsUnit": "senttiä / kWh",
      "as.priceHint1":
        "Kokonaiset eurosentit, eli 35 tarkoittaa 0,35 €/kWh. Anna summa tai hinta, toinen lasketaan automaattisesti.",
      "as.notes": "Muistiinpanot",
      "as.fast": "Pikalataus",
      "as.home": "Kotilataus",
      "as.saveFav": "Tallenna tämä paikka suosikiksi",
      "as.favName": "Suosikin nimi",
      "as.favHint":
        "Jätä tyhjäksi, jos haluat käyttää paikan tekstiä. Karttakohteen voit lisätä myöhemmin Suosikissa.",
      "ph.loc": "Aloita kirjoittamaan osoitetta…",
      "ph.mileage": "esim. 45000",
      "ph.energy": "esim. 52,4",
      "ph.auto": "automaattinen",
      "ph.notes": "esim. 150 kW, 24 °C, akku 20 → 80 %",
      "ph.favname": "esim. Koti, Vaasa S1",
      "cl.lead": "Tallennetut lataukset, uusin ensin.",
      "cl.none":
        "Ei vielä latauksia — lisää yksi kohdasta “Lisää lataus”.",
      "th.date": "Päivä",
      "th.time": "Aika",
      "th.dur": "Kesto",
      "th.loc": "Paikka",
      "th.energy": "Energia",
      "th.speed": "keskim. nopeus",
      "th.mileage": "Matkamittarilukema",
      "th.cost": "Kustannus",
      "th.tags": "Tunnisteet",
      "th.notes": "Muistiinpanot",
      "th.del": "Poista",
      "tag.fast": "Pika",
      "tag.home": "Koti",
      "tag.fav": "★ Suosikki",
      "tag.est": "Laskettu hinnallasi",
      "fav.title": "Suosikkipaikat",
      "fav.lead":
        "Nimeä tavalliset latauspaikkasi, hae osoite ja aseta nappi kartalle.",
      "fav.name": "Nimi",
      "fav.address": "Osoite",
      "fav.find": "Etsi",
      "fav.findHint":
        "Kirjoita osoite ja paina Etsi. Käyttää OpenStreetMap-palvelua ollessasi verkossa.",
      "fav.lat": "Leveysaste",
      "fav.lng": "Pituusaste",
      "fav.mapOff":
        "Kartta ei ole käytettävissä offline-tilassa. Voit syöttää koordinaatit myös käsin.",
      "fav.save": "Tallenna suosikiksi",
      "fav.clear": "Tyhjennä lomake",
      "fav.saved": "Tallennetut",
      "fav.geoMissing": "Etsi puuttuvat koordinaatit",
      "toast.geoNoneMissing":
        "Jokaisella tallennetulla paikalla on jo koordinaatit ({s} tarkistettu).",
      "toast.geoDone":
        "Löytyi {n}, ei löytynyt {f}. {s} paikalla oli jo koordinaatit ja ne jätettiin ennalleen.",
      "toast.geoProgress": "Etsitään {d}/{t}… löytyi {n}",
      "fav.use": "Käytä",
      "fav.edit": "Muokkaa",
      "fav.map": "Kartta",
      "fav.del": "Poista",
      "fav.noCoords": " · ei koordinaatteja",
      "fav.uses": "{n} käyttökertaa",
      "fav.empty":
        "Ei vielä suosikkeja — nimeä yksi ylhäältä tai valitse “Tallenna tämä paikka suosikiksi” lisätessäsi latausta.",
      "set.vehicles": "Ajoneuvot",
      "set.vehiclesLead":
        "Ajoneuvovalikko näytetään vain, kun niitä on useampi kuin yksi.",
      "set.saveVehicle": "Tallenna ajoneuvo",
      "set.rename": "Nimeä uudelleen",
      "set.remove": "Poista",
      "set.price": "Energian hinta",
      "set.priceLead":
        "Käytetään latauksiin, joissa kustannus jätetään tyhjäksi. Sama arvo on muokattavissa kokonaisina eurosentteinä Lisää lataus -näkymässä.",
      "set.priceEur": "Hinta per kWh (€)",
      "set.priceCents": "Sama hinta sentteinä",
      "set.export": "Vie data",
      "set.exportLead":
        "Lataa latausloki tiedostoksi. Rajaus määrää, minkä ajoneuvon tiedot viedään.",
      "set.scope": "Rajaus",
      "set.allVehicles": "Kaikki ajoneuvot",
      "set.exportCsv": "Vie CSV",
      "set.exportJson": "Vie JSON",
      "set.tplCsv": "CSV-malli",
      "set.tplJson": "JSON-malli",
      "set.data": "Data",
      "set.dataLead": "Varmuuskopioi, palauta ja siivoa.",
    "set.layout": "Asettelu",
    "set.layoutHint": "Sama sovellus kahdessa asettelussa. Vaihdettaessa mitään ei siirretä eikä tuoda uudelleen, ja tietosi sekä tilisi ovat molemmissa samat.",
    "set.layoutClassic": "Klassinen (sivupalkki)",
    "set.layoutWide": "Leveä (yläpalkki)",
      "set.backup": "Varmuuskopioi JSON",
      "set.diag": "Kopioi vianmääritys",
      "set.diagCopied": "Vianmääritys kopioitu. Liitä se vikailmoitukseen.",
      "set.diagFailed": "Kopiointi ei onnistunut. Avaa selaimen kehittäjätyökalut ja ilmoita siellä.",
      "set.restore": "Palauta varmuuskopio",
      "set.clear": "Tyhjennä lataukset",
      "set.wipe": "Poista kaikki",
      "im.title": "Tuo latausdataa",
      "im.lead":
        "Lataa lataukset tiedostosta. Tuetut: <strong>.csv</strong>, <strong>.tsv</strong> ja <strong>.json</strong>. Nykyiset lataukset säilytetään, ja tuodut lataukset lisätään <em>Ajoneuvo</em>-sarakkeen mukaiseen ajoneuvoon, tai nykyisesti valittuun ajoneuvoon, jos sarake puuttuu tai on tyhjä.",
      "im.choose": "Valitse tiedosto",
      "im.go": "Tuo tiedosto",
      "im.tplNote":
        "Mallit uuteen tiedostoon ovat yllä kohdassa Vie data.",
      "how.title": "Miten tiedoston on oltava muotoiltu",
      "how.cols": "Sarakkeiden nimet (CSV / TSV)",
      "how.p1":
        "Ensimmäisen rivin on oltava otsakkorivi. Sarakenimet tunnistetaan kirjainkoon riippumatta, ja välit, alaviivat ja viivat jätetään huomiotta, joten <code>Energy (kWh)</code>, <code>energy_kwh</code> ja <code>ENERGY</code> toimivat.",
      "how.th1": "Sarake",
      "how.th2": "Pakollinen",
      "how.th3": "Hyväksytyt arvot",
      "how.date": "VVVV-KK-PP, esim. <code>2026-09-28</code>",
      "how.time": "TT:MM 24 tuntia, esim. <code>08:15</code>",
      "how.loc": "Vapaa teksti, esim. <code>Supercharger Vaasa</code>",
      "how.energy": "Luku kWh:ssa, esim. <code>52,4</code>",
      "how.dur":
        "<code>TT:MM</code> tai desimaalitunnit, esim. <code>00:45</code> tai <code>0,75</code>",
      "how.mileage": "Luku kilometreinä, esim. <code>45000</code>",
      "how.cost":
        "Luku euroina, esim. <code>12,50</code>. Jätä tyhjäksi, jos haluat käyttää hintaa per kWh",
      "how.vehicle":
        "Ajoneuvon nimi. Tuntemattomalle nimelle luodaan uusi ajoneuvo",
      "how.notes": "Vapaa teksti",
      "how.flags":
        "<code>kyllä</code>/<code>ei</code>, <code>true</code>/<code>false</code> tai <code>1</code>/<code>0</code>",
      "how.csv": "CSV-esimerkki",
      "how.tsvTitle": "TSV",
      "how.tsv":
        "Sama kuin CSV, mutta sarakkeet erotetaan sarkausmerkillä. Tallentamalla CSV:n Excelistä tai Google Sheetsistä muodossa “Taulukkoerotettu (.tsv)” toimii.",
      "how.json": "JSON",
      "how.jsonP":
        "Joko tavallisten latausten taulukko, tai aiemmin Varmuuskopioi JSON -toiminnolla tehty tiedosto (joka voi sisältää myös <code>vehicles</code>, <code>favourites</code> ja <code>pricePerKwh</code>).",
      "how.notes2": "Huomioita",
      "how.n1":
        "UTF-8-tiedoston ensimmäinen rivi voi sisältää tavumerkintä; se ohitetaan.",
      "how.n2":
        'Teksti, jossa on pilkku, puolipiste tai lainausmerkki, on kuitattava kahdella lainausmerkillä (<code>"Oy, Ab"</code>).',
      "how.n3":
        "Rivit, joista puuttuu päivämäärä, aika, paikka tai numeerinen energia-arvo, ohitetaan ja luetellaan syineen, joten mitään ei tuoda huomaamatta.",
      "ed.title": "Muokkaa latausta",
      "ed.durHint": "Tunti, minuutti ja sekunti.",
      "ed.cost": "Kustannus (€)",
      "ed.fav": "Tallennettu suosikkipaikaksi",
      "ed.save": "Tallenna muutokset",
      "ed.cancel": "Peruuta",
      "ed.del": "Poista",
      "aria.theme": "Vaihda väriteema",
      "aria.map": "Kartta",
      "aria.sessMap": "Valitun paikan kartta",
      "aria.edit": "Muokkaa latausta",
      "aria.del": "Poista lataus",
      "aria.newveh": "Uuden ajoneuvon nimi",
      "aria.addr": "Osoite",
      "aria.cents": "Hinta per kWh eurosentteinä",
      foot: "Sähköautojen latausloki · tiedot pysyvät tässä selaimessa",
      "ph.vehname": "Ajoneuvon nimi, esim. Tesla Model 3",
      "ph.addr": "Katu, kaupunki, maa",
      "tag.yes": "kyllä",
      "tag.no": "ei",
      "toast.storage": "Tallennustila täynnä — latausta ei tallennettu",
      "toast.favSave": "Suosikkeja ei voitu tallentaa",
      "toast.saved": "Lataus tallennettiin ajoneuvoon {v}",
      "toast.savedFav":
        "Lataus tallennettiin ajoneuvoon {v} · suosikki päivitetty",
      "toast.updated": "Lataus päivitetty",
      "toast.deleted": "Lataus poistettu",
      "toast.delFav": "Suosikki poistettu",
      "toast.vehAdd": "{v} lisätty",
      "toast.vehRem": "{v} poistettu",
      "toast.vehName": "Anna ajoneuvolle nimi",
      "toast.csv": "{n} latausta vietty CSV-muodossa",
      "toast.json": "{n} latausta vietty",
      "toast.nothing": "Ei vielä vietävää",
      "toast.backup": "Varmuuskopio ladattu",
      "toast.restore": "Palautettiin {n} latausta ja {f} suosikkia",
      "toast.restoreOrphans":
        "Palautettiin {n} latausta ja {f} suosikkia · {o} latausta ohitettiin, koska niiden ajoneuvo puuttui",
      "toast.badRestore": "Tiedosto ei ole kelvollinen varmuuskopio",
      "toast.cleared": "Lataukset tyhjennetty",
      "toast.wiped": "Kaikki poistettu",
      "toast.clearQ":
        "Poistetaanko kaikki {n} tallennettua latausta? Ajoneuvot ja suosikit säilyvät.",
      "toast.wipeQ":
        "Poistetaanko kaikki ajoneuvot, kaikki lataukset ja kaikki suosikit? Tätä ei voi perua.",
      "toast.remQ": "Poistetaanko {v} ja sen {n} latausta?",
      "toast.delQ": "Poistetaanko lataus paikassa {loc}?",
      "toast.renQ": "Uusi nimi ajoneuvulle {v}",
      "toast.delFavQ": "Poistetaanko suosikki “{n}”?",
      "toast.imported": "{n} latausta tuotu",
        "toast.notAllYours": "{n} riviä kuuluu jollekin muulle, joten niitä ei muutettu",
      "toast.tplCsv": "CSV-malli ladattu",
      "toast.tplJson": "JSON-malli ladattu",
      "toast.locFirst": "Kirjoita ensin osoite",
      "toast.offline":
        "Olet näyttävissä offline-tilassa. Syötä koordinaatit käsin tai käytä karttaa.",
      "toast.noMatch":
        "Ei osumaa hakusanalle “{q}”. Kokeile tarkempaa osoitetta.",
      "toast.geoFail":
        "Osoitehaku epäonnistui (offline tai estetty). Voit silti asettaa napin kartalle tai syöttää koordinaatit.",
      "toast.locFirst2": "Kirjoita ensin osoite.",
      "toast.offline2":
        "Olet offline-tilassa — osoite tallennetaan silti lataukseen.",
      "toast.noMatch2": "Ei osumaa hakusanalle “{q}”.",
      "toast.geoFail2": "Osoitehaku epäonnistui (offline tai estetty).",
      "toast.geoNone": "Tämä selain ei voi jakaa sijaintiasi.",
      "toast.geoWait": "Odotetaan sijaintilupaa…",
      "toast.geoDenied":
        "Sijaintilupa evättiin. Voit silti hakea osoitteen haulla.",
      "toast.geoUnavail": "Sijaintiasi ei ole juuri nyt käytettävissä.",
      "toast.geoError": "Sijaintia ei voitu lukea.",
      "toast.geoPerm": "Voit silti hakea osoitteen haulla.",
      "toast.geoNear":
        "Lähellä paikkaa {v} — {d} m päässä, käytetty paikkana.",
      "toast.geoNearF":
        "Lähin tallennettu paikka on {v}, {d} m päässä. Nappi asetettu sijaintiisi — muokkaa tarvittaessa.",
      "toast.geoNoNear":
        "Lähellä ei ole tallennettua latauspaikkaa. Nappi asetettu sijaintiisi — kirjoita aseman nimi tai vedä nappia.",
      "toast.showing": "Näytetään {v}",
      "toast.pinMoved": "Nappi siirretty kohtaan {a}, {b}",
      "toast.favName": "Anna nimi tai osoite",
      "toast.favCoords": "Leveys- ja pituusaste on annettava molemmat",
      "toast.favSavedMap": "{v} tallennettiin karttakohteen kanssa",
      "toast.favSavedNo":
        "{v} tallennettiin — lisää karttakohta myöhemmin",
      "toast.priceNow":
        "Kokonaiset eurosentit, eli 35 tarkoittaa 0,35 €/kWh. Nyt {v} per kWh",
      "toast.priceFromTotal": " — hinta laskettu summasta.",
      "toast.priceFromPrice": " — summa laskettu tästä.",
      "toast.priceEnergy": "kWh",
      "toast.priceNeed": "energia tarvitaan",
      "toast.priceHint": "Jätä tyhjäksi, jos haluat käyttää {v} per kWh",
      "toast.priceNeedE": "Anna ladattu energia nähdäksesi summan.",
      "toast.centsMirror": "{c} senttiä = {v} / kWh",
      "err.json": "Tiedostoa ei voitu lukea JSON-muodossa.",
      "err.jsonBad": "Tiedosto ei ole kelvollinen JSON: {m}",
      "err.jsonShape":
        "Odotettiin latausten taulukkoa tai varmuuskopio-objektia, jossa on sessions-taulukko.",
      "err.rowObj": "rivi {n}: ei ole objekti",
      "err.empty": "Ei tuotavaa.",
      "err.emptyMore":
        "Tiedostossa on oltava otsakkorivi ja vähintään yksi datarivi.",
      "err.cols": "Otsakkorivistä puuttuu pakollisia sarakkeita.",
      "err.colsReq":
        "Pakolliset sarakkeet: date, time, location, energy.",
      "err.colsFound": "Löytyi: {c}",
      "err.ignored": "ohitettiin tuntemattomat sarakkeet: {c}",
      "err.noneImported": "Yhtään ei tuotu ({n} ongelmaa löytyi).",
      "err.date":
        "rivi {n}: puuttuu tai virheellinen päivämäärä (käytä VVVV-KK-PP)",
      "err.time":
        "rivi {n}: puuttuu tai virheellinen aika (käytä TT:MM, 00:00-23:59)",
      "err.loc": "rivi {n}: paikka puuttuu",
      "err.energy": "rivi {n}: energian on oltava numero kWh:ssa",
      "err.energyNeg": "rivi {n}: energia ei voi olla negatiivinen",
      "err.dur": "rivi {n}: keston on oltava TT:MM tai desimaalitunnit",
    "err.noVehicle": "rivi {n}: ajoneuvoa ei ole tässä tiedostossa",
      "err.mileage": "rivi {n}: matkamittarilukeman on oltava numero",
      "err.cost": "rivi {n}: kustannuksen on oltava numero",
      "err.fileOpen": "Tiedostoa ei voitu lukea.",
      "err.open": "Tiedostoa ei voitu avata.",
      more: "… ja {n} muuta",
      "veh.created": "{v} luotu",
      "imp.note": "Tuotiin {n} latausta.",
      "log.for": "{n} latausta tallennettu ajoneuvoon {v}, uusin ensin.",
      "log.none": "Ajoneuvoon {v} ei ole vielä tallennettu latauksia.",
      yes: "kyllä",
      no: "ei",
      lang: "Kieli",
      "a11y.skip": "Siirry pääsisältöön",
      "a11y.nav": "Päävalikko",
      "a11y.stats": "Valitun ajoneuvon summat",
      "a11y.vehList": "Ajoneuvon valinta",
      "a11y.picked": "Valittu: {v}",
      "a11y.editSession": "Muokkaa latausta: {v}, {d}",
      "a11y.deleteSession": "Poista lataus: {v}, {d}",
      "a11y.useFav": "Käytä suosikkia: {v}",
      "a11y.editFav": "Muokkaa suosikkia: {v}",
      "a11y.deleteFav": "Poista suosikki: {v}",
      "a11y.renameVeh": "Nimeä ajoneuvo uudelleen: {v}",
      "a11y.removeVeh": "Poista ajoneuvo: {v}",
      "grp.when": "Milloin lataus tapahtui",
      "grp.duration": "Kesto ja matka",
      "grp.soc": "Akun varaus, alku ja loppu",
      "grp.coords": "Kartan koordinaatit",
      "grp.vehicle": "Ajoneuvon tiedot",
      "chart.title": "Energia ja kustannus kuukausittain",
      "chart.energy": "Energia (kWh)",
      "chart.cost": "Kustannus (€)",
      "chart.empty":
        "Ei vielä latauksia tälle ajoneuvolle. Lisää lataus, niin näet kuukausikartan.",
      "chart.loading": "Ladataan…",
      "chart.offline":
        "Kaavakirjastoa ei voitu ladata (ei internetyhteyttä?). Muu toimii normaalisti.",
      "how.soc":
        "Akun varaus ennen ja jälkeen latauksen, prosentteina (0-100). Jätä tyhjäksi, jos tuntematon.",
      "err.soc":
        "Rivi {n}: akun prosenttiarvo ei ole numero, jätettiin tyhjäksi.",
      "set.editVehicle": "Muokkaa ajoneuvoa",
      "set.initialOdoLead":
        'Aloitusmatkamittari on matkan laskennan "nolla": matka = suurin kirjattu lukema − tämä arvo.',
      "as.initialOdo": "Aloitusmatkamittari (km)",
      "ph.initialodo": "esim. 45000",
      "aria.initialodo": "aloitusmatkamittarin lukema kilometreinä",
      "as.vehicle": "Ajoneuvon nimi",
      "auth.lead":
        "Kirjaudu sisään synkronoidaksesi ajoneuvot ja lataukset.",
      "auth.username": "Käyttäjätunnus",
      "auth.usernameHint": "Sähköpostiosoitetta ei tarvita.",
      "auth.password": "Salasana",
      "auth.signIn": "Kirjaudu",
      "auth.createAccount": "Luo tili",
      "auth.logout": "Kirjaudu ulos",
      "auth.logoutQ": "Kirjaudu ulos käyttäjästä {u}?",
      "auth.expired":
        "Istuntosi on vanhentunut, joten mitään ei voitu tallentaa. Kirjaudu uudelleen sisään.",
      "confirm.title": "Vahvista",
      "confirm.body": "Haluatko varmasti?",
      "confirm.ok": "Kyllä, jatka",
      "confirm.cancel": "Peruuta",
      "confirm.delete": "Poista",
      "confirm.remove": "Poista ajoneuvo",
      "confirm.deleteEverything": "Poista kaikki",
      "confirm.removeVehicle": "Poistetaanko ajoneuvo?",
      "confirm.deleteSession": "Poistetaanko lataus?",
      "confirm.deleteFav": "Poistetaanko suosikki?",
      "confirm.clearSessions": "Tyhjennetäänkö kaikki lataukset?",
      "confirm.wipe": "Poistetaanko kaikki?",
      "auth.needAccount": "Tarvitseko tilin? Rekisteröidy",
      "auth.haveAccount": "Onko tili jo? Kirjaudu",
      "auth.working": "Odota…",
      "auth.privacy":
        "Käyttäjätunnukseen liitetään ei-toimitettava verkkotunnus, joten oikeaa sähköpostiosoitetta ei koskaan lähetetä tai tallenneta.",
      "auth.ok": "Kirjauduit sisään.",
      "auth.checkMail":
        "Tili luotu. Vahvista se Supabasessa ja kirjaudu sisään.",
      "auth.notConfigured":
        "Supabasea ei ole vielä määritetty. Aseta SUPABASE_URL ja SUPABASE_ANON_KEY.",
      "auth.noLib":
        "Supabase-kirjastoa ei voitu ladata. Tarkista yhteys ja lataa sivu uudelleen.",
      "auth.missing": "Anna käyttäjätunnus ja salasana.",
      "auth.shortPw": "Valitse salasana, jossa on vähintään 8 merkkiä.",
      "auth.badLogin": "Väärä käyttäjätunnus tai salasana.",
      "auth.notConfirmed":
        'Tiliä pitää vielä vahvistaa sähköpostilla, mikä ei koskaan tavoita, koska käyttäjätunnus käyttää keksiettä verkkotunnusta. Poista "Confirm email" -asetus Supabasesta ja rekisteröidy uudelleen.',
      "auth.exists":
        "Tuo käyttäjätunnus on jo rekisteröity. Kirjaudu sisään sen sijaan.",
      "auth.rate": "Liikaa yrityksiä. Odota minuutti ja yritä uudelleen.",
      "auth.failed": "Jokin meni pieleen. Yritä uudelleen.",
      "veh.default": "Ajoneuvo 1",
      "sync.pending":
        "Tallennettu laitteelle · {n} muutosta odottaa synkronointia",
      "sync.retryNow": "Yritä nyt",
      "sync.banner":
        "{n} muutosta ei voitu tallentaa palvelimelle. Avaa nähdäksesi syyn.",
      "sync.nextTry": "Seuraava yritys {n} s kuluttua",
      "set.build": "Versio",
      "set.sw": "SW",
      "set.swNone": "ei (ei asennettu)",
      "set.vehNameHelp":
        "Nimi, jonka näet sovelluksessa ja ajoneuvoluettelossa.",
      "set.initialOdoHelp":
        "Matka lasketaan tästä lukemasta. Jätä arvoksi 0, jos et tiedä sitä.",
      "set.panelError":
        "Osa tästä sivusta ei latautunut. Muu toimii edelleen.",
      "set.account": "Tili",
      "set.accountOut":
        "Et ole kirjautuneena. Tietosi pysyvät tällä laitteella, kunnes kirjaudut sisään.",
      "set.accountMeta": "{n} ajoneuvo(a) · {s} latausta tällä laitteella",
      "set.theme": "Ulkoasu",
      "set.themeLight": "Vaalea",
      "set.themeDark": "Tumma",
      "set.resetDevice": "Kirjaudu ulos ja tyhjennä tämä laite",
      "set.resetDeviceHint":
        "Poistaa tämän laitteen kopion kaikista tileistä ja kirjaa ulos. Palvelimelta ei poisteta mitään.",
      "set.resetContinue": "Jatka",
      "set.resetQ1":
        "Tyhjennetäänkö kaikki tämän laitteen tiedot ja kirjaudutaan ulos tilistä {u}? Mitään, mitä on vain tallennettu tänne eikä palvelimelle, menee hukkaan.",
      "set.resetQ2": "Kirjoita RESET vahvistukseksi",
      "set.resetMismatch":
        "Ei täsmännyt mitään. Mitään ei poistettu — kirjoita RESET täsmälleen, isoilla kirjaimilla.",
      "set.defTitle": "Sijaintien oletukset",
      "set.defLead":
        "Esitäytä latauspaikka, kun lisäät session. Se täyttää vain tyhjän kentän, joten voit aina kirjoittaa jotain muuta.",
      "set.defLoc": "Oletuspaikka",
      "set.defLocHint": "Otetaan suosikkisijainneistasi.",
      "set.defNone": "Ei mitään",
      "set.defHour": "Käytä klo",
      "set.defNever": "Ei koskaan",
      "set.defHourHint": "Oma paikallinen kellonaika.",
      "set.defGeo": "Käytä laitteeni sijaintia sen sijaan",
      "set.defGeoHint": "Täyttää latauspaikan puolestasi, kun olet jollakin tallentamallasi paikalla. Sijaintiasi käytetään vain vertailuun, eikä sitä tallenneta.",
      "set.defApplied": "Oletuspaikka täytetty: {v}",
      "set.geoMatched": "Lähellä tallennettua paikkaa: {v}",
      "set.geoAmbiguous":
        "{n} tallennettua paikkaa on 100 m sisällä. Käytettiin {v} ilman hintaa — tarkista ja korjaa.",
      "set.geoTooCoarse":
        "Sijainti ei ollut tarpeeksi tarkka ({n} m), joten mitään ei täytetty.",
      "toast.defSaved": "Sijainnin oletus tallennettu",
      "toast.geoAllowed": "Sijainti lupa myönnetty",
      "toast.geoDenied":
        "Sijainti lupa evättiin, joten automaattinen tunnistus on pois",
      "toast.codeTimeout":
        "Palvelin ei vastannut ajoissa. Tarkista yhteys ja kokeile koodia uudelleen.",
      "sync.open": "Näytä synkronoinnin tiedot",
      "sync.title": "Synkronointi",
      "sync.allGoodShort": "Synkassa",
      "sync.lead":
        "Kaikki tässä on tallennettu tälle laitteelle eikä ole vielä päässyt palvelimelle.",
      "sync.allGood": "Kaikki on palvelimella. Ei mitään odottamassa.",
      "sync.discard": "Hylkää",
      "sync.stalledHint":
        "Palvelin hylkäsi nämä, joten odottaminen ei auta. Tarkka syy näytetään jokaisen kohdalla. Hylkää poistaa kohteen tältä laitteelta, tai avaa ja tallenna uudelleen, jotta kopio lähetettäisiin.",
      "sync.heldHint":
        "Nämä ovat kunnossa ja ladataan itsestään, kun omistaja hyväksyy käyttöoikeuden. Älä hylkää niitä: mitään niissä ei ole viallista.",
      "sync.reason.offline": "odottaa yhteyttä",
      "sync.reason.queued": "odottaa lähetystä",
      "sync.reason.rejected": "palvelin hylkäsi",
      "sync.reason.notYet": "odottaa omistajan hyväksyntää",
      "sync.reason.wrong":
        "palvelin ei hyväksynyt tätä riviä (rivitason suojaus)",
      "toast.legacyMoved":
        "{n} synkronointematonta tietoa vanhemmasta versiosta siirrettiin uloskirjautuneen tilaan. Kirjaudu ulos nähdäksesi ne.",
      "toast.discardQ": "Hylätäänkö {v} ja {n} kohdetta tältä laitteelta?",
      "toast.discarded": "Hylätty tältä laitteelta",
      "toast.deletedForever": "Poistettu pysyvästi",
      "sync.loading": "Synkronoidaan…",
      "sync.offline":
        "Ei verkkoyhteyttä · muutokset säilyvät tälle laitteelle",
      "sync.syncFailed":
        "Palvelimeen ei saa yhteyttä · muutokset säilyvät tälle laitteelle",
      "fav.price": "Hinta per kWh (€)",
      "fav.priceHint":
        "Jätä tyhjäksi, jos haluat käyttää oletushintaa. Suosikin hinta otetaan käyttöön automaattisesti, kun valitset paikan.",
      "im.target": "Tuo ajoneuvoon",
      "im.targetLead":
        "Rivit, joissa tiedostossa on ajoneuvon nimi, säilyttävät sen. Rivit ilman nimeä tuodaan tähän ajoneuvoon.",
      "set.share": "Jaa",
      "set.shareLead":
        "Anna muiden henkilöiden lisätä latauksia tähän ajoneuvoon. He eivät voi nimetä sitä uudelleen eivätkä poistaa sitä.",
      "set.shareWith": "Kuljettajan käyttäjätunnus",
      "set.shareInvite": "Kutsu",
      "set.shareHint":
        "Käyttäjätunnus on verkkotunnuksen edessä oleva osa. Sähköpostiosoitetta ei tarvita eikä tallenneta.",
      "set.shareNone": "Ei vielä muita kuljettajia.",
      "set.shareRemove": "Poista",
      "set.shareCanEdit": "Voi lisätä latauksia",
      "set.shareNotOwner": "Vain ajoneuvon omistaja voi jakaa sen.",
      "set.shareSignedOut":
        "Kirjaudu sisään, niin voit jakaa ajoneuvon toisen henkilön kanssa.",
      "set.shareNoSupport":
        "Jakaminen ei ole vielä käytössä palvelimella. Aja Supabasessa jakamisen SQL ja lataa sivu uudelleen.",
      "set.shareLoading": "Tarkistetaan jakamista…",
      "set.shareNotSaved":
        "Tämä ajoneuvo ei ole vielä tallentunut palvelimelle, joten sillä ei ole koodia. Avaa synkronointipaneeli ja katso, miksi tallennus on jumissa.",
      "set.shareTimeout":
        "Palvelin ei vastannut ajoissa. Tarkista yhteys ja yritä uudelleen.",
      "set.shareFailed":
        "Koodia ei saatu tälle ajoneuvolle. Kopioi vianmääritys tiedoista.",
      "a11y.shareVeh": "Jaa ajoneuvo: {v}",
      "a11y.unshare": "Poista käyttöoikeus: {v}",
      "a11y.acceptShare": "Hyväksy käyttöoikeus: {v}",
      "a11y.setRole": "Rooli: {v}",
      "a11y.rejectShare": "Kiellä käyttöoikeus: {v}",
      "role.viewer": "Katselija",
      "role.driver": "Kuljettaja",
      "role.admin": "Ylläpitäjä",
      "set.sharePendingTitle": "Odotavat pyynnöt",
      "set.sharePendingLead":
        "Nämä henkilöt syöttivät jakokoodin. He eivät näe eivätkä voi muuttaa mitään, ennen kuin hyväksyt heidät.",
      "set.shareMembersTitle": "Henkilöt, joilla on käyttöoikeus",
      "set.shareAccept": "Hyväksy",
      "set.shareReject": "Kiellä",
      "set.pendingTag": "Odottaa hyväksyäsi",
      "set.pendingNoHistory":
        "Ei vielä mitään näytettävää. Odotat omistajan hyväksyntää pyynnöillesi tälle ajoneuvolle.",
      "nav.bin": "Roskakori",
      "bin.title": "Roskakori",
      "bin.lead":
        "Poistetut kohteet odottavat täällä eivätkä katoa, joten virheen voi palauttaa. Palautus palauttaa latauksen alkuperäiseen paikkaansa.",
      "bin.empty": "Tyhjennä roskakori",
      "bin.emptyHint":
        "Mitään ei poisteta automaattisesti. Kohteet pysyvät täällä, kunnes poistat ne pysyvästi.",
      "bin.emptyBody":
        "Roskakori on tyhjä. Poistamasi kohteet odottavat täällä, jotta voit palauttaa ne.",
      "bin.vehicles": "Ajoneuvot",
      "bin.sessions": "Lataukset",
      "bin.favs": "Suosikkisijainnit",
      "bin.restore": "Palauta",
      "bin.purge": "Poista pysyvästi",
      "toast.vehBinned": "{v} siirretty roskakoriin",
      "toast.favBinned": "Siirretty roskakoriin",
      "toast.restored": "Palautettu",
      "toast.binEmptied": "Roskakori tyhjennetty",
      "toast.purged": "Poistettu pysyvästi",
      "toast.emptyBinQ":
        "Poistetaanko {n} kohdetta roskakorista pysyvästi? Tätä ei voi perua.",
      "toast.purgeQ": "Poistetaanko {v} ja {n} kohdetta pysyvästi?",
      "set.pendingNoAddLead":
        "Odotat omistajan hyväksyntää. Näet ajoneuvon, mutta et sen historiaa.",
      "set.viewerNoAddLead":
        "Sinulla on vain lukuoikeus tähän ajoneuvoon.",
      "toast.shareAccepted": "{u} sai käyttöoikeuden",
      "toast.shareRejected": "Käyttöoikeus evättiin: {u}",
      "toast.shareRoleOk": "{u} on nyt {r}",
      "toast.rejectQ":
        "Kielletäänkö käyttöoikeus käyttäjälle {u}? Hän tarvitsee uuden koodin ja uuden pyynnön.",
      "toast.noPermission": "Sinulla ei ole oikeutta siihen",
      "toast.pendingNoAdd":
        "Odotat hyväksyntää, etk voi vielä lisätä latauksia.",
      "toast.codePending":
        "Pyyntö lähetetty ajoneuvolle {v}. Saat käyttöoikeuden, kun omistaja hyväksyy sen.",
      "toast.codeAlreadyMember": "Sinulla on jo käyttöoikeus ajoneuvoon {v}",
      "toast.codeAlreadyPending":
        "Pyynnösi ajoneuvoon {v} odottaa jo hyväksyntää.",
      "confirm.rejectShare": "Kiellä käyttöoikeus",
      "confirm.reject": "Kiellä",
      "confirm.irreversibleSession":
        "Tämä siirtyy roskakoriin, ei katoa. Voit palauttaa sen, kunnes tyhjennät roskakorin — mutta siihen asti se on tallessa myös palvelimella. Valitse “Poista pysyvästi”, jos haluat sen heti pois.",
      "confirm.irreversibleClear":
        "Kaikki lataukset siirtyvät roskakoriin ja pysyvät palvelimella, kunnes tyhjennät roskakorin. Voit palauttaa kaiken siihen asti.",
      "confirm.irreversibleWipe":
        "Kaikki siirtyy roskakoriin: jokainen ajoneuvo, lataus ja suosikki. Ne pysyvät palvelimella, kunnes tyhjennät roskakorin.",
      "confirm.irreversibleUnshare":
        "Hän menettää käyttöoikeuden heti eikä näe ajoneuvoa enää. Hänen jo lisäämänsä lataukset säilyvät, mutta hän ei voi enää muuttaa niitä.",
      "confirm.irreversibleVehicle":
        "Ajoneuvo ja sen lataukset siirtyvät roskakoriin ja pysyvät palvelimella, kunnes tyhjennät sen. Valitse “Poista pysyvästi”, jos haluat ne heti pois.",
      "confirm.emptyBin": "Tyhjennä roskakori",
      "confirm.deleteForever": "Poista pysyvästi",
      "confirm.toBin": "Siirrä roskakoriin",
      "confirm.close": "Sulje",
      "confirm.logout": "Kirjaudu ulos",
      "confirm.discard": "Hylkää",
      "confirm.irreversibleEmptyBin":
        "Tätä ei voi perua. Kaikki roskakorissa oleva poistetaan tältä laitteelta ja tietokannasta pysyvästi. Ei varmuuskopiota eikä peruutusta.",
      "confirm.irreversiblePurge":
        "Tätä ei voi perua. Kohde poistetaan tältä laitteelta ja tietokannasta pysyvästi.",
      "confirm.irreversibleDiscard":
        "Tätä ei voi perua. Kohde ei koskaan päässyt palvelimelle, joten hylkääminen poistaa sen tältä laitteelta pysyvästi.",
      "confirm.resetDevice": "Tyhjennä tämä laite",
      "confirm.typeToConfirm": "Kirjoita vahvistus-sana",
      "confirm.expectHint": "Painike aukeaa, kun kirjoitat {w} täsmälleen.",
      "confirm.irreversibleReset":
        "Tätä ei voi perua. Kaikki tähän selaimeseen tallennettu data poistetaan kaikilta tileiltä. Palvelimella oleva data ei muutu, ja se tulee takaisin kirjautuessasi sisään.",
      "ph.shareuser": "esim. anna",
      "ph.favprice": "esim. 0,30",
      "toast.favPrice": "Hinnaksi asetettiin {p} per kWh",
      "toast.shareOk": "{u} voi nyt lisätä latauksia ajoneuvoon {v}",
      "toast.shareFail":
        "Jakaminen ei onnistunut. Tarkista käyttäjätunnus ja että omistat ajoneuvon.",
      "toast.shareNoName": "Anna ensin käyttäjätunnus",
      "toast.unshareQ": "Poistetaanko käyttöoikeus käyttäjältä {u}?",
      "toast.unshareOk": "Käyttöoikeus poistettu käyttäjältä {u}",
      "fav.priceCents": "Hinta sentteinä",
      "ph.favcents": "esim. 35",
      "aria.favcents": "hinta per kWh kokonaisina eurosentteinä",
      "set.shareCodeLabel": "Ajoneuvosi koodi",
      "set.shareCodeNone": "ladataan…",
      "set.shareCopy": "Kopioi koodi",
      "set.shareRotate": "Uusi koodi",
      "set.shareCodeHint":
        "Kuka tahansa, jolla on tämä koodi, voi lisätä ajoneuvon omaan tililleen. Uusi koodi poistaa vanhan käytöstä, ja kaikki jo lisänneet säilyttävät oikeutensa.",
      "set.redeem": "Lisää jaettu ajoneuvo",
      "set.redeemLead":
        "Joku antoi sinulle koodin ajoneuvoonsa. Syötä koodi tähän, niin ajoneuvo ilmestyy listaasi ja voit lisätä siihen latauksia.",
      "set.redeemLabel": "Koodi",
      "set.redeemGo": "Lisää ajoneuvo",
      "set.redeemHint":
        "Kuusi merkkiä, kirjaimia ja numeroita, esimerkiksi K7M2QX. Merkkejä 0/O ja 1/I ei käytetä, jotta koodi voidaan lukea ääneen.",
      "set.sharedTag": "jaettu",
      "aria.redeemcode":
        "ajanoneuvon koodi, jonku joku on jakanut sinulle",
      "ph.redeemcode": "esim. K7M2QX",
      "toast.codeOk": "{v} lisättiin ajoneuvoihisi",
      "toast.codeAlready": "{v} oli jo listallasi",
      "toast.codeNoSuch":
        "Koodille {c} ei löydy ajoneuvoa. Tarkista koodi koodin antaneelta henkilöltä.",
      "toast.codeEmpty": "Syötä koodi ensin",
      "toast.codeLooking": "Haetaan koodilla…",
      "toast.codeOwn": "{v} on oma ajoneuvosi",
      "toast.codeUnavailable":
        "Koodit eivät ole vielä käytössä palvelimella. Aja Supabasessa koodien SQL ja lataa sivu uudelleen.",
      "toast.codeCopied": "Koodi {c} kopioitu",
      "toast.codeCopyFail": "Kopiointi epäonnistui. Koodi on {c}",
      "toast.codeRotated": "Uusi koodi: {c}",
      "toast.codeRotateQ":
        "Uusitaanko koodi? Vanha koodi poistuu käytöstä heti.",
      "toast.codeFail": "Koodin vaihtaminen epäonnistui.",
      "set.leave": "Poistu",
      "set.cancelRequest": "Peruuta pyyntö",
      "set.clearRequest": "Poista pyyntö",
      "set.capacity": "Akun kapasiteetti",
      "set.capTimes": "× 95 % =",
      "set.capUsable": "Laskennassa käytettävä käyttökapasiteetti",
      "set.capGrossMode": "Brutto — tyypinumerot",
      "set.capNetMode": "Käyttö — tarkka lukema",
      "set.capHintGross": "Arvioitu käyttökapasiteetti: noin {n} kWh. Muokkaa, jos tiedät oikean lukeman.",
      "set.capHintNet": "Käytetään {n} kWh käyttökapasiteettina.",
      "set.capHintNone": "Kapasiteettia ei ole asetettu, joten kulutus lasketaan ladatusta energiasta.",
      "ph.capGross": "esim. 77,4",
      "ph.capUsable": "esim. 73,53",
      "grp.capacity": "Akun kapasiteetti",
      "tile.fromBattery": "akon tason mukaan, {n} osuutta",
      "tile.fromCharging": "latauksen mukaan, {n} latausta ({v} kWh/100km)",
      "tile.disagree": "menetelmät eivät täsmää",
      "tile.noLegs": "{n} kWh ei mitattu vielä",
      "tile.costLegs": "{n} latauksen yli",
      "toast.leaveQ": "Lopetetaanko {v} käyttö? Auto poistuu listaltasi. Näkyvissäsi olevaa {n} latausta siirtyy laitteesi roskakoriin, jossa ne ovat luettavissa, kunnes tyhjennät sen. Omistaja säilyttää kaiken, eikä palvelin enää näytä näitä latauksia sinulle.",
      "toast.leavePendingQ": "Peruutetaanko pyyntösi ajoneuvoon {v}? Omistaja ei enää näe sitä odottavana.",
      "toast.leftCar": "Poistuit ajoneuvosta {v}. {n} latausta on laitteesi roskakorissa.",
      "toast.requestCancelled": "Pyyntö ajoneuvoon {v} peruutettu",
      "toast.leaveBlocked": "Poistuminen ei onnistunut. Mitään ei muutettu.",
      "toast.leaveNeedsSql": "Tietokanta ei vielä sallinut tätä. Ensin on ajettava siirtymä 10-leave-share.sql.",
      "toast.leaveOffline": "Ei onnistunut: yhteys palvelimeen puuttuu.",
      "toast.leaveSignedOut": "Kirjaudu sisään poistaaksesi jaetun ajoneuvon.",
      "log.by": "— {n}",
      "log.byYou": "— sinä",
      "log.byUnknown": "— jäseneltä, joka on poistunut",
      "confirm.cancelRequest": "Peruutetaanko pyyntö?",
      "confirm.leaveCar": "Poistutko tästä autosta?",
      "a11y.leaveVeh": "Lopeta {v} käyttö tai poista pyyntösi siihen",
      "confirm.shareRotate": "Uusi koodi?",
      "confirm.yes": "Kyllä, jatka",
      "odo.title": "Tarkista mittarilukema",
      "odo.lowerThanHistory":
        "{d} km on vähemmän kuin {v} päivätty {f} km. Yleensä syy on kirjoitusvirhe. Käytä {f} km, tallenna silti {d} km, tai peruuta muuttamatta mitään.",
      "odo.usePrevious": "Käytä {f} km",
      "odo.keepAnyway": "Tallenna silti {d} km",
      "odo.savedWithout": "Tallennettiin ilman lukemaa. Voit lisätä mittarilukeman myöhemmin.",
      "st.title": "Etsi laturi",
      "st.lead": "Etsii todellisia latureita lähelläsi. Suomessa lähte on Digitrafficin valtakunnallinen rekisteri, muualla OpenStreetMap. Mitään ei tallenneta eikä lähetetä mihään muuhun kuin näihin karttapalveluihin.",
      "st.find": "Etsi laturi",
      "st.findNear": "Lähellä olevat",
      "st.searching": "Etsitään sijaintiasi…",
      "st.found": "{n} laturia {r} km säteellä.",
      "st.none": "Ei vielä näytettäviä latureita.",
      "st.noneNear": "Ei kartoitettuja latureita {n} km säteellä.",
      "st.lookupFailed": "Laturipalvelu ei vastannut ({e}). Yritä hetken kuluttua uudelleen tai kirjoita nimi ja siirrä nappi.",
      "st.geoFail": "Sijaintia ei saatu ({n}).",
      "st.use": "Käytä",
      "st.chosen": "{v} — nappi ja nimi täytetty.",
      "st.unnamed": "Laturi",
      "st.plugs": "{n} pistoketta",
      "st.paid": "maksullinen",
      "st.free": "ilmainen",
      "st.source": "Laturitiedot Suomessa © Digitraffic / Fintraffic. Muualla © OpenStreetMapin yhteisö, välityksellä Overpass. Kattavuus vaihtelee: kaupunkiverkot ovat kattavia, maaseudulla harvat.",
      "st.foundCached": "{n} laturia {r} km säteellä, tallennetusta listasta.",
      "st.offline": "Et ole verkossa. Laturihaku vaatii yhteyden.",
      "st.geoUnavailable": "Tämä selain ei voi jaka sijaintiasi.",
      "st.away": "{d} m päässä",
      "st.openDetails": "Avaa tiedot napauttamalla merkkiä",
      "st.poles": "{n} laturia",
      "st.polesTitle": "Laturit ({n})",
      "st.poleUnknown": "Pistoketyyppiä ei ole ilmoitettu",
      "st.moreCount": "Näytä {n} muuta",
      "st.cacheStale": "Käytetään tallennettua {n} laturin listaa. Päivitetään…",
      "st.noLive": "Reaaliaikaista tilaa julkaistaan vain Suomessa.",
      "st.liveLoading": "Tarkistetaan reaaliaikaista tilaa…",
      "st.liveNone": "Tälle asemalle ei ilmoiteta reaaliaikaista tilaa.",
      "st.liveFail": "Reaaliaikaiseen tilapalveluun ei saatu yhteyttä.",
      "st.live": "{a} vapaana {n}:sta. {rest}",
      "st.liveRest": "Tila: {c}",
      "st.polesMore": "ja {n} muuta ei ole listattu",
      "cam.find": "Lähellä olevat kamerat",
      "cam.loading": "Etsitään kameroita…",
      "cam.found": "{n} tiekameraa {r} km säteellä. Näytetään {n2} lähintä.",
      "cam.none": "Ei tiekameraita {n} km säteellä.",
      "cam.failed": "Kamerapalvelu ei vastannut ({e}).",
      "cam.open": "Avaa koko kuva: {v}",
      "cam.alt": "Tiekamera {v}",
      "cam.ageMinutes": "{n} min sitten",
      "cam.ageHours": "{n} t sitten",
      "cam.ageDays": "{n} päivää sitten",
      "cam.ageUnknown": "aika tuntematon",
      "cam.nearStation": "Kamerat tämän laturin lähellä",
      "cam.note": "Nämä ovat tiekamerat, eivät nopeuskamerat. Kuvat haetaan Digitrafficista eikä mitään tallenneta.",
      "cam.foundRough": "{n} tiekameraa {r} km säteellä, näytetään {n2} lähintä. Sijaintisi oli tarkkuudelta noin {a} m.",
      "st.statusOther": "{n} {s}",
      "st.foundRough": "{n} laturia {r} km säteellä. Sijaintisi oli tarkkuudelta noin {a} m.",
      "st.foundRoughCached": "{n} laturia {r} km säteellä tallennetusta listasta. Sijaintisi oli tarkkuudelta noin {a} m.",
      "st.noneRough": "Ei kartoitettuja latureita {n} km säteellä. Sijaintisi oli tarkkuudelta noin {a} m, joten lähellä voi olla.",
      "cam.usedStationFix": "Sijaintia ei saatu, joten nämä ovat viimeisimmän haun paikan ympärillä.",
      "locNearStation": "Lähellä olevat laturit",
      "locNearSaved": "Suosikkisi",
      "locNearUsed": "Lataettu täällä aiemmin",
      "odo.startReading": "ajoneuvon alkumerkintä",
      "durHintDefault": "Näytetään 30 minuuttia, kunnes sinulla on {n} kirjattua latausta.",
      "durHintAvg": "Näytetään keskiarvo {n} kirjatusta latauksesta.",
      "st.status_unknown": "{n} tuntematon",
      "st.status_planned": "{n} ei vielä käytössä",
      "st.status_inoperative": "{n} ei toimi",
      "st.status_reserved": "{n} varattu",
      "st.status_blocked": "{n} estetty",
      "st.status_outoforder": "{n} pois käytöstä",
      "st.status_charging": "{n} käytössä",
      "st.status_available": "{n} vapaana",
    },
    sv: {
      "ed.for": "Fordon {n} - skapad {d}",
      "fav.update": "Uppdatera favorit",
      "toast.looking": "Söker ”{q}”…",
      "toast.found": "Hittade: {v}",
      brand: "Laddningslogg för elbilar",
      "nav.dashboard": "Översikt",
      "nav.add": "Lägg till session",
      "veh.sessions": "{n} session(er)",
      "nav.log": "Laddningslogg",
      "nav.fav": "Favoriter",
      "nav.set": "Inställningar",
      db: "Lokalt lagring · {n} session(er) · {v} fordon",
      "dash.lead": "Summor för valt fordon. Alla räknare börjar på noll.",
      "dash.pick": "Välj fordon",
      "qa.import": "Importera data",
      "qa.addVehicle": "Lägg till fordon",
      "tile.kwh": "Laddad energi",
      "tile.dist": "Sträcka",
      "tile.distEst": "Sträcka (sedan första mätning)",
      "tile.distEstHelp":
        "Ingen startodometer har angetts för det här fordonet, så sträckan mäts från första loggade mätningen.",
      "tile.distHelp":
        "Sträcka från startodometern du angett för det här fordonet.",
      "tile.cost": "Total kostnad",
      "tile.time": "Total laddningstid",
      "tile.kwh100": "medel kWh / 100 km",
      "tile.cost100": "medel kr / 100 km",
      "tile.speed": "medel laddningseffekt",
      "tile.duravg": "medel sessionstid",
      "as.title": "Lägg till laddningssession",
      "as.date": "Datum",
      "as.time": "Tid",
      "as.dur": "Sessionstid",
      "as.durHint": "Timme, minut och sekund.",
      "as.mileage": "Mätarställning (km)",
      "as.location": "Plats / laddare",
      "as.find": "📍 Sök",
      "as.myloc": "Near mig",
      "as.mapDrag":
        "Dra nålen för att justera platsen, eller klicka på kartan.",
      "as.mapOff":
        "Kartan är inte tillgänglig offline. Adressen sparas ändå med sessionen.",
      "as.energy": "Laddad energi (kWh)",
      "as.socStart": "Start %",
      "as.socEnd": "Slut %",
      "ph.soc": "t.ex. 20",
      "as.total": "Totalbelopp",
      "as.price": "Pris per kWh",
      "as.centsUnit": "öre / kWh",
      "as.priceHint1":
        "Hela eurocent, alltså 35 betyder 0,35 €/kWh. Ange totalbelopp eller pris, den andra räknas ut automatiskt.",
      "as.notes": "Anteckningar",
      "as.fast": "Snabbladdning",
      "as.home": "Hemmaladdning",
      "as.saveFav": "Spara den här platsen som favorit",
      "as.favName": "Favoritens namn",
      "as.favHint":
        "Lämna tomt för att använda platsens text. Kartposition kan läggas till senare under Favoriter.",
      "ph.loc": "Börja skriva en adress…",
      "ph.mileage": "t.ex. 45000",
      "ph.energy": "t.ex. 52,4",
      "ph.auto": "automatiskt",
      "ph.notes": "t.ex. 150 kW, 24 °C, batteri 20 → 80 %",
      "ph.favname": "t.ex. Hem, Vaasa S1",
      "cl.lead": "Sparade sessioner, nyast först.",
      "cl.none":
        "Inga sessioner än — lägg till en under ”Lägg till session”.",
      "th.date": "Datum",
      "th.time": "Tid",
      "th.dur": "Tid",
      "th.loc": "Plats",
      "th.energy": "Energi",
      "th.speed": "medel effekt",
      "th.mileage": "Sträcka",
      "th.cost": "Kostnad",
      "th.tags": "Etiketter",
      "th.notes": "Anteckningar",
      "th.del": "Ta bort",
      "tag.fast": "Snabb",
      "tag.home": "Hem",
      "tag.fav": "★ Favorit",
      "tag.est": "Beräknat med ditt pris",
      "fav.title": "Favoritplatser",
      "fav.lead":
        "Namnge dina vanliga laddningsställen, slå upp adressen och placera nålen på kartan.",
      "fav.name": "Namn",
      "fav.address": "Adress",
      "fav.find": "Sök",
      "fav.findHint":
        "Skriv en adress och tryck Sök. Använder OpenStreetMap när du är uppkopplad.",
      "fav.lat": "Latitud",
      "fav.lng": "Longitud",
      "fav.mapOff":
        "Kartan är inte tillgänglig offline. Du kan ange koordinater manuellt.",
      "fav.save": "Spara favorit",
      "fav.clear": "Tyda formuläret",
      "fav.saved": "Sparade",
      "fav.geoMissing": "Slå upp saknade koordinater",
      "toast.geoNoneMissing":
        "Alla sparade platser har redan koordinater ({s} kontrollerade).",
      "toast.geoDone":
        "Hittade {n}, kunde inte placera {f}. {s} hade redan koordinater och lämnades orörda.",
      "toast.geoProgress": "Slår upp {d} av {t}… {n} hittade",
      "fav.use": "Använd",
      "fav.edit": "Redigera",
      "fav.map": "Karta",
      "fav.del": "Ta bort",
      "fav.noCoords": " · inga koordinater",
      "fav.uses": "{n} användning(ar)",
      "fav.empty":
        "Inga favoriter än — namnge en ovan, eller kryssa i ”Spara den här platsen som favorit” när du loggar en session.",
      "set.vehicles": "Fordon",
      "set.vehiclesLead":
        "Fordon visas i en växlare först när det finns fler än ett.",
      "set.saveVehicle": "Spara fordon",
      "set.rename": "Byt namn",
      "set.remove": "Ta bort",
      "set.price": "Energipris",
      "set.priceLead":
        "Används för sessioner där kostnaden lämnas tom. Samma värde går att ändra i hela eurocent på sidan Lägg till session.",
      "set.priceEur": "Pris per kWh (€)",
      "set.priceCents": "Samma pris i öre",
      "set.export": "Exportera data",
      "set.exportLead":
        "Ladda ner laddningsloggen som en fil. Omfattningen avgör vilket fordon filen gäller.",
      "set.scope": "Omfattning",
      "set.allVehicles": "Alla fordon",
      "set.exportCsv": "Exportera CSV",
      "set.exportJson": "Exportera JSON",
      "set.tplCsv": "CSV-mall",
      "set.tplJson": "JSON-mall",
      "set.data": "Data",
      "set.dataLead": "Säkerhetskopiera, återställ och städa.",
    "set.layout": "Layout",
    "set.layoutHint": "Samma app i två layouter. Ingenting flyttas eller importeras om när du byter, och dina data och ditt konto är desamma i båda.",
    "set.layoutClassic": "Klassisk (sidopanel)",
    "set.layoutWide": "Bred (toppfält)",
      "set.backup": "Säkerhetskopiera JSON",
      "set.restore": "Återställ säkerhetskopia",
      "set.diag": "Kopiera diagnostik",
      "set.diagCopied": "Diagnostiken är kopierad. Klistra in den i en felrapport.",
      "set.diagFailed": "Kopieringen misslyckades. Öppna webbläsarens utvecklarverktyg och rapportera där.",
      "set.clear": "Rensa sessioner",
      "set.wipe": "Ta bort allt",
      "im.title": "Importera laddningsdata",
      "im.lead":
        "Ladda sessioner från en fil. Stöds: <strong>.csv</strong>, <strong>.tsv</strong> och <strong>.json</strong>. Befintliga sessioner behålls, och importerade sessioner läggs till fordonet i kolumnen <em>Fordon</em>, eller till det fordon som är valt när kolumnen saknas eller är tom.",
      "im.choose": "Välj en fil",
      "im.go": "Importera fil",
      "im.tplNote":
        "Mallar för en ny fil finns under Exportera data ovan.",
      "how.title": "Så måste filen vara formaterad",
      "how.cols": "Kolumnnamn (CSV / TSV)",
      "how.p1":
        "Första raden måste vara en rubrikrad. Kolumnnamn matchas oberoende av skiftläge, och mellanslag, understreck och bindestreck ignoreras, så <code>Energy (kWh)</code>, <code>energy_kwh</code> och <code>ENERGY</code> alla fungerar.",
      "how.th1": "Kolumn",
      "how.th2": "Obligatorisk",
      "how.th3": "Godkända värden",
      "how.date": "ÅÅÅÅ-MM-DD, t.ex. <code>2026-09-28</code>",
      "how.time": "HH:MM 24-timmars, t.ex. <code>08:15</code>",
      "how.loc": "Valfri text, t.ex. <code>Supercharger Vaasa</code>",
      "how.energy": "Tal i kWh, t.ex. <code>52,4</code>",
      "how.dur":
        "<code>HH:MM</code> eller decimaltimmar, t.ex. <code>00:45</code> eller <code>0,75</code>",
      "how.mileage": "Tal i kilometer, t.ex. <code>45000</code>",
      "how.cost":
        "Tal i euro, t.ex. <code>12,50</code>. Lämna tomt för att använda ditt pris per kWh",
      "how.vehicle":
        "Fordonets namn. Ett nytt fordon skapas för ett okänt namn",
      "how.notes": "Valfri text",
      "how.flags":
        "<code>ja</code>/<code>nej</code>, <code>true</code>/<code>false</code> eller <code>1</code>/<code>0</code>",
      "how.csv": "CSV-exempel",
      "how.tsvTitle": "TSV",
      "how.tsv":
        "Samma som CSV men kolumnerna skiljs med ett tabbtecken. Att spara en CSV som ”Tab-separated (.tsv)” från Excel eller Google Sheets fungerar.",
      "how.json": "JSON",
      "how.jsonP":
        "Antingen en enkel array med sessioner, eller en fil från <em>Säkerhetskopiera JSON</em> (som kan innehålla <code>vehicles</code>, <code>favourites</code> och <code>pricePerKwh</code>).",
      "how.notes2": "Observera",
      "how.n1":
        "Första raden i en UTF-8-fil kan innehålla en byte order mark; den hoppas över.",
      "how.n2":
        'Text med komma, semikolon eller citattecken måste omslutas av dubbla citattecken (<code>"Ab, Inc."</code>).',
      "how.n3":
        "Rader som saknar datum, tid, plats eller ett numeriskt energivärde hoppas över och listas med skälet, så ingenting importeras i smyg.",
      "ed.title": "Redigera laddningssession",
      "ed.durHint": "Timme, minut och sekund.",
      "ed.cost": "Kostnad (€)",
      "ed.fav": "Sparad som favoritplats",
      "ed.save": "Spara ändringar",
      "ed.cancel": "Avbryt",
      "ed.del": "Ta bort",
      "aria.theme": "Byt färgtema",
      "aria.map": "Karta",
      "aria.sessMap": "Karta över vald plats",
      "aria.edit": "Redigera session",
      "aria.del": "Ta bort session",
      "aria.newveh": "Nytt fordonnamn",
      "aria.addr": "Adress",
      "aria.cents": "Pris per kWh i eurocent",
      foot: "Laddningslogg för elbilar · data stannar i den här webbläsaren",
      "ph.vehname": "Fordonets namn, t.ex. Tesla Model 3",
      "ph.addr": "Gata, stad, land",
      "tag.yes": "ja",
      "tag.no": "nej",
      "toast.storage":
        "Lagringsutrymmet är fullt — sessionen sparades inte",
      "toast.favSave": "Favoriter kunde inte sparas",
      "toast.saved": "Sessionen sparades för {v}",
      "toast.savedFav":
        "Sessionen sparades för {v} · favoriten uppdaterad",
      "toast.updated": "Sessionen uppdaterad",
      "toast.deleted": "Sessionen borttagen",
      "toast.delFav": "Favoriten borttagen",
      "toast.vehAdd": "{v} tillagt",
      "toast.vehRem": "{v} borttaget",
      "toast.vehName": "Ge fordonet ett namn",
      "toast.csv": "{n} session(er) exporterade som CSV",
      "toast.json": "{n} session(er) exporterade",
      "toast.nothing": "Inget att exportera än",
      "toast.backup": "Säkerhetskopia nedladdad",
      "toast.restore": "Återställde {n} session(er) och {f} favorit(er)",
      "toast.restoreOrphans":
        "Återställde {n} session(er) och {f} favorit(er) · {o} session(er) hoppades över eftersom deras fordon saknades",
      "toast.badRestore": "Filen är inte en giltig säkerhetskopia",
      "toast.cleared": "Sessionerna rensade",
      "toast.wiped": "Allt borttaget",
      "toast.clearQ":
        "Ta bort alla {n} sparade session(er)? Fordon och favoriter behålls.",
      "toast.wipeQ":
        "Ta bort alla fordon, alla sessioner och alla favoriter? Det går inte att ångra.",
      "toast.remQ": "Ta bort {v} och dess {n} session(er)?",
      "toast.delQ": "Ta bort sessionen på {loc}?",
      "toast.renQ": "Nytt namn för {v}",
      "toast.delFavQ": "Ta bort favoriten ”{n}”?",
      "toast.imported": "{n} session(er) importerade",
        "toast.notAllYours": "{n} rad(er) tillhör någon annan och lämnades orörda",
      "toast.tplCsv": "CSV-mall nedladdad",
      "toast.tplJson": "JSON-mall nedladdad",
      "toast.locFirst": "Skriv en adress först",
      "toast.offline":
        "Du ser ut att vara offline. Ange koordinater manuellt eller använd kartan.",
      "toast.noMatch":
        "Ingen träff för ”{q}”. Prova en mer fullständig adress.",
      "toast.geoFail":
        "Adresssökningen misslyckades (offline eller blockerad). Du kan fortfarande placera nålen eller skriva koordinater.",
      "toast.locFirst2": "Skriv en adress först.",
      "toast.offline2":
        "Du är offline — adressen sparas ändå med sessionen.",
      "toast.noMatch2": "Ingen träff för ”{q}”.",
      "toast.geoFail2":
        "Adresssökningen misslyckades (offline eller blockerad).",
      "toast.geoNone": "Den här webbläsaren kan inte dela din plats.",
      "toast.geoWait": "Väntar på platsbehörighet…",
      "toast.geoDenied":
        "Platsbehörighet nekades. Du kan fortfarande söka adressen.",
      "toast.geoUnavail": "Din plats är inte tillgänglig just nu.",
      "toast.geoError": "Kunde inte läsa din plats.",
      "toast.geoPerm": "Du kan fortfarande söka adressen.",
      "toast.geoNear": "Near {v} — {d} m bort, användes som plats.",
      "toast.geoNearF":
        "Närmaste sparade plats är {v}, {d} m bort. Nålen satt på din position — justera vid behov.",
      "toast.geoNoNear":
        "Ingen sparad laddningsplats i närheten. Nålen satt på din position — skriv stationens namn eller dra nålen.",
      "toast.showing": "Visar {v}",
      "toast.pinMoved": "Nålen flyttad till {a}, {b}",
      "toast.favName": "Lägg till ett namn eller en adress",
      "toast.favCoords": "Både latitud och longitud måste fyllas i",
      "toast.favSavedMap": "{v} sparad med kartposition",
      "toast.favSavedNo": "{v} sparad — lägg till kartposition senare",
      "toast.priceNow":
        "Hela eurocent, alltså 35 betyder 0,35 €/kWh. Nu {v} per kWh",
      "toast.priceFromTotal": " — priset räknat ut från totalen.",
      "toast.priceFromPrice": " — totalen räknad ut från detta.",
      "toast.priceEnergy": "kWh",
      "toast.priceNeed": "energi behövs",
      "toast.priceHint": "Lämna tomt för att använda {v} per kWh",
      "toast.priceNeedE": "Ange den laddade energin för att se totalen.",
      "toast.centsMirror": "{c} öre = {v} / kWh",
      "err.json": "Kunde inte läsa filen som JSON.",
      "err.jsonBad": "Filen är inte giltig JSON: {m}",
      "err.jsonShape":
        "Förväntade en array med sessioner, eller ett säkerhetskopieobjekt med en sessions-array.",
      "err.rowObj": "rad {n}: är inte ett objekt",
      "err.empty": "Inget att importera.",
      "err.emptyMore": "Filen behöver en rubrikrad och minst en datarad.",
      "err.cols": "Rubrikraden saknar obligatoriska kolumner.",
      "err.colsReq":
        "Obligatoriska kolumner: date, time, location, energy.",
      "err.colsFound": "Hittade: {c}",
      "err.ignored": "ignorerade okända kolumner: {c}",
      "err.noneImported": "Inget importerades ({n} problem hittades).",
      "err.date":
        "rad {n}: datum saknas eller är fel (använd ÅÅÅÅ-MM-DD)",
      "err.time":
        "rad {n}: tid saknas eller är fel (använd HH:MM, 00:00-23:59)",
      "err.loc": "rad {n}: plats saknas",
      "err.energy": "rad {n}: energi måste vara ett tal i kWh",
      "err.energyNeg": "rad {n}: energi kan inte vara negativ",
      "err.dur": "rad {n}: tid måste vara HH:MM eller decimaltimmar",
    "err.noVehicle": "rad {n}: fordonet den hör till finns inte i filen",
      "err.mileage": "rad {n}: mätarställning måste vara ett tal",
      "err.cost": "rad {n}: kostnad måste vara ett tal",
      "err.fileOpen": "Kunde inte läsa filen.",
      "err.open": "Filen kunde inte öppnas.",
      more: "… och {n} till",
      "veh.created": "{v} skapad",
      "imp.note": "Importerade {n} session(er).",
      "log.for": "{n} session(er) sparade för {v}, nyast först.",
      "log.none": "Inga sessioner sparade för {v} än.",
      yes: "ja",
      no: "nej",
      lang: "Språk",
      "a11y.skip": "Hoppa till huvudinnehållet",
      "a11y.nav": "Huvudmeny",
      "a11y.stats": "Summor för valt fordon",
      "a11y.vehList": "Fordonsval",
      "a11y.picked": "Valt: {v}",
      "a11y.editSession": "Redigera session: {v}, {d}",
      "a11y.deleteSession": "Ta bort session: {v}, {d}",
      "a11y.useFav": "Använd favoritplats: {v}",
      "a11y.editFav": "Redigera favorit: {v}",
      "a11y.deleteFav": "Ta bort favorit: {v}",
      "a11y.renameVeh": "Byt namn på fordon: {v}",
      "a11y.removeVeh": "Ta bort fordon: {v}",
      "grp.when": "När sessionen skedde",
      "grp.duration": "Längd och sträcka",
      "grp.soc": "Batterinivå, start och slut",
      "grp.coords": "Kartkoordinater",
      "grp.vehicle": "Fordonsuppgifter",
      "chart.title": "Energi och kostnad per månad",
      "chart.energy": "Energi (kWh)",
      "chart.cost": "Kostnad (EUR)",
      "chart.empty":
        "Inga sessioner för det här fordonet ännu. Lägg till en för att se månadskartan.",
      "chart.loading": "Läser in…",
      "chart.offline":
        "Diagrambiblioteket kunde inte laddas (ingen internetanslutning?). Allt annat fungerar normalt.",
      "how.soc":
        "Batteriets laddningsnivå före och efter sessionen, i procent (0-100). Lämna tomt om okänt.",
      "err.soc":
        "Rad {n}: batteriprocent är inte ett tal, lämnades tomt.",
      "set.editVehicle": "Redigera fordon",
      "set.initialOdoLead":
        'Startodometern är distansens "nollpunkt": distans = högsta loggade mätarställning − detta värde.',
      "as.initialOdo": "Startodometer (km)",
      "ph.initialodo": "t.ex. 45000",
      "aria.initialodo": "startodometerns mätarställning i kilometer",
      "as.vehicle": "Bilnamn",
      "auth.lead": "Logga in för att synka dina fordon och sessioner.",
      "auth.username": "Användarnamn",
      "auth.usernameHint": "Ingen e-postadress behövs.",
      "auth.password": "Lösenord",
      "auth.signIn": "Logga in",
      "auth.createAccount": "Skapa konto",
      "auth.logout": "Logga ut",
      "auth.logoutQ": "Logga ut från {u}?",
      "auth.expired":
        "Din session har gått ut, så ingenting kunde sparas. Logga in igen.",
      "confirm.title": "Bekräfta",
      "confirm.body": "Är du säker?",
      "confirm.ok": "Ja, fortsätt",
      "confirm.cancel": "Avbryt",
      "confirm.delete": "Ta bort",
      "confirm.remove": "Ta bort fordon",
      "confirm.deleteEverything": "Ta bort allt",
      "confirm.removeVehicle": "Ta bort det här fordonet?",
      "confirm.deleteSession": "Ta bort den här sessionen?",
      "confirm.deleteFav": "Ta bort den här favoriten?",
      "confirm.clearSessions": "Rensa alla sessioner?",
      "confirm.wipe": "Ta bort allt?",
      "auth.needAccount": "Behöver du ett konto? Registrera dig",
      "auth.haveAccount": "Redan registrerad? Logga in",
      "auth.working": "Vänta…",
      "auth.privacy":
        "Ditt användarnamn lagras med en icke-levererbar domän, så ingen riktig e-postadress skickas eller lagras.",
      "auth.ok": "Inloggad.",
      "auth.checkMail":
        "Kontot skapat. Bekräfta det i Supabase och logga sedan in.",
      "auth.notConfigured":
        "Supabase är inte konfigurerat än. Ange SUPABASE_URL och SUPABASE_ANON_KEY.",
      "auth.noLib":
        "Kunde inte läsa in Supabase-biblioteket. Kontrollera anslutningen och ladda om.",
      "auth.missing": "Ange användarnamn och lösenord.",
      "auth.shortPw": "Välj ett lösenord med minst 8 tecken.",
      "auth.badLogin": "Fel användarnamn eller lösenord.",
      "auth.notConfirmed":
        'Kontot behöver fortfarande bekräftas via e-post, vilket aldrig kan komma fram eftersom användarnamnet använder en falsk domän. Stäng av "Confirm email" i Supabase och registrera om.',
      "auth.exists":
        "Det användarnamnet är redan registrerat. Logga in i stället.",
      "auth.rate": "För många försök. Vänta en minut och försök igen.",
      "auth.failed": "Något gick fel. Försök igen.",
      "veh.default": "Fordon 1",
      "sync.pending":
        "Sparad lokalt · {n} ändring(ar) väntar på synkning",
      "sync.retryNow": "Försök nu",
      "sync.banner":
        "{n} ändring(ar) kunde inte sparas på servern. Öppna för att se varför.",
      "sync.nextTry": "Nästa försök om {n} s",
      "set.build": "Build",
      "set.sw": "SW",
      "set.swNone": "ingen (inte installerad)",
      "set.vehNameHelp":
        "Namnet du ser i appen och i fordonslistan.",
      "set.initialOdoHelp":
        "Distansen räknas från den här avläsningen. Lämna 0 om du inte vet.",
      "set.panelError":
        "Del av den här sidan kunde inte laddas. Resten fungerar fortfarande.",
      "set.account": "Konto",
      "set.accountOut":
        "Inte inloggad. Dina data stannar på den här enheten tills du loggar in.",
      "set.accountMeta": "{n} fordon · {s} session(er) på den här enheten",
      "set.theme": "Utseende",
      "set.themeLight": "Ljust",
      "set.themeDark": "Mörkt",
      "set.resetDevice": "Logga ut och töm den här enheten",
      "set.resetDeviceHint":
        "Tar bort den här enhetens kopia av alla konton och loggar ut. Inget raderas på servern.",
      "set.resetContinue": "Fortsätt",
      "set.resetQ1":
        "Tömma all data på den här enheten och logga ut från {u}? Allt som bara finns här och inte på servern går förlorat.",
      "set.resetQ2": "Skriv RESET för att bekräfta",
      "set.resetMismatch":
        "Det stämde inte. Inget raderades — skriv RESET exakt, med versaler.",
      "set.defTitle": "Standardplatser",
      "set.defLead":
        "Fyller i laddplatsen när du lägger till en session. Den fyller bara ett tomt fält, så du kan alltid skriva något annat.",
      "set.defLoc": "Standardplats",
      "set.defLocHint": "Väljs bland dina favoriter.",
      "set.defNone": "Ingen",
      "set.defHour": "Använd efter",
      "set.defNever": "Aldrig",
      "set.defHourHint": "Din egen lokala klocka.",
      "set.defGeo": "Använd min enhetsplats",
      "set.defGeoHint": "Fyller i laddplatsen åt dig när du är på någon av dina sparade platser. Din position används bara för matchningen och sparas inte.",
      "set.defApplied": "Standardplats ifylld: {v}",
      "set.geoMatched": "Nära en sparad plats: {v}",
      "set.geoAmbiguous":
        "{n} sparade platser ligger inom 100 m. Använde {v} utan pris — kontrollera och justera.",
      "set.geoTooCoarse":
        "Platsen var inte tillräckligt exakt ({n} m), så inget fylldes i.",
      "toast.defSaved": "Standardplats sparad",
      "toast.geoAllowed": "Platsåtkomst beviljad",
      "toast.geoDenied":
        "Platsåtkomst nekades, så automatisk matchning är av",
      "toast.codeTimeout":
        "Servern svarade inte i tid. Kontrollera din anslutning och försök koden igen.",
      "sync.open": "Visa synkdetaljer",
      "sync.title": "Synkstatus",
      "sync.allGoodShort": "I synk",
      "sync.lead":
        "Allt här är sparat på den här enheten och har ännu inte nått servern.",
      "sync.allGood": "Allt finns på servern. Inget väntar på synkning.",
      "sync.discard": "Kasta",
      "sync.stalledHint":
        "Servern nekade dessa, så att vänta hjälper inte. Den exakta orsaken visas under varje post. Kasta för att ta bort den från enheten, eller öppna och spara igen för att skicka en ny kopia.",
      "sync.heldHint":
        "Dessa är fine och laddas upp av sig själva så snart ägaren godkänner din åtkomst. Kasta inte bort dem: ingenting är fel med dem.",
      "sync.reason.offline": "väntar på anslutning",
      "sync.reason.queued": "väntar på att skickas",
      "sync.reason.rejected": "nekad av servern",
      "sync.reason.notYet": "väntar på att ägaren godkänner din åtkomst",
      "sync.reason.wrong":
        "servern accepterade inte den här posten (radnivåskydd)",
      "toast.legacyMoved":
        "{n} osynkade datauppgifter från en äldre version flyttades till det utloggade området. Logga ut för att se dem.",
      "toast.discardQ": "Kasta {v} och {n} post(er) från den här enheten?",
      "toast.discarded": "Kastad från den här enheten",
      "toast.deletedForever": "Raderad för alltid",
      "sync.loading": "Synkar…",
      "sync.offline":
        "Ingen anslutning · ändringar stannar på den här enheten",
      "sync.syncFailed":
        "Kunde inte nå servern · ändringar stannar på den här enheten",
      "fav.price": "Pris per kWh (€)",
      "fav.priceHint":
        "Lämna tomt för att använda standardpriset. Ett favoritpris tillämpas automatiskt när du väljer platsen.",
      "im.target": "Importera till fordon",
      "im.targetLead":
        "Rader som anger ett fordon i filen behåller det. Rader utan namn importeras hit.",
      "set.share": "Dela",
      "set.shareLead":
        "Låt andra lägga till laddningar på det här fordonet. De kan inte byta namn på det eller ta bort det.",
      "set.shareWith": "Förarens användarnamn",
      "set.shareInvite": "Bjud in",
      "set.shareHint":
        "Användarnamnet är delen före domänen. Ingen e-postadress behövs och ingen sparas.",
      "set.shareNone": "Inga andra förare ännu.",
      "set.shareRemove": "Ta bort",
      "set.shareCanEdit": "Kan lägga till laddningar",
      "set.shareNotOwner": "Endast ägaren till ett fordon kan dela det.",
      "set.shareSignedOut":
        "Logga in för att dela ett fordon med någon annan.",
      "set.shareNoSupport":
        "Delning är inte installerad på servern än. Kör delnings-SQL i Supabase och ladda om sidan.",
      "set.shareLoading": "Kontrollerar delning…",
      "set.shareNotSaved":
        "Fordonet har inte nått servern än, så det har ingen kod. Öppna synkpanelen för att se varför sparandet fastnat.",
      "set.shareTimeout":
        "Servern svarade inte i tid. Kontrollera anslutningen och försök igen.",
      "set.shareFailed":
        "Kunde inte hämta en kod för fordonet. Kopiera diagnostiken från Inställningar.",
      "a11y.shareVeh": "Dela fordon: {v}",
      "a11y.unshare": "Ta bort åtkomst för {v}",
      "a11y.acceptShare": "Godkänn åtkomst för {v}",
      "a11y.setRole": "Roll för {v}",
      "a11y.rejectShare": "Neka åtkomst för {v}",
      "role.viewer": "Läsare",
      "role.driver": "Förare",
      "role.admin": "Administratör",
      "set.sharePendingTitle": "Väntande förfrågan",
      "set.sharePendingLead":
        "De här personerna har matat in en delningskod. De kan varken se eller ändra något förrän du godkänner dem.",
      "set.shareMembersTitle": "Personer med åtkomst",
      "set.shareAccept": "Godkänn",
      "set.shareReject": "Neka",
      "set.pendingTag": "Väntar på ditt godkännande",
      "set.pendingNoHistory":
        "Inget att visa än. Du väntar på att ägaren ska godkänna din förfrågan om fordonet.",
      "nav.bin": "Papperskorg",
      "bin.title": "Papperskorg",
      "bin.lead":
        "Borttagna poster väntar här i stället för att försvinna, så ett misstag går att ångra. Återställning sätter tillbaka laddsessionen på sin ursprungliga plats.",
      "bin.empty": "Töm papperskorgen",
      "bin.emptyHint":
        "Ingenting tas bort automatiskt. Poster stannar här tills du raderar dem för alltid.",
      "bin.emptyBody":
        "Papperskorgen är tom. Det du tar bort väntar här så att du kan lägga tillbaka det.",
      "bin.vehicles": "Fordon",
      "bin.sessions": "Laddsessioner",
      "bin.favs": " Favoritplatser",
      "bin.restore": "Återställ",
      "bin.purge": "Radera för alltid",
      "toast.vehBinned": "{v} flyttades till papperskorgen",
      "toast.favBinned": "Flyttades till papperskorgen",
      "toast.restored": "Återställd",
      "toast.binEmptied": "Papperskorgen är tom",
      "toast.purged": "Raderad för alltid",
      "toast.emptyBinQ":
        "Radera {n} post(er) från papperskorgen för alltid? Detta går inte att ångra.",
      "toast.purgeQ": "Radera {v} och {n} post(er) för alltid?",
      "set.pendingNoAddLead":
        "Du väntar på ägarens godkännande. Du ser fordonet men inte dess historik.",
      "set.viewerNoAddLead":
        "Du har endast läsbehörighet till det här fordonet.",
      "toast.shareAccepted": "{u} har nu åtkomst",
      "toast.shareRejected": "Åtkomst nekades för {u}",
      "toast.shareRoleOk": "{u} är nu {r}",
      "toast.rejectQ":
        "Neka åtkomst för {u}? De behöver en ny kod och en ny förfrågan.",
      "toast.noPermission": "Du har inte behörighet för det",
      "toast.pendingNoAdd":
        "Du väntar på godkännande och kan inte lägga till laddningar än.",
      "toast.codePending":
        "Förfrågan skickad till {v}. Du får åtkomst när ägaren godkänner den.",
      "toast.codeAlreadyMember": "Du har redan åtkomst till {v}",
      "toast.codeAlreadyPending":
        "Din förfrågan för {v} väntar redan på godkännande.",
      "confirm.rejectShare": "Neka åtkomst",
      "confirm.reject": "Neka",
      "confirm.irreversibleSession":
        "Detta hamnas i papperskorgen, inte bort. Du kan återställa det tills du tömmer korgen — men tills dess ligger det kvar på servern. Välj ”Radera för alltid” om det ska bort nu.",
      "confirm.irreversibleClear":
        "Alla laddsessioner hamnar i papperskorgen och ligger kvar på servern tills du tömmer den. Du kan återställa allt tills dess.",
      "confirm.irreversibleWipe":
        "Allt hamnar i papperskorgen: varje fordon, laddsession och favorit. De ligger kvar på servern tills du tömmer korgen.",
      "confirm.irreversibleUnshare":
        "De förlorar åtkomst direkt och kan inte se fordonet igen. Sessioner de redan lagt till finns kvar, men de kan inte längre ändra dem.",
      "confirm.irreversibleVehicle":
        "Fordonet och dess sessioner hamnar i papperskorgen och ligger kvar på servern tills du tömmer den. Välj ”Radera för alltid” för att ta bort dem nu.",
      "confirm.emptyBin": "Töm papperskorgen",
      "confirm.deleteForever": "Radera för alltid",
      "confirm.toBin": "Flytta till papperskorgen",
      "confirm.close": "Stäng",
      "confirm.logout": "Logga ut",
      "confirm.discard": "Kasta",
      "confirm.irreversibleEmptyBin":
        "Detta går inte att ångra. Allt i papperskorgen raderas från den här enheten och från databasen för alltid. Ingen backup, ingen ångra.",
      "confirm.irreversiblePurge":
        "Detta går inte att ångra. Posten raderas från den här enheten och från databasen för alltid.",
      "confirm.irreversibleDiscard":
        "Detta går inte att ångra. Posten nådde aldrig servern, så att kasta bort den raderar den från den här enheten för alltid.",
      "confirm.resetDevice": "Töm den här enheten",
      "confirm.typeToConfirm": "Skriv ordet för att bekräfta",
      "confirm.expectHint": "Knappen låses upp när du skriver {w} exakt.",
      "confirm.irreversibleReset":
        "Detta går inte att ångra. Allt som lagras i den här webbläsaren raderas, för alla konton. Data som redan sparats på servern påverkas inte och kommer tillbaka när du loggar in.",
      "ph.shareuser": "t.ex. anna",
      "ph.favprice": "t.ex. 0,30",
      "toast.favPrice": "Priset satt till {p} per kWh",
      "toast.shareOk": "{u} kan nu lägga till laddningar på {v}",
      "toast.shareFail":
        "Kunde inte dela. Kontrollera användarnamnet och att du äger fordonet.",
      "toast.shareNoName": "Ange ett användarnamn först",
      "toast.unshareQ": "Ta bort åtkomsten för {u}?",
      "toast.unshareOk": "Åtkomsten borttagen för {u}",
      "fav.priceCents": "Pris i cent",
      "ph.favcents": "t.ex. 35",
      "aria.favcents": "pris per kWh i hela eurocent",
      "set.shareCodeLabel": "Din kod för fordonet",
      "set.shareCodeNone": "laddar…",
      "set.shareCopy": "Kopiera kod",
      "set.shareRotate": "Ny kod",
      "set.shareCodeHint":
        "Vem som helst med koden kan lägga till fordonet på sitt eget konto. En ny kod gör den gamla ogiltig, och alla som redan lagt till behåller sin åtkomst.",
      "set.redeem": "Lägg till ett delat fordon",
      "set.redeemLead":
        "Någon har gett dig en kod till sitt fordon. Ange den här så visas fordonet i din lista, där du kan lägga till laddningar.",
      "set.redeemLabel": "Kod",
      "set.redeemGo": "Lägg till fordon",
      "set.redeemHint":
        "Sex tecken, bokstäver och siffror, till exempel K7M2QX. 0/O och 1/I används inte, så koden kan läsas upp.",
      "set.sharedTag": "delat",
      "aria.redeemcode":
        "delningskod för ett fordon som någon delat med dig",
      "ph.redeemcode": "t.ex. K7M2QX",
      "toast.codeOk": "{v} lades till i dina fordon",
      "toast.codeAlready": "{v} fanns redan i din lista",
      "toast.codeNoSuch":
        "Inget fordon matchar koden {c}. Kontrollera koden med personen som gav den.",
      "toast.codeEmpty": "Ange koden först",
      "toast.codeLooking": "Slår upp koden…",
      "toast.codeOwn": "{v} är ditt eget fordon",
      "toast.codeUnavailable":
        "Koder är inte installerade på servern än. Kör kod-SQL i Supabase och ladda om sidan.",
      "toast.codeCopied": "Koden {c} kopierad",
      "toast.codeCopyFail": "Kopieringen misslyckades. Koden är {c}",
      "toast.codeRotated": "Ny kod: {c}",
      "toast.codeRotateQ":
        "Skapa en ny kod? Den gamla slutar fungera direkt.",
      "toast.codeFail": "Kunde inte byta kod.",
      "confirm.shareRotate": "Ny kod?",
      "confirm.yes": "Ja, fortsätt",
    },
    se: {
      "fav.name": "Namma",
      "fav.map": "Mátta",
      "fav.save": "Girjjit",
      "fav.use": "Váldit",
      "fav.del": "Bahčit",
      "fav.edit": "Rievdat",
      "set.remove": "Bahčit",
      "set.leave": "Lämna",
      "set.cancelRequest": "Avbryt förfrågan",
      "set.clearRequest": "Rensa förfrågan",
      "set.capacity": "Batterikapacitet",
      "set.capTimes": "× 95 % =",
      "set.capUsable": "Användbar kapacitet som används i beräkningen",
      "set.capGrossMode": "Brutto — siffran på databladet",
      "set.capNetMode": "Användbar — den siffra jag känner till",
      "set.capHintGross": "Uppskattad användbar kapacitet: cirka {n} kWh. Ändra den om du vet det exakta värdet.",
      "set.capHintNet": "Använder {n} kWh som användbar kapacitet.",
      "ph.capGross": "t.ex. 77,4",
      "set.capHintNone":
        "Ingen kapacitet angiven, s? f?rbrukningen m?ts fr?n laddad energi ist?llet.",
      "ph.capUsable": "t.ex. 73,53",
      "grp.capacity": "Batterikapacitet",
      "tile.fromBattery": "från batterinivå, {n} sträckor",
      "tile.fromCharging": "från laddning, {n} laddningar ({v} kWh/100km)",
      "tile.disagree": "metoderna stämmer inte överens",
      "tile.noLegs": "{n} kWh ännu inte mätta",
      "tile.costLegs": "över {n} laddningar",
      "toast.leaveQ": "Sluta använda {v}? Bilen försvinner från din lista. De {n} laddningar du kan ser flyttas till den här enhetens papperskorg, där du fortfarande kan läsa dem tills du tömmer den. Ägaren behåller allt, och servern visar dig inte dessa laddningar igen.",
      "toast.leavePendingQ": "Ta tillbaka din förfrågan om {v}? Ägaren ser den inte längre som väntande.",
      "toast.leftCar": "Lämnade {v}. {n} laddningar finns i den här enhetens papperskorg.",
      "toast.requestCancelled": "Förfrågan om {v} återkallad",
      "toast.leaveBlocked": "Kunde inte lämna. Inget ändrades.",
      "toast.leaveNeedsSql": "Databasen tillåter det inte än. Migrationen 10-leave-share.sql måste köras först.",
      "toast.leaveOffline": "Kunde inte lämna: ingen anslutning till servern.",
      "toast.leaveSignedOut": "Logga in för att lämna en delad bil.",
      "log.by": "av {n}",
      "log.byYou": "av dig",
      "log.byUnknown": "av en medlem som har lämnat",
      "confirm.cancelRequest": "Ta tillbaka förfrågan?",
      "confirm.leaveCar": "Lämna den här bilen?",
      "a11y.leaveVeh": "Sluta använda {v}, eller ta bort din förfrågan om den",
      "aria.map": "Mátta",
      "aria.del": "Bahčit",
      "aria.edit": "Rievdat",
      "ed.save": "Girjjit",
      "ed.del": "Bahčit",
      "as.date": "Beaivi",
      "as.time": "Áigi",
      "odo.title": "Kontrollera mätarställning",
      "odo.lowerThanHistory":
        "{d} km är lägre än de {f} km som registrerats {v}. Det tyder oftast på ett skrivfel. Använd {f} km, spara {d} km ändå, eller avbryt utan att ändra något.",
      "odo.usePrevious": "Använd {f} km",
      "odo.keepAnyway": "Spara {d} km ändå",
      "odo.savedWithout":
        "Sparad utan mätarställning. Du kan lägga till den senare.",
      "st.title": "Hitta laddstation",
      "st.lead": "Söker riktiga laddstationer runt dig. I Finland kommer listan från Digitraffics nationella register, annanstans från OpenStreetMap. Inget sparas och ingenting skickas till någon annan än de här karttjänsterna.",
      "st.find": "Hitta station",
      "st.findNear": "Stationer nära mig",
      "st.searching": "Söker din position…",
      "st.found": "{n} station(er) inom {r} km.",
      "st.none": "Inga stationer att visa än.",
      "st.noneNear": "Inga kartlagda stationer inom {n} km.",
      "st.lookupFailed": "Stationstjänsten svarade inte ({e}). Försök igen om en stund, eller skriv namnet och dra nålen.",
      "st.geoFail": "Kunde inte läsa din position ({n}).",
      "st.use": "Använd",
      "st.chosen": "{v} — nål och namn ifyllda.",
      "st.unnamed": "Laddstation",
      "st.plugs": "{n} stickpropp(ar)",
      "st.paid": "avgift",
      "st.free": "gratis",
      "st.source": "Laddstationsuppgifter i Finland © Digitraffic / Fintraffic. Annanstans © OpenStreetMap-gemenskapen, via Overpass. Täckningen varierar: stadsnät är täta, landsbygden tunnare.",
      "st.foundCached": "{n} station(er) inom {r} km, från den sparade listan.",
      "st.offline": "Du är offline. Sökningen behöver en anslutning.",
      "st.geoUnavailable": "Den här webbläsaren kan inte dela din plats.",
      "st.away": "{d} m bort",
      "st.openDetails": "Tryck på punkten för detaljer",
      "st.poles": "{n} laddare",
      "st.polesTitle": "Laddare ({n})",
      "st.poleUnknown": "Kontakttyp anges inte",
      "st.moreCount": "Visa {n} till",
      "st.cacheStale": "Använder den sparade listan med {n} stationer. Uppdaterar…",
      "st.noLive": "Live-status publiceras bara för Finland.",
      "st.liveLoading": "Kontrollerar live-status…",
      "st.liveNone": "Ingen live-status rapporteras för den här stationen.",
      "st.liveFail": "Kunde inte nå live-status tjänsten.",
      "st.live": "{a} av {n} lediga. {rest}",
      "st.liveRest": "Status: {c}",
      "st.polesMore": "och {n} till som inte listas",
      "cam.find": "Kameror i närheten",
      "cam.loading": "Söker kameror…",
      "cam.found": "{n} vägkamera/-or inom {r} km. Visar de {n2} närmaste.",
      "cam.none": "Inga vägkameror inom {n} km.",
      "cam.failed": "Kameratjänsten svarade inte ({e}).",
      "cam.open": "Öppna hela bilden från {v}",
      "cam.alt": "Vägförhållandekamera {v}",
      "cam.ageMinutes": "{n} min sedan",
      "cam.ageHours": "{n} tim sedan",
      "cam.ageDays": "{n} dagar sedan",
      "cam.ageUnknown": "tiden okänd",
      "cam.nearStation": "Kameror nära den här laddaren",
      "cam.note": "Det här är vägförhållandekameror, inte hastighetskameror. Bilderna hämtas från Digitraffic och ingenting sparas.",
      "cam.foundRough": "{n} vägkamera/-or inom {r} km, visar de {n2} närmaste. Din plats var noggrann till ungefär {a} m.",
      "st.statusOther": "{n} {s}",
      "st.foundRough": "{n} station(er) inom {r} km. Din plats var noggrann till ungefär {a} m.",
      "st.foundRoughCached": "{n} station(er) inom {r} km, från den sparade listan. Din plats var noggrann till ungefär {a} m.",
      "st.noneRough": "Inga kartlagda stationer inom {n} km. Din plats var noggrann till ungefär {a} m, så det kan finnas några i närheten.",
      "cam.usedStationFix": "Din plats kunde inte läsas, så dessa är kring platsen för den senaste sökningen.",
      "locNearStation": "Laddare i närheten",
      "locNearSaved": "Dina favoriter",
      "locNearUsed": "Laddat här förut",
      "odo.startReading": "fordets startmätarställning",
      "durHintDefault": "Visar 30 minuter tills du har loggat {n}.",
      "durHintAvg": "Visar ditt genomsnitt av {n} loggade laddningar.",
      "st.status_unknown": "{n} okända",
      "st.status_planned": "{n} inte i drift än",
      "st.status_inoperative": "{n} ur funktion",
      "st.status_reserved": "{n} reserverade",
      "st.status_blocked": "{n} blockerade",
      "st.status_outoforder": "{n} ur funktion",
      "st.status_charging": "{n} i bruk",
      "st.status_available": "{n} lediga",
    },
  };
  var LANGS = [
    ["fi", "Suomi"],
    ["sv", "Svenska"],
    ["se", "Davvisámegiella"],
    ["en", "English"],
  ];
  var ORDER = {
    fi: "fi",
    sv: "sv",
    se: "se",
    sme: "se",
    en: "en",
  };
  var lang = "en";

  /**
   * Translate a key into the active language.
   * @param {string} key      key from the D table, e.g. "nav.dashboard"
   * @param {Object} [vars]   values for {placeholders}, e.g. {n: 3}
   * @returns {string}        the translation, falling back to English and
   *                          finally to the key itself if it is unknown
   */
  function t(key, vars) {
    var pack = D[lang] || D.en;
    var s =
      pack && pack[key] !== undefined
        ? pack[key]
        : D.en[key] !== undefined
          ? D.en[key]
          : key;
    if (vars) {
      s = String(s).replace(/\{(\w+)\}/g, function (m, k) {
        return vars[k] !== undefined ? String(vars[k]) : m;
      });
    }
    return s;
  }
  /**
   * Pick a language from the browser's locale list.
   * @returns {string} one of "fi", "sv", "se" or "en"; English if the
   *                    browser reports nothing we recognise
   */
  function detectLang() {
    var codes = [];
    try {
      if (navigator.languages)
        codes = codes.concat(
          Array.prototype.slice.call(navigator.languages),
        );
      if (navigator.language) codes.push(navigator.language);
    } catch (e) {
      /* a browser that hides its locale list still exposes navigator.language */
    }
    for (var i = 0; i < codes.length; i++) {
      var base = String(codes[i]).toLowerCase().split(/[-_]/)[0];
      if (ORDER[base]) return ORDER[base];
    }
    return "en";
  }
  /* Marks elements that carry a translated accessible name (data-i18n-aria,
   aria-label) so those names can be re-translated after a language switch. */
  var ariaNameCache = [];
  /**
   * Re-apply every cached accessible name in the active language.
   * Called after applyI18n and by the app script through the EV_I18N
   * bridge, because rows built from HTML carry data-i18n-aria that a
   * plain textContent pass cannot reach. Detached nodes are skipped.
   */
  function refreshAriaNames() {
    for (var i = 0; i < ariaNameCache.length; i++) {
      var e = ariaNameCache[i];
      if (!e.isConnected || !e.getAttribute) continue;
      var k = e.getAttribute("data-i18n-aria");
      if (k) e.setAttribute("aria-label", t(k));
    }
  }
  /**
   * Write translations into the DOM.
   * Fills every [data-i18n] element's text, [data-i18n-html] innerHTML,
   * [data-i18n-ph] placeholder and [data-i18n-aria] accessible name.
   * @param {Element|Document} [root]  scope, defaults to the whole document
   */
  function applyI18n(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var k = el.getAttribute("data-i18n");
      if (!k) continue;
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT"
      ) {
        var ph = el.getAttribute("data-i18n-ph") || "ph." + k;
        el.setAttribute("placeholder", t(ph));
        /* Only synthesise an aria-label when a translation really exists. A missing
   key makes t() return the key itself, for example "aria.location", and
   aria-label would then override the visible label with that raw key. */
        if (el.tagName === "INPUT" && el.type === "text") {
          var ak = "aria." + (el.id || k);
          if (D.en[ak] !== undefined)
            el.setAttribute("aria-label", t(ak));
          else el.removeAttribute("aria-label");
        }
      } else {
        el.textContent = t(k);
      }
    }
    /* Placeholders also appear on inputs that carry no data-i18n of their
       own, because their visible text comes from the wrapping label. Those
       were never visited by the loop above, so every one of them was left
       with no placeholder at all: location, energy, mileage, the SoC
       fields, notes, and the favourite name, address and price. */
    var phs = scope.querySelectorAll("[data-i18n-ph]");
    for (var p = 0; p < phs.length; p++) {
      var pel = phs[p];
      /* Anything the first pass handled is skipped, so a language switch
         does not leave one group stale and the other current. */
      if (pel.hasAttribute("data-i18n")) continue;
      var pk = pel.getAttribute("data-i18n-ph");
      if (pk) pel.setAttribute("placeholder", t(pk));
    }
    var rich = scope.querySelectorAll("[data-i18n-html]");
    for (var j = 0; j < rich.length; j++) {
      var r = rich[j],
        rk = r.getAttribute("data-i18n-html");
      if (rk) r.innerHTML = t(rk);
    }
    var ar = scope.querySelectorAll("[data-i18n-aria]");
    for (var m = 0; m < ar.length; m++) {
      var a = ar[m],
        ak = a.getAttribute("data-i18n-aria");
      if (ak) {
        a.setAttribute("aria-label", t(ak));
        ariaNameCache.push(a);
      }
    }
    refreshAriaNames();
  }
  function setLang(l) {
    lang = l && D[l] ? l : "en";
    try {
      localStorage.setItem("ev.v1.lang", lang);
    } catch (e) {
      /* private mode or a full quota: the choice simply will not persist */
    }
    try {
      document.documentElement.lang =
        { fi: "fi", sv: "sv", se: "se", en: "en" }[lang] || lang;
    } catch (e) {
      /* the lang attribute is a nicety, never a reason to stop */
    }
    applyI18n();
    if (typeof window.renderI18n === "function") window.renderI18n();
  }
  function currentLang() {
    return lang;
  }
  /**
   * Restore the saved language (or detect one) and build the picker.
   * Called once at startup, after the DOM exists.
   */
  function bootLang() {
    var saved = null;
    try {
      saved = localStorage.getItem("ev.v1.lang");
    } catch (e) {
      /* unreadable storage just means "no saved choice" */
    }
    setLang(saved && D[saved] ? saved : detectLang());
    var sel = document.getElementById("langSel");
    if (sel) {
      var opts = "";
      for (var i = 0; i < LANGS.length; i++)
        opts +=
          '<option value="' +
          LANGS[i][0] +
          '">' +
          LANGS[i][1] +
          "</option>";
      sel.innerHTML = opts;
      sel.value = lang;
      sel.addEventListener("change", function () {
        setLang(this.value);
      });
    }
  }
  /* Exposed so the app script, which is a separate IIFE with its own scope, can
             reach the translation helpers. Anything referenced from the
             app script must be published here or it will be undefined. */
  window.EV_I18N = {
    t: t,
    setLang: setLang,
    bootLang: bootLang,
    currentLang: currentLang,
    applyI18n: applyI18n,
    /* Exposed because the app script is a separate IIFE and
                 cannot see anything declared in this one. Rows it builds
                 from HTML carry data-i18n-aria names that must be
                 re-translated after a language switch. */
    refreshAriaNames: refreshAriaNames,
    dict: D,
    langs: LANGS,
  };
})();
