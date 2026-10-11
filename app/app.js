/* EV Tracker application logic, extracted from ev-tracker.html so the
   two layout pages share one copy. Load order is enforced by
   tools/test-wiring.mjs:
     app/i18n.js     -> window.EV_I18N
     app/storage.js  -> window.EV_STORAGE
     app/app.js      -> this file
   A classic script, not a module: the app must also run from file://,
   where module scripts are blocked by the CORS rules. */
      (function () {
        "use strict";
        /* ---------- storage keys ----------
           Per account, never global. One shared set of keys meant that signing
           out of one account and into another carried the first account's
           vehicles, sessions and favourites straight into the new one. They
           then appeared labelled "shared vehicle", the sharing panel answered
           "you are not the owner", and every pull tried to push rows the new
           account was never allowed to write, which failed, retried, and left
           the sync badge up.
           "local" is the bucket used while nobody is signed in, so work done
           offline survives a sign-out instead of being thrown away.
           Theme and language stay global: those are device preferences, not
           account data. */
        /* ---------- storage ----------
           Key naming, per-account bucket selection and the one-off move of
           pre-scoped leftovers all live in app/storage.js. This module is
           reachable only through window.EV_STORAGE.

           The original explanation is kept here because it explains why the
           module exists at all:

           Keys are per account, never global. One shared set meant that signing
           out of one account and into another carried the first account's
           vehicles, sessions and favourites straight into the new one. They then
           appeared labelled "shared vehicle", the sharing panel answered "you
           are not the owner", and every pull tried to push rows the new account
           was never allowed to write, which failed, retried, and left the sync
           badge up.

           "local" is the bucket used while nobody is signed in, so work done
           offline survives a sign-out instead of being thrown away. Theme and
           language stay global: those are device preferences, not account data. */
        var STORAGE = window.EV_STORAGE;
        /* A local alias, refreshed whenever the bucket changes. Cheaper than a
           property lookup on every save, and refreshAccount() is the only place
           that can move it. */
        var K = STORAGE.current();
        var K_LANG = "ev.v1.lang";
        function useAccount(userId) {
          var r = STORAGE.useAccount(userId);
          K = r.keys;
          return r.changed;
        }
        var $ = function (id) {
          return document.getElementById(id);
        };
        var TXT = function (k, v) {
          return window.EV_I18N.t(k, v);
        };
        window.renderI18n = function () {
          try {
            /* After the text is swapped, so the labels read in the new language. */
            syncNavButtonNames();
            render();
            syncCents();
            syncHints();
          } catch (e) {
            /* the text is already translated by applyI18n; a failed redraw must not break the language switch */
          }
          /* applyI18n rewrites both auth buttons from their data-i18n
                       keys, which always means the login labels. Re-apply the
                       current mode so switching language mid-register keeps
                       saying "create account". */
          try {
            if (typeof syncAuthButtons === "function") syncAuthButtons(false);
          } catch (e) {
            /* button labels are cosmetic; never block the language switch over them */
          }
          /* Re-translate the confirmation dialog too: it is built once, so its
             static labels would otherwise stay in the previous language. */
          try {
            var cs = $("confirmSheet");
            if (window.EV_I18N && cs) window.EV_I18N.applyI18n(cs);
          } catch (e) {}
        };
        var vehicles = [],
          sessions = [],
          favs = [],
          cur = 0,
          view = "dashboard",
          dirty = false,          price = 0.2,
          editFav = null,
          editVehId = null;

        /* ---------- the bin ----------
           Binned rows are held in their own arrays instead of being flagged in
           place. Almost every calculation in the app reads `vehicles` and
           `sessions` directly, so keeping deleted rows out of those arrays
           entirely is what guarantees that totals, distance, the chart, exports,
           the log and the import target cannot quietly include something the
           user threw away. One split here, and nothing else needs to change. */
        var binned = { vehicles: [], sessions: [], favs: [] };
        /** How many items are waiting to be restored or purged. */
        function binCount() {
          return (
            binned.vehicles.length +
            binned.sessions.length +
            binned.favs.length
          );
        }
        /**
         * Separate a loaded or pulled list into live rows and binned rows.
         * @param {Array} list  rows straight from storage or the server
         * @param {Array} into   binned bucket to append to
         * @returns {Array} the rows that are still live
         */
        function splitBinned(list, into) {
          var live = [];
          if (!Array.isArray(list)) return live;
          for (var i = 0; i < list.length; i++) {
            var row = list[i];
            if (!row) continue;
            if (row.deletedAt) into.push(row);
            else live.push(row);
          }
          return live;
        }

        /* Where this build came from, shown in Settings so a stale phone can be
           spotted without DevTools. Deliberately a fixed DD.MM.YYYY rather than
           toLocaleDateString: it is read by whoever ends up doing support, and
           a build stamp that changes shape with the interface language is
           awkward to quote over a phone. */
        var APP_BUILD = "2026-10-02";
        function buildStamp() {
          var p = APP_BUILD.split("-");
          if (p.length !== 3) return APP_BUILD;
          return p[2] + "." + p[1] + "." + p[0];
        }
        var swVersionCache = null;
        /**
         * Ask the active service worker which version it is.
         * @returns {Promise<?string>} e.g. "v5", or null when unavailable
         */
        function askSwVersion() {
          if (swVersionCache) return Promise.resolve(swVersionCache);
          if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller)
            return Promise.resolve(null);
          return new Promise(function (resolve) {
            var done = false;
            function finish(v) {
              if (done) return;
              done = true;
              if (v) swVersionCache = v;
              resolve(v || null);
            }
            var ch = new MessageChannel();
            ch.port1.onmessage = function (ev) {
              finish(ev.data && ev.data.version);
            };
            /* A worker that cannot answer must not leave the row blank
               forever. */
            setTimeout(function () {
              finish(null);
            }, 1500);
            try {
              navigator.serviceWorker.controller.postMessage(
                { type: "which-version" },
                [ch.port2],
              );
            } catch (e) {
              finish(null);
            }
          });
        }
        /* ---------- the layout switcher ----------
           There are two pages and they are the same application: identical
           markup, identical app/app.js, the same per-account storage and the
           same Supabase account. Only the arrangement differs, and it differs
           purely in CSS, selected by the layout sheet each page loads.

           That is why switching is a plain navigation and carries no migration.
           It also means the choice cannot be remembered across the two pages by
           this page alone, so it is NOT stored: whichever page you are on when
           you close the tab is the one you return to, and the switcher shows
           you where you would go rather than silently overriding it.

           The current view is carried in the hash so switching from the middle
           of the log does not dump you on the dashboard. Only the hash is read -
           see the boot sequence - and a layout page serves the same file
           contents, so the fragment resolves identically. */
        var LAYOUT_PAGES = [
          { name: "classic", file: "ev-tracker.html", label: "set.layoutClassic" },
          { name: "wide", file: "ev-tracker-wide.html", label: "set.layoutWide" },
        ];
        function currentLayout() {
          var el = document.body && document.body.getAttribute("data-layout");
          for (var i = 0; i < LAYOUT_PAGES.length; i++)
            if (LAYOUT_PAGES[i].name === el) return el;
          /* Absent or unknown: fall back to whichever file this page actually
             is, rather than to the first entry, so a page that somehow lost its
             attribute still reports the truth about itself. */
          var here = (location.pathname.split("/").pop() || "").toLowerCase();
          for (var j = 0; j < LAYOUT_PAGES.length; j++)
            if (LAYOUT_PAGES[j].file === here) return LAYOUT_PAGES[j].name;
          return LAYOUT_PAGES[0].name;
        }
        function otherLayout() {
          var cur = currentLayout();
          for (var i = 0; i < LAYOUT_PAGES.length; i++)
            if (LAYOUT_PAGES[i].name !== cur) return LAYOUT_PAGES[i];
          return LAYOUT_PAGES[0];
        }
        function renderLayoutPicker() {
          var sel = $("layoutSel");
          if (!sel) return;
          /* Rebuilt rather than translated in place, because the labels are the
             layout names and they change with the language. */
          sel.textContent = "";
          for (var i = 0; i < LAYOUT_PAGES.length; i++) {
            var o = document.createElement("option");
            o.value = LAYOUT_PAGES[i].name;
            o.textContent = TXT(LAYOUT_PAGES[i].label);
            if (LAYOUT_PAGES[i].name === currentLayout()) o.selected = true;
            sel.appendChild(o);
          }
          sel.onchange = function () {
            var target = null;
            for (var k = 0; k < LAYOUT_PAGES.length; k++)
              if (LAYOUT_PAGES[k].name === sel.value) target = LAYOUT_PAGES[k];
            if (!target || target.name === currentLayout()) return;
            /* Same page, same origin, so the fragment survives the navigation
               and the other page boots straight into the same view. */
            location.href = target.file + location.hash;
          };
        }
        function renderBuildRow() {
          var row = $("buildRow");
          if (!row) return;
          row.textContent =
            TXT("set.build") + " " + buildStamp() + " · " + TXT("set.sw") + " …";
          askSwVersion().then(function (v) {
            if (!row.isConnected) return;
            row.textContent =
              TXT("set.build") +
              " " +
              buildStamp() +
              " · " +
              TXT("set.sw") +
              " " +
              (v || TXT("set.swNone"));
          });
        }
        /* ---------- location defaults ----------
           A configurable default, never a hardcoded rule: which place, after
           what hour, and whether device position may be consulted. The default
           only ever fills an EMPTY field, so it can never overwrite something
           the user typed or picked. */
        var LOC_RADIUS_M = 100;
        /* The accuracy gate, and the reason it exists. Desktop geolocation is
           derived from the IP address and routinely reports accuracy in the
           hundreds or thousands of metres, sometimes for the wrong city
           entirely. A 100m match against such a reading is meaningless, and
           acting on it would write the wrong place and the wrong price into
           real data. Anything coarser than this is discarded, which in practice
           means the feature works on a phone outdoors and stays quiet on a
           desktop. */
        var LOC_MAX_ACCURACY_M = 50;
        var locDefaults = { loc: null, hour: null, geo: false };
        function loadLocDefaults() {
          try {
            var raw = JSON.parse(localStorage.getItem(K.df) || "null");
            if (raw && typeof raw === "object") {
              locDefaults.loc = raw.loc || null;
              locDefaults.hour = isNum(raw.hour) ? +raw.hour : null;
              locDefaults.geo = !!raw.geo;
            }
          } catch (e) {
            locDefaults = { loc: null, hour: null, geo: false };
          }
        }
        function saveLocDefaults() {
          try {
            localStorage.setItem(K.df, JSON.stringify(locDefaults));
          } catch (e) {
            /* the preference still applies for this session */
          }
        }
        /** Great-circle distance in metres. */
        function metresBetween(lat1, lng1, lat2, lng2) {
          var R = 6371000;
          var toRad = Math.PI / 180;
          var dLat = (lat2 - lat1) * toRad;
          var dLng = (lng2 - lng1) * toRad;
          var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * toRad) *
              Math.cos(lat2 * toRad) *
              Math.sin(dLng / 2) *
              Math.sin(dLng / 2);
          return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
        }
        /**
         * When this place was last used, as a timestamp, or -1.
         * Compared per place, not globally: the newest session overall is
         * arbitrary when two saved chargers are close together.
         */
        function lastUsedAt(f) {
          if (!f) return -1;
          var want = (f.address || f.name || "").toLowerCase();
          var best = -1;
          for (var i = 0; i < sessions.length; i++) {
            var s = sessions[i];
            if (!s || s.deletedAt) continue;
            if (String(s.location || "").toLowerCase() !== want) continue;
            var t = Date.parse((s.date || "") + "T" + (s.time || "00:00"));
            if (isFinite(t) && t > best) best = t;
          }
          return best;
        }
        /**
         * Put a saved place into the form.
         * @param {Object} f
         * @param {boolean} withPrice  false leaves the price alone, which is
         *        what an ambiguous proximity match gets: guessing the place is
         *        recoverable, guessing its price is not.
         * @returns {boolean} whether the field was filled
         */
        function fillLocationFromFav(f, withPrice) {
          var input = $("location");
          if (!f || !input) return false;
          input.value = f.address || f.name;
          var fp = favPrice(f);
          if (withPrice && fp !== null) {
            setPriceCents(Math.round(fp * 100));
            recalcFromPrice();
            syncCents();
          }
          return true;
        }
        /** The configured default, if the clock is past the chosen hour. */
        function applyTimeDefault() {
          if (!isNum(locDefaults.hour)) return false;
          var f = locDefaults.loc ? favById(locDefaults.loc) : null;
          if (!f) return false;
          /* Before the hour, nothing happens. This compares the local clock
             only; it is a convenience, not an inference about where you are. */
          if (new Date().getHours() < locDefaults.hour) return false;
          if (!fillLocationFromFav(f, true)) return false;
          setLocStatus(TXT("set.defApplied", { v: f.name }));
          return true;
        }
        /**
         * Ask the device where we are and match it against saved places.
         *
         * The coordinates are used for the comparison and then dropped: nothing
         * is written to storage and nothing is sent to the server. This is
         * deliberately not location telemetry.
         */
        function tryNearbyFavourite() {
          if (!navigator.geolocation) return;
          if (typeof locDefaults.geoState === "string") return;
          locDefaults.geoState = "asking";
          navigator.geolocation.getCurrentPosition(
            function (pos) {
              locDefaults.geoState = "";
              var acc = pos && pos.coords ? pos.coords.accuracy : null;
              if (!isNum(acc) || acc > LOC_MAX_ACCURACY_M) {
                setLocStatus(
                  TXT("set.geoTooCoarse", { n: isNum(acc) ? Math.round(acc) : 0 }),
                );
                return;
              }
              var lat = pos.coords.latitude,
                lng = pos.coords.longitude;
              var near = [];
              for (var i = 0; i < favs.length; i++) {
                var f = favs[i];
                if (!f || f.deletedAt) continue;
                if (!isNum(f.lat) || !isNum(f.lng)) continue;
                var d = metresBetween(lat, lng, +f.lat, +f.lng);
                if (d <= LOC_RADIUS_M) near.push({ f: f, d: d });
              }
              if (!near.length) return;
              /* Nearest wins. This is the signal that actually distinguishes two
                 chargers at the same site: stand 10 m from the garage charger and
                 90 m from the mall one and the distance picks the right one,
                 where a recency or preference rule would have guessed. */
              near.sort(function (a, b) {
                return a.d - b.d;
              });
              var pick = near[0].f;
              /* "Ambiguous" now means genuinely indistinguishable, not merely
                 more than one candidate: two places within this far of each
                 other cannot be told apart from one reading. */
              var ambiguous = near.length > 1 && near[1].d - near[0].d < 25;
              if (ambiguous && locDefaults.loc)
                for (var j = 0; j < near.length; j++)
                  if (near[j].f.id === locDefaults.loc) {
                    pick = near[j].f;
                    break;
                  }
              /* Nothing is committed silently either way: the field is filled
                 and left for the user to confirm or correct, which is the same
                 treatment a manually picked favourite gets. */
              fillLocationFromFav(pick, !ambiguous);
              setLocStatus(
                ambiguous
                  ? TXT("set.geoAmbiguous", { v: pick.name, n: near.length })
                  : TXT("set.geoMatched", { v: pick.name }),
              );
            },
            function () {
              /* Denied, unavailable or timed out. Deliberately silent: the
                 field simply stays as the user left it, and asking again on
                 every keystroke would be worse than not trying. */
              locDefaults.geoState = "";
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
          );
        }
        /**
         * Fill an empty location field from the configured defaults. Never
         * overwrites, so it is safe to call whenever the add view is opened.
         */
        function applyLocationDefaults() {
          var input = $("location");
          if (!input) return;
          if (input.value.trim()) return;
          if (locDefaults.geo) {
            tryNearbyFavourite();
            /* Still offer the clock default if position is slow or refused. */
            setTimeout(function () {
              if (input && !input.value.trim()) applyTimeDefault();
            }, 1200);
            return;
          }
          applyTimeDefault();
        }
        /* ---------- storage ---------- */
        /* A request with no timeout can hang forever. When a phone sleeps, the
           connection is often left half-open rather than refused, so the promise
           never settles: the panel stays on "loading" with no error and no way
           out until the browser eventually gives up, which can be minutes. An
           abort turns that into a prompt, actionable failure. */
        var SUPABASE_TIMEOUT_MS = 15000;
        /**
         * Attach an abort signal and a deadline to a Supabase query builder.
         * The timer is intentionally not cleared on success: aborting a request
         * that already finished is a no-op, and the alternative is threading a
         * cleanup callback through every call site for no real benefit.
         * @param {Object} builder  a supabase query or rpc builder
         * @param {number} [ms]
         * @returns {Object} the same builder, chainable as before
         */
        function timed(builder, ms) {
          if (!builder || typeof AbortController === "undefined") return builder;
          var ctl = new AbortController();
          setTimeout(function () {
            try {
              ctl.abort();
            } catch (e) {}
          }, ms || SUPABASE_TIMEOUT_MS);
          return builder.abortSignal(ctl.signal);
        }
        /** True when a rejection was our own deadline rather than the server. */
        function isTimeout(e) {
          return !!(
            e &&
            (e.name === "AbortError" ||
              /abort|timeout|timed out/i.test(String(e.message || "")))
          );
        }
        function load() {
          try {
            vehicles = JSON.parse(localStorage.getItem(K.v)) || [];
          } catch (e) {
            vehicles = [];
          }
          /* backwards compatibility: vehicles saved before the initial odometer
               existed, and before usable capacity existed */
          if (Array.isArray(vehicles))
            for (var vi = 0; vi < vehicles.length; vi++) {
              if (vehicles[vi] && !isFinite(+vehicles[vi].initialOdometer))
                vehicles[vi].initialOdometer = 0;
              /* Normalised to null, not 0. A vehicle with no capacity set must
                 not be treated as having a zero-capacity battery, which would
                 read as "no usable energy at all" rather than "unknown". */
              if (vehicles[vi] && !isNum(vehicles[vi].capacity))
                vehicles[vi].capacity = null;
            }
          try {
            sessions = JSON.parse(localStorage.getItem(K.s)) || [];
          } catch (e) {
            sessions = [];
          }
          /* Everything the user deleted lives here, not in the live arrays. */
          try {
            binned.vehicles = JSON.parse(localStorage.getItem(K.bv)) || [];
          } catch (e) {
            binned.vehicles = [];
          }
          try {
            binned.sessions = JSON.parse(localStorage.getItem(K.bs)) || [];
          } catch (e) {
            binned.sessions = [];
          }
          /* A row can reach storage already flagged, for instance if it was
             saved before this split existed or arrived from the server, so the
             split runs on load as well as on pull. */
          vehicles = splitBinned(vehicles, binned.vehicles);
          sessions = splitBinned(sessions, binned.sessions);
          if (!Array.isArray(vehicles) || !vehicles.length)
            vehicles = [
              {
                id: uuid(),
                name: TXT("veh.default"),
                icon: "🚗",
                initialOdometer: 0,
                capacity: null,
                /* The baseline has to be stamped here for the same reason
                   addVehicle stamps it: without an owner the row is labelled a
                   shared vehicle, the sharing controls stay hidden, and
                   canAddSession refuses, so a brand new account cannot log its
                   first charge. */
                userId: ownerId() || null,
                /* Marked provisional because this is a guess made before the
                   network has been asked anything. Every account gets a default
                   vehicle, so this row is almost always already waiting on the
                   server under the real name and id, and pushing this one means
                   an insert the row-level security policy rejects with 42501.

                   It is kept provisional rather than deleted because the
                   interface needs a vehicle to render, and a signed-out or
                   offline user has to be able to log a charge immediately.
                   syncPull drops it once the real rows arrive and pushes it
                   only when a pull has confirmed the account has none. */
                provisional: !!ownerId(),
              },
            ];
          if (!Array.isArray(sessions)) sessions = [];
          sessions = sessions.filter(function (s) {
            return s && s.vehicleId && isFinite(+s.energy);
          });
          var stored = localStorage.getItem(K.p);
          price = stored !== null ? parseFloat(stored) : 0.2;
          if (!isFinite(price) || price < 0) price = 0.2;
          $("ppk").value = price;
          cur = 0;
        }
        function save() {
          if (dirty) return;
          try {
            localStorage.setItem(K.v, JSON.stringify(vehicles));
            localStorage.setItem(K.s, JSON.stringify(sessions));
            localStorage.setItem(K.bv, JSON.stringify(binned.vehicles));
            localStorage.setItem(K.bs, JSON.stringify(binned.sessions));
          } catch (e) {
            toast(TXT("toast.storage"));
          }
        }
        function persist() {
          try {
            localStorage.setItem(K.p, String(price));
          } catch (e) {
            /* the price still applies for this session even if it will not persist */
          }
        }

        /* ---------- supabase sync ----------
   Optimistic UI: every mutation updates the local arrays and re-renders
   first, then the same change is pushed to Postgres in the background.
   The local arrays are always the source of truth for the screen, so a
   failed or offline request never blocks the user; localStorage keeps the
   state for the next visit and everything syncs when the app reopens. */
        var syncQueue = { pending: 0, fail: 0 };
        /** True when a client, a signed-in user and real credentials all exist. */
        function syncOn() {
          return !!(authClient && authUser && authUser.id && authConfigured());
        }
        /* records that only exist locally because the cloud write failed; they are
   retried on the next successful pull so offline work is never lost */
        var syncDirty = { vehicles: {}, sessions: {} };
        /* ids deleted locally that the server has not confirmed removing yet */
        var syncDeleted = { vehicles: {}, sessions: {} };
        /** Remember a row whose write failed so it can be retried. */
        function markDirty(kind, id) {
          syncDirty[kind][id] = 1;
          /* armRetry, NOT scheduleRetry: resetting the backoff on every failure
             would keep it at the first step and hammer the server every two
             seconds indefinitely. */
          if (typeof armRetry === "function") armRetry();
        }
        function clearDirty(kind, id) {
          delete syncDirty[kind][id];
        }
        /** Find a row by id whether it is live or in the bin, so a push that was
    queued before the row moved cannot be stranded by the move. */
        function vehicleAnywhere(id) {
          var live = vehById(id);
          if (live) return live;
          for (var i = 0; i < binned.vehicles.length; i++)
            if (binned.vehicles[i].id === id) return binned.vehicles[i];
          return null;
        }
        function sessionAnywhere(id) {
          for (var i = 0; i < sessions.length; i++)
            if (sessions[i].id === id) return sessions[i];
          for (var j = 0; j < binned.sessions.length; j++)
            if (binned.sessions[j].id === id) return binned.sessions[j];
          return null;
        }
        /** Re-push every row previously marked dirty. Called after a successful pull. */
        function retryDirty() {
          if (!syncOn()) return;
          var vi = Object.keys(syncDirty.vehicles),
            si = Object.keys(syncDirty.sessions);
          /* Both lookups span the bin, because a row that was just deleted has
             moved out of the live arrays and the delete itself still has to
             reach the server. Rows the server has already refused are skipped:
             retrying them would just fail again on every pull. */
for (var a = 0; a < vi.length; a++) {
              if (syncStalled.vehicles[vi[a]]) continue;
              var v = vehicleAnywhere(vi[a]);
              if (v) syncVehicle(v);
              else forgetGoneRow("vehicles", vi[a]);
            }
            for (var b = 0; b < si.length; b++) {
              if (syncStalled.sessions[si[b]]) continue;
              var s = sessionAnywhere(si[b]);
              if (s) syncSession(s);
              else forgetGoneRow("sessions", si[b]);
            }
          }
          /** Drop a queued row that is no longer on this device at all.
           *
           * Nothing else removed these. clearDirty runs only on a successful
           * push, on the give-up path, and from the discard button, so an id that
           * left the device by being purged from the bin stayed queued forever.
           * pendingCount() therefore never reached zero, so a retry timer was
           * armed permanently, and unsyncedRows listed the row as "no longer on
           * this device" with no Discard button, leaving the sync panel unable to
           * return to "all good".
           * @param {string} kind "vehicles" or "sessions"
           * @param {string} id
           */
          function forgetGoneRow(kind, id) {
            clearDirty(kind, id);
            forgetAttempts(kind, id);
            if (window.console && window.console.info)
              window.console.info(
                "[sync] dropped a queued " +
                  kind +
                  " row that is no longer on this device: " +
                  id,
              );
          }
        /**
         * @returns {boolean} false only when the browser explicitly reports
         *                     offline; an unknown state is treated as online
         */
        function syncOnline() {
          return !!(navigator.onLine !== false);
        }
        /**
         * Show or hide the sync badge in the header.
         * @param {string} text  empty string hides the badge
         * @param {string} [kind] "warn" tints it as a warning
         */
        function syncNote(text, kind) {
          /* The same state appears twice: in the header on a wide screen, and in
             the sticky strip on a phone. Both are written here so they cannot
             disagree about whether anything is waiting. */
          var targets = [$("syncBadge"), $("syncBadgeM")];
          for (var i = 0; i < targets.length; i++) {
            var el = targets[i];
            if (!el) continue;
            if (!text) {
              /* Not hidden. These badges are the only way to reach the sync panel,
                 so hiding them when everything is fine made the panel
                 unreachable exactly when a user might want to check it. It used
                 to work only because a CSS bug kept them on screen as empty
                 pills; fixing that bug removed the accidental affordance, so it
                 is now made explicit with a quiet state.

                 Still hidden when sync is not configured at all, since a
                 local-only install has nothing to show. */
              var quiet = syncOn();
              el.hidden = !quiet;
              el.textContent = quiet ? TXT("sync.allGoodShort") : "";
              el.dataset.kind = "";
              continue;
            }
            el.hidden = false;
            el.textContent = text;
            el.dataset.kind = kind || "";
          }
          /* The countdown changes as rows land, and the panel body has to agree
             with it whenever it happens to be open. */
          /* Checks the class, not the hidden attribute: nothing ever sets .hidden on
             #syncPanel, openSyncPanel and closeSyncPanel only toggle "on". The
             test was therefore permanently true and the panel body was rebuilt on
             every status change, every pull and every retry tick, for a dialog
             that was closed. */
            if ($("syncPanel").classList.contains("on")) renderSyncPanel();
        }
/* Which badge opened the panel. On a phone it is syncBadgeM, and returning
               focus to syncBadge moved focus to a control that is not on screen
               at that width. */
          var syncPanelTrigger = null;
          /** Both badges are the same control at different widths, so both carry
           *  the expanded state; updating only the desktop one left the mobile
           *  button announcing "collapsed" while its dialog was open. */
          function syncBadges() {
            return [$("syncBadge"), $("syncBadgeM")];
          }
          function setSyncBadgesExpanded(on) {
            syncBadges().forEach(function (b) {
              if (b) b.setAttribute("aria-expanded", on ? "true" : "false");
            });
          }
          function openSyncPanel(trigger) {
            var p = $("syncPanel");
            if (!p) return;
            renderSyncPanel();
            /* Recorded only if it is not already open, so a reopen from the
               banner does not overwrite the badge that started it. */
            if (!p.classList.contains("on")) {
              syncPanelTrigger =
                trigger && trigger.isConnected ? trigger : null;
            }
            p.classList.add("on");
            lockBackground(true);
            setSyncBadgesExpanded(true);
            var c = $("syncCloseBtn");
            if (c) c.focus();
          }
          function closeSyncPanel() {
            var p = $("syncPanel");
            if (!p || !p.classList.contains("on")) return;
            p.classList.remove("on");
            /* The badge is inside the header, which lockBackground makes inert,
               so focus cannot simply go back to it while it is still inert. */
            lockBackground(false);
            setSyncBadgesExpanded(false);
            var back = syncPanelTrigger;
            syncPanelTrigger = null;
            if (back && back.isConnected && !back.hidden) back.focus();
            else {
              /* No usable trigger, so fall back to whichever badge is on screen
                 rather than dropping focus to the body. */
              var vis = syncBadges().filter(function (b) {
                return b && !b.hidden;
              });
              if (vis.length) vis[vis.length - 1].focus();
            }
          }
        /* camelCase -> snake_case, matching the SQL schema.
   user_id is stamped from the signed-in account on every write, so the column
   is never left to a client-supplied value. Row Level Security still enforces
   ownership; this simply keeps the column populated and consistent. */
        function ownerId() {
          return authUser && authUser.id ? authUser.id : null;
        }
        /**
         * Convert a local vehicle to its database shape.
         * @param {Object} v
         * @returns {Object} snake_case row, including user_id from the session
         */
        function vehicleRow(v) {
          /* Keep the ORIGINAL owner. A shared driver who renames the car or
             edits its odometer must not take ownership away from the user who
             created it, so v.userId wins over the signed-in user.

             This is only advisory now. 06-owner-stamp.sql overwrites user_id
             with auth.uid() on INSERT, so the value sent here is used for the
             UPDATE path and ignored for a new row. */
          return {
            id: v.id,
            user_id: v.userId || ownerId(),
            name: String(v.name || ""),
            icon: String(v.icon || "\u{1F697}"),
            initial_odometer: isNum(v.initialOdometer)
              ? num(v.initialOdometer)
              : 0,
            /* USABLE capacity, and the only capacity the maths reads. The
               gross-to-usable conversion happens in the vehicle editor and is
               never stored, so there is no flag that could disagree with this
               number. null rather than 0: "not set" and "set to zero" mean
               different things, and only the second disables the method. */
            battery_capacity_kwh: isNum(v.capacity)
              ? num(v.capacity)
              : null,
            /* null means live. A timestamp means the row is in the bin and the
               client is expected to keep it out of the live arrays. */
            deleted_at: v.deletedAt || null,
          };
        }
        /**
         * Convert a local session to its database shape.
         * @param {Object} s
         * @returns {Object} snake_case row; out-of-range battery values are
         *                    clamped and empty ones become null
         */
        function sessionRow(s) {
          return {
            id: s.id,
            /* Keep the ORIGINAL author. An owner or admin correcting somebody
               else's session must not take authorship of it, and the database
               checks can_edit_session against this column, so writing the
               editor's own id here would silently lock them out of their own
               row on the next edit. Mirrors what vehicleRow does for vehicles. */
            user_id: s.userId || ownerId(),
            vehicle_id: s.vehicleId,
            date: String(s.date || ""),
            time: s.time ? String(s.time) : null,
            duration: s.duration == null ? null : String(s.duration),
            hours: isNum(s.hours) ? num(s.hours) : 0,
            location: String(s.location || ""),
            energy: isNum(s.energy) ? num(s.energy) : 0,
            mileage: isNum(s.mileage) ? num(s.mileage) : 0,
            cost: isNum(s.cost) ? num(s.cost) : null,
            notes: s.notes ? String(s.notes) : null,
            fast: !!s.fast,
            home: !!s.home,
            fav: !!s.fav,
            lat: isNum(s.lat) ? num(s.lat) : null,
            lng: isNum(s.lng) ? num(s.lng) : null,
            socStart: soc(s.socStart),
            socEnd: soc(s.socEnd),
            /* Kept through every write, or emptying the bin would silently
               un-delete a row that got re-saved while it sat there. */
            deleted_at: s.deletedAt || null,
          };
        }
        /* snake_case -> camelCase */
function rowVehicle(r) {
            /* userId is the owner, which is not necessarily the signed-in user
               once a vehicle is shared. */
            return {
              id: r.id,
              name: String(r.name || "Vehicle"),
              icon: String(r.icon || "\u{1F697}"),
              initialOdometer: isNum(r.initial_odometer)
                ? num(r.initial_odometer)
                : 0,
              /* Absent on every row written before migration 12. isNum rejects
                 null, undefined and "", so an old vehicle reads as "not set"
                 and simply has no battery-derived figure. */
              capacity: isNum(r.battery_capacity_kwh)
                ? num(r.battery_capacity_kwh)
                : null,
              userId: r.user_id || null,
              deletedAt: r.deleted_at || null,
              /* It came from the server, so the server already has it. syncVehicle
                 uses this to choose a plain insert for rows this device invented
                 instead of an upsert that would also drag the UPDATE policies
                 into a create. */
              confirmed: true,
            };
          }
        /**
         * Convert a database row back into a local session.
         * @param {Object} r  row from the sessions table
         * @returns {Object} camelCase session with a numeric created stamp
         */
        function rowSession(r) {
          return {
            id: r.id,
            vehicleId: r.vehicle_id,
            /* Who logged it. Not the same as the signed-in user once an admin or
               the owner edits somebody else's row. */
            userId: r.user_id || null,
            date: String(r.date || ""),
            time: fmtTime(r.time),
            duration: r.duration == null ? "" : String(r.duration),
            hours: isNum(r.hours) ? num(r.hours) : 0,
            location: String(r.location || ""),
            energy: isNum(r.energy) ? num(r.energy) : 0,
            mileage: isNum(r.mileage) ? num(r.mileage) : 0,
            cost: isNum(r.cost) ? num(r.cost) : null,
            notes: r.notes == null ? "" : String(r.notes),
            fast: !!r.fast,
            home: !!r.home,
            fav: !!r.fav,
            lat: isNum(r.lat) ? num(r.lat) : null,
            lng: isNum(r.lng) ? num(r.lng) : null,
            socStart: soc(r.socStart),
            socEnd: soc(r.socEnd),
            deletedAt: r.deleted_at || null,
            created: r.created_at ? Date.parse(r.created_at) : Date.now(),
          };
        }
        /**
         * Record a failed background write.
         * The change stays in local state and the badge explains that it is
         * still local, so the UI is never rolled back under the user.
         * @param {string} what  short description used in the console warning
         */
        function syncFail(what) {
          syncQueue.fail++;
          syncNote(TXT("sync.pending", { n: syncQueue.fail }), "warn");
          if (window.console && window.console.warn)
            window.console.warn("[sync] " + what + " failed; kept locally");
        }
        /* A row the server will never accept has to stop being retried. Replaying it
           on every pull costs a full round trip each time, and because the pull
           only finishes when the batch does, a handful of impossible rows made
           syncing feel broken. Three tries is enough to tell a transient
           network failure from a row the database is going to refuse forever. */
        var MAX_PUSH_ATTEMPTS = 3;
        var pushAttempts = {};
        /* Rows the server has refused, kept apart from the ordinary dirty queue.
           A row that only sits in syncDirty is still waiting for the network and
           will go through on its own. A row listed here never will, so it has to
           be visible to the user and has to offer a way out. */
        var syncStalled = { vehicles: {}, sessions: {} };
        function markStalled(kind, id, reason, err) {
          syncStalled[kind][id] = {
            reason: reason || "rejected",
            kind: classifyRefusal(err),
            code: (err && (err.code || err.error_code)) || "",
            message: String((err && (err.message || err.msg)) || "").trim(),
            details: String((err && (err.details || err.hint)) || "").trim(),
            when: new Date().toISOString(),
          };
        }
        /**
         * Work out what kind of refusal this is, because the two cases need
         * opposite handling and treating them alike is dangerous.
         *
         *   "notYet"  the row is fine, the account simply may not write it YET.
         *              A driver whose request is still pending gets this. It is
         *              held and retried, and must NOT offer Discard: the row is a
         *              perfectly good charging session, and discarding it would
         *              destroy real data to "fix" a permission that resolves on
         *              its own the moment the owner approves.
         *
         *   "wrong"   the row itself is unacceptable, most often because it
         *              carries another account's owner id. Discard is offered,
         *              and so is nothing automatic: guessing is what caused this.
         *
         *   "rejected" anything else, shown verbatim with the server's message.
         *
         * @param {Object} [err]
         * @returns {string} "notYet" | "wrong" | "rejected"
         */
        function classifyRefusal(err) {
          var code = String((err && (err.code || err.error_code)) || "");
          var msg = (
            String((err && err.message) || "") +
            " " +
            String((err && err.details) || "")
          ).toLowerCase();
          /* An explicit SQLSTATE beats the wording. 42501 is Postgres's
             insufficient_privilege, which is Row Level Security refusing the
             row itself. P0001 is what our own sessions trigger raises, and every
             message it can produce is about this account's permission rather
             than about the row. */
          if (code === "42501") return "wrong";
          if (code === "P0001") return "notYet";
          /* No usable code, so fall back to the wording. PostgREST does not
             always report one. */
          if (
            /row-level security|row level security|insufficient[_ ]privileg/.test(
              msg,
            )
          )
            return "wrong";
          if (
            /do not have permission|not have been granted|permission denied|not authoris?z|not permitted/.test(
              msg,
            )
          )
            return "notYet";
          return "rejected";
        }
        function clearStalled(kind, id) {
          if (syncStalled[kind]) delete syncStalled[kind][id];
          /* The banner is a count, so it has to be re-derived rather than just
             hidden, or it would vanish while other refusals remained. */
          if (typeof armStallBanner === "function") armStallBanner();
        }
        /* How many rows the server has refused, for the failure banner. */
        function stalledCount() {
          return (
            Object.keys(syncStalled.vehicles).length +
            Object.keys(syncStalled.sessions).length
          );
        }
        function bumpAttempt(kind, id) {
          var k = kind + ":" + id;
          pushAttempts[k] = (pushAttempts[k] || 0) + 1;
          return pushAttempts[k];
        }
        function forgetAttempts(kind, id) {
          delete pushAttempts[kind + ":" + id];
        }
        /**
         * Ask the server who it thinks we are, after a policy refusal.
         *
         * A 42501 cannot be fixed by resending the same row. Either the token
         * has expired, in which case nothing this device holds is any use, or
         * the row really is not ours, in which case the refusal is correct and
         * the only honest thing to do is leave the row alone.
         *
         * Nothing is retried here. Retrying is what turned one dead session into
         * an endless loop of identical refusals.
         *
         * @param {string} what  short description for the console
         * @param {Object} [err] the PostgREST error, for the console
         */
        function confirmSessionAlive(what, err) {
          if (!authClient) return Promise.resolve(null);
          /* Asked first, and deliberately before getUser(). getUser() proves the
             token is valid to the auth service; whoami() proves the token
             actually reached the database on a normal request. Those are
             different claims, and only the second one explains a policy refusal,
             because auth.uid() is what the policy compares against. */
/* Fired, not awaited: askWhoAmI resolves the shared whoAmI object, and the
               handler below runs before that settles. The promise was assigned to
               `who` and then read as who.role, which is undefined on a Promise,
               so every 42501 log line read "(database saw role=undefined)" — the
               one field the function exists to report. */
            askWhoAmI();
            return authClient.auth.getUser().then(
            function (r) {
              var real = r && r.data && r.data.user;
              if (real) {
                /* The token is good, so this is a genuine permission problem
                   about the row rather than about us. */
                if (window.console && window.console.warn)
                  window.console.warn(
                    "[sync] " +
                      what +
                      " refused by RLS while signed in as " +
                      real.id +
                      ": the session is valid, so the row itself is not yours. " +
                      describeServerError(err) +
                      " (database saw role=" + whoAmI.role + ")",
                  );
                return real;
              }
              if (window.console && window.console.warn)
                window.console.warn(
                  "[sync] " +
                    what +
                    " refused and getUser() found no signed-in user: the access " +
                    "token has expired, so auth.uid() is NULL server-side and no " +
                    "insert policy can ever be satisfied. " +
                    describeServerError(err) +
                    " (database saw role=" + whoAmI.role + ")",
                );
              return expireSession();
            },
            function () {
              /* Offline, so the check could not run. That is not evidence either
                 way and must not be mistaken for a dead session. */
              if (window.console && window.console.info)
                window.console.info(
                  "[sync] could not check the session while offline; leaving " +
                    what +
                    " queued",
                );
              return null;
            },
          );
        }
        /* What the database believes the caller is, for the diagnostics report.
         *
         * Populated by askWhoAmI() and read back out of it, because the failure
         * handler is synchronous and the probe is not. Stays "unknown" when the
         * function is not installed, which is itself worth seeing rather than
         * guessing at. */
        var whoAmI = { role: "unknown", uid: "unknown", error: "not probed" };
        /**
         * Ask the database who it thinks this request is from.
         *
         * This is the measurement that distinguishes the two remaining causes of
         * a 42501 on vehicles. If it answers 'anon', the browser sent no user
         * token with the request and auth.uid() is NULL, so the stamp trigger
         * skipped and the insert policy could not be satisfied by anything the
         * client sent. If it answers 'authenticated', the token arrived and the
         * live schema is not what the migrations describe.
         * @returns {Promise<Object>} never rejects
         */
        function askWhoAmI() {
          if (!authClient || !syncOn()) return Promise.resolve(whoAmI);
          return authClient.rpc
            ? authClient
                .rpc("whoami")
                .then(function (r) {
                  var row = r && r.data && r.data[0];
                  if (r && r.error) {
                    whoAmI = {
                      role: "probe failed: " + r.error.code,
                      uid: "unknown",
                      error: r.error.message,
                    };
                  } else if (row) {
                    whoAmI = {
                      /* row.role_name, not row.role: "role" is a reserved word
                         in some PostgREST shapes and reading it here returned
                         undefined. */
                      role: row.role_name || "(null)",
                      uid: row.uid || "(null)",
                      error: "",
                    };
                  }
                  return whoAmI;
                })
                .catch(function (e) {
                  whoAmI = {
                    role: "probe threw",
                    uid: "unknown",
                    error: String((e && e.message) || e),
                  };
                  return whoAmI;
                })
            : Promise.resolve(whoAmI);
        }
        /**
         * Record a failed push: keep it queued while it might still succeed,
         * then give up on it so it cannot slow every future sync.
         *
         * The server's own error is kept, because "refused by the server" on
         * its own is not diagnosable. PostgREST reports a Row Level Security
         * rejection as code 42501 with the offending table named, and a missing
         * column as PGRSTxxx, which is the difference between a policy problem
         * and a migration that was never run.
         *
         * @param {string} kind  "vehicles" or "sessions"
         * @param {string} id
         * @param {string} what  short description for the console
         * @param {Object} [err] the error PostgREST returned
         */
        function failPush(kind, id, what, err) {
          /* Recorded before anything else decides what to do with it, because
             the retry path and the give-up path both lose the raw error and this
             is the only place it survives. */
          diag("push:" + kind, {
            /* Which operation actually failed. This is the single most useful
               field and it was missing: Postgres words an INSERT refusal and an
               UPDATE refusal identically, so without it every report said only
               "42501 on vehicles" and the reader could not tell a refused create
               from a refused edit. syncVehicle passes "vehicle insert" or
               "vehicle update". */
            operation: what,
            row: id,
            vehicle: kind === "vehicles" ? diagRowName(id) : undefined,
            /* Whether this device believes the server already has the row. That
               decides insert vs update, so it belongs next to the operation. */
            confirmed: kind === "vehicles" ? diagRowConfirmed(id) : undefined,
            attempt: bumpAttemptPreview(kind, id),
            code: (err && (err.code || err.error_code)) || "(none)",
            message: (err && err.message) || "(none)",
            details: (err && err.details) || "(none)",
            hint: (err && err.hint) || "(none)",
            provisional: kind === "vehicles" ? isProvisionalRow(id) : undefined,
            ownerOnDevice:
              kind === "vehicles" ? diagRowOwner(id) : undefined,
            /* Filled in by askWhoAmI() a moment after this event is recorded, so
               it reads "not probed" on the first failure of a session and the
               real value on every one after. */
            dbRoleSeen: whoAmI.role,
            dbUidSeen: whoAmI.uid,
          });
          /* A 42501 is ambiguous from here, and the two causes need opposite
             responses, so it is resolved before anything else happens.

             "vehicles insertable by owner" checks user_id = auth.uid(). If the
             access token has expired, auth.uid() is NULL rather than wrong, the
             check can never be satisfied, and every single write fails with this
             same error. 06-owner-stamp.sql cannot rescue it either: its trigger
             deliberately skips the stamp when auth.uid() IS NULL, because it must
             not guess an owner for a row inserted on purpose.

             So 42501 on an insert means one of exactly two things:

               1. the session is dead, and the fix is to sign in again, or
               2. the session is fine and this row genuinely is not ours.

             The app can tell them apart, because only the first makes the token
             unusable. Asking the server who we are is one request, and it turns
             an unactionable "the server will not accept this row" into a
             sentence the user can act on. */
          if (classifyRefusal(err) === "wrong") confirmSessionAlive(what, err);
          /* A transport failure is not a refusal, and must never spend one of the
             three attempts.
             MAX_PUSH_ATTEMPTS exists to tell "the server will never accept this
             row" from "the network hiccuped". Spending an attempt on a dropped
             connection defeats that: a phone on a captive portal reports
             navigator.onLine === true, three consecutive "Failed to fetch" or
             timed-out aborts trip the limit, and the row is then marked stalled
             with kind "rejected" and offered a Discard button. That turns a
             passing network problem into an apparent data-loss risk on a real
             charging session.

             So a timeout, a missing connection, or an error carrying no SQLSTATE
             is re-queued without counting, and can never be given up on. */
          if (isTimeout(err) || !err || !err.code) {
            markDirty(kind, id);
            syncFail(what);
            return false;
          }
          if (bumpAttempt(kind, id) < MAX_PUSH_ATTEMPTS) {
            markDirty(kind, id);
            syncFail(what);
            return false;
          }
          clearDirty(kind, id);
          /* Recorded rather than forgotten, so the sync panel can name it and
             the user can decide whether to discard it. */
          markStalled(kind, id, "rejected", err);
          armStallBanner();
          syncFail(what + " - giving up, the server will not accept this row");
          if (window.console && window.console.warn)
            window.console.warn(
              "[sync] " +
                kind +
                " " +
                id +
                " failed " +
                MAX_PUSH_ATTEMPTS +
                " times: " +
                describeServerError(err) +
                " -- it stays on this device only",
            );
          return false;
        }
        /**
         * Read-only helpers for the diagnostics report. Each tolerates a missing
         * row, because the point is to describe a row that may well have been
         * discarded by the time the report is generated.
         */
        function diagRowName(id) {
          try {
            var v = vehById(id) || vehicleAnywhere(id);
            return v ? v.name : "(not on this device)";
          } catch (e) {
            return "(lookup failed)";
          }
        }
        function diagRowOwner(id) {
          try {
            var v = vehById(id) || vehicleAnywhere(id);
            if (!v) return "(not on this device)";
            return v.userId || "(null - would be refused as unowned)";
          } catch (e) {
            return "(lookup failed)";
          }
        }
        function isProvisionalRow(id) {
          try {
            var v = vehById(id) || vehicleAnywhere(id);
            return v ? !!v.provisional : "(not on this device)";
          } catch (e) {
            return "(lookup failed)";
          }
        }
        /** Whether this device believes the server already has this row.
         *
         * Undefined means the row predates the flag, which is the same as "not
         * confirmed" for the insert/update decision, so it is reported as such
         * rather than as a misleading false.
         */
        function diagRowConfirmed(id) {
          try {
            var v = vehById(id) || vehicleAnywhere(id);
            return v ? (v.confirmed ? "yes" : "no (this device invented it)") : "(not on this device)";
          } catch (e) {
            return "(lookup failed)";
          }
        }
        /* Reads the counter without incrementing it, so recording an event cannot
           change the behaviour it is recording. failPush owns the increment. */
        function bumpAttemptPreview(kind, id) {
          return pushAttempts[kind + ":" + id] || 0;
        }
        /**
         * A one-line summary of what the server actually said.
         * @param {Object} [err]
         * @returns {string}
         */
        function describeServerError(err) {
          if (!err) return "no error detail";
          var code = err.code || err.error_code || "";
          var msg = String(err.message || err.msg || "").trim();
          /* PostgREST puts the table name in `details` for a policy rejection,
             which is the single most useful thing to show. */
          var det = String(err.details || err.hint || "").trim();
          var out = code ? code + ": " : "";
          out += msg || "(no message)";
          if (det && det.indexOf(msg) < 0) out += " (" + det + ")";
          return out;
        }
        /* ---------- diagnostics ----------
           A short in-memory log of everything the server refused, kept so a user
           can paste it into a bug report without opening developer tools.

           It exists because the summary shown on screen is not enough to
           diagnose anything. "42501 · new row violates row-level security policy
           for table vehicles" names a symptom; the fields that identify the
           cause are the ones PostgREST puts in `details` and `hint`, plus which
           account and which row were involved. All of that used to exist only in
           a console.warn that a phone user will never see.

           Deliberately not sent anywhere. There is no endpoint, no telemetry and
           no service_role key in this project, and the log stays in memory: it
           is read out by copying it to the clipboard and pasting it into a
           conversation, which the user chooses to do. It holds no token, no
           password and no session, only ids a user already knows. */
var DIAG_MAX = 60;
          var diagLog = [];
          /* A SECOND buffer, for things that succeeded.
             diagLog renders under a heading that says ERRORS, and its empty line
             reads "none - every write the server accepted". Filing a successful
             external lookup there would print it as a fault - the same
             misreading that made an empty log look like nothing had happened and
             got a 42501 wrongly declared fixed. Successes and neutral events get
             their own bounded list with their own heading.

             Capped separately and lower: this carries raw response bodies, and
             the error log is the part that must never be crowded out. */
          var EVENT_MAX = 10;
          var eventLog = [];
          /* The raw body is truncated hard. A fifty-station response is tens of
             kilobytes, and the report exists to be pasted into a conversation. */
          var EVENT_BODY_MAX = 4000;
          function stationEvent(outcome, data) {
            try {
              var d = data || {};
              if (typeof d.body === "string" && d.body.length > EVENT_BODY_MAX)
                d =
                  Object.assign({}, d, {
                    body:
                      d.body.slice(0, EVENT_BODY_MAX) +
                      "\n      …[truncated, " +
                      d.body.length +
                      " bytes total]",
                  });
              eventLog.push({
                at: new Date().toISOString(),
                kind: "station-lookup",
                outcome: outcome,
                data: d,
              });
              while (eventLog.length > EVENT_MAX) eventLog.shift();
            } catch (e) {
              /* Diagnostics must never be the reason something breaks. */
            }
          }
          /* Timestamps of the last success of each kind. The log only ever holds
             failures, so "no entries" could not be told apart from "nothing was
             attempted" — which is precisely the mistake made when the 42501 was
             wrongly declared fixed. These make an empty error log
             self-explanatory. */
          var lastPullAt = null;
          var lastPushAt = null;
          function stampSuccess(kind) {
            var at = new Date().toISOString();
            if (kind === "pull") lastPullAt = at;
            else lastPushAt = at;
          }
        /**
         * Record one event for the diagnostics report.
         * @param {string} kind short machine-ish label, e.g. "push:vehicles"
         * @param {Object} data already-stringified fields
         */
        function diag(kind, data) {
          try {
            diagLog.push({
              at: new Date().toISOString(),
              kind: kind,
              account: (authUser && (authUser.email || authUser.id)) || "signed out",
              data: data || {},
            });
            /* Bounded, because a retry loop would otherwise grow it without
               limit on a device that is never going to recover. */
            if (diagLog.length > DIAG_MAX) diagLog.shift();
          } catch (e) {
            /* Diagnostics must never be the reason something breaks. */
          }
        }
        /**
         * Build the report the user pastes into a bug report.
         *
         * The first section is deliberately hand-written rather than generated:
         * "vehicle push refused, 42501" says nothing, but "insert refused with
         * the row the database itself stamped" narrows it immediately.
         * @returns {string}
         */
        function diagnosticsReport() {
          var lines = [];
          lines.push("EV Tracker diagnostics");
          lines.push("generated: " + new Date().toISOString());
          lines.push("build: " + buildStamp());
            /* The service worker version, not just the build date. buildStamp() is
               a date string baked into the source, so it looks identical on every
               build and cannot tell a support report which code is actually
               running. Every fix ships with a VERSION bump precisely so this can
               be verified, and a report without it makes the one question that
               matters - "are you on the build with the fix in it?" - unanswerable.
               Cached, because this function is synchronous; copyDiagnostics primes
               the cache before calling it. */
            lines.push(
              "service worker: " + (swVersionCache || "(not yet known)"),
            );
            /* Which account produced this. Without it the report cannot answer the
               question it most often has to answer - "is this row count the right
               account's?" - because nothing else names the account unless an
               error happened to fire. Two accounts can hold wildly different
               histories, and a report that does not say which is which makes the
               counts unverifiable. */
            lines.push(
              "account: " +
                ((authUser && (authUser.email || authUser.id)) || "signed out"),
            );
          lines.push("user agent: " + navigator.userAgent);
          lines.push("online: " + (syncOnline() ? "yes" : "no"));
          lines.push("sync configured: " + (syncConfiguredForDiag() ? "yes" : "no"));
          lines.push(
            "database sees caller as: role=" +
              whoAmI.role +
              " uid=" +
              whoAmI.uid +
              (whoAmI.error ? " (" + whoAmI.error + ")" : ""),
          );
          lines.push("local vehicles: " + vehicles.length);
          lines.push("local sessions: " + sessions.length);
          lines.push("dirty rows: " + JSON.stringify(unsyncedSummaryForDiag()));
          lines.push("last successful pull: " + (lastPullAt || "never"));
          lines.push("last successful write: " + (lastPushAt || "none yet"));
          /* Its own section, above the errors. Successful external lookups are
             not errors, and putting them under a heading that says ERRORS is how
             a working feature reads as a broken one. */
          lines.push("");
          lines.push(
            "STATION LOOKUPS (newest last, max " + EVENT_MAX + ")",
          );
          if (!eventLog.length)
            lines.push("  none recorded - no search has been run on this device");
          for (var v = 0; v < eventLog.length; v++) {
            var ev = eventLog[v];
            lines.push("  " + ev.at + "  " + ev.kind + "  " + ev.outcome);
            for (var f in ev.data) {
              if (Object.prototype.hasOwnProperty.call(ev.data, f))
                lines.push("      " + f + ": " + ev.data[f]);
            }
          }
          lines.push("");
          /* Named ERRORS, not EVENTS. This section only ever receives entries
             from failure paths, and "EVENTS: none recorded" was read as "nothing
             happened" rather than "nothing failed" — which is the opposite
             reading, and the empty case is the good one. */
          lines.push("RECORDED ERRORS (newest last, max " + DIAG_MAX + ")");
          if (!diagLog.length)
            lines.push("  none - every write the server accepted");
          for (var i = 0; i < diagLog.length; i++) {
            var e = diagLog[i];
            lines.push(
              "  " + e.at + "  " + e.kind + "  account=" + e.account,
            );
            for (var k in e.data) {
              if (Object.prototype.hasOwnProperty.call(e.data, k))
                lines.push("      " + k + ": " + e.data[k]);
            }
          }
          return lines.join("\n");
        }
        function syncConfiguredForDiag() {
          try {
            return !!(authClient && authUser && authUser.id);
          } catch (e) {
            return false;
          }
        }
        function unsyncedSummaryForDiag() {
          try {
            var out = { vehicles: 0, sessions: 0 };
            for (var kind in syncDirty)
              if (Object.prototype.hasOwnProperty.call(syncDirty, kind))
                out[kind] = Object.keys(syncDirty[kind] || {}).length;
            return out;
          } catch (e) {
            return "unavailable";
          }
        }
        /**
         * Copy the report to the clipboard, for pasting into a bug report.
         *
         * A file download is no good here: on a phone it lands in Downloads,
         * where it is never found again. The clipboard is where the text already
         * has to be pasted.
         * @returns {Promise<boolean>}
         */
function copyDiagnostics() {
            /* Ask the active worker which version it is, and who the database
               thinks we are, before building the text, so the report can state
               both. The identity probe otherwise runs once after sign-in and only
               reports if it completed before the report was built - so a clean
               report claimed "not probed" even when a token was perfectly valid,
               which reads as a fault rather than as a race. Both normally resolve
               from cache without delaying the copy. */
            return Promise.all([
              askSwVersion().catch(function () {
                return null;
              }),
              askWhoAmI().catch(function () {
                return null;
              }),
            ])
              .then(function () {
                return copyText(diagnosticsReport());
              })
              .then(
            function () {
              toast(TXT("set.diagCopied"));
              return true;
            },
            function () {
              toast(TXT("set.diagFailed"));
              return false;
            },
          );
        }
        /* push one vehicle; "mode" is insert or update, both handled by upsert

           There used to be a retry here that resent the row with the signed-in
           account's id whenever Row Level Security refused it. It is gone. It
           assumed the stored owner id was stale, which is unprovable from the
           client: Postgres emits "new row violates row-level security policy"
           for an UPDATE check as well as an INSERT one, so the same code path
           covers a row that already belongs to somebody else. The retry then
           sent the identical value, could never succeed, and cost an extra
           round trip on every rejection.

           Ownership is now settled in the database instead: 06-owner-stamp.sql
           puts a BEFORE INSERT trigger on vehicles that overwrites user_id with
           auth.uid(). Whatever the client sends is ignored, so this class of
           refusal cannot happen any more. */
        /**
         * Whether a vehicle row may be sent to the server at all.
         *
         * A provisional vehicle is a local guess, not a row the server has
         * agreed to. Pushing it before a pull confirms the account is empty is
         * what produced the 42501 on "Vehicle 1": every account already has one
         * server-side, under a different id, so the insert can only be refused.
         * The stamp trigger cannot help here because it stamps user_id, not id.
         *
         * The check is `!v.provisional` rather than `v.provisional === false` on
         * purpose: every row saved before this flag existed has no property at
         * all, and must stay pushable.
         */
        function pushableVehicle(v) {
          return !!v && !v.provisional;
        }
        function syncVehicle(v) {
          if (!syncOn() || !v) return Promise.resolve(false);
          if (!pushableVehicle(v)) return Promise.resolve(false);
          if (!syncOnline()) {
            markDirty("vehicles", v.id);
            return Promise.resolve(false);
          }
          /* A vehicle row is only ever written by its owner, or by an admin
             editing the settings. Anything else is refused by
             "vehicles editable by owner or admin", and refusing it repeatedly
             is pure waste: it costs a round trip on every pull and holds the
             sync panel open with a failure the user cannot act on.

             This happens when the device is holding another account's vehicle,
             which is what a switch without clearing leaves behind. The
             server's copy is the authoritative one, so the right move is to
             leave this local row alone rather than to argue with RLS about it. */
          if (!mayWriteVehicle(v.id)) {
            clearDirty("vehicles", v.id);
            forgetAttempts("vehicles", v.id);
            if (window.console && window.console.info)
              window.console.info(
                "[sync] not writing vehicle " +
                  v.id +
                  ": it belongs to another account on the server",
              );
            return Promise.resolve(true);
          }
                  syncQueue.pending++;
          /* Insert or update, decided deliberately rather than by letting one
             statement cover both.

             .upsert() compiles to INSERT ... ON CONFLICT (id) DO UPDATE, which
             drags the UPDATE row-level policies into a write that should be a
             create. That matters because Postgres words an UPDATE refusal
             exactly like an INSERT one — "new row violates row-level security
             policy for table vehicles" — so a single upsert cannot tell us which
             gate rejected the row, and a permissive insert policy does not
             shield the update half.

             The client already knows which case this is. A row that came back
             from a pull has been seen by the server, so it is an update. A row
             this device invented has not, so it is an insert, and an insert
             cannot reach the UPDATE policies at all. */
          var isCreate = !v.confirmed;
          var write = isCreate
            ? authClient.from("vehicles").insert(vehicleRow(v))
            : authClient
                .from("vehicles")
                .upsert(vehicleRow(v), { onConflict: "id" });
          return timed(write)
            .then(function (res) {
              syncQueue.pending--;
              var e = res && res.error;
              if (e) {
                /* The id is already on the server. That is not a failure: it is
                   a restored backup, a row another device created, or a pull
                   that had not yet told us this id existed. Mark it seen and let
                   the normal path update it, rather than reporting a duplicate
                   key the user can do nothing about. */
                if (isCreate && isDuplicateKey(e)) {
                  v.confirmed = true;
                  if (window.console && window.console.info)
                    window.console.info(
                      "[sync] vehicle " + v.id + " already exists on the " +
                        "server; updating it instead of inserting",
                    );
                  return syncVehicle(v);
                }
                /* An update refused on permissions, retried once as an insert.

                   `confirmed` is a latch: it is set when a write succeeds and
                   persisted with the row, and nothing ever clears it. So a
                   vehicle that was pushed once and later hard-deleted on the
                   server - cleaned up by hand, or purged from another device -
                   kept taking the update path forever against a row that no
                   longer existed, retried three times, escalated to the red
                   banner, and offered a Discard button that would have taken
                   the vehicle and all of its sessions with it. Verified: four
                   rows reported `confirmed: yes` while a direct query for those
                   ids returned nothing.

                   An upsert should create a missing row anyway, but it does not
                   get the chance, because the INSERT branch of an upsert is still
                   evaluated as an insert the moment anything refuses it. Trying
                   the insert path outright distinguishes the two cases: if it
                   succeeds the row was genuinely absent and is now back; if it
                   fails the same way, the row is there and is not writable, and
                   that is a real permission problem the user should be told
                   about rather than retried. */
                if (!isCreate && !v.confirmedRetry && e.code === "42501") {
                  v.confirmedRetry = true;
                  v.confirmed = false;
                  if (window.console && window.console.info)
                    window.console.info(
                      "[sync] vehicle " + v.id +
                        " refused as an update; retrying as an insert in case " +
                        "the server no longer has it",
                    );
                  return syncVehicle(v);
                }
                return failPush(
                  "vehicles",
                  v.id,
                  isCreate ? "vehicle insert" : "vehicle update",
                  e,
                );
              }
              /* The server has it now, so later writes take the update path. */
              v.confirmed = true;
              clearDirty("vehicles", v.id);
              clearStalled("vehicles", v.id);
              forgetAttempts("vehicles", v.id);
              stampSuccess("push");
              return true;
            })
            .catch(function (ce) {
              syncQueue.pending--;
              /* The thrown error is kept: a transport-level failure and a
                 policy rejection look identical from the outside otherwise. */
              return failPush(
                "vehicles",
                v.id,
                isCreate ? "vehicle insert" : "vehicle update",
                ce,
              );
            });
        }
        /** True when the server refused because the row is already there.
         *
         * 23505 is Postgres's unique_violation. PostgREST reports it as a plain
         * conflict rather than a policy problem, which is what makes it safe to
         * recognise: it says the id is taken, not that the row is forbidden.
         * @param {Object} err
         * @returns {boolean}
         */
        function isDuplicateKey(err) {
          if (!err) return false;
          if (String(err.code || err.error_code || "") === "23505") return true;
          return /duplicate key|already exists|violates unique constraint/i.test(
            String(err.message || "") + " " + String(err.details || ""),
          );
        }
        /**
         * Push one session to Postgres.
         * @param {Object} s   local session object
         * @returns {Promise<boolean>} true when the server accepted it
         */
        function syncSession(s) {
          if (!syncOn() || !s) return Promise.resolve(false);
          if (!syncOnline()) {
            markDirty("sessions", s.id);
            return Promise.resolve(false);
          }
syncQueue.pending++;
            /* timed(), like syncVehicle. Without it a half-open connection on a
               sleeping phone leaves this unsettled forever: the row stays dirty,
               the backoff keeps re-issuing it, and the user watches "retrying"
               with nothing to act on. */
            return timed(
              authClient
                .from("sessions")
                .upsert(sessionRow(s), { onConflict: "id" }),
            )
              .then(function (res) {
                syncQueue.pending--;
                var e = res && res.error;
                if (e)
                  return failPush("sessions", s.id, "session upsert", e);
                clearDirty("sessions", s.id);
                clearStalled("sessions", s.id);
                forgetAttempts("sessions", s.id);
                stampSuccess("push");
                return true;
              })
              .catch(function (ce) {
                syncQueue.pending--;
                return failPush("sessions", s.id, "session upsert", ce);
              });
          }
        /* Deletes are recorded while offline too, otherwise a session deleted on a
   train would reappear on the next sync. */
        function markDeleted(table, id) {
          if (!syncDeleted[table]) syncDeleted[table] = {};
          syncDeleted[table][id] = 1;
        }
        function clearDeleted(table, id) {
          if (syncDeleted[table]) delete syncDeleted[table][id];
        }
        /**
         * Delete one row server-side.
         * The id is remembered even when offline, so a delete made without a
         * connection is replayed rather than silently undone by the next pull.
         * @param {string} table  "vehicles" or "sessions"
         * @param {string} id     uuid of the row
         * @returns {Promise<boolean>}
         */
        function syncDelete(table, id) {
          if (!syncOn() || !id) return Promise.resolve(false);
          markDeleted(table, id);
          if (!syncOnline()) return Promise.resolve(false);
syncQueue.pending++;
            /* timed(), like every other write. Without a deadline a half-open
               connection on a sleeping phone leaves this promise unsettled
               forever: the id stays in syncDeleted, no timer is armed, and the
               delete is silently forgotten on the next reload. */
            return timed(
              authClient
                .from(table)
                .delete()
                .eq("id", id),
            )
              .then(function (res) {
                syncQueue.pending--;
                var e = res && res.error;
                if (e) {
                  /* Recorded, unlike before: the error object was discarded
                     entirely, so a refused delete produced only a generic console
                     warning with no code and no way to diagnose it. The id stays
                     in syncDeleted and is now counted, listed and retried. */
                  diag("delete:" + table, {
                    row: id,
                    operation: table + " delete",
                    code: (e && (e.code || e.error_code)) || "(none)",
                    message: (e && e.message) || "(none)",
                    details: (e && e.details) || "(none)",
                    hint: (e && e.hint) || "(none)",
                  });
                  syncFail(table + " delete");
                  armRetry();
                  return false;
                }
                clearDeleted(table, id);
                return true;
              })
              .catch(function (ce) {
                syncQueue.pending--;
                diag("delete:" + table, {
                  row: id,
                  operation: table + " delete (transport)",
                  code: (ce && (ce.code || ce.error_code)) || "(none)",
                  message: (ce && ce.message) || "(none)",
                  timedOut: isTimeout(ce) ? "yes" : "no",
                });
                syncFail(table + " delete");
                /* Keep it queued and schedule another try, rather than letting
                   "delete forever" quietly revert on the next pull. */
                armRetry();
                return false;
              });
          }
        /** Re-issue deletes that could not reach the server while offline. */
function retryDeleted() {
            if (!syncOn()) return Promise.resolve(false);
            var work = [];
            for (var t in syncDeleted) {
              if (!Object.prototype.hasOwnProperty.call(syncDeleted, t)) continue;
              var ids = Object.keys(syncDeleted[t] || {});
              for (var i = 0; i < ids.length; i++) work.push(syncDelete(t, ids[i]));
            }
            /* Returns a promise so flushOneDirty can await it. It used to return
               undefined, which the caller treated as a resolved push and then
               re-armed on a row that was never touched. */
            return Promise.all(work).then(function (r) {
              return r.some(Boolean);
            });
          }
        /* ---------- shared vehicles ----------
   Several people can log charging for the same car. Ownership stays with the
   user who created the vehicle; anyone listed in vehicle_shares may read and
   add sessions for it. Every helper returns false or an empty array when the
   table is not installed yet, so a single-user install is unaffected. */
        var shares = {};
        var sharesChecked = false;
        function shareTableReady() {
          return (
            sharesChecked && Object.keys(shares).length >= 0 && sharesAvailable
          );
        }
        var sharesAvailable = false;
        /**
         * Load who may drive each vehicle.
         * @returns {Promise<boolean>} true when the table answered
         */
function loadShares() {
            if (!syncOn()) return Promise.resolve(false);
            /* `shares` answers every permission question in the app: myRole,
               myRank, canView, canAddSession, canEditVehicle, canEditSession. It
               was reset on an account switch, but a response already in flight
               was not cancelled, so a late one repopulated it with the previous
               account's rows. If the new account's own loadShares resolved first,
               the OLD rows won, and a car shared with both accounts was rendered
               with whichever role arrived last - an admin-only Rename button on a
               viewer's screen, or a driver's add-session form gone missing. */
            var gen = acctGen;
            return authClient
              .from("vehicle_shares")
              .select("vehicle_id,user_id,role,status")
              .then(function (res) {
                if (!acctLive(gen)) return false;
              var e = res && res.error;
              if (e) {
                /* 404 simply means the SQL has not been run yet */
                sharesAvailable = false;
                sharesChecked = true;
                if (shareTarget) renderShare();
                return false;
              }
              shares = {};
              var rows = (res && res.data) || [];
              for (var i = 0; i < rows.length; i++) {
                var vid = rows[i].vehicle_id;
                if (!shares[vid]) shares[vid] = [];
                shares[vid].push({
                  user_id: rows[i].user_id,
                  role: rows[i].role || "viewer",
                  /* A share with no status predates the roles migration, which
                     backfilled every existing row to accepted. Treating a
                     missing status as accepted keeps the app working in the
                     window before supabase/04-roles.sql has been run. */
                  status: rows[i].status || "accepted",
                });
              }
              sharesAvailable = true;
              sharesChecked = true;
              /* Keep an open panel in step with what the server now says. */
              if (shareTarget) renderShare();
              return true;
            })
            .catch(function () {
              sharesAvailable = false;
              sharesChecked = true;
              if (shareTarget) renderShare();
              return false;
            });
        }
        /** How many extra drivers a vehicle has, for the settings list. */
        function shareCount(vehicleId) {
          return shares[vehicleId] ? shares[vehicleId].length : 0;
        }
        /**
         * Invite a driver by username.
         * The database resolves the name to an account, so no email address is
         * ever sent to this device.
         * @param {string} vehicleId  vehicle to share
         * @param {string} username   the other user's name, without the domain
         * @returns {Promise<boolean>} true when the invite was stored
         */
        function shareAdd(vehicleId, username) {
          if (!syncOn() || !vehicleId) return Promise.resolve(false);
          var name = String(username || "").trim();
          if (!name) return Promise.resolve(false);
          return timed(
              authClient.rpc("invite_driver", { p_vehicle: vehicleId, p_username: name }),
            )
            .then(function (res) {
              var err = res && res.error;
              if (err) throw err;
              var status = (res && res.data) || "no-such-user";
              if (status !== "ok") return false;
              return loadShares().then(function () {
                return true;
              });
            })
            .catch(function (e) {
              if (window.console && window.console.warn)
                window.console.warn("[share] invite failed", e);
              return false;
            });
        }
        /**
         * Stop sharing a vehicle with someone.
         * @param {string} vehicleId
         * @param {string} userId  the other user
         * @returns {Promise<boolean>}
         */
        function shareRemove(vehicleId, userId) {
          if (!syncOn() || !vehicleId || !userId) return Promise.resolve(false);
          return authClient
            .from("vehicle_shares")
            .delete()
            .eq("vehicle_id", vehicleId)
            .eq("user_id", userId)
            .then(function (res) {
              if (res && res.error) return false;
              delete shares[vehicleId];
              return true;
            })
            .catch(function () {
              return false;
            });
        }
        /**
         * True when this user owns the vehicle outright, which is what the
         * UI uses to decide whether to offer the sharing controls.
         * @param {string} vehicleId
         * @returns {boolean}
         */
        function ownsVehicle(vehicleId) {
          var v = vehById(vehicleId);
          return !!(v && ownerId() && v.userId === ownerId());
        }
        /* ---------- roles ----------
   The ladder mirrors the database exactly. The client only hides what the
   server would refuse anyway; RLS and the rank helpers in
   supabase/04-roles.sql are what actually decide, so a tampered client
   gains nothing here. Ranks match vehicle_rank(). */
        var ROLE_RANK = { owner: 4, admin: 3, driver: 2, viewer: 1 };
        var ROLES = ["viewer", "driver", "admin"];
        function rankOf(role) {
          return ROLE_RANK[role] || 0;
        }
        /**
         * This user's own share row for a vehicle, pending or not.
         * @param {string} vehicleId
         * @returns {?{user_id:string, role:string, status:string}}
         */
        function myShare(vehicleId) {
          var me = ownerId();
          if (!vehicleId || !me) return null;
          var list = shares[vehicleId] || [];
          for (var i = 0; i < list.length; i++)
            if (list[i].user_id === me) return list[i];
          return null;
        }
        /**
         * The role that grants access, or null when there is none.
         * A pending or rejected request resolves to null on purpose: that is
         * what makes waiting for approval actually mean something.
         * @param {string} vehicleId
         * @returns {?string}
         */
        function myRole(vehicleId) {
          if (ownsVehicle(vehicleId)) return "owner";
          var s = myShare(vehicleId);
          return s && s.status === "accepted" ? s.role || "viewer" : null;
        }
        function myRank(vehicleId) {
          return rankOf(myRole(vehicleId));
        }
        /** True while a request exists but the owner has not answered it. */
        function isPending(vehicleId) {
          var s = myShare(vehicleId);
          return !!s && s.status === "pending";
        }
        /** A request the owner already turned down. The row is still there, so
            the car still appears and can still be cleared - which is how a
            re-invite from the owner is possible. */
        function isRejected(vehicleId) {
          var s = myShare(vehicleId);
          return !!s && s.status === "rejected";
        }
        /** Read access. A pending requester counts so their placeholder card
            renders; the server still refuses them every real read. */
        function canView(vehicleId) {
          return myRank(vehicleId) >= 1 || isPending(vehicleId);
        }
        function canAddSession(vehicleId) {
          return myRank(vehicleId) >= 2;
        }
        /** Vehicle settings belong to the owner and admins. */
        function canEditVehicle(vehicleId) {
          return myRank(vehicleId) >= 3;
        }
        /**
         * May this session be edited or deleted?
         * Admins and the owner may touch anyone's; a driver only their own.
         * @param {Object} s  a local session
         * @returns {boolean}
         */
function canEditSession(s) {
            if (!s) return false;
            var r = myRank(s.vehicleId);
            if (r >= 3) return true;
            /* A row created on this device has no author until it has been
               pushed and pulled back: the add form never set userId, so the
               comparison below was `undefined === "<uuid>"` and always false. The
               RLS rule is "rank >= 2 AND row.user_id = auth.uid()", which the
               server satisfies immediately because it stamps the author on
               insert. So a driver could not fix a typo in, or delete, a charge
               they had just logged on a shared vehicle - the edit and delete
               buttons rendered as a dash - until a pull brought the row back
               with its author. Invisible to the owner and admin, whose rank >= 3
               branch hid it. `!s.userId` means "made here, not yet on the
               server", which is exactly the case the server will accept. */
            if (r >= 2 && !!ownerId()) return !s.userId || s.userId === ownerId();
            return false;
          }
        /** True when the signed-in user may write this vehicle row to the
            server. A local-only vehicle has no userId yet and was made here,
            so it counts as theirs; a pending placeholder does not, because the
            insert policy would reject it on every pull. */
          function mayWriteVehicle(vehicleId) {
            /* Anywhere, NOT only the live array.
               doRemoveVehicle moves the row into the bin before pushing it, so a
               lookup restricted to `vehicles` returned null for exactly the row
               that needed writing. syncVehicle then read that as "this belongs to
               somebody else", skipped the push and cleared the dirty flag, so the
               server never learned the car was binned and the next pull brought
               it straight back into the list. Binning appeared to work until the
               next sync, which is why it looked intermittent.
               vehicleAnywhere() exists for this: it checks live rows first and
               then the bin. */
            var v = vehicleAnywhere(vehicleId);
            if (!v) return false;
            /* Checked against the row itself rather than through ownsVehicle(),
               which also looks only at the live array and would say no for the
               same reason. A binned row still has exactly one owner. */
            if (!v.userId) return true;
            if (ownerId() && v.userId === ownerId()) return true;
            return canEditVehicle(vehicleId);
          }
        /* ---------- owner decisions ---------- */
        /**
         * Accept or reject a request.
         * @param {string} vehicleId
         * @param {string} userId
         * @param {string} status  "accepted" or "rejected"
         * @returns {Promise<boolean>}
         */
        function shareSetStatus(vehicleId, userId, status) {
          if (!syncOn() || !vehicleId || !userId) return Promise.resolve(false);
          return timed(
              authClient.rpc("set_share_status", {
                p_vehicle: vehicleId,
                p_user: userId,
                p_status: status,
              }),
            )
            .then(function (res) {
              if (res && res.error) throw res.error;
              if ((res && res.data) !== "ok") return false;
              return loadShares().then(function () {
                return true;
              });
            })
            .catch(function (e) {
              if (window.console && window.console.warn)
                window.console.warn("[share] status failed", e);
              return false;
            });
        }
        /**
         * Change an accepted member's role. Assigning one also accepts them,
         * so the owner can do both from the same control.
         * @param {string} vehicleId
         * @param {string} userId
         * @param {string} role  one of ROLES
         * @returns {Promise<boolean>}
         */
        function shareSetRole(vehicleId, userId, role) {
          if (!syncOn() || !vehicleId || !userId) return Promise.resolve(false);
          if (ROLES.indexOf(role) < 0) return Promise.resolve(false);
          return timed(
              authClient.rpc("set_share_role", {
                p_vehicle: vehicleId,
                p_user: userId,
                p_role: role,
              }),
            )
            .then(function (res) {
              if (res && res.error) throw res.error;
              if ((res && res.data) !== "ok") return false;
              return loadShares().then(function () {
                return true;
              });
            })
            .catch(function (e) {
              if (window.console && window.console.warn)
                window.console.warn("[share] role failed", e);
              return false;
            });
        }
        /** A <select> listing the three assignable roles. */
function roleSelect(vehicleId, userId, current, id, who) {
            /* The accessible name is required. Without it a screen reader
               announces "combo box, driver" with no indication of whose role is
               being changed, and there is no visible label either. The static
               markup check cannot see this, because the select is built in JS. */
            var h = '<select class="role-sel" id="' + id + '" data-role-set="' +
              esc(vehicleId) + "|" + esc(userId) + '" aria-label="' +
              esc(TXT("a11y.setRole", { v: who || shareLabel(vehicleId, userId) })) +
              '">';
          for (var i = 0; i < ROLES.length; i++)
            h +=
              '<option value="' +
              ROLES[i] +
              '"' +
              (ROLES[i] === current ? " selected" : "") +
              ">" +
              TXT("role." + ROLES[i]) +
              "</option>";
          return h + "</select>";
        }
        /** A row is a live or a binned session belonging to this vehicle. */
        function sessionsOf(vehicleId) {
          var out = [];
          var i;
          for (i = 0; i < sessions.length; i++)
            if (sessions[i].vehicleId === vehicleId) out.push(sessions[i]);
          for (i = 0; i < binned.sessions.length; i++)
            if (binned.sessions[i].vehicleId === vehicleId)
              out.push(binned.sessions[i]);
          return out;
        }
        /**
         * Re-queue everything held back for this vehicle.
         *
         * Rows refused because the account was not permitted YET become
         * writable the moment the owner approves, so there is no reason to make
         * the driver wait for the backoff to expire. Called after any decision
         * that changes this account's role.
         *
         * @param {string} vehicleId
         * @returns {number} how many rows were released
         */
        function releaseHeldRows(vehicleId) {
          if (!syncOn() || !vehicleId) return 0;
          var rows = sessionsOf(vehicleId);
          var released = 0;
          for (var i = 0; i < rows.length; i++) {
            var id = rows[i].id;
            var wasHeld = syncStalled.sessions[id];
            if (wasHeld && wasHeld.kind !== "notYet") continue;
            if (wasHeld) {
              clearStalled("sessions", id);
              forgetAttempts("sessions", id);
              released++;
            }
            /* Pushed straight away rather than only re-marked, so a driver who
               has just been approved sees the session arrive now. */
            markDirty("sessions", id);
            syncSession(rows[i]);
          }
          if (released) renderSyncPanel();
          return released;
        }
        /**
         * Accept or reject a request. Only a rejection is confirmed, because
         * accepting can be undone from the member list but rejecting reads as
         * final to the person waiting.
         * @param {string} userId
         * @param {string} status  "accepted" or "rejected"
         * @returns {Promise<boolean>}
         */
        function decideShare(userId, status) {
          if (!shareTarget || !userId) return Promise.resolve(false);
          var vehicle = shareTarget,
            label = shareLabel(vehicle, userId);
          var run = function () {
            return shareSetStatus(vehicle, userId, status).then(function (ok) {
              if (ok) {
                toast(
                  TXT(
                    status === "accepted"
                      ? "toast.shareAccepted"
                      : "toast.shareRejected",
                    { u: label },
                  ),
                );
                render();
                /* The panel does not rebuild itself from render(). */
                if (shareTarget === vehicle) renderShare();
                /* Anything held while this person was not permitted can go now. */
                releaseHeldRows(vehicle);
              } else {
                toast(TXT("toast.shareFail"));
              }
              return ok;
            });
          };
          if (status !== "rejected") return run();
          return askConfirm(TXT("toast.rejectQ", { u: label }), {
            heading: "confirm.rejectShare",
            ok: "confirm.reject",
          }).then(function (yes) {
            return yes ? run() : false;
          });
        }
        /**
         * Apply a role picked in the owner's dropdown.
         * @param {string} vehicleId
         * @param {string} userId
         * @param {string} role
         * @returns {Promise<boolean>}
         */
        function changeShareRole(vehicleId, userId, role) {
          if (!vehicleId || !userId || !role) return Promise.resolve(false);
          var label = shareLabel(vehicleId, userId);
          return shareSetRole(vehicleId, userId, role).then(function (ok) {
            if (ok) {
              toast(
                TXT("toast.shareRoleOk", {
                  u: label,
                  r: TXT("role." + role),
                }),
              );
              render();
              if (shareTarget === vehicleId) renderShare();
              releaseHeldRows(vehicleId);
            } else {
              toast(TXT("toast.shareFail"));
              /* Put the dropdown back to what the server still believes. */
              renderShare();
            }
            return ok;
          });
        }
        /**
         * The owner's short code for a vehicle, asking the server for one the
         * first time. Codes are server-allocated so they cannot collide.
         * @param {string} vehicleId
         * @param {boolean} rotate  issue a fresh code instead of the current one
         * @returns {Promise<string>} the code, or "" when unavailable
         */
        var shareCodeCache = {};
        /* Why the last code request failed: "", "timeout", "unsupported",
           "notOnServer" or "failed". Cleared on success. The panel reads it so a
           failure explains itself instead of leaving a spinner running. */
        /* Keyed by vehicle id, not a single global. As one value it leaked across
             cars: one failed request for car A left the panel for car B — whose
             code was already cached, so no new request was made to clear it —
             permanently showing the failure. That also hid B's pending-request
             list, so Accept and Reject became unreachable and the invite field
             never rendered, for the rest of the session. */
        var shareCodeProblems = {};
        function shareCode(vehicleId, rotate) {
          if (!syncOn() || !vehicleId) return Promise.resolve("");
          var fn = rotate ? "rotate_share_code" : "ensure_share_code";
          var cached = shareCodeCache[vehicleId];
          if (!rotate && cached) return Promise.resolve(cached);
          return timed(authClient.rpc(fn, { p_vehicle: vehicleId }))
            .then(function (res) {
              if (res && res.error) throw res.error;
              var code = String((res && res.data) || "")
                .trim()
                .toUpperCase();
if (code) {
                  shareCodeCache[vehicleId] = code;
                  codesAvailable = true;
                  delete shareCodeProblems[vehicleId];
                }
              return code;
            })
            .catch(function (e) {
              /* Only a missing SQL function means codes are genuinely
                 unsupported. A timeout or a dropped connection says nothing
                 about the server, and treating it as "unavailable" left the
                 panel permanently blank until a full reload. */
              var msg = String((e && e.message) || "").toLowerCase();
              var missing =
                /does not exist|404|not found|pgrst/i.test(msg);
              if (missing) codesAvailable = false;
              /* Why the code is absent, so the panel can say it instead of
                 spinning forever. ensure_share_code raises P0001 "vehicle does
                 not belong to this user" both when the caller is not the owner
                 and when the row is not on the server at all. The second case
                 is the common one here: a vehicle whose insert was refused still
                 looks owned on this device, so it passes the ownership check and
                 then fails server-side for a reason that has nothing to do with
                 ownership. Saying "not the owner" there would be a lie. */
var problem = isTimeout(e)
                  ? "timeout"
                  : missing
                    ? "unsupported"
                    : /does not belong|p0001/.test(msg)
                      ? "notOnServer"
                      : "failed";
                shareCodeProblems[vehicleId] = problem;
                diag("share:code", {
                  vehicle: vehicleId,
                  fn: fn,
                  problem: problem,
                  code: (e && e.code) || "(none)",
                  message: (e && e.message) || "(none)",
                });
              if (window.console && window.console.warn)
                window.console.warn(
                  "[share] code unavailable (" +
                    problem +
                    ")" +
                    (isTimeout(e) ? " (timed out)" : ""),
                  e,
                );
              return "";
            });
        }
        /**
         * Add a shared vehicle using a code someone was given.
         * @param {string} code  the six character code
         * @returns {Promise<{status:string, vehicle?:Object}>}
         */
function redeemShareCode(code) {
            if (!syncOn()) return Promise.resolve({ status: "signed-out" });
            var clean = String(code || "")
              .trim()
              .toUpperCase();
            if (!clean) return Promise.resolve({ status: "empty" });
            /* Redeeming grants access to a vehicle, so the continuation appends
               it to `vehicles`, sets it current and save()s. Guarded for the same
               reason as the pull: redeeming, switching account and landing on a
               stranger's car in your own namespace, where you can neither delete
               it nor log against it. */
            var gen = acctGen;
            return timed(authClient.rpc("redeem_share_code", { p_code: clean }))
              .then(function (res) {
                if (res && res.error) throw res.error;
                if (!acctLive(gen)) return { status: "stale" };
              var data = res && res.data;
              if (typeof data === "string") {
                try {
                  data = JSON.parse(data);
                } catch (e) {
                  data = { status: data };
                }
              }
              var out = data && data.status ? data : { status: "unknown" };
              /* Show the car immediately instead of waiting for the next pull.
                 The RPC answers with vehicleId, so it is mapped to id here:
                 rowVehicle reads id, and passing the raw payload left the new
                 vehicle without one. */
              if (
                (out.status === "ok" || out.status === "pending") &&
                out.vehicleId &&
                !vehById(out.vehicleId)
              ) {
                vehicles.push(
                  rowVehicle({
                    id: out.vehicleId,
                    name: out.name,
                    icon: out.icon,
                    initial_odometer: out.initial_odometer,
                    user_id: out.user_id,
                  }),
                );
                cur = vehicles.length - 1;
                save();
                /* A pending request is not ours to write, so it is deliberately
                   not queued for upload. mayWriteVehicle keeps syncPull from
                   retrying it on every refresh. */
                if (out.status === "ok") markDirty("vehicles", out.vehicleId);
                render();
              }
              if (out.status === "ok" || out.status === "pending")
                loadShares();
              return out;
            })
            .catch(function (e) {
              /* Reported separately from "unavailable" so the message can tell
                 the user to check their connection and try again, rather than
                 implying the code was wrong. */
              if (isTimeout(e)) return { status: "timeout" };
              if (window.console && window.console.warn)
                window.console.warn("[share] redeem failed", e);
              return { status: "unavailable" };
            });
        }
        /** Copy text to the clipboard, with a fallback for older browsers. */
        function copyText(text) {
          if (navigator.clipboard && navigator.clipboard.writeText)
            return navigator.clipboard.writeText(text);
          return new Promise(function (resolve, reject) {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try {
              ok = document.execCommand("copy");
            } catch (e) {
              ok = false;
            }
            document.body.removeChild(ta);
            if (ok) resolve();
            else reject(new Error("copy failed"));
          });
        }

        /* ---------- adding a shared vehicle with a code ---------- */
        var REDEEM_TEXT = {
          ok: "toast.codeOk",
          pending: "toast.codePending",
          "already-member": "toast.codeAlreadyMember",
          "already-pending": "toast.codeAlreadyPending",
          "own-vehicle": "toast.codeOwn",
          "no-such-code": "toast.codeNoSuch",
          empty: "toast.codeEmpty",
          "signed-out": "set.shareSignedOut",
          timeout: "toast.codeTimeout",
          unavailable: "toast.codeUnavailable",
          unknown: "toast.codeUnavailable",
        };
        /** The redeem box is pointless while signed out, so it stays hidden. */
        function renderRedeemPanel() {
          var p = $("redeemPanel");
          if (!p) return;
          p.hidden = !syncOn();
        }
        /**
         * Look up a code and add the vehicle it belongs to.
         * @returns {Promise<string>} the status reported by the server
         */
        function doRedeem() {
          var input = $("redeemCode");
          var stat = $("redeemStat");
          if (!input) return Promise.resolve("empty");
          var code = input.value.trim().toUpperCase();
          if (!code) {
            stat.textContent = TXT("toast.codeEmpty");
            input.focus();
            return Promise.resolve("empty");
          }
          stat.textContent = TXT("toast.codeLooking");
          return redeemShareCode(code).then(function (res) {
            var key = REDEEM_TEXT[res.status] || "toast.codeUnavailable";
            if (res.status === "ok" && res.already)
              stat.textContent = TXT("toast.codeAlready", { v: res.name });
            else stat.textContent = TXT(key, { v: res.name, c: code });
            if (res.status === "ok") {
              input.value = "";
              toast(TXT("toast.codeOk", { v: res.name }));
              render();
              syncPull();
            } else if (res.status === "no-such-code") {
              input.focus();
              input.select();
            }
            return res.status;
          });
        }

        /* ---------- sharing user interface ---------- */
        var shareTarget = null;
        var shareCodeCache = {};
        var codesAvailable = false;
        var shareNames = {};
        /** Read the invited-names cache for the CURRENT bucket.
         *
         * Called at boot and again from showApp whenever the account changes,
         * because K.n moves with the bucket. Reading it once at IIFE evaluation
         * bound it to the signed-out key, so inviting somebody as one account
         * wrote every name it held into the next account's key.
         */
        function loadShareNames() {
          try {
            shareNames = JSON.parse(localStorage.getItem(K.n) || "{}") || {};
          } catch (err) {
            /* a corrupt name cache is only cosmetic, so start over */
            shareNames = {};
          }
          return shareNames;
        }
        loadShareNames();
        /** True when the signed-in user could have sharing controls at all. */
        function canShare() {
          return !!syncOn();
        }
        function saveShareNames() {
          try {
            localStorage.setItem(K.n, JSON.stringify(shareNames));
          } catch (err) {
            /* losing the labels is not worth interrupting the user for */
          }
        }
        /** Remember a username against the user id the invite resolved to. */
        function noteShareName(vehicleId, userId, name) {
          if (!vehicleId || !userId || !name) return;
          if (!shareNames[vehicleId]) shareNames[vehicleId] = {};
          shareNames[vehicleId][userId] = name;
          saveShareNames();
        }
        /** Best available label for a share: the username we invited, else a short id. */
        function shareLabel(vehicleId, userId) {
          var byVeh = shareNames[vehicleId];
          if (byVeh && byVeh[userId]) return byVeh[userId];
          return String(userId || "").slice(0, 8);
        }
        /** Open the sharing panel for one vehicle. */
        function openShare(vehicleId) {
          shareTarget = vehicleId;
          var v = vehById(vehicleId);
          $("shareVehName").textContent = v ? v.name + ": " : "";
          renderShare();
          go("settings");
          var first = $("shareBody").querySelector("input, button");
          if (first) first.focus();
          /* Ask for the code so the panel is never briefly empty. Re-rendered
             whichever way it settles: rendering only on success left the panel
             showing "loading" forever whenever the request failed. */
          if (ownsVehicle(vehicleId) && !shareCodeCache[vehicleId])
            shareCode(vehicleId, false).then(function (code) {
              if (shareTarget !== vehicleId) return;
              if (code) renderShare();
              else if (!shareCodeCache[vehicleId]) {
                /* Leave the loading state and say why. */
                sharesChecked = true;
                renderShare();
              }
            });
        }
        /**
         * Draw the sharing panel. It states plainly why the controls are
         * missing instead of silently showing an empty box.
         */
        function renderShare() {
          var panel = $("sharePanel");
          if (!shareTarget || !vehById(shareTarget)) {
            panel.hidden = true;
            return;
          }
          panel.hidden = false;
          var box = $("shareBody");
          if (!syncOn()) {
            box.innerHTML =
              '<p class="mini">' + TXT("set.shareSignedOut") + "</p>";
            return;
          }
          if (!ownsVehicle(shareTarget)) {
            box.innerHTML =
              '<p class="mini">' + TXT("set.shareNotOwner") + "</p>";
            return;
          }
          /* "not checked yet" and "not supported" are different answers, and
             showing the wrong one before the first check would tell the user to
             run SQL they have already run. */
          if (!sharesChecked) {
            box.innerHTML =
              '<p class="mini">' + TXT("set.shareLoading") + "</p>";
            var wanted = shareTarget;
            loadShares().then(function () {
              if (shareTarget === wanted) renderShare();
            });
            return;
          }
          if (!sharesAvailable) {
            box.innerHTML =
              '<p class="mini">' + TXT("set.shareNoSupport") + "</p>";
            return;
          }
/* The code request failed. Say which failure, because the four mean
               very different things and two of them are fixable by the user.

               Only relevant when there is no cached code. If a code was already
               fetched the panel must still render it, because bailing out here
               also hid the pending-request list, so Accept and Reject became
               unreachable, and the invite-by-username field never appeared. */
            var codeProblem = shareCodeProblems[shareTarget] || "";
            if (codeProblem && !shareCodeCache[shareTarget]) {
              var key =
                codeProblem === "notOnServer"
                  ? "set.shareNotSaved"
                  : codeProblem === "timeout"
                    ? "set.shareTimeout"
                    : codeProblem === "unsupported"
                      ? "set.shareNoSupport"
                      : "set.shareFailed";
              box.innerHTML =
                '<p class="mini">' + TXT(key) + "</p>";
              return;
            }
          var list = shares[shareTarget] || [];
          /* The short code comes first, because passing it on is the easy path
             and needs no username from the other person. */
          var code = shareCodeCache[shareTarget] || "";
          var h =
            '<div class="codebox">' +
            '<div class="mini" id="shareCodeLabel">' +
            TXT("set.shareCodeLabel") +
            "</div>" +
            '<div class="code" id="shareCodeValue">' +
            (code ? esc(code) : TXT("set.shareCodeNone")) +
            "</div>" +
            '<div class="qa" style="margin-top:0.4rem">' +
            '<button type="button" class="btn sm sec" id="shareCopy"' +
            (code ? "" : " disabled") +
            ">" +
            TXT("set.shareCopy") +
            "</button>" +
            '<button type="button" class="btn sm ghost" id="shareRotate">' +
            TXT("set.shareRotate") +
            "</button></div>" +
            '<div class="hint">' +
            TXT("set.shareCodeHint") +
            "</div></div>";
          /* Pending requests come first and separately: they are the only entries the
             owner has to act on, and mixing them into the member list made it
             look like they already had access. */
          var pending = [],
            accepted = [];
          for (var li = 0; li < list.length; li++) {
            if (list[li].status === "pending") pending.push(list[li]);
            else if (list[li].status !== "rejected") accepted.push(list[li]);
          }
          if (pending.length) {
            h +=
              '<h3 style="margin-top:1.25rem">' +
              TXT("set.sharePendingTitle") +
              "</h3>" +
              '<div class="hint" style="margin-bottom:0.5rem">' +
              TXT("set.sharePendingLead") +
              "</div>" +
              '<div class="list">';
            for (var p = 0; p < pending.length; p++) {
              var plabel = shareLabel(shareTarget, pending[p].user_id);
              h +=
                '<div class="item">' +
                '<span aria-hidden="true" style="font-size:1.2rem">⏳</span>' +
                '<span class="nm">' +
                esc(plabel) +
                "</span>" +
roleSelect(
                    shareTarget,
                    pending[p].user_id,
                    pending[p].role || "viewer",
                    "roleSelP" + p,
                    plabel,
                  ) +
                '<button type="button" class="btn sm sec" data-accept="' +
                esc(pending[p].user_id) +
                '" aria-label="' +
                TXT("a11y.acceptShare", { v: esc(plabel) }) +
                '">' +
                TXT("set.shareAccept") +
                "</button>" +
                '<button type="button" class="btn sm dgr" data-reject="' +
                esc(pending[p].user_id) +
                '" aria-label="' +
                TXT("a11y.rejectShare", { v: esc(plabel) }) +
                '">' +
                TXT("set.shareReject") +
                "</button></div>";
            }
            h += "</div>";
          }
          if (!list.length) {
            h += '<p class="mini">' + TXT("set.shareNone") + "</p>";
          } else if (accepted.length) {
            h +=
              '<h3 style="margin-top:1.25rem">' +
              TXT("set.shareMembersTitle") +
              "</h3>" +
              '<div class="list">';
            for (var i = 0; i < accepted.length; i++) {
              var mlabel = shareLabel(shareTarget, accepted[i].user_id);
              h +=
                '<div class="item">' +
                '<span aria-hidden="true" style="font-size:1.2rem">👤</span>' +
                '<span class="nm">' +
                esc(mlabel) +
                "</span>" +
                roleSelect(
                  shareTarget,
                  accepted[i].user_id,
accepted[i].role || "viewer",
                    "roleSelM" + i,
                    mlabel,
                  ) +
                '<button type="button" class="btn sm dgr" data-unshare="' +
                esc(accepted[i].user_id) +
                '" aria-label="' +
                TXT("a11y.unshare", { v: esc(mlabel) }) +
                '"><span aria-hidden="true">' +
                TXT("set.shareRemove") +
                "</span></button></div>";
            }
            h += "</div>";
          }
          h +=
            '<div class="addrow-fields" style="margin-top:0.5rem">' +
            '<div class="f">' +
            '<label for="shareUser">' +
            TXT("set.shareWith") +
            "</label>" +
            '<input type="text" id="shareUser" maxlength="60" ' +
            'data-i18n-ph="ph.shareuser" ' +
            'autocomplete="off" spellcheck="false" />' +
            "</div>" +
            '<button type="button" class="btn sec" id="shareInvite">' +
            TXT("set.shareInvite") +
            "</button></div>" +
            '<div class="hint">' +
            TXT("set.shareHint") +
            "</div>";
          box.innerHTML = h;
          if (window.EV_I18N) window.EV_I18N.applyI18n(box);
          /* The panel is rebuilt from scratch each time, so the controls are
             wired here rather than once at startup. */
          var copy = $("shareCopy");
          if (copy)
            copy.addEventListener("click", function () {
              var c = shareCodeCache[shareTarget] || "";
              if (!c) return;
              copyText(c).then(
                function () {
                  toast(TXT("toast.codeCopied", { c: c }));
                },
                function () {
                  toast(TXT("toast.codeCopyFail", { c: c }));
                },
              );
            });
          var rot = $("shareRotate");
          if (rot)
            rot.addEventListener("click", function () {
              var vehicle = shareTarget;
              return askConfirm(TXT("toast.codeRotateQ"), {
                heading: "confirm.shareRotate",
                ok: "confirm.yes",
              }).then(function (yes) {
                if (!yes) return "";
                rot.disabled = true;
                return shareCode(vehicle, true).then(function (code) {
                  rot.disabled = false;
                  if (!code) {
                    toast(TXT("toast.codeFail"));
                    return "";
                  }
                  toast(TXT("toast.codeRotated", { c: code }));
                  renderShare();
                  return code;
                });
              });
            });
          var invite = $("shareInvite");
          if (invite)
            invite.addEventListener("click", function () {
              doShareInvite();
            });
          var who = $("shareUser");
          if (who)
            who.addEventListener("keydown", function (ev) {
              if (ev.key !== "Enter") return;
              ev.preventDefault();
              doShareInvite();
            });
        }
        /**
         * Invite the typed username to the vehicle currently shown.
         * @returns {Promise<void>}
         */
        function doShareInvite() {
          var input = $("shareUser");
          if (!input || !shareTarget) return Promise.resolve();
          var name = input.value.trim();
          if (!name) {
            toast(TXT("toast.shareNoName"));
            input.focus();
            return Promise.resolve();
          }
          var vehicle = shareTarget;
          return shareAdd(vehicle, name).then(function (ok) {
            if (!ok) {
              toast(TXT("toast.shareFail"));
              if (input) input.focus();
              return;
            }
            /* The id that was just granted is the newest entry for this car. */
            var now = shares[vehicle] || [];
            for (var i = now.length - 1; i >= 0; i--)
              noteShareName(vehicle, now[i].user_id, name);
            if (input) input.value = "";
            toast(TXT("toast.shareOk", { u: name, v: vehById(vehicle).name }));
            renderShare();
          });
        }
        /**
         * Revoke one driver's access after confirmation.
         * @param {string} userId
         */
        function unshare(userId) {
          if (!shareTarget || !userId) return Promise.resolve(false);
          var label = shareLabel(shareTarget, userId);
          return askConfirm(TXT("toast.unshareQ", { u: label }), {
            heading: "confirm.remove",
            ok: "confirm.remove",
            irreversible: "confirm.irreversibleUnshare",
          }).then(function (yes) {
            if (!yes) return false;
            var vehicle = shareTarget;
            return shareRemove(vehicle, userId).then(function (ok) {
              if (ok) {
                if (shareNames[vehicle]) delete shareNames[vehicle][userId];
                saveShareNames();
                toast(TXT("toast.unshareOk", { u: label }));
                renderShare();
              } else {
                toast(TXT("toast.shareFail"));
              }
              return ok;
            });
          });
        }
        /**
         * Run a worker over a list with a bounded number in flight.
         * PostgREST rejects very large single requests, so bulk writes are sent
         * in slices and at most CONCURRENCY of them are open at any moment.
         * Failures are returned rather than thrown so one bad slice cannot
         * silently abandon the rest.
         * @param {Array}    list          items to process
         * @param {number}   size          items per request
         * @param {Function} worker        (slice) => Promise, resolves to false on error
         * @param {number}   [concurrency] requests in flight at once
         * @returns {Promise<{ok:number, failed:number}>}
         */
        function runBatched(list, size, worker, concurrency) {
          var slices = [];
          for (var i = 0; i < list.length; i += size)
            slices.push(list.slice(i, i + size));
          if (!slices.length) return Promise.resolve({ ok: 0, failed: 0 });
          var limit = Math.max(1, concurrency || 3);
          var next = 0,
            ok = 0,
            failed = 0;
          function workerLoop() {
            if (next >= slices.length) return Promise.resolve();
            var slice = slices[next++];
            return Promise.resolve()
              .then(function () {
                return worker(slice);
              })
              .then(function (res) {
                if (res === false) failed++;
                else ok++;
              })
              .catch(function () {
                failed++;
              })
              .then(workerLoop);
          }
          var lanes = [];
          for (var k = 0; k < Math.min(limit, slices.length); k++)
            lanes.push(workerLoop());
          return Promise.all(lanes).then(function () {
            return { ok: ok, failed: failed };
          });
        }
        /**
         * Replace every server row for this account with the current local
         * arrays. Used by "clear sessions", "delete everything" and a restored
         * backup, all of which must also clear the cloud copy rather than just
         * this browser.
         *
         * Order matters: sessions are deleted first so the ownership trigger
         * never sees an orphaned reference, and vehicles are inserted before
         * sessions so every session points at a row that already exists.
         * Both tables are written in slices, so a large backup cannot exceed
         * the request size limit.
         * @returns {Promise<boolean>} true only when every slice succeeded
         */
        function syncReplaceAll() {
          if (!syncOn()) return Promise.resolve(false);
          if (!syncOnline()) return Promise.resolve(false);
          syncQueue.pending++;
          var uid = ownerId();
          var BATCH = 500;
          var sessionsToWrite = sessions.filter(function (s) {
            return s && vehById(s.vehicleId);
          });
          var failed = 0;
          return authClient
            .from("sessions")
            .delete()
            .eq("user_id", uid)
            .then(function (r1) {
              var e1 = r1 && r1.error;
              if (e1) throw e1;
              return authClient.from("vehicles").delete().eq("user_id", uid);
            })
            .then(function (r2) {
              var e2 = r2 && r2.error;
              if (e2) throw e2;
              syncDeleted = { vehicles: {}, sessions: {} };
              return runBatched(
                vehicles.slice(),
                BATCH,
                function (slice) {
                  return authClient
                    .from("vehicles")
                    .upsert(slice.map(vehicleRow), { onConflict: "id" })
                    .then(function (r) {
                      return !(r && r.error);
                    });
                },
                3,
              );
            })
            .then(function (vres) {
              failed += vres.failed;
              return runBatched(
                sessionsToWrite,
                BATCH,
                function (slice) {
                  return authClient
                    .from("sessions")
                    .upsert(slice.map(sessionRow), { onConflict: "id" })
                    .then(function (r) {
                      return !(r && r.error);
                    });
                },
                3,
              );
            })
            .then(function (sres) {
              failed += sres.failed;
              if (failed) {
                syncQueue.pending--;
                if (window.console && window.console.warn)
                  window.console.warn(
                    "[sync] replace all: " + failed + " slice(s) failed",
                  );
                syncFail("replace all");
                return false;
              }
              syncQueue.pending--;
              syncQueue.fail = 0;
              syncDirty = { vehicles: {}, sessions: {} };
              syncNote("");
              return true;
            })
            .catch(function (err) {
              syncQueue.pending--;
              if (window.console && window.console.warn)
                window.console.warn("[sync] replace all failed", err);
              syncFail("replace all");
              return false;
            });
        }
        /**
         * Push several sessions at once, e.g. after a file import.
         * Written in slices so a large file cannot exceed the request limit,
         * and any slice that fails marks its rows dirty for the next retry.
         * @param {Array} list  local session objects
         * @returns {Promise<boolean>}
         */
        function syncSessions(list) {
          if (!syncOn() || !list || !list.length) return Promise.resolve(false);
          var rows = [];
          for (var i = 0; i < list.length; i++)
            if (list[i]) rows.push(sessionRow(list[i]));
          if (!rows.length) return Promise.resolve(false);
          syncQueue.pending++;
          return runBatched(
            rows,
            500,
            function (slice) {
              return authClient
                .from("sessions")
                .upsert(slice, { onConflict: "id" })
                .then(function (res) {
                  var e = res && res.error;
if (e) {
                      for (var k = 0; k < slice.length; k++)
                        failPush("sessions", slice[k].id, "session bulk upsert", e);
                      return false;
                    }
                  for (var j = 0; j < slice.length; j++) {
                    clearDirty("sessions", slice[j].id);
                    clearStalled("sessions", slice[j].id);
                    forgetAttempts("sessions", slice[j].id);
                  }
                  return true;
                });
            },
            3,
          )
            .then(function (out) {
              syncQueue.pending--;
              if (out.failed) {
                syncFail("session bulk upsert");
                return false;
              }
              return true;
            })
            .catch(function () {
              syncQueue.pending--;
              syncFail("session bulk upsert");
              return false;
            });
        }
        /* Pull the account's rows and replace the local arrays. Vehicles first,
   because sessions reference them. */
function syncPull() {
            if (!syncOn()) return Promise.resolve(false);
            /* Which account this pull is FOR. Without it the response is written
               into whatever account is loaded when it arrives: signing out and
               back in during the 15s window appended the old account's vehicles
               and sessions to the new account's arrays and save()d them under the
               new account's key, so the other account's charging history appeared
               on this dashboard, persisted, and went into this account's export.
               Checked again at the start of the merge, because the two awaits in
               between are exactly where the account can change. */
            var gen = acctGen;
            syncNote(TXT("sync.loading"));
          /* vres is declared out here on purpose. The vehicles response has to
             survive into the second .then, and a variable declared inside the
             first callback would not be in scope there. */
var vres = null;
            /* Both reads are deadline-bounded. This is the only place the panel
               shows "Syncing…", and an unsettled promise left that text up for
               good: syncNote was never cleared, syncQueue.pending was never
               decremented, and every "Retry now" started another hung pull. */
            return timed(
              authClient
                .from("vehicles")
                .select("*")
                .order("created_at", { ascending: true }),
            )
              .then(function (r) {
                vres = r;
                if (vres && vres.error) throw vres.error;
                return timed(
                  authClient
                    .from("sessions")
                    .select("*")
                    .order("date", { ascending: false }),
                );
              })
            .then(function (sres) {
              if (sres && sres.error) throw sres.error;
              /* The account this response belongs to must still be the loaded
               account. Everything below mutates the shared arrays and then
               save()s them under the current storage prefix, so this one
               comparison is what stops a result crossing accounts. */
              if (!acctLive(gen)) return false;
              var vrows = (vres && vres.data) || [],
                srows = (sres && sres.data) || [];
              /* Merge rather than replace. A row that only exists on this
                 device, because its write failed or it was made offline, must
                 survive the pull; replacing the arrays wholesale destroyed it
                 and the data was lost on the next refresh. */
              var pulledVehicles = [];
              var known = {};
              for (var i = 0; i < vrows.length; i++) {
                var pv = rowVehicle(vrows[i]);
                pulledVehicles.push(pv);
                known[pv.id] = 1;
              }
              var pulledSessions = [];
              var knownS = {};
              for (var j = 0; j < srows.length; j++) {
                /* drop sessions whose vehicle was deleted server-side */
                if (!vehById(srows[j].vehicle_id, pulledVehicles)) continue;
                var ps = rowSession(srows[j]);
                pulledSessions.push(ps);
                knownS[ps.id] = 1;
              }
/* Keep local rows the server does not have, and re-push them
                   below so the two sides converge. */
                var localOnlyVehicles = [];
                for (var lv = 0; lv < vehicles.length; lv++) {
                  var lvr = vehicles[lv];
                  if (lvr && !known[lvr.id]) localOnlyVehicles.push(lvr);
                }
                var localOnlySessions = [];
                for (var ls = 0; ls < sessions.length; ls++) {
                  var lsr = sessions[ls];
                  if (lsr && !knownS[lsr.id]) localOnlySessions.push(lsr);
                }
                /* The server deliberately keeps binned rows, because they have to stay
                   restorable, so the pull separates them here in the same way
                   load() does.
                   The LOCAL bin is carried across as well, which it was not: only
                   the live arrays were searched above, so resetting binned to []
                   discarded every locally binned row the server had never seen. A
                   session logged and then deleted while offline vanished from the
                   device entirely, and one deleted offline that the server *did*
                   know came back live, because the pulled copy has deleted_at
                   null and overwrote the local bin stamp. The delete was then
                   pushed back as live, so a local delete lost on the server too.
                   A local row that has been binned wins over the server's copy. */
                var localBinnedIds = {};
                var keptBinnedVehicles = [];
                for (var bv1 = 0; bv1 < binned.vehicles.length; bv1++) {
                  var bvr = binned.vehicles[bv1];
                  if (!bvr) continue;
                  if (known[bvr.id]) {
                    /* The server still has this row. Keep the local, binned copy
                       so the delete stands, and drop the server's live version. */
                    localBinnedIds[bvr.id] = 1;
                    keptBinnedVehicles.push(bvr);
                    known[bvr.id] = 0;
                  } else keptBinnedVehicles.push(bvr);
                }
                var keptBinnedSessions = [];
                for (var bs1 = 0; bs1 < binned.sessions.length; bs1++) {
                  var bsr = binned.sessions[bs1];
                  if (!bsr) continue;
                  if (knownS[bsr.id]) {
                    localBinnedIds[bsr.id] = 1;
                    keptBinnedSessions.push(bsr);
                    knownS[bsr.id] = 0;
                  } else keptBinnedSessions.push(bsr);
                }
                var localOnlyBinnedVehicles = [];
                for (var bv2 = 0; bv2 < keptBinnedVehicles.length; bv2++)
                  if (!known[keptBinnedVehicles[bv2].id])
                    localOnlyBinnedVehicles.push(keptBinnedVehicles[bv2]);
                var localOnlyBinnedSessions = [];
                for (var bs2 = 0; bs2 < keptBinnedSessions.length; bs2++)
                  if (!knownS[keptBinnedSessions[bs2].id])
                    localOnlyBinnedSessions.push(keptBinnedSessions[bs2]);
                binned.vehicles = [];
                binned.sessions = [];
                vehicles = splitBinned(
                  pulledVehicles
                    .concat(localOnlyVehicles)
                    .filter(function (r) {
                      return !localBinnedIds[r.id];
                    }),
                  binned.vehicles,
                );
                binned.vehicles = binned.vehicles.concat(localOnlyBinnedVehicles);
              /* A provisional vehicle was invented before the network could be
                 asked, so it is discarded now that the server has answered. If
                 the account genuinely has no vehicles, syncPull creates a real
                 one below and pushes it.

                 It is only discarded when it has no sessions. A charge logged
                 against it is real data the user typed, so it is kept and the
                 flag is dropped instead, which lets it be pushed normally. */
              for (var dv = vehicles.length - 1; dv >= 0; dv--) {
                if (!vehicles[dv].provisional) continue;
                var hasLogs = false;
                for (var dvs = 0; dvs < sessions.length; dvs++)
                  if (sessions[dvs].vehicleId === vehicles[dv].id) hasLogs = true;
                if (hasLogs) vehicles[dv].provisional = false;
                else vehicles.splice(dv, 1);
              }
sessions = splitBinned(
                  pulledSessions
                    .concat(localOnlySessions)
                    .filter(function (r) {
                      return !localBinnedIds[r.id];
                    }),
                  binned.sessions,
                );
                binned.sessions = binned.sessions.concat(
                  localOnlyBinnedSessions,
                );
                if (!vehicles.length) {
                /* brand new account: give them a baseline vehicle straight away */
                var first = {
                  id: uuid(),
                  name: TXT("veh.default"),
                  icon: "\u{1F697}",
                  initialOdometer: 0,
                  capacity: null,
                  /* Stamped so the insert satisfies the vehicles insert policy
                     (user_id = auth.uid()) and the car is treated as theirs. */
                  userId: ownerId(),
                };
                vehicles.push(first);
                syncVehicle(first);
              }
if (cur >= vehicles.length) cur = 0;
                  /* Re-checked immediately before the write. The merge above
                     rebuilt the shared arrays in place, so a late return here
                     would leave them holding the other account's rows for the
                     next render() to paint, even if save() never happened. */
                  if (!acctLive(gen)) return false;
                  save();
                  render();
                  stampSuccess("pull");
                  syncNote("");
              /* Push anything that failed while offline. Records deleted in the meantime
     are re-applied after the rows land, so a local delete always wins. */
              loadShares();
              retryDirty();
              retryDeleted();
/* Anything the server had never seen goes up now, so a row created
                   on this device is not lost on the next refresh.

                   retryDirty() above already pushes every row in syncDirty, and a
                   local-only row is by definition dirty if it has ever failed to
                   save. Running both meant the same object was pushed twice in
                   the same tick: two INSERTs for one id, one succeeding and the
                   other returning 23505 and recursing back into syncVehicle for
                   a third request. Two failures per pull also exhausted
                   MAX_PUSH_ATTEMPTS in two pulls instead of three.

                   Neither loop checked syncStalled, so a row that failPush had
                   deliberately given up on was re-pushed on every pull anyway,
                   which is the opposite of what giving up is for. Both guards are
                   now applied, and the loops are kept because a row can be
                   local-only without being dirty, having never been attempted. */
                for (var pv2 = 0; pv2 < localOnlyVehicles.length; pv2++) {
                  var lrow = localOnlyVehicles[pv2];
                  if (syncStalled.vehicles[lrow.id]) continue;
                  if (syncDirty.vehicles[lrow.id]) continue;
                  if (mayWriteVehicle(lrow.id) && !lrow.provisional)
                    syncVehicle(lrow);
                }
if (localOnlySessions.length)
                    syncSessions(
                      localOnlySessions.filter(function (r) {
                        /* Both guards, as the vehicle loop above. retryDirty()
                           has already queued every dirty session and
                           syncSessions bulk-upserts them in this same tick, so
                           without the dirty check an offline-logged session was
                           pushed twice per pull. A refused push spends an
                           attempt each time, which burned MAX_PUSH_ATTEMPTS in
                           half the expected pulls. */
                        if (syncStalled.sessions[r.id]) return false;
                        return !syncDirty.sessions[r.id];
                      }),
                    );
                return true;
            })
.catch(function (e) {
                  /* A failure that belongs to an account which is no longer
                     loaded must not be filed under this one: diag entries carry
                     the account and the vehicle name, so a stale one would put the
                     previous account's username and car into this account's
                     support report. */
                  if (!acctLive(gen)) return false;
                  diag("pull", {
                    operation: "pull",
                  code: (e && (e.code || e.error_code)) || "(none)",
                  message: (e && e.message) || "(none)",
                  timedOut: isTimeout(e) ? "yes" : "no",
                  online: syncOnline() ? "yes" : "no",
                });
                if (window.console && window.console.warn)
                  window.console.warn("[sync] pull failed", e);
                /* A server error while the browser is online is not the same
                   thing as being offline, and saying so was misleading. */
                syncNote(
                  TXT(syncOnline() ? "sync.syncFailed" : "sync.offline"),
                  "warn",
                );
                /* Something is queued, so keep trying on the backoff rather than
                   waiting for a pull the user may never trigger again. */
                if (pendingCount() + pendingDeleteCount()) armRetry();
                return false;
              });
        }
        /** Persist favourites to localStorage, reporting a failure to the user. */
function saveFavs() {
            try {
              localStorage.setItem(K.f, JSON.stringify(favs));
              /* The bin half too. It used to be dropped, so a deleted favourite
                 vanished on reload, and a wipe emptied the favourites list
                 irrecoverably even though it promises the bin still holds it. */
              localStorage.setItem(K.bf, JSON.stringify(binned.favs));
            } catch (e) {
              toast(TXT("toast.favSave"));
            }
          }
        function uid() {
          return (
            Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
          );
        }
        /* vehicles and sessions are keyed by uuid in Postgres, so records destined
   for the cloud must be created with a uuid up front. This keeps local ids
   and database ids identical, which is what lets upsert() work without a
   second reconciliation step. */
        function isUuid(v) {
          return (
            typeof v === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              v,
            )
          );
        }
        function uuid() {
          if (window.crypto && typeof window.crypto.randomUUID === "function") {
            try {
              return window.crypto.randomUUID();
            } catch (e) {
              /* insecure origin: fall through to the generator below */
            }
          }
          /* fallback for older browsers and insecure origins */
          var b = new Uint8Array(16);
          if (window.crypto && window.crypto.getRandomValues)
            window.crypto.getRandomValues(b);
          else
            for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
          b[6] = (b[6] & 0x0f) | 0x40;
          b[8] = (b[8] & 0x3f) | 0x80;
          var h = "";
          for (var j = 0; j < 16; j++)
            h += (b[j] + 0x100).toString(16).slice(1);
          return (
            h.slice(0, 8) +
            "-" +
            h.slice(8, 12) +
            "-" +
            h.slice(12, 16) +
            "-" +
            h.slice(16, 20) +
            "-" +
            h.slice(20)
          );
        }
        /**
         * Load favourite locations from localStorage into the favs array.
         * Tolerates the older string-only format saved by previous versions.
         */
        function loadFavs() {
          var raw = null;
          try {
            raw = JSON.parse(localStorage.getItem(K.f) || "null");
          } catch (e) {
            raw = null;
          }
          favs = [];
          if (!Array.isArray(raw)) return;
          for (var i = 0; i < raw.length; i++) {
            var f = raw[i];
            if (typeof f === "string")
              favs.push({
                id: uid(),
                name: f,
                address: f,
                lat: null,
                lng: null,
                price: null,
                deletedAt: null,
              });
            else if (f && typeof f === "object")
              /* Every field is rebuilt explicitly, so a newly added one has to be
                 listed here too or it is lost the next time the page loads. */
              favs.push({
                id: f.id || uid(),
                name: String(f.name || f.address || "Favourite"),
                address: String(f.address || f.name || ""),
                lat: isNum(f.lat) ? +f.lat : null,
                lng: isNum(f.lng) ? +f.lng : null,
                price: isNum(f.price) && +f.price >= 0 ? +f.price : null,
                deletedAt: f.deletedAt || null,
              });
          }
/* Favourites never leave the device, so their bin is device-local too. Read
               from storage rather than reset, so a deleted favourite is still
               restorable after a reload. */
            var binRaw = null;
            try {
              binRaw = JSON.parse(localStorage.getItem(K.bf) || "null");
            } catch (e) {
              binRaw = null;
            }
            binned.favs = Array.isArray(binRaw)
              ? binRaw.filter(function (f) {
                  return f && typeof f === "object" && f.id;
                })
              : [];
            favs = splitBinned(favs, binned.favs);
        }

        /* ---------- helpers ---------- */
        function pad(n) {
          return n < 10 ? "0" + n : "" + n;
        }
        function now() {
          var d = new Date();
          return {
            y: d.getFullYear(),
            m: pad(d.getMonth() + 1),
            d: pad(d.getDate()),
            h: pad(d.getHours()),
            i: pad(d.getMinutes()),
          };
        }
        function stampDefaults() {
          var n = now();
          $("date").value = n.y + "-" + n.m + "-" + n.d;
          $("time").value = n.h + ":" + n.i;
        }
        function hmToHours(v) {
          var p = String(v == null ? "" : v)
            .trim()
            .split(":");
          if (p.length < 2 || p.length > 3) return 0;
          /* Each component must be digits only. The bounds checks below catch
             60 minutes and a negative hour, but they cannot catch a SIGN: in
             JavaScript `-0 < 0` is false, so "-0:30" sailed past
             `h < 0` and returned 0.5 hours - a malformed string quietly accepted
             as thirty minutes. Worth rejecting properly, since this function
             decides whether a row's duration is a real number at all. */
          for (var q = 0; q < p.length; q++)
            if (!/^\d+$/.test(p[q].trim())) return NaN;
          var h = parseInt(p[0], 10),
            m = parseInt(p[1], 10),
            s = p.length === 3 ? parseInt(p[2], 10) : 0;
          if (!isFinite(h) || !isFinite(m) || !isFinite(s)) return 0;
            /* Reject impossible components rather than returning them.
               "-0:30" and "0:-30" both produced -0.5, which was accepted because
               only NaN was checked: the row then SUBTRACTED from the Hours tile,
               and hoursToHM rendered it as "0-1:-30" in the log and in every
               subsequent CSV export. A charge longer than a day is not a
               charging session either. */
            if (m < 0 || m > 59 || s < 0 || s > 59) return NaN;
            if (h < 0 || h > 48) return NaN;
            return h + m / 60 + s / 3600;
        }
function hoursToHM(h, alwaysSeconds) {
            /* Clamped as well, because this also formats rows restored from a
               backup, which are not re-validated on the way in. */
            var t = Math.max(0, Math.round((+h || 0) * 3600));
          var hh = Math.floor(t / 3600),
            mm = Math.floor((t % 3600) / 60),
            ss = t % 60;
          var out = pad(hh) + ":" + pad(mm);
          /* Two modes, and the distinction is deliberate.
             alwaysSeconds is for the INPUT fields, which now offer second
             precision and so must be able to display it. Without it, for the
             READ paths - the average tile, the log rows, every CSV export -
             seconds appear only when the duration actually has them, so a
             hundred rows of whole-minute sessions stay "01:30" rather than
             becoming "01:30:00". */
          if (alwaysSeconds || ss > 0) out += ":" + pad(ss);
          return out;
        }
/* Mean length of the stored sessions, and how many actually contributed.
       The mean is returned at FULL precision, deliberately. It used to be
       rounded to a whole minute here, which quietly threw away exactly the
       thing that was supposed to count: a session of 30 min 20 s and five of
       30 min came out as 30 min either way, so the seconds were read, added
       and discarded. Rounding now happens where a number is written for a
       person to read - see toWholeMinute - and nowhere else. */
      function avgDuration(list) {
        if (!list || !list.length) return { hours: null, n: 0 };
        var sum = 0,
          n = 0;
        for (var i = 0; i < list.length; i++) {
          var h = num(list[i].hours);
          if (h > 0) {
            sum += h;
            n++;
          }
        }
        if (!n) return { hours: null, n: 0 };
        return { hours: sum / n, n: n };
      }

      /* Snap to the nearest whole minute, for display only.
         Every field that shows a duration uses this, so no readout anywhere
         ends up with a spurious ":07" from the mean of unrelated charges. */
      function toWholeMinute(hours) {
        return Math.round((+hours || 0) * 60) / 60;
      }

      /* How many logged charges it takes before the average is used instead of
         the flat default. One or two charges describe those charges, not this
         driver: a single 90-minute session would otherwise prefill every
         subsequent charge with an hour and a half. */
      var DURATION_SAMPLE_MIN = 5;
      var DURATION_FALLBACK_H = 0.5;

      /**
       * The duration to prefill: the average once there are enough samples,
       * otherwise a flat default.
       *
       * @returns {{hours: number, fromAverage: boolean, n: number}}
       */
      function durationDefault(list) {
        var a = avgDuration(list || sessions);
        if (a.hours !== null && a.n >= DURATION_SAMPLE_MIN) {
          /* Full precision in, whole minute out. The seconds counted towards the
             mean and are now correctly part of it; they are simply not shown. */
          return {
            hours: toWholeMinute(a.hours),
            fromAverage: true,
            n: a.n,
          };
        }
        return {
          hours: DURATION_FALLBACK_H,
          fromAverage: false,
          /* Reported even below the threshold, so the hint can say how many
             more are needed rather than just "default". */
          n: a.n,
        };
      }
        function fmtTime(v) {
          var s = String(v == null ? "" : v).trim();
          if (!s) return "";
          /* Seconds are kept. This matched the optional third group and then
             returned only hours and minutes, so a time of 12:30:45 came back
             as "12:30" and every edit-save silently rewrote the clock of every
             row that had seconds on it. That was unreachable while the only
             seconds-capable field was the duration, which this function never
             touches; giving the time field the same precision made it a real
             path, so the truncation had to go with it. */
          var m = s.match(/^(\d{1,2})\D{0,2}(\d{1,2})(?:\D{1,2}(\d{1,2}))?$/);
          if (m) {
            var out = pad(parseInt(m[1], 10)) + ":" + pad(parseInt(m[2], 10));
            /* Only emitted when there is something to emit. Every input now
               offers seconds, but a value that arrived without them is still
               valid and turning every historical row into 12:30:00 would be a
               diff on data nobody asked to change. */
            if (m[3] !== undefined && parseInt(m[3], 10) > 0)
              out += ":" + pad(parseInt(m[3], 10));
            return out;
          }
          var t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
          if (t) {
            var out2 = pad(parseInt(t[1], 10)) + ":" + t[2];
            if (t[3] !== undefined && parseInt(t[3], 10) > 0)
              out2 += ":" + t[3];
            return out2;
          }
          return s;
        }
        function num(v) {
          var n = parseFloat(v);
          return isFinite(n) ? n : 0;
        }
        function isNum(v) {
          return v !== null && v !== undefined && v !== "" && isFinite(v);
        }

        /* ---------- locale ----------
   Everything below uses the browser's own locale, so formats follow the
   user's country. Intl is built into the browser: no requests, no slowdown.
   If the locale cannot be read we fall back to Finnish formats. */
        var LOCALE = (function () {
          try {
            var l =
              (navigator.languages && navigator.languages[0]) ||
              navigator.language ||
              "fi-FI";
            return l || "fi-FI";
          } catch (e) {
            return "fi-FI";
          }
        })();
        var REGION = (function () {
          try {
            var r = new Intl.Locale(LOCALE).region;
            if (r) return r.toUpperCase();
          } catch (e) {
            /* older engines lack Intl.Locale, so REGION stays empty and formats fall back */
          }
          var m = LOCALE.match(/[-_]([A-Za-z]{2})$/);
          return m ? m[1].toUpperCase() : "FI";
        })();
        /* Countries that write the postcode before the city: "33100 Tampere" */
        var POSTCODE_FIRST = {
          FI: 1,
          SE: 1,
          NO: 1,
          DK: 1,
          IS: 1,
          EE: 1,
          LV: 1,
          LT: 1,
          DE: 1,
          AT: 1,
          CH: 1,
          FR: 1,
          ES: 1,
          PT: 1,
          IT: 1,
          NL: 1,
          BE: 1,
          CZ: 1,
          SK: 1,
          PL: 1,
          SI: 1,
          HR: 1,
          HU: 1,
          RO: 1,
          BG: 1,
          LU: 1,
          IE: 1,
        };
        function postcodeFirst() {
          return !!POSTCODE_FIRST[REGION];
        }
        var moneyFmt = null;
        function fmtMoney(v) {
          var n = isNum(v) ? +v : 0;
          try {
            if (!moneyFmt)
              moneyFmt = new Intl.NumberFormat(LOCALE, {
                style: "currency",
                currency: "EUR",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
            return moneyFmt.format(n);
          } catch (e) {
            return n.toFixed(2) + " EUR";
          }
        }
        function fmtCents(c) {
          var n = isNum(c) ? Math.round(+c) : 0;
          return fmtMoney(n / 100);
        }
        function cityLine(city, pc) {
          if (!city && !pc) return "";
          if (!pc) return city;
          if (!city) return pc;
          return postcodeFirst() ? pc + " " + city : city + ", " + pc;
        }
        var numFmtCache = {};
        function fmtNum(v, digits) {
          var n = isNum(v) ? +v : 0;
          var key = String(digits || 0);
          try {
            if (!numFmtCache[key]) {
              numFmtCache[key] = new Intl.NumberFormat(LOCALE, {
                minimumFractionDigits: digits || 0,
                maximumFractionDigits: digits || 0,
              });
            }
            return numFmtCache[key].format(n);
          } catch (e) {
            return n.toFixed(digits || 0);
          }
        }
        function fmtKw(v) {
          if (!isNum(v)) return "—";
          return fmtNum(v, 1) + " kW";
        }
        /* charge power of one session: kWh / h */
        function chargeSpeed(s) {
          var h = num(s && s.hours);
          if (!(h > 0)) return null;
          return num(s.energy) / h;
        }
        /* battery state of charge, percent: empty -> null, otherwise clamped 0-100 */
        function soc(v) {
          if (!isNum(v)) return null;
          var n = Math.round(num(v));
          return n < 0 ? 0 : n > 100 ? 100 : n;
        }
        function fmtSoc(s) {
          var a = soc(s && s.socStart),
            b = soc(s && s.socEnd);
          if (a === null && b === null) return "";
          return (
            " (" +
            (a === null ? "" : a + "%") +
            (a !== null && b !== null ? " \u2192 " : "") +
            (b === null ? "" : b + "%") +
            ")"
          );
        }
        /* overall average power: total kWh / total hours, ignoring zero-length rows */
        function speedTotal(list) {
          var kwh = 0,
            h = 0;
          for (var i = 0; i < list.length; i++) {
            var hrs = num(list[i].hours);
            if (hrs > 0) {
              kwh += num(list[i].energy);
              h += hrs;
            }
          }
          return h > 0 ? kwh / h : null;
        }
        function hasCost(s) {
          return (
            s.cost !== null &&
            s.cost !== undefined &&
            s.cost !== "" &&
            isFinite(s.cost)
          );
        }
        function costOf(s) {
          return hasCost(s) ? s.cost : num(s.energy) * price;
        }
        function veh() {
          return vehicles[cur] || vehicles[0];
        }
        function vehById(id, list) {
          var src = list || vehicles;
          for (var i = 0; i < src.length; i++)
            if (src[i] && src[i].id === id) return src[i];
          return null;
        }
        function ofVehicle(id) {
          return sessions.filter(function (s) {
            /* deletedAt is normally redundant here, because a binned row is
               moved out of `sessions` entirely. It is checked anyway so that a
               row flagged in place can never reach a total, the distance sum,
               an export or the chart. */
            return s.vehicleId === id && !s.deletedAt;
          });
        }
        function sorted(list) {
          return list.slice().sort(function (a, b) {
            var x = (a.date || "") + "T" + (a.time || "");
            var y = (b.date || "") + "T" + (b.time || "");
            return x < y ? 1 : x > y ? -1 : (b.id || 0) - (a.id || 0);
          });
        }
        /* distance driven = highest odometer reading logged, minus the vehicle's
   initial odometer ("ground zero"). Adding up the gaps between consecutive
   sessions would silently ignore everything driven before the first entry. */
        /**
         * Consumption, measured one drive at a time.
         *
         * The old calculation divided EVERY kWh you logged by EVERY kilometre
         * the odometer moved. That is wrong by exactly one charge's worth of
         * energy, always: the newest charge has no kilometres yet, because you
         * have not driven since it, and its energy was divided by distance it
         * never covered. With two charges the error is half the total, which is
         * why it looked absurd; with twenty charges it is a twentieth, which is
         * why nobody noticed until a log was short.
         *
         * A "leg" is one drive between two charging sessions. Both endpoints
         * must carry a mileage reading, because the distance comes from the
         * difference between them. The energy credited to a leg is the charge
         * at its START: you charge, then you drive, so that charge is what
         * powered the drive.
         *
         * Sessions are walked in date order, and a leg whose distance is zero or
         * negative is skipped and COUNTED rather than allowed to subtract.
         * That happens when a reading is mistyped or when a session is
         * backfilled out of sequence, and silently averaging a negative leg
         * would make the car look impossibly efficient.
         *
         * The first reading only has a leg if the vehicle has an initial
         * odometer, because otherwise there is nothing before it to measure
         * from.
         *
         * @param {Array} list    sessions for one vehicle
         * @param {number} initialOdo the vehicle's starting odometer, or 0
         * @returns {{legs:number, km:number, kwh:number, cost:number,
         *            skipped:number, noStart:boolean, unattributed:number}}
         */
        function legStats(list, initialOdo) {
          var out = {
            legs: 0,
            km: 0,
            kwh: 0,
            cost: 0,
            skipped: 0,
            noStart: false,
            /* Charges whose energy has no distance to divide by. Reported, not
               hidden: the difference between "12 charges" and "12 charges,
               11 of them measured" is the whole point. */
            unattributed: 0,
          };
          var start = num(initialOdo);
          /* OLDEST FIRST, and said so because sorted() is the other way round:
             it returns newest first, which is what the log wants. Pairing legs
             needs the reverse walk, and getting this wrong is silent - the loop
             runs, every leg comes out negative, and the whole set is discarded
             as "no data". */
          var s = sorted(list || []).slice().reverse();
          var prev = null;
          for (var i = 0; i < s.length; i++) {
            var cur = s[i];
            var cm = num(cur.mileage);
            /* No mileage means this session cannot be an endpoint of a leg. It
               still counts as unmeasured energy. */
            if (!(cm > 0)) {
              out.unattributed += num(cur.energy);
              continue;
            }
            if (!prev) {
              if (start > 0) {
                var d0 = cm - start;
                if (d0 > 0) {
                  /* Distance only. There is no charge at the initial odometer
                     to attribute energy to, so counting cur's charge here as
                     well would bill the same energy to two legs. */
                  out.legs++;
                  out.km += d0;
                } else out.skipped++;
              } else {
                /* No starting point, so this session's charge cannot be
                   measured from here. Its energy is NOT counted here: the next
                   iteration may consume it as the start of a proper leg, and
                   the final step adds it only if nothing did. */
                out.noStart = true;
              }
              prev = cur;
              continue;
            }
            var d = cm - num(prev.mileage);
            if (d <= 0) {
              /* The odometer did not move forward. The charge is still real,
                 it just has no measurable distance behind it. */
              out.skipped++;
              out.unattributed += num(prev.energy);
            } else {
              out.legs++;
              out.km += d;
              out.kwh += num(prev.energy);
              out.cost += costOf(prev);
            }
            prev = cur;
          }
          /* The newest charge: measured nothing yet, by definition. */
          if (prev) out.unattributed += num(prev.energy);
          return out;
        }

        /**
         * Consumption, measured from the battery instead of from the odometer.
         *
         * Between two charging sessions the pack went from prev.socEnd (left
         * charged) to cur.socStart (arrived), and that percentage drop covers the
         * drive between them:
         *
         *     energy = (prev.socEnd - cur.socStart) / 100 x usable capacity
         *
         * This is the better source where it exists, because it does not care
         * how often you charge: it measures the battery rather than inferring
         * from the spacing of your entries.
         *
         * A drop of zero or less means the car was plugged in at the same level
         * it left at, which in practice means a charge was missed or a percentage
         * was mistyped. Such a leg is excluded and counted, never averaged in -
         * a zero drop would otherwise pull the figure toward zero efficiency and
         * make the car look superhuman.
         *
         * @param {Array} list
         * @param {number} usableKwh the vehicle's USABLE capacity, 0 if unset
         */
        function socLegStats(list, usableKwh) {
          var cap = num(usableKwh);
          var out = { legs: 0, km: 0, kwh: 0, skipped: 0, usable: cap > 0 };
          if (!(cap > 0)) return out;
          /* Oldest first; see legStats for why that is not the default. */
          var s = sorted(list || []).slice().reverse();
          var prev = null;
          for (var i = 0; i < s.length; i++) {
            var cur = s[i];
            if (prev) {
              var pe = soc(prev.socEnd),
                cs = soc(cur.socStart);
              var pm = num(prev.mileage),
                cm = num(cur.mileage);
              /* Both percentages and both positions are required: the
                 percentage gives the energy, the difference gives the distance,
                 and either half without the other is not a measurement. */
              if (pe !== null && cs !== null && pm > 0 && cm > 0) {
                var d = cm - pm;
                var drop = pe - cs;
                if (d > 0 && drop > 0) {
                  out.legs++;
                  out.km += d;
                  out.kwh += (drop / 100) * cap;
                } else {
                  out.skipped++;
                }
              }
            }
            if (num(cur.mileage) > 0) prev = cur;
          }
          return out;
        }

        function totals(list, initialOdo) {
          var t = { kwh: 0, cost: 0, h: 0, km: 0, est: 0 };
          var s = sorted(list);
          var maxM = 0,
            minM = 0,
            seen = false;
          for (var i = 0; i < s.length; i++) {
            t.kwh += num(s[i].energy);
            t.h += num(s[i].hours);
            t.cost += costOf(s[i]);
            if (!hasCost(s[i])) t.est++;
            var m = num(s[i].mileage);
            if (m > 0) {
              if (!seen) {
                maxM = m;
                minM = m;
                seen = true;
              } else {
                if (m > maxM) maxM = m;
                if (m < minM) minM = m;
              }
            }
          }
          if (seen) {
            /* Distance is measured from a baseline. An explicit initial odometer
               wins, because the user knows the real starting point. Without one
               the earliest logged reading is the baseline: subtracting from zero
               would report the whole odometer as distance covered. */
            var start = num(initialOdo);
            var base = start > 0 ? start : minM;
            t.km = Math.max(0, maxM - base);
            t.odo = maxM;
            /* true when the distance is measured between logged readings only,
               because no initial odometer was supplied */
            t.kmEstimated = !(start > 0);
          }
          return t;
        }
        function esc(s) {
          return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return {
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            }[c];
          });
        }
        var tmr;
        function toast(msg) {
          var el = $("toast");
          el.textContent = msg;
          el.classList.add("on");
          clearTimeout(tmr);
          tmr = setTimeout(function () {
            el.classList.remove("on");
          }, 2600);
        }

        /* ---------- supabase auth ----------
   The publishable key below is the only Supabase credential this app needs,
   and it is designed to be public: Row Level Security in the SQL schema is
   what actually protects the data, not this key. Never put a service_role
   key here.
   authConfigured() still guards against an unedited template URL so that a
   fresh clone stays usable offline instead of failing to boot. */
        var SUPABASE_URL = "https://ztzsyklfaqxurbtvsvtz.supabase.co";
        var SUPABASE_ANON_KEY =
          "sb_publishable_X13saO5I9lyqRUm5T4X3sA_pLxtrT1B";
        /* Usernames are not email addresses. .test is a reserved TLD (RFC 2606) that
   can never be registered publicly, so a confirmation mail could not arrive
   even if the project had confirmation enabled. Verified: Supabase's address
   validator accepts this domain. */
        var AUTH_FAKE_DOMAIN = "@evtracker.test";
        var authMode = "in",
          authReady = false,
          authUser = null,
          authClient = null,
          authTimer = null,
          lastSyncUser = null;
        /* Which account's storage bucket is currently loaded, or null for the
           signed-out local bucket. Distinct from lastSyncUser, which tracks
           when rows were last fetched. */
        var lastAccount = null;
        /* Monotonic counter guarding the getSession() / sign-in-form race. See
           the bootstrap in initAuth. */
        var authTicket = 0;
          /* Monotonic counter identifying WHICH ACCOUNT an in-flight async result
             belongs to. Bumped by showApp() whenever the account actually
             changes, including on sign-out.

             Every network call that produces data must capture this before its
             first await and re-check it before writing anything back. Without it,
             a pull started by account A and finished after the user signed in as
             B appended A's vehicles and sessions to B's arrays, then save()d them
             under B's storage prefix: A's full charging history on B's dashboard,
             persisted, and included in B's export. The same hole put A's rows in
             the signed-out bucket, which the next person to use the device sees.

             app/storage.js already guarantees no KEY is shared between accounts.
             This is the missing half: no RESULT may cross accounts either. */
          var acctGen = 0;
          /* True while the caller's captured generation is still the live one. */
          function acctLive(gen) {
            return gen === acctGen;
          }
        /**
         * The server rejected our token, so the local one is worthless. Drop it
         * and put the user back on the sign-in form rather than leaving an app
         * that looks signed in and cannot save anything.
         */
        async function expireSession() {
          try {
            if (authClient) await authClient.auth.signOut();
          } catch (e) {
            /* an offline sign-out still clears the local session below */
          }
          authMode = "in";
          lastAccount = null;
          $("authPass").value = "";
          showApp(null);
          authMsg(TXT("auth.expired"), "err");
        }
        function authConfigured() {
          return !!(
            SUPABASE_URL &&
            SUPABASE_ANON_KEY &&
            SUPABASE_URL.indexOf("YOUR_") < 0 &&
            SUPABASE_URL.indexOf("xxxx") < 0
          );
        }
        function toFakeEmail(u) {
          u = String(u == null ? "" : u)
            .trim()
            .toLowerCase();
          if (!u) return "";
          if (u.indexOf("@") > 0) return u; /* already qualified */
          return u + AUTH_FAKE_DOMAIN;
        }
        /* strip the dummy domain so the UI shows what the user actually typed */
        function fromFakeEmail(e) {
          e = String(e || "");
          return e.slice(-AUTH_FAKE_DOMAIN.length) === AUTH_FAKE_DOMAIN
            ? e.slice(0, -AUTH_FAKE_DOMAIN.length)
            : e;
        }
        /* Maps a Supabase auth error to a message key.
                   Supabase reports the reason in error_code, which is stable
                   across SDK versions, so it is matched first and the human
                   message is only used as a fallback. */
        function authErrKey(err) {
          var code = String(
            (err && (err.code || err.error_code)) || "",
          ).toLowerCase();
          var msg = String((err && err.message) || "").toLowerCase();
          /* an unknown username and a wrong password must stay
                       indistinguishable, so both map to the same key */
          if (
            code.indexOf("invalid_credentials") >= 0 ||
            msg.indexOf("invalid login") >= 0
          )
            return "auth.badLogin";
          if (
            code.indexOf("email_not_confirmed") >= 0 ||
            msg.indexOf("not confirmed") >= 0
          )
            return "auth.notConfirmed";
          if (
            code.indexOf("user_already_exists") >= 0 ||
            code.indexOf("already_registered") >= 0 ||
            code.indexOf("email_exists") >= 0 ||
            msg.indexOf("already registered") >= 0 ||
            msg.indexOf("already been registered") >= 0
          )
            return "auth.exists";
          if (
            code.indexOf("rate_limit") >= 0 ||
            code.indexOf("over_email_send") >= 0 ||
            msg.indexOf("rate limit") >= 0 ||
            msg.indexOf("too many") >= 0
          )
            return "auth.rate";
          if (window.console && window.console.warn)
            window.console.warn("[auth] unmapped error", code, msg);
          return "auth.failed";
        }
        /* The text shown in the auth box.

                   A raw Supabase message is the fastest way to diagnose a
                   login that refuses to work, so the server wording is shown
                   verbatim instead of being flattened into one generic line.
                   The one exception is a bad credential: that stays on the
                   neutral message so the form cannot be used to find out which
                   usernames exist. */
        function authErrText(err) {
          if (!err) return TXT("auth.failed");
          var raw = String(err.message || "").trim();
          if (authErrKey(err) === "auth.badLogin") return TXT("auth.badLogin");
          return raw || TXT("auth.failed");
        }
        /* Full detail for the console, including the parts that are
                   deliberately kept off screen. */
        function authLogErr(where, err) {
          if (!window.console || !window.console.warn) return;
          window.console.warn(
            "[auth] " + where + " failed:",
            err && err.code !== undefined
              ? {
                  code: err.code,
                  error_code: err.error_code,
                  status: err.status,
                  message: err.message,
                }
              : err,
          );
        }
        /**
         * Show, hide or clear the message under the auth form.
         * @param {string} text   empty hides the box
         * @param {string} [kind] "err" or "ok"
         */
        function authMsg(text, kind) {
          var m = $("authMsg");
          if (!text) {
            m.hidden = true;
            m.textContent = "";
            return;
          }
          m.hidden = false;
          m.textContent = text;
          m.className = "auth-msg" + (kind ? " " + kind : "");
        }
        /**
         * Switch between the sign-in screen and the app.
         * Also decides when to pull: on the first session and whenever the
         * account actually changes, so switching users never shows stale data.
         * @param {Object|null} user  Supabase user, or null to sign out
         */
        function showApp(user) {
          var was = !!authUser;
          authUser = user || null;
          var signed = !!user;
          document.body.classList.toggle("need-auth", !signed);
          $("logoutBtn").hidden = !signed;
          var chip = $("userChip");
          if (chip) chip.hidden = !signed;
          var who = signed ? user.id : null;
          /* onAuthStateChange also fires for TOKEN_REFRESHED, which Supabase
             sends roughly hourly and whenever the tab regains focus. Reloading
             storage on those would reset the selected vehicle and throw away
             edits that have not been written yet, so state is only swapped when
             the account genuinely differs from the one in the current bucket. */
if (who !== lastAccount) {
              useAccount(who);
              load();
              /* Every other bucket-scoped cache is reloaded here too. load() is
                 not the only reader of K: favs, locDefaults and shareNames were
                 each read once at boot, when K still pointed at the SIGNED-OUT
                 bucket, because useAccount() runs only here. So a signed-in
                 account's saved favourites and location defaults were never read
                 at all (the Settings controls came up blank), and changing one
                 wrote the signed-out bucket's values into the account's own key.
                 shareNames was worse: the whole map was rewritten, copying
                 another bucket's usernames into this account's namespace, which is
                 exactly the cross-account leak app/storage.js exists to stop. */
              loadFavs();
              loadLocDefaults();
              loadShareNames();
/* Sharing state is account-scoped too. Carrying it across left the
                 new account's role checks answering from the previous account's
                 rows, which is how a driver's add-session form was hidden. */
                shares = {};
                sharesChecked = false;
                shareCodeCache = {};
                shareCodeProblems = {};
                codesAvailable = false;
shareTarget = null;
              /* renderShare() is the only thing that hides or rewrites the share
                 panel, and every call site was guarded on shareTarget, which is
                 null now. So the panel was left exactly as the previous account
                 left it: their share code - a credential - their member
                 usernames and their vehicle name still in the DOM, with Copy,
                 Rotate and Invite all silently dead because shareTarget is null.
                 The one artefact here that grants access. */
              renderShare();
              /* Bumped for every account change, so any request still in flight
                 from the previous account discards its result instead of writing
                 it into this one. Placed before load() so a continuation that
                 somehow runs during this block already sees the new generation. */
              acctGen++;
              /* The sync bookkeeping is per-account, and this used to be reset
                 only on the signed-out path. A direct account A to account B
                 switch - which is exactly what happens when another tab signs in,
                 because Supabase broadcasts the session across same-origin tabs -
                 skipped it entirely, so B inherited A's queued rows, A's RLS
                 refusals with A's server messages still attached, A's attempt
                 counters, and A's armed backoff timer. B's sync panel then listed
                 rows that were not B's. */
              resetSyncQueues();
              /* Diagnostics are account-scoped too: each entry records the
                 account and the vehicle name it failed on, and the report prints
                 the probed uid. Copied into the next account's support ticket. */
              diagLog = [];
              whoAmI = { role: "unknown", uid: "unknown", error: "not probed" };
              /* Anything the previous account had open stays open across a switch
                 unless it is closed here. The sheets are body-level siblings of
                 <main class="wrap">, so the signed-out rule that hides the app
                 does not touch them: signing out left the open Edit sheet fully
                 rendered on top of the login form, complete with that session's
                 private notes. */
              closeEdit();
              closeVeh();
              closeSyncPanel();
              if ($("confirmSheet").classList.contains("on")) closeConfirm(false);
              editFav = null;
              editVehId = null;
              lastFocus = null;
              /* Neither are unsaved form fields, the map instances or the pinned
                 coordinates. The session form kept the previous account's typed
                 values and its map pin, so a new account could save the previous
                 account's charger coordinates and notes into their own history. */
              var sf = $("sForm");
              if (sf) sf.reset();
              /* The favourite form has no <form> element of its own, so its
                 inputs are cleared by id. */
              var favIds = ["fName", "fAddr", "fLat", "fLng", "fPrice"];
              for (var fi = 0; fi < favIds.length; fi++) {
                var fEl = $(favIds[fi]);
                if (fEl) fEl.value = "";
              }
              clearPin("sessMap");
              clearPin("map");
              maps = {};
              locGeo = { lat: null, lng: null, label: "" };
              closeSuggest();
              var lc = $("locStat");
              if (lc) lc.textContent = "";
              var rc = $("redeemCode");
              if (rc) rc.value = "";
              var su = $("shareUser");
              if (su) su.value = "";
            /* The canvas keeps whatever was last drawn on it, so a chart built
               for the previous account stays on screen until something
               redraws it. renderChart only runs while the dashboard is the
               visible view, which means simply switching accounts could leave
               another account's charging history sitting on the dashboard.
               Nothing survives a switch now. */
            if (monthChart) {
              try {
                monthChart.destroy();
              } catch (e) {}
              monthChart = null;
            }
            var cb = $("chartBox"),
              cn = $("chartNote");
            if (cb) cb.hidden = true;
            if (cn) {
              cn.hidden = false;
              cn.textContent = TXT("chart.loading");
            }
            if (signed) {
              /* A vehicle made while signed out has no owner stamped, because
                 there was no account to stamp it with. This account is the only
                 one that could have created it on this device, so adopt it now
                 instead of letting it fail the vehicles insert policy on every
                 pull, which is what left the sync badge permanently lit. */
              var adopted = 0;
              for (var ai = 0; ai < vehicles.length; ai++)
                if (vehicles[ai] && !vehicles[ai].userId) {
                  vehicles[ai].userId = user.id;
                  adopted++;
                }
              if (adopted) save();
            }
            lastAccount = who;
          }
          if (signed) {
            var who2 = fromFakeEmail(user.email || "");
            $("userName").textContent = who2;
            $("whoMobileName").textContent = who2;
            var wm = $("whoMobile");
            if (wm) wm.hidden = false;
            render();
            /* fetch the account's rows when a session first appears, and whenever the
   account actually changes, so switching users never shows stale data */
            if (!was || !user || user.id !== lastSyncUser) syncPull();
            if (user && user.id) lastSyncUser = user.id;
          } else {
            lastSyncUser = null;
            $("whoMobile").hidden = true;
            $("whoMobileName").textContent = "";
syncNote("");
            }
          }
          /* Every piece of per-account sync bookkeeping, in one place. Called on
             ANY account change, not only on sign-out, because a direct A-to-B
             switch is a real path: Supabase broadcasts its session across
             same-origin tabs, so signing in as B in a second tab drives the
             first tab straight from one account to the other with no signed-out
             moment in between. */
          function resetSyncQueues() {
            syncQueue = { pending: 0, fail: 0 };
            syncDirty = { vehicles: {}, sessions: {} };
            syncDeleted = { vehicles: {}, sessions: {} };
            /* These two are not per-queue, they are refusals keyed by row id.
               Carrying them across made the sync panel list rows the new account
               had never heard of, each with a Discard button that did nothing
               because the row was not on the device, and the red banner counted
               them. pushAttempts surviving meant a row of the new account's that
               had already failed twice gave up after one more. */
            syncStalled = { vehicles: {}, sessions: {} };
            pushAttempts = {};
            if (typeof clearStallBanner === "function") clearStallBanner();
            /* The retry timer and its 1Hz ticker belong to the previous
               account's queue. */
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = null;
            if (retryTick) clearInterval(retryTick);
            retryTick = null;
            retryStep = 0;
          }
        /* Renders the auth form in the current language. Called from initAuth so the
                   buttons are filled before the deferred language boot finishes,
                   and again whenever the mode or language changes. */
        function applyAuthI18n() {
          var view = $("authView");
          if (window.EV_I18N && view) window.EV_I18N.applyI18n(view);
          syncAuthButtons(false);
        }
        /* Single place that owns both button labels, so sign in and
                   register can never drift apart. */
        function syncAuthButtons(busy) {
          var go = $("authGo"),
            tg = $("authToggle");
          if (go) {
            go.disabled = !!busy;
            go.textContent = busy
              ? TXT("auth.working")
              : TXT(authMode === "up" ? "auth.createAccount" : "auth.signIn");
          }
          if (tg) {
            tg.disabled = !!busy;
            tg.textContent = TXT(
              authMode === "up" ? "auth.haveAccount" : "auth.needAccount",
            );
          }
        }
        /**
         * Disable the auth buttons and show a working label while a request
         * is in flight.
         * @param {boolean} b
         */
        function setAuthBusy(b) {
          syncAuthButtons(!!b);
        }
        async function submitAuth(e) {
          if (e) e.preventDefault();
          if (!authClient) {
            authMsg(TXT("auth.notConfigured"), "err");
            return;
          }
          var u = $("authUser").value.trim(),
            p = $("authPass").value;
          if (!u || !p) {
            authMsg(TXT("auth.missing"), "err");
            return;
          }
          if (authMode === "up" && p.length < 8) {
            authMsg(TXT("auth.shortPw"), "err");
            return;
          }
setAuthBusy(true);
            authMsg("");
            /* Claims the same ticket the bootstrap uses. Without it that guard
               could never fire, because nothing else incremented it: a slow
               getSession() resolving after this sign-in succeeded would run
               showApp for the *previous* account, switching the app back, or sign
               the user straight out again if the stale token had expired. */
            var ticket = ++authTicket;
            try {
              var email = toFakeEmail(u),
                res;
              var registering = authMode === "up";
              if (registering)
              res = await authClient.auth.signUp({
                email: email,
                password: p,
              });
            else
              res = await authClient.auth.signInWithPassword({
                email: email,
                password: p,
              });
var err = res && res.error;
              /* A newer attempt, or a sign-out, has happened while we waited. */
              if (ticket !== authTicket) return;

              /* A name that is already taken is not a failure worth
                           reporting: it means the account exists, so the useful
                           move is to sign in with the password just typed. */
            if (err && registering && authErrKey(err) === "auth.exists") {
              authLogErr("signUp (name taken, retrying as sign-in)", err);
              res = await authClient.auth.signInWithPassword({
                email: email,
                password: p,
              });
              err = res && res.error;
            }

            if (err) {
              authLogErr(registering ? "signUp" : "signIn", err);
              authMsg(authErrText(err), "err");
} else if (res.data && res.data.session) {
                /* a session came straight back, so the project does
                                 not require email confirmation */
                if (ticket !== authTicket) return;
                authMsg(TXT("auth.ok"), "ok");
                $("authPass").value = "";
                showApp(res.data.user);
              } else if (registering) {
              /* The account exists but no session was issued. With
                               confirmation enabled the sign-in below fails with
                               email_not_confirmed, and that reason is shown as is
                               so the project setting can be fixed. */
              try {
                var li = await authClient.auth.signInWithPassword({
                  email: email,
                  password: p,
                });
                if (li && li.data && li.data.session) {
                  authMsg(TXT("auth.ok"), "ok");
                  $("authPass").value = "";
                  showApp(li.data.user);
                } else {
                  authLogErr(
                    "signIn after sign-up",
                    li && li.error
                      ? li.error
                      : { message: "no session returned" },
                  );
                  authMsg(
                    authErrText(
                      li && li.error
                        ? li.error
                        : { message: TXT("auth.failed") },
                    ),
                    "err",
                  );
                }
              } catch (liErr) {
                authLogErr("signIn after sign-up", liErr);
                authMsg(authErrText(liErr), "err");
              }
            } else {
              authMsg(TXT("auth.ok"), "ok");
            }
          } catch (err2) {
            /* a thrown error is a transport or library failure, not a
                           credential problem, so the real reason is worth seeing */
            authLogErr(registering ? "signUp" : "signIn", err2);
            authMsg(
              err2 && err2.message ? err2.message : TXT("auth.failed"),
              "err",
            );
          } finally {
            setAuthBusy(false);
          }
        }
        async function doLogout() {
          if (!authClient) return;
          /* Names the account on the way out. Signing out of the wrong account
             is how one account's data ends up looking like another's. */
var who = $("userName").textContent || TXT("auth.logout");
            /* Same ticket as the sign-in form, so a bootstrap still in flight
               cannot showApp() the account the user just signed out of. */
            var ticket = ++authTicket;
            var yes = await askConfirm(TXT("auth.logoutQ", { u: who }), {
              heading: "confirm.logout",
              ok: "confirm.logout",
            });
            if (!yes) return;
            if (ticket !== authTicket) return;
            try {
              await authClient.auth.signOut();
            } catch (e) {
              /* an offline sign-out still clears the local session below */
            }
            /* The user may have signed in as somebody else while the confirm
               dialog was up, in which case this sign-out must not evict them. */
            if (ticket !== authTicket) return;
            authMode = "in";
          $("authPass").value = "";
          authMsg("");
          showApp(null);
        }
        /* Fill the auth form in the detected language before anything else, so the
                   buttons and labels are never blank while the CDN script and
                   the session are still resolving. */
        function initAuth() {
          applyAuthI18n();
          var lib = $("supabaseLib");
          var clientStarted = false;
          function finish() {
            /* the load event and the immediate check below can both
                           fire, so the client must only be built once */
            if (clientStarted) return;
            if (!authConfigured()) {
              /* placeholders: stay open as a local-only, single-user app */
              clientStarted = true;
              authReady = true;
              document.body.classList.remove("need-auth");
              $("logoutBtn").hidden = true;
              var chip = $("userChip");
              if (chip) chip.hidden = true;
              render();
              return;
            }
            if (!window.supabase || !window.supabase.createClient) {
              authMsg(TXT("auth.noLib"), "err");
              return;
            }
            clientStarted = true;
            authClient = window.supabase.createClient(
              SUPABASE_URL,
              SUPABASE_ANON_KEY,
            );
            authClient.auth.onAuthStateChange(function (evt, session) {
              var u = session && session.user ? session.user : null;
              /* A token refresh is the one event that can arrive with a dead
                 token, and getSession() will not tell us: it reads the local
                 cache and never asks the server whether the token is still
                 good. That is how an app ends up looking signed in while the
                 database sees nobody, and every write is then refused. Asking
                 getUser() actually validates it. */
if (u && evt === "TOKEN_REFRESHED") {
                  /* Claims the ticket, like every other continuation in this
                     file. Without it this one is a way to UNDO a sign-out: the
                     token refreshes, getUser() goes off, the user finishes
                     signing out, and then this resolves and calls showApp again -
                     the app re-opening itself as the account they just left,
                     dashboard and all, with syncOn() true while the Supabase
                     session is already gone so every write is refused. */
                  var rticket = ++authTicket;
                  authClient.auth.getUser().then(
                    function (r) {
                      if (rticket !== authTicket) return;
                      var real = r && r.data && r.data.user;
                      if (!real) {
                        expireSession();
                        return;
                      }
                      showApp(real);
                    },
                    function () {
                      if (rticket !== authTicket) return;
                      expireSession();
                    },
                  );
                  return;
                }
              showApp(u);
            });
            /* Monotonic, so a slow getSession() that resolves after the sign-in
               form has already succeeded cannot drag the app back to the
               previous account. Both paths claim a ticket; the older one is
               ignored on arrival. */
            var ticket = ++authTicket;
            authClient.auth
              .getSession()
              .then(function (res) {
                if (ticket !== authTicket) return;
                var s = res && res.data && res.data.session;
                if (!s || !s.user) {
                  showApp(null);
                  authReady = true;
                  return;
                }
                /* Validated against the server rather than trusted from cache.
                   A dead session is reported instead of quietly producing a
                   signed-in shell that cannot write anything. */
                authClient.auth
                  .getUser()
                  .then(function (r) {
                    if (ticket !== authTicket) return;
                    var real = r && r.data && r.data.user;
                    showApp(real || null);
                    if (!real) authMsg(TXT("auth.expired"), "err");
                    authReady = true;
                  })
                  .catch(function () {
                    if (ticket !== authTicket) return;
                    showApp(null);
                    authReady = true;
                  });
              })
              .catch(function () {
                if (ticket !== authTicket) return;
                authReady = true;
              });
          }
          if (lib) {
            lib.addEventListener("load", finish);
            lib.addEventListener("error", function () {
              authMsg(TXT("auth.noLib"), "err");
            });
            if (window.supabase && window.supabase.createClient) finish();
          } else finish();
        }
        /* onAuthStateChange can fire before the DOM listener is attached in some
   browsers; poll briefly so the shell never stays hidden */
        function authWatchdog() {
          if (authReady) return;
          authTimer = setInterval(function () {
            if (authReady) {
              clearInterval(authTimer);
              return;
            }
            if (
              !authConfigured() ||
              (window.supabase && window.supabase.createClient && authClient)
            ) {
              render();
            }
          }, 400);
          setTimeout(function () {
            if (authTimer) clearInterval(authTimer);
          }, 8000);
        }

        /* ---------- monthly dashboard chart ---------- */
        var monthChart = null;
        /**
         * Read the current theme colours from CSS custom properties.
         * @returns {Object} text, muted, line, kwh and cost colours
         */
        function chartColors() {
          var cs = window.getComputedStyle
            ? window.getComputedStyle(document.body)
            : null;
          var g = function (n, fb) {
            var v = cs ? cs.getPropertyValue(n) : "";
            v = String(v).trim();
            return v || fb;
          };
          return {
            text: g("--text", "#0f172a"),
            muted: g("--text-muted", "#475569"),
            line: g("--line", "#e2e8f0"),
            kwh: g("--primary", "#2563eb"),
            cost: g("--accent", "#06b6d4"),
          };
        }
        /* kWh and cost per month, for one vehicle; most recent 12 months that have data */
        function monthBuckets(id) {
          var list = ofVehicle(id),
            m = {};
          for (var i = 0; i < list.length; i++) {
            var s = list[i],
              k = String(s.date || "").slice(0, 7);
            if (!/^\d{4}-\d{2}$/.test(k)) continue;
            if (!m[k]) m[k] = { kwh: 0, cost: 0 };
            m[k].kwh += num(s.energy);
            m[k].cost += costOf(s);
          }
          var keys = Object.keys(m).sort();
          if (keys.length > 12) keys = keys.slice(keys.length - 12);
          var out = [];
          for (var q = 0; q < keys.length; q++)
            out.push({
              key: keys[q],
              kwh: Math.round(m[keys[q]].kwh * 100) / 100,
              cost: Math.round(m[keys[q]].cost * 100) / 100,
            });
          return out;
        }
        function monthLabel(k) {
          var d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1);
          if (!isFinite(d.getTime())) return k;
          return d.toLocaleDateString(undefined, {
            month: "short",
            year: "2-digit",
          });
        }
        /**
         * Draw the monthly energy and cost bars.
         * Does nothing visible when Chart.js failed to load; chartNote then
         * explains why. Safe to call repeatedly.
         */
        function renderChart() {
          var note = $("chartNote"),
            box = $("chartBox");
          if (!note || !box) return;
          /* Chart.js cannot measure a hidden canvas, so only draw while the
     dashboard is the visible view */
          if (view !== "dashboard") return;
function say(msg) {
              /* Destroy, do not just drop the reference. Chart.js keeps a
                 global registry and its constructor THROWS if a canvas already
                 has a chart, so nulling the variable left an instance alive:
                 switching to a vehicle with no sessions and back made the next
                 render throw, the chart stayed blank for the rest of the
                 session, and the raw Chart.js error was painted into the error
                 box in Settings. */
              if (monthChart) {
                try {
                  monthChart.destroy();
                } catch (e) {}
              }
              monthChart = null;
              note.textContent = msg;
              note.hidden = false;
              box.hidden = true;
            }
          if (!window.Chart) return say(TXT("chart.offline"));
          var b = monthBuckets(veh().id);
          if (!b.length) return say(TXT("chart.empty"));
          note.hidden = true;
          box.hidden = false;
          var C = chartColors();
          var data = {
            labels: [],
            datasets: [
              {
                type: "bar",
                label: TXT("chart.energy"),
                yAxisID: "y",
                order: 2,
                backgroundColor: C.kwh,
                borderRadius: 4,
                data: [],
              },
              {
                type: "line",
                label: TXT("chart.cost"),
                yAxisID: "y1",
                order: 1,
                borderColor: C.cost,
                backgroundColor: C.cost,
                borderWidth: 2,
                pointRadius: 3,
                tension: 0.3,
                data: [],
              },
            ],
          };
          for (var i = 0; i < b.length; i++) {
            data.labels.push(monthLabel(b[i].key));
            data.datasets[0].data.push(b[i].kwh);
            data.datasets[1].data.push(b[i].cost);
          }
          function restyle(ch) {
            if (!ch.options) return ch;
            ch.options.scales.x.ticks.color = C.muted;
            ch.options.scales.y.ticks.color = C.muted;
            ch.options.scales.y1.ticks.color = C.muted;
            ch.options.scales.x.grid.color = C.line;
            ch.options.scales.y.grid.color = C.line;
            ch.options.plugins.legend.labels.color = C.text;
            ch.options.plugins.title.color = C.text;
            return ch;
          }
          if (monthChart) {
            /* Handing Chart.js a whole new `data` object does not reliably
               rebuild the axes. When the number of months changes, which is
               exactly what happens on an account switch or when a vehicle's
               history is deleted, the old scale and labels can survive and keep
               the previous series on screen. Rebuilding is the only way to be
               sure the chart shows the data it was just handed. */
            var sameShape =
              monthChart.data.labels.length === data.labels.length;
            if (sameShape) {
              /* Same shape: mutate the arrays in place, which Chart.js does
                 handle correctly, and avoids tearing the chart down on every
                 render. */
              monthChart.data.labels = data.labels;
              monthChart.data.datasets[0].data = data.datasets[0].data;
              monthChart.data.datasets[1].data = data.datasets[1].data;
              restyle(monthChart).update();
              return;
            }
            monthChart.destroy();
            monthChart = null;
          }
          monthChart = new window.Chart($("monthChart"), {
            type: "bar",
            data: data,
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: "index", intersect: false },
              plugins: {
                title: {
                  display: true,
                  text: TXT("chart.title"),
                  color: C.text,
                  font: { size: 13, weight: "normal" },
                  padding: { bottom: 12 },
                },
                legend: {
                  position: "bottom",
                  labels: {
                    color: C.text,
                    boxWidth: 12,
                    usePointStyle: true,
                  },
                },
                tooltip: {
                  callbacks: {
                    label: function (c) {
                      return (
                        c.dataset.label +
                        ": " +
                        (c.parsed.y === null ? "" : num(c.parsed.y).toFixed(2))
                      );
                    },
                  },
                },
              },
              scales: {
                x: {
                  ticks: {
                    color: C.muted,
                    autoSkip: true,
                    maxRotation: 0,
                  },
                  grid: { color: C.line },
                },
                y: {
                  beginAtZero: true,
                  position: "left",
                  title: {
                    display: true,
                    text: "kWh",
                    color: C.muted,
                  },
                  ticks: { color: C.muted },
                  grid: { color: C.line },
                },
                y1: {
                  beginAtZero: true,
                  position: "right",
                  title: {
                    display: true,
                    text: "EUR",
                    color: C.muted,
                  },
                  ticks: { color: C.muted },
                  grid: { drawOnChartArea: false },
                },
              },
            },
          });
          restyle(monthChart);
        }
        /* the CDN script is deferred, so Chart may not exist on first paint */
        function watchChartLib() {
          var lib = $("chartjsLib");
          if (lib)
            lib.addEventListener("load", function () {
              renderChart();
            });
          if (lib)
            lib.addEventListener("error", function () {
              renderChart();
            });
          setTimeout(function () {
            if (view === "dashboard") renderChart();
          }, 2500);
        }

        var lastAnnouncedVeh = null;
        /* Screen-reader users get no visual confirmation that the tiles below now
   belong to a different vehicle, so state the switch explicitly. */
        function announceVehicle() {
          var v = veh();
          if (lastAnnouncedVeh === v.id) return;
          lastAnnouncedVeh = v.id;
          var el = $("statsLive");
          if (el) el.textContent = TXT("a11y.stats") + " - " + v.name;
        }
        /* Rebuilds the tiles, table and favourite rows, then re-applies translated
   accessible names, since those rows are recreated from HTML on every render.
                   refreshAriaNames lives in the translation script, which is a
                   separate IIFE, so it is reached through the EV_I18N bridge and
                   guarded: a missing helper must never stop the app rendering. */
        function refreshAriaNames() {
          try {
            var i18n = window.EV_I18N;
            if (i18n && typeof i18n.refreshAriaNames === "function")
              i18n.refreshAriaNames();
          } catch (e) {
            /* re-labelling rows is an enhancement; rendering wins over it */
          }
        }
        function render() {
          renderBody();
          refreshAriaNames();
        }
        /**
         * Run one panel's renderer, containing any failure to that panel.
         *
         * renderBody fills a dozen independent panels in one pass. Without this,
         * a single throw anywhere in it silently skipped every panel after that
         * point, which presents as "half the view has no text in it" with
         * nothing in the console to explain it. A panel that fails is reported
         * on screen instead, so the next occurrence is diagnosable.
         *
         * @param {string} name  which panel, for the message
         * @param {Function} fn
         */
        function tryPanel(name, fn) {
          try {
            fn();
          } catch (e) {
            if (window.console && window.console.warn)
              window.console.warn("[render] " + name + " panel failed", e);
            var host = $("panelError");
            if (host) {
              host.hidden = false;
              host.textContent =
                TXT("set.panelError") + " (" + name + ": " + (e && e.message) + ")";
            }
          }
        }
        function renderBody() {
          var v = veh();
/* Through TXT(). These were hard-coded English, so the page heading for two
               whole views read in English next to translated nav buttons. The nav
               keys are reused because they are what leads to each view. */
            $("who").textContent =
              view === "dashboard" || view === "view-data"
                ? v.name
                : view === "add-session"
                  ? TXT("nav.add")
                  : view === "settings"
                    ? TXT("nav.set")
                    : TXT("nav.dashboard");
          /* Say why the form is unusable instead of letting someone fill it in
             and then hit a refusal from the server. */
          $("formVeh").textContent = v.name;
          var canAdd = canAddSession(v.id);
          if (!canAdd) {
            $("formVeh").textContent =
              v.name +
              ": " +
              TXT(
                isPending(v.id) ? "set.pendingNoAddLead" : "set.viewerNoAddLead",
              );
          }
          $("sForm").hidden = !canAdd;
          $("dbInfo").textContent = TXT("db", {
            n: sessions.length,
            v: vehicles.length,
          });

          var multi = vehicles.length > 1;
          $("vehWrap").hidden = !multi;
          if (multi) {
            var h = "";
            for (var i = 0; i < vehicles.length; i++) {
              /* Filtered once. ofVehicle() walks the whole session array, and it
                 was being called three times per card, so the cost grew with
                 vehicles multiplied by sessions on every render. */
              var mine2 = ofVehicle(vehicles[i].id);
              var t = totals(mine2);
              var nSessions = mine2.length;
              h +=
                '<button class="vcard" type="button" data-v="' +
                esc(vehicles[i].id) +
                '" aria-pressed="' +
                (i === cur) +
                '">' +
                '<span class="ic" aria-hidden="true">' +
                esc(vehicles[i].icon) +
                "</span>" +
                '<div class="n">' +
                esc(vehicles[i].name) +
                "</div>" +
                '<div class="s">' +
                t.kwh.toFixed(1) +
                " kWh · " +
                /* Through TXT(). The English plural rule was applied by
                   concatenating "s" in code, which puts the word order and the
                   plural form wrong in Finnish and Swedish. */
                TXT("veh.sessions", { n: nSessions }) +
                "</div>" +
                (isPending(vehicles[i].id)
                  ? '<div class="s">' + TXT("set.pendingTag") + "</div>"
                  : "") +
                "</button>";
            }
            $("vehList").innerHTML = h;
          }
          announceVehicle();

          var sel = ofVehicle(v.id);
          var T = totals(sel, v.initialOdometer);
          $("sEnergy").textContent = T.kwh.toFixed(1) + " kWh";
          $("sDist").textContent = Math.round(T.km) + " km";
          /* Say so when the distance is measured between logged readings,
             because no starting odometer was given for this vehicle. */
          var distLabel = $("sDistLabel");
          if (distLabel) {
            distLabel.textContent = TXT(
              T.kmEstimated ? "tile.distEst" : "tile.dist",
            );
            distLabel.title = T.kmEstimated
              ? TXT("tile.distEstHelp")
              : TXT("tile.distHelp");
          }
          $("sCost").textContent = fmtMoney(T.cost);
          $("sDur").textContent = T.h.toFixed(1) + " h";
          renderConsumption(sel, v);
          $("sSpeed").textContent = fmtKw(speedTotal(sel));
          /* The tile shows the real mean whatever the sample size - it reports what
             the data says rather than what we would prefill, so it is not
             subject to DURATION_SAMPLE_MIN. Rounded for reading, like every
             other duration readout. */
          var ad = avgDuration(sel);
          $("sDurAvg").textContent =
            ad.hours === null ? "—" : hoursToHM(toWholeMinute(ad.hours));

          /* The log table and its scope picker are only built while the log is
             actually on screen. This was the most expensive thing in the app by
             a distance: every row is nested markup, and it was rebuilt on each
             view change, vehicle switch, add, delete and language switch. The
             bin and the chart already have this guard. Exports read the scope
             picker's value on demand, and it keeps the user's last choice. */
          if (view === "view-data") {
            var list = sorted(ofVehicle(v.id));
            $("logLead").textContent = list.length
              ? TXT("log.for", { n: list.length, v: v.name })
              : TXT("log.none", { v: v.name });
            var tb = "";
            for (var j = 0; j < list.length; j++) {
              var s = list[j];
              var c = fmtMoney(costOf(s));
              var tags = "";
              if (s.fast)
                tags += '<span class="tag t-fast">' + TXT("tag.fast") + "</span>";
              if (s.home)
                tags += '<span class="tag t-home">' + TXT("tag.home") + "</span>";
              if (s.fav)
                tags += '<span class="tag t-fav">' + TXT("tag.fav") + "</span>";
              if (!hasCost(s))
                tags += '<span class="tag t-est">' + TXT("tag.est") + "</span>";
              tb +=
                "<tr><td>" +
                esc(s.date) +
                "</td><td>" +
                esc(fmtTime(s.time)) +
                "</td><td>" +
                esc(hoursToHM(s.hours)) +
                "</td>" +
                "<td>" +
                esc(s.location) +
                /* On a shared car, who wrote the row. Empty on a car with one
                   member, where it would be "by you" on every single line. */
                authorOf(s, v) +
                "</td><td>" +
                num(s.energy).toFixed(2) +
                " kWh" +
                fmtSoc(s) +
                "</td><td>" +
                fmtKw(chargeSpeed(s)) +
                "</td>" +
                "<td>" +
                num(s.mileage).toFixed(1) +
                " km</td>" +
                "<td>" +
                c +
                "</td><td>" +
                tags +
                '</td><td class="wrapc">' +
                esc(s.notes || "—") +
                "</td>" +
                /* The buttons are omitted rather than disabled: a viewer should
                   not be offered an action the server would refuse, and an empty
                   cell keeps the row height stable. */
                (canEditSession(s)
                  ? '<td><button type="button" class="btn sm ghost" data-edit="' +
                    esc(s.id) +
                    '" aria-label="' +
                    TXT("a11y.editSession", {
                      v: esc(s.location),
                      d: esc(s.date),
                    }) +
                    '"><span aria-hidden="true">✎</span></button> ' +
                    '<button type="button" class="btn sm dgr" data-del="' +
                    esc(s.id) +
                    '" aria-label="' +
                    TXT("a11y.deleteSession", {
                      v: esc(s.location),
                      d: esc(s.date),
                    }) +
                    '"><span aria-hidden="true">✕</span></button></td>'
                  : '<td class="mt">—</td>') +
                "</tr>";
            }
            $("logBody").innerHTML =
              tb ||
              '<tr><td colspan="11" class="empty">' +
                /* A pending requester can read nothing at all, so an empty table
                   would read as lost data rather than as a request still waiting
                   for the owner. */
                TXT(
                  canView(v.id) && isPending(v.id)
                    ? "set.pendingNoHistory"
                    : "cl.none",
                ) +
                "</td></tr>";

renderScopePicker();
            }

          var vs = "";
          tryPanel("vehicles", function () {
          for (var k = 0; k < vehicles.length; k++) {
            var c2 = ofVehicle(vehicles[k].id).length;
            var mine = ownsVehicle(vehicles[k].id);
            /* Admins may rename and change settings. Sharing and deleting the
               vehicle itself stay with the owner. */
            var editable = canEditVehicle(vehicles[k].id);
            var waiting = isPending(vehicles[k].id);
            vs +=
              '<div class="item"><span aria-hidden="true" style="font-size:1.2rem">' +
              esc(vehicles[k].icon) +
              "</span>" +
              '<span class="nm">' +
              esc(vehicles[k].name) +
              /* A car added with somebody else's code behaves like any other,
                 but it is not yours to rename or delete, so say so. A request
                 still waiting for approval is called out separately, because
                 otherwise an empty history looks like data loss. */
              (waiting
                ? '<span class="shared-tag">' +
                  TXT("set.pendingTag") +
                  "</span>"
                : mine || !syncOn()
                  ? ""
                  : '<span class="shared-tag">' +
                    TXT("set.sharedTag") +
                    "</span>") +
              "</span>" +
              '<span class="mt">' +
              TXT("fav.uses", { n: c2 }) +
              "</span>" +
              (editable
                ? '<button type="button" class="btn sm ghost" data-ren="' +
                  esc(vehicles[k].id) +
                  '" aria-label="' +
                  TXT("a11y.renameVeh", {
                    v: esc(vehicles[k].name),
                  }) +
                  '"><span aria-hidden="true">' +
                  TXT("set.rename") +
                  "</span></button>"
                : "") +
              (canShare() && mine
                ? '<button type="button" class="btn sm sec" data-share="' +
                  esc(vehicles[k].id) +
                  '" aria-label="' +
                  TXT("a11y.shareVeh", { v: esc(vehicles[k].name) }) +
                  '"><span aria-hidden="true">' +
                  TXT("set.share") +
                  (shareCount(vehicles[k].id)
                    ? " (" + shareCount(vehicles[k].id) + ")"
                    : "") +
                  "</span></button>"
                : "") +
              /* The way out of a car you do not own. Without this the share
                 was permanent from your side: the panel above only appears for
                 the owner, so a member had nothing to press. Present for every
                 state - accepted, pending and refused - and worded for each. */
              (!mine && myShare(vehicles[k].id)
                ? '<button type="button" class="btn sm ghost" data-leave="' +
                  esc(vehicles[k].id) +
                  '" aria-label="' +
                  TXT("a11y.leaveVeh", { v: esc(vehicles[k].name) }) +
                  '"><span aria-hidden="true">' +
                  TXT(
                    isPending(vehicles[k].id)
                      ? "set.cancelRequest"
                      : isRejected(vehicles[k].id)
                        ? "set.clearRequest"
                        : "set.leave",
                  ) +
                  "</span></button>"
                : "") +
              (vehicles.length > 1 && mine
                ? '<button type="button" class="btn sm dgr" data-rm="' +
                  esc(vehicles[k].id) +
                  '" aria-label="' +
                  TXT("a11y.removeVeh", {
                    v: esc(vehicles[k].name),
                  }) +
                  '"><span aria-hidden="true">' +
                  TXT("set.remove") +
                  "</span></button>"
                : "") +
              "</div>";
          }
          });
          $("vehSettings").innerHTML = vs;
          /* Each of these is an independent panel. Contained separately so one
             of them failing cannot leave the rest of the view blank. */
          tryPanel("import", renderImportTarget);
          tryPanel("bin", renderBin);
          if (view === "settings") {
            tryPanel("layout", renderLayoutPicker);
            tryPanel("build", renderBuildRow);
            tryPanel("account", renderAccountPanel);
          }
          tryPanel("redeem", renderRedeemPanel);
          tryPanel("price", syncCents);
tryPanel("favourites", renderFavs);
            tryPanel("scope", renderScopePicker);
            tryPanel("chart", renderChart);
        }

        /**
         * Rebuild both favourite surfaces: the saved list and the quick chips
         * shown under the session form.
         */
        /**
         * Format when a row was binned, for the bin list.
         * @param {?string} iso
         * @returns {string} a short local date and time, or "" if unknown
         */
        function binWhen(iso) {
          if (!iso) return "";
          var t = Date.parse(iso);
          if (!isFinite(t)) return "";
          try {
            return new Date(t).toLocaleString();
          } catch (e) {
            return new Date(t).toISOString().slice(0, 16).replace("T", " ");
          }
        }
        /**
         * Build the bin view: everything deleted, with Restore and
         * Delete forever on each row.
         */
        /**
         * Everything that is not on the server yet, with a reason.
         * The reason is the whole point: "waiting for the network" is harmless,
         * while "the server refused this" will never resolve on its own.
         * @returns {Array<{kind:string, id:string, label:string, why:string, hard:boolean}>}
         */
        function unsyncedRows() {
          var out = [];
          var offline = !syncOnline();
          function add(kind, id, why, hard, stall) {
            var row =
              kind === "vehicles" ? vehicleAnywhere(id) : sessionAnywhere(id);
            out.push({
              kind: kind,
              id: id,
              label: row
                ? kind === "vehicles"
                  ? row.name
                  : row.location + " · " + row.date
                : "(no longer on this device)",
              /* `stall` is the recorded server error, when there is one. */
              why: typeof why === "object" && why ? why.reason : why,
              /* Discard is only offered for a row that is itself wrong. A row
                 held back by a pending approval is good data, and one button
                 press must not be able to delete it. */
              hard:
                stall && stall.kind === "notYet"
                  ? false
                  : !!hard,
              /* Surfaced separately from `hard` so the panel can explain the
                 whole group in one line. */
              held: !!(stall && stall.kind === "notYet"),
              why2:
                stall && stall.kind ? TXT("sync.reason." + stall.kind) : "",
              code: (stall && stall.code) || "",
              detail:
                stall && (stall.message || stall.details)
                  ? [stall.code, stall.message, stall.details]
                      .filter(Boolean)
                      .join(" · ")
                  : "",
              when: (stall && stall.when) || "",
            });
          }
          var vi = Object.keys(syncDirty.vehicles);
          for (var a = 0; a < vi.length; a++)
            if (!syncStalled.vehicles[vi[a]])
              add("vehicles", vi[a], offline ? "offline" : "queued", false);
          var si = Object.keys(syncDirty.sessions);
          for (var b = 0; b < si.length; b++)
            if (!syncStalled.sessions[si[b]])
              add("sessions", si[b], offline ? "offline" : "queued", false);
          var sv = Object.keys(syncStalled.vehicles);
          for (var c = 0; c < sv.length; c++) {
            var st = syncStalled.vehicles[sv[c]];
            add("vehicles", sv[c], st, true, st);
          }
var ss = Object.keys(syncStalled.sessions);
            for (var d = 0; d < ss.length; d++) {
              var st2 = syncStalled.sessions[ss[d]];
              add("sessions", ss[d], st2, true, st2);
            }
            /* Deletes waiting to be confirmed. They were listed nowhere and
               counted nowhere, so a "delete forever" that failed was invisible
               and silently reverted by the next pull. Not discardable: the row is
               already gone from this device, so the only thing left is to finish
               telling the server. */
            var dv = Object.keys(syncDeleted.vehicles || {});
            for (var e = 0; e < dv.length; e++)
              add("vehicles", dv[e], offline ? "offline" : "delete queued", false);
            var ds = Object.keys(syncDeleted.sessions || {});
            for (var f = 0; f < ds.length; f++)
              add("sessions", ds[f], offline ? "offline" : "delete queued", false);
            return out;
        }
        /**
         * Throw away one row that will never reach the server. Because it never
         * made it up, removing it here is a real delete, and it is confirmed
         * with the row named.
         * @param {string} kind
         * @param {string} id
         */
function discardUnsynced(kind, id) {
            var row = kind === "vehicles" ? vehicleAnywhere(id) : sessionAnywhere(id);
            /* No row, but still clear the bookkeeping rather than returning. A
               phantom entry here made this button a no-op: the guard fired
               before anything was cleaned up, so the panel kept listing a
               refusal for a row that no longer existed and could never be
               dismissed. Nothing is lost by clearing, because there is nothing to
               discard. */
            if (!row) {
              clearDirty(kind, id);
              clearStalled(kind, id);
              forgetAttempts(kind, id);
              renderSyncPanel();
              return Promise.resolve(true);
            }
          var label =
            kind === "vehicles" ? row.name : row.location + " · " + row.date;
          var extra =
            kind === "vehicles"
              ? sessions.filter(function (s) {
                  return s.vehicleId === id;
                }).length
              : 0;
          return askConfirm(
            TXT("toast.discardQ", { v: label, n: 1 + extra }),
            {
              heading: "confirm.discard",
              ok: "confirm.discard",
              irreversible: "confirm.irreversibleDiscard",
            },
          ).then(function (yes) {
            if (!yes) return false;
            if (kind === "vehicles") {
              var gone = sessions.filter(function (s) {
                return s.vehicleId === id;
              });
              vehicles = vehicles.filter(function (v) {
                return v.id !== id;
              });
              sessions = sessions.filter(function (s) {
                return s.vehicleId !== id;
              });
              binned.vehicles = binned.vehicles.filter(function (v) {
                return v.id !== id;
              });
              binned.sessions = binned.sessions.filter(function (s) {
                return s.vehicleId !== id;
              });
              for (var i = 0; i < gone.length; i++) {
                clearDirty("sessions", gone[i].id);
                clearStalled("sessions", gone[i].id);
                forgetAttempts("sessions", gone[i].id);
              }
            } else {
              sessions = sessions.filter(function (s) {
                return s.id !== id;
              });
              binned.sessions = binned.sessions.filter(function (s) {
                return s.id !== id;
              });
            }
            clearDirty(kind, id);
            clearStalled(kind, id);
            forgetAttempts(kind, id);
            if (cur >= vehicles.length) cur = Math.max(0, vehicles.length - 1);
            save();
            render();
            toast(TXT("toast.discarded"));
            renderSyncPanel();
            return true;
          });
        }
        /** Render the sync panel body, which the header badge opens. */
        function renderSyncPanel() {
          var box = $("syncBody");
          if (!box) return;
          renderRetryCountdown();
          var rows = unsyncedRows();
          if (!rows.length) {
            box.innerHTML = '<p class="mini">' + TXT("sync.allGood") + "</p>";
            return;
          }
          var h = '<div class="list">';
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            h +=
              '<div class="item">' +
              '<span class="nm">' +
              esc(r.label) +
              "</span>" +
                '<span class="mt">' +
                esc(r.why2 || TXT("sync.reason." + r.why)) +
                "</span>" +
                /* The server's own words. Without this the panel can only say
                   that a write was refused, which is the least useful possible
                   answer when the question is why. */
                (r.detail
                  ? '<span class="sync-err" title="' +
                    esc(r.detail) +
                    '">' +
                    esc(r.detail.length > 90 ? r.detail.slice(0, 90) + "…" : r.detail) +
                    "</span>"
                  : "") +
                (r.hard
                ? '<button type="button" class="btn sm dgr" data-discard="' +
                  esc(r.kind) +
                  ":" +
                  esc(r.id) +
                  '">' +
                  TXT("sync.discard") +
                  "</button>"
                : "") +
              "</div>";
          }
          h += "</div>";
          /* Two different explanations, because a row held for approval and a
             row that is genuinely wrong need opposite decisions from the user. */
          var held = 0;
          for (var q = 0; q < rows.length; q++) if (rows[q].held) held++;
          if (held)
            h +=
              '<div class="hint" style="margin-top:0.6rem">' +
              TXT("sync.heldHint") +
              "</div>";
          if (rows.length - held)
            h +=
              '<div class="hint" style="margin-top:0.6rem">' +
              TXT("sync.stalledHint") +
              "</div>";
          box.innerHTML = h;
        }
        /* Retry cadence for queued rows. Short enough that a phone that slept
           through a failure catches up on its own shortly after waking, which
           is the case that used to leave the badge looking stuck. */
        var RETRY_STEPS_MS = [2000, 5000, 15000, 30000, 60000];
var retryTimer = null;
      var retryStep = 0;
      /* The 1 Hz countdown ticker is kept at module scope so a re-arm can clear
         it. It used to be a local inside armRetry(), reachable only by the
         timeout callback, so every re-entry after an interval existed discarded
         it without clearing: armRetry is re-entered from markDirty on every
         failed push and from scheduleRetry on every connectivity change, leaving
         a permanent 1 Hz timer per failure that woke the page once a second for
         the rest of the session. */
      var retryTick = null;
        /**
         * (Re)start the countdown to the next upload attempt.
         * Called after anything that changes the queue, so the number under the
         * badge is never a promise the app cannot keep.
         */
function scheduleRetry() {
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = null;
            if (retryTick) {
              clearInterval(retryTick);
              retryTick = null;
            }
            retryStep = 0;
            armRetry();
          }
          /** Deletes waiting to be confirmed by the server.
           *
           * syncDeleted was consulted only by retryDeleted(), which runs solely on
           * a pull. A delete that failed was therefore counted by nothing and
           * listed nowhere, so no timer was ever armed for it and the sync panel
           * could not show it: "delete forever" on a bad connection silently
           * un-did itself, because the row was already gone from the bin locally
           * and the next pull put it back.
           *
           * @returns {number}
           */
          function pendingDeleteCount() {
            var n = 0;
            for (var t in syncDeleted)
              if (Object.prototype.hasOwnProperty.call(syncDeleted, t))
                n += Object.keys(syncDeleted[t] || {}).length;
            return n;
          }
function armRetry() {
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = null;
            if (retryTick) {
              clearInterval(retryTick);
              retryTick = null;
            }
            var pending = pendingCount() + pendingDeleteCount();
          if (!pending || !syncOn()) {
            renderRetryCountdown();
            return;
          }
var wait = RETRY_STEPS_MS[Math.min(retryStep, RETRY_STEPS_MS.length - 1)];
            retryTick = setInterval(renderRetryCountdown, 1000);
            retryTimer = setTimeout(function () {
              clearInterval(retryTick);
              retryTick = null;
              retryTimer = null;
              retryStep++;
            /* One row at a time, so a queue of ten does not fire ten RPCs the
               instant the tab wakes. */
            flushOneDirty();
          }, wait);
          renderRetryCountdown();
        }
        /** Push the single most urgent queued row, then re-arm. */
        function flushOneDirty() {
          var vi = Object.keys(syncDirty.vehicles).filter(function (id) {
            return !syncStalled.vehicles[id];
          });
          var si = Object.keys(syncDirty.sessions).filter(function (id) {
            return !syncStalled.sessions[id];
          });
          var p = Promise.resolve(false);
if (vi.length) {
              var v = vehicleAnywhere(vi[0]);
              if (v) p = syncVehicle(v);
              else forgetGoneRow("vehicles", vi[0]);
            } else if (si.length) {
              var s = sessionAnywhere(si[0]);
              if (s) p = syncSession(s);
              else forgetGoneRow("sessions", si[0]);
            } else if (pendingDeleteCount()) {
              /* Nothing else is queued, but a delete is. It used to have no retry
                 driver at all, so a delete that failed silently un-did itself on
                 the next pull. */
              p = retryDeleted();
            }
            armRetry();
            return p;
        }
        /** Rows waiting to be sent, ignoring the ones the server refused. */
        function pendingCount() {
          function count(kind) {
            var n = 0;
            var keys = Object.keys(syncDirty[kind]);
            for (var i = 0; i < keys.length; i++)
              if (!syncStalled[kind][keys[i]]) n++;
            return n;
          }
          return count("vehicles") + count("sessions");
        }
        /**
         * Show the countdown, and offer an immediate retry. This replaces a
         * message that could sit unchanged for a long time with nothing to do
         * about it, which read as "stuck" whether or not it was.
         */
        function renderRetryCountdown() {
          var el = $("syncCountdown");
          if (!el) return;
          if (!retryTimer) {
            el.hidden = true;
            return;
          }
          var wait = RETRY_STEPS_MS[Math.min(retryStep, RETRY_STEPS_MS.length - 1)];
          var left = Math.max(0, Math.ceil(wait / 1000));
          el.hidden = false;
          el.textContent = TXT("sync.nextTry", { n: left });
        }
        /** Forget the backoff and try right now, then start again gently. */
function retryNow() {
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = null;
            /* The interval too, not just the timeout. armRetry armed both, and
               the path that follows a manual retry re-arms neither: the pull
               succeeds, so armRetry and scheduleRetry are never called and the
               countdown keeps firing once a second for the rest of the session,
               re-hiding an element that is already hidden. */
            if (retryTick) clearInterval(retryTick);
            retryTick = null;
            retryStep = 0;
          if (syncOn() && syncOnline()) syncPull();
          else scheduleRetry();
          renderSyncPanel();
        }
              /* How long a refusal has to stand still before it is escalated from a
         badge to a banner. Long enough that a single hiccup does not shout,
         short enough that it never costs a day of unnoticed data loss. */
      var STALL_BANNER_AFTER_MS = 10 * 60 * 1000;
      var stallBannerTimer = null;
      /**
       * Show the failure banner once a refusal has been standing for a while.
       * Held rows are excluded: a pending approval is not a failure and must
       * never be escalated into one.
       */
      function armStallBanner() {
        if (stallBannerTimer) {
          clearTimeout(stallBannerTimer);
          stallBannerTimer = null;
        }
        var show = function () {
          stallBannerTimer = null;
          var b = $("syncBanner");
          if (!b) return;
          var hard = 0;
          var kinds = ["vehicles", "sessions"];
          for (var i = 0; i < kinds.length; i++) {
            var rows = syncStalled[kinds[i]];
            for (var k in rows) if (rows[k].kind !== "notYet") hard++;
          }
          if (!hard) {
            b.hidden = true;
            return;
          }
          $("syncBannerMsg").textContent = TXT("sync.banner", { n: hard });
          b.hidden = false;
        };
        if (stalledCount())
          stallBannerTimer = setTimeout(show, STALL_BANNER_AFTER_MS);
        else show();
      }
      function clearStallBanner() {
        if (stallBannerTimer) clearTimeout(stallBannerTimer);
        stallBannerTimer = null;
        var b = $("syncBanner");
        if (b) b.hidden = true;
      }
        /**
         * Remove every trace of this account from THIS DEVICE, then sign out.
         *
         * Deliberately separate from the ordinary sign-out above, which keeps
         * local data so signing back in restores it. This one is for the case
         * where the local copy is itself the problem, which is exactly what a
         * stale session left behind.
         *
         * Only the browser is touched. Nothing is deleted on the server, so a
         * sign-in afterwards pulls the account's real data straight back. The
         * danger is losing unsynced work, which is why it asks twice.
         *
         * @returns {Promise<boolean>}
         */
        async function resetThisDevice() {
          var name = $("accountName").textContent || "";
          var keys = [];
          /* Two gates in one dialog: the warning is the body, the typed word is
             the button. The OK button stays disabled until the word matches
             exactly, so there is nothing to get wrong after the prompt appears. */
          var yes = await askConfirm(
            TXT("set.resetQ1", { u: name || TXT("auth.logout") }),
            {
              heading: "confirm.resetDevice",
              ok: "set.resetContinue",
              expect: "RESET",
              expectLabel: "set.resetQ2",
              irreversible: "confirm.irreversibleReset",
            },
          );
          if (!yes) return false;
          var keys = [];
          try {
            for (var i = 0; i < localStorage.length; i++) {
              var k = localStorage.key(i);
              /* Everything this app owns, for any account, plus the pre-scoped
                 leftovers. Theme and language are device preferences and are
                 deliberately kept. */
              if (k && k.indexOf("ev.") === 0 && k !== STORAGE.theme && k !== K_LANG)
                keys.push(k);
            }
            for (var j = 0; j < keys.length; j++) localStorage.removeItem(keys[j]);
          } catch (e) {
            /* Private browsing can refuse writes; the reload below still helps */
          }
          try {
            if (authClient) await authClient.auth.signOut();
          } catch (e) {
            /* an offline sign-out still clears the in-memory session below */
          }
          authMode = "in";
          lastAccount = null;
          showApp(null);
          location.reload();
          return true;
        }
        /** Point the Settings controls at the current account and appearance. */
        function renderAccountPanel() {
          var signed = !!(authUser && authUser.id);
          var row = $("accountRow");
          if (row) row.hidden = !signed;
          var out = $("accountSignedOut");
          if (out) out.hidden = signed;
          if (signed) {
            $("accountName").textContent = fromFakeEmail(authUser.email || "");
            $("accountMeta").textContent = TXT("set.accountMeta", {
              n: vehicles.length,
              s: sessions.length,
            });
          }
          var th = $("themeSel");
          if (th) {
            th.innerHTML =
              '<option value="light">' + TXT("set.themeLight") + "</option>" +
              '<option value="dark">' + TXT("set.themeDark") + "</option>";
            th.value = document.body.classList.contains("dark") ? "dark" : "light";
          }
          /* The language list lives inside the i18n module, which already fills
             the header's select. Copying its options keeps one source of truth
             without reaching across the module boundary, and the language still
             changes by driving that select. */
          var ls = $("langSel2");
          var src = $("langSel");
          if (ls && src && src.options.length && !ls.options.length) {
            ls.innerHTML = Array.prototype.map
              .call(src.options, function (o) {
                return (
                  '<option value="' +
                  esc(o.value) +
                  '">' +
                  esc(o.textContent) +
                  "</option>"
                );
              })
              .join("");
          }
          if (ls) {
            /* The active language is a variable inside the i18n module and is
               not in scope here. The header's select is the reliable source:
               the i18n module keeps it in step with the active language. */
            var active = src && src.value ? src.value : "";
            if (active) ls.value = active;
          }
        }
        /** Apply a theme chosen in Settings, reusing the existing toggle. */
        function applyThemeSel(want) {
          var isDark = document.body.classList.contains("dark");
          if ((want === "dark") !== isDark) $("themeBtn").click();
        }
        /** Fill the export scope picker with the current vehicle list.
         *
         * This lived inside the log-view branch, but the select it fills lives in
         * the Settings export panel. A user opening Settings directly saw only
         * "All vehicles" and no way to scope an export, and the options that did
         * appear were a side effect of having visited the log first — so they
         * could name a vehicle that no longer existed, which silently exported an
         * empty file.
         */
        function renderScopePicker() {
          var sl = $("scope");
          if (!sl) return;
          var keep = sl.value;
          sl.innerHTML =
            '<option value="all">' +
            TXT("set.allVehicles") +
            "</option>" +
            vehicles
              .map(function (x) {
                return (
                  '<option value="' + esc(x.id) + '">' + esc(x.name) + "</option>"
                );
              })
              .join("");
          /* Only keep the selection if it still names a vehicle, otherwise the
             stale id would export nothing while looking valid. */
          sl.value = vehicles.some(function (x) {
            return x.id === keep;
          })
            ? keep
            : "all";
        }
        function renderBin() {
          var n = binCount();
          var badge = $("binCount");
          if (badge) {
            badge.textContent = String(n);
            badge.hidden = !n;
          }
          var empty = $("emptyBinBtn");
          if (empty) empty.disabled = !n;
          /* Only build the list when the bin is actually on screen. render()
             runs after every edit and every language change, and assembling
             this markup each time for a hidden view is pure waste. */
          if (view !== "bin") return;
          var box = $("binBody");
          if (!box) return;
          if (!n) {
            box.innerHTML =
              '<p class="empty">' + TXT("bin.emptyBody") + "</p>";
            return;
          }
          var h = "";
          /* Newest binned first, which is the order you want to look for a
             mistake you just made. */
          function byNewest(a, b) {
            var ta = Date.parse(a.deletedAt || "") || 0;
            var tb = Date.parse(b.deletedAt || "") || 0;
            return tb - ta;
          }
          function section(key, titleKey, rows, labelFn) {
            if (!rows.length) return;
            h +=
              '<h3 style="margin-top:1.25rem">' +
              TXT(titleKey) +
              ' <span class="mini">(' +
              rows.length +
              ")</span></h3>" +
              '<div class="list">';
            for (var i = 0; i < rows.length; i++) {
              var row = rows[i];
              var id = esc(row.id);
              h +=
                '<div class="item">' +
                '<span class="nm">' +
                esc(labelFn(row)) +
                "</span>" +
                '<span class="bin-when">' +
                esc(binWhen(row.deletedAt)) +
                "</span>" +
                '<button type="button" class="btn sm ghost" data-bin-restore="' +
                key +
                ":" +
                id +
                '">' +
                TXT("bin.restore") +
                "</button>" +
                '<button type="button" class="btn sm dgr" data-bin-purge="' +
                key +
                ":" +
                id +
                '">' +
                TXT("bin.purge") +
                "</button></div>";
            }
            h += "</div>";
          }
          section(
            "vehicles",
            "bin.vehicles",
            binned.vehicles.slice().sort(byNewest),
            function (v) {
              var count = binned.sessions.filter(function (s) {
                return s.vehicleId === v.id;
              }).length;
              return v.name + (count ? "  (" + count + ")" : "");
            },
          );
          section(
            "sessions",
            "bin.sessions",
            binned.sessions.slice().sort(byNewest),
            function (s) {
              var v = null;
              for (var i = 0; i < binned.vehicles.length; i++)
                if (binned.vehicles[i].id === s.vehicleId)
                  v = binned.vehicles[i];
              return (
                (v ? v.name + " · " : "") +
                s.location +
                " · " +
                num(s.energy).toFixed(2) +
                " kWh · " +
                s.date
              );
            },
          );
          section(
            "favs",
            "bin.favs",
            binned.favs,
            function (f) {
              return f.name + (f.address && f.address !== f.name
                ? " · " + f.address
                : "");
            },
          );
          box.innerHTML = h;
        }
        /**
         * Put a binned row back, by kind.
         * @param {string} kind  "vehicles", "sessions" or "favs"
         * @param {string} id
         */
        function binRestore(kind, id) {
          if (kind === "vehicles") restoreVehicle(id);
          else if (kind === "sessions") restoreSession(id);
          else if (kind === "favs") restoreFav(id);
          renderBin();
        }
        /**
         * Delete one binned row for good. This is the only irreversible action,
         * so it is confirmed on its own even though the whole bin can be
         * emptied in one go.
         * @param {string} kind
         * @param {string} id
         */
        function binPurge(kind, id) {
          var list =
            kind === "vehicles"
              ? binned.vehicles
              : kind === "sessions"
                ? binned.sessions
                : binned.favs;
          var row = null;
          for (var i = 0; i < list.length; i++)
            if (list[i].id === id) row = list[i];
if (!row) return;
            /* A permanent DELETE, so the same permission question as the row
               itself. Without it a shared vehicle someone else wrote sessions
               for could be purged from this device's copy of a shared history -
               for them too, since the server row goes with it.

               EXCEPT a row you detached by leaving a shared car. You no longer
               have access, so the server would refuse with 42501 - and the row
               could never be removed from the bin at all. Those are this
               device's copy and nothing else, so they are simply dropped. */
            if (kind === "vehicles" && !row.detached && !mayWriteVehicle(id)) {
              toast(TXT("toast.noPermission"));
              return;
            }
            if (kind === "sessions" && !row.detached && !canEditSession(row)) {
              toast(TXT("toast.noPermission"));
              return;
            }
            var label =
              kind === "vehicles"
                ? row.name
                : kind === "sessions"
                  ? row.location
                  : row.name;
          /* Purging a vehicle takes everything binned with it, which would
             otherwise leave orphaned sessions in the bin. */
          var orphans = 0;
          if (kind === "vehicles") {
            orphans = binned.sessions.filter(function (s) {
              return s.vehicleId === id;
            }).length;
          }
          return askConfirm(
            TXT("toast.purgeQ", {
              n: 1 + orphans,
              v: label,
            }),
            {
              heading: "confirm.deleteForever",
              ok: "confirm.deleteForever",
              irreversible: "confirm.irreversiblePurge",
            },
          ).then(function (yes) {
if (!yes) return false;
              if (kind === "vehicles") {
                binned.vehicles = binned.vehicles.filter(function (x) {
                  return x.id !== id;
                });
                var gone = binned.sessions.filter(function (s) {
                  return s.vehicleId === id;
                });
                binned.sessions = binned.sessions.filter(function (s) {
                  return s.vehicleId !== id;
                });
                /* Every id removed from the device is also forgotten by the sync
                   bookkeeping. Only discardUnsynced did this, so a row that had
                   been refused three times kept its stalled entry after being
                   purged: the panel kept listing a refusal for a row that no
                   longer existed anywhere, its Discard button did nothing
                   because the row lookup returned null, and the red banner
                   counted a row the user had already deleted for good. */
                for (var i = 0; i < gone.length; i++) {
                  /* Skipped for a row you detached: there is nothing on the
                     server for you to delete, and asking would only produce a
                     refusal. */
                  if (gone[i].detached) continue;
                  forgetGoneRow("sessions", gone[i].id);
                  syncDelete("sessions", gone[i].id);
                }
                forgetGoneRow("vehicles", id);
                if (!row.detached) syncDelete("vehicles", id);
              } else if (kind === "sessions") {
                binned.sessions = binned.sessions.filter(function (x) {
                  return x.id !== id;
                });
                forgetGoneRow("sessions", id);
                if (!row.detached) syncDelete("sessions", id);
              } else {
                binned.favs = binned.favs.filter(function (x) {
                  return x.id !== id;
                });
              }
            save();
            saveFavs();
            render();
            toast(TXT("toast.purged"));
            return true;
          });
        }
        function renderLocDefaults() {
          var sel = $("defLoc");
          if (!sel) return;
          var h = '<option value="">' + TXT("set.defNone") + "</option>";
          for (var i = 0; i < favs.length; i++) {
            if (!favs[i] || favs[i].deletedAt) continue;
            h +=
              '<option value="' +
              esc(favs[i].id) +
              '"' +
              (favs[i].id === locDefaults.loc ? " selected" : "") +
              ">" +
              esc(favs[i].name) +
              "</option>";
          }
          sel.innerHTML = h;
          /* A default that pointed at a deleted or binned favourite falls back
             to none rather than silently doing nothing. */
          if (
            locDefaults.loc &&
            !favs.some(function (f) {
              return f && !f.deletedAt && f.id === locDefaults.loc;
            })
          )
            locDefaults.loc = null;
          if (!locDefaults.loc) sel.value = "";
          var hr = $("defHour");
          if (hr) {
            var oh = '<option value="">' + TXT("set.defNever") + "</option>";
            for (var q = 0; q <= 23; q++) {
              var hh = (q < 10 ? "0" : "") + q;
              oh +=
                '<option value="' +
                q +
                '"' +
                (locDefaults.hour === q ? " selected" : "") +
                ">" +
                hh +
                ":00" +
                "</option>";
            }
            hr.innerHTML = oh;
            hr.value = isNum(locDefaults.hour) ? String(locDefaults.hour) : "";
          }
          var geo = $("defGeo");
          if (geo) geo.checked = !!locDefaults.geo;
        }
        function renderFavs() {
          var box = $("favList"),
            html = "";
          for (var i = 0; i < favs.length; i++) {
            var f = favs[i];
            var has = isNum(f.lat) && isNum(f.lng);
            var fp = favPrice(f);
            var uses = sessions.filter(function (s) {
              return s.location === f.address || s.location === f.name;
            }).length;
            html +=
              '<div class="item">' +
              '<span aria-hidden="true" style="font-size:1.2rem">📍</span>' +
              '<span class="nm">' +
              esc(f.name) +
              (fp === null
                ? ""
                : ' <span class="mt">💶 ' +
                  esc(fmtCents(Math.round(fp * 100))) +
                  "</span>") +
              '<br><span class="mt">' +
              esc(f.address) +
              (has
                ? " · " + f.lat.toFixed(4) + ", " + f.lng.toFixed(4)
                : TXT("fav.noCoords")) +
              "</span></span>" +
              '<span class="mt">' +
              TXT("fav.uses", { n: uses }) +
              "</span>" +
              '<button type="button" class="btn sm sec" data-use="' +
              esc(f.id) +
              '" aria-label="' +
              TXT("a11y.useFav", { v: esc(f.name) }) +
              '"><span aria-hidden="true">' +
              TXT("fav.use") +
              "</span></button>" +
              '<button type="button" class="btn sm ghost" data-fedit="' +
              esc(f.id) +
              '" aria-label="' +
              TXT("a11y.editFav", { v: esc(f.name) }) +
              '"><span aria-hidden="true">' +
              (has ? TXT("fav.map") : TXT("fav.edit")) +
              "</span></button>" +
              '<button type="button" class="btn sm dgr" data-fdel="' +
              esc(f.id) +
              '" aria-label="' +
              TXT("a11y.deleteFav", { v: esc(f.name) }) +
              '"><span aria-hidden="true">' +
              TXT("fav.del") +
              "</span></button></div>";
          }
          box.innerHTML =
            html || '<div class="empty">' + TXT("fav.empty") + "</div>";

          var chips = "";
          for (var j = 0; j < favs.length; j++) {
            chips +=
              '<button type="button" class="chip" data-use="' +
              esc(favs[j].id) +
              '" aria-label="' +
              TXT("a11y.useFav", { v: esc(favs[j].name) }) +
              '"><span aria-hidden="true">📍</span> ' +
              esc(favs[j].name) +
              "</button>";
          }
          $("favQuick").innerHTML = chips;
          $("favQuick").hidden = favs.length === 0;
          /* The default-location list is built from favourites, so it has to be
             rebuilt whenever they change, including a deletion. */
          renderLocDefaults();
          refreshDatalist();
        }

        /* ---------- import ---------- */
        var IMPORT_COLS = [
          { key: "date", re: ["date", "day", "chargingdate"] },
          { key: "time", re: ["time", "starttime", "start"] },
          {
            key: "duration",
            re: [
              "duration",
              "sessionduration",
              "durationh",
              "hours",
              "chargingtime",
            ],
          },
          {
            key: "location",
            re: ["location", "station", "place", "site", "address"],
          },
          {
            key: "energy",
            re: ["energy", "energykwh", "kwh", "energycharged", "charge"],
          },
          {
            key: "mileage",
            re: ["mileage", "odometer", "km", "distance", "kmreading"],
          },
          {
            key: "cost",
            re: ["cost", "price", "totalcost", "costEUR", "amount"],
          },
          {
            key: "socStart",
            re: [
              "startsoc",
              "socstart",
              "startsocpct",
              "startsocpercent",
              "startbattery",
              "startbatterypercent",
            ],
          },
          {
            key: "socEnd",
            re: [
              "endsoc",
              "socend",
              "endsocpct",
              "endsocpercent",
              "endbattery",
              "endbatterypercent",
            ],
          },
          { key: "vehicle", re: ["vehicle", "car", "vehicleName"] },
          {
            key: "notes",
            re: ["notes", "note", "comment", "comments"],
          },
          {
            key: "fast",
            re: ["fast", "fastcharging", "dc", "directcurrent"],
          },
          {
            key: "home",
            re: ["home", "homecharging", "ac", "alternatingcurrent"],
          },
          {
            key: "favourite",
            re: ["favourite", "favorite", "fav", "favouriteLocation"],
          },
        ];
        function normHeader(v) {
          return String(v == null ? "" : v)
            .replace(/^\uFEFF/, "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
        }
        /* map a normalized header back to its canonical key using IMPORT_COLS.
   Needed because normHeader lowercases and strips, which breaks camelCase
   keys such as socStart when a JSON file is imported. */
        function resolveHead(h) {
          if (!h) return null;
          var i,
            q,
            best = null,
            bestLen = -1;
          for (i = 0; i < IMPORT_COLS.length; i++) {
            if (IMPORT_COLS[i].re.indexOf(h) >= 0) return IMPORT_COLS[i].key;
          }
for (i = 0; i < IMPORT_COLS.length; i++) {
              for (q = 0; q < IMPORT_COLS[i].re.length; q++) {
                var a = IMPORT_COLS[i].re[q];
                if (h.indexOf(a) < 0) continue;
/* The alias must also START the header. Without that,
                     "vehicleid" matched the "vehicle" alias by containment, so a
                     JSON export was read back as if the vehicle column held a
                     NAME, and a new vehicle was invented whose name was a raw
                     uuid - carrying every restored session and leaving the real
                     cars empty. Containment is only safe as a fallback when the
                     alias is a prefix. */
                  if (h.indexOf(a) !== 0) continue;
                /* Ties break towards the earlier column, so a header matching
                   two lists of equal-length aliases cannot be decided by
                   declaration order: "startdate" reached this loop with `start`
                   (time) beating `date`, disagreeing with the intent. */
                if (a.length > bestLen || (a.length === bestLen && best !== null)) {
                  bestLen = a.length;
                  best = IMPORT_COLS[i].key;
                  if (bestLen >= h.length) return best;
                }
              }
            }
            return best;
        }
        function parseDelimited(text, delim) {
          var rows = [],
            row = [],
            cur = "",
            quoted = false,
            i = 0;
          text = String(text == null ? "" : text).replace(/^\uFEFF/, "");
          while (i < text.length) {
            var c = text.charAt(i);
            if (quoted) {
              if (c === '"') {
                if (text.charAt(i + 1) === '"') {
                  cur += '"';
                  i += 2;
                  continue;
                }
                quoted = false;
                i++;
                continue;
              }
              cur += c;
              i++;
              continue;
            }
            if (c === '"') {
              quoted = true;
              i++;
              continue;
            }
            if (c === delim) {
              row.push(cur);
              cur = "";
              i++;
              continue;
            }
            if (c === "\r") {
              i++;
              continue;
            }
            if (c === "\n") {
              row.push(cur);
              rows.push(row);
              row = [];
              cur = "";
              i++;
              continue;
            }
            cur += c;
            i++;
          }
          if (cur !== "" || row.length) {
            row.push(cur);
            rows.push(row);
          }
          return rows.filter(function (r) {
            for (var i = 0; i < r.length; i++)
              if (String(r[i]).trim() !== "") return true;
            return false;
          });
        }
        function isYes(v) {
          var s = String(v == null ? "" : v)
            .trim()
            .toLowerCase();
          return (
            s === "yes" || s === "y" || s === "true" || s === "1" || s === "x"
          );
        }
        function validDate(v) {
          var s = String(v || "").trim();
          var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
          if (!m) return null;
          var y = +m[1],
            mo = +m[2],
            d = +m[3];
          var dt = new Date(y, mo - 1, d);
          if (
            dt.getFullYear() !== y ||
            dt.getMonth() !== mo - 1 ||
            dt.getDate() !== d
          )
            return null;
          return y + "-" + pad(mo) + "-" + pad(d);
        }
        function validTime(v) {
          var m = String(v == null ? "" : v)
            .trim()
            /* Seconds are optional, and a file that carries them keeps them.
               The time field offers second precision now, so an export made
               from this app has HH:MM:SS in it, and a regex that only accepted
               two groups rejected every row of such a file - or, had it been
               looser, silently truncated the seconds on the way in. */
            .match(/^(\d{1,2})[:.\-h]?(\d{2})(?:[:.\-s]?(\d{2}))?$/);
          if (!m) return null;
          var h = +m[1],
            mi = +m[2],
            se = m[3] === undefined ? 0 : +m[3];
          if (h > 23 || mi > 59 || se > 59) return null;
          var out = pad(h) + ":" + pad(mi);
          /* Emitted only when non-zero, so importing an HH:MM file and an
             HH:MM:SS file both produce the value the author meant, and a round
             trip does not add ":00" to every historical row. */
          if (se > 0) out += ":" + pad(se);
          return out;
        }
        /**
         * The vehicle rows without their own Vehicle column should land in. With only
         * one vehicle stored there is no choice to make, so it falls back to that one.
         * @returns {Object|null}
         */
        function importTargetVehicle() {
          if (vehicles.length < 2) return veh();
          var sel = $("impTarget");
          var wanted = sel ? sel.value : "";
          for (var i = 0; i < vehicles.length; i++)
            if (vehicles[i].id === wanted) return vehicles[i];
          return veh();
        }
        /**
         * Show the "import into" picker, but only when the choice actually
         * exists. Called from render() so it follows vehicle changes.
         */
        function renderImportTarget() {
          var wrap = $("impTargetWrap"),
            sel = $("impTarget");
          if (!wrap || !sel) return;
          var many = vehicles.length > 1;
          wrap.hidden = !many;
          if (!many) return;
          var keep = sel.value || (veh() ? veh().id : "");
          var h = "";
          for (var i = 0; i < vehicles.length; i++)
            h +=
              '<option value="' +
              esc(vehicles[i].id) +
              '">' +
              esc(vehicles[i].name) +
              "</option>";
          sel.innerHTML = h;
          sel.value = vehicles.some(function (v) {
            return v.id === keep;
          })
            ? keep
            : vehicles[0].id;
        }
        /**
         * Resolve the Vehicle column, falling back to the picker when the file
         * does not name one. Existing behaviour kept: an unknown name creates
         * a new vehicle, because the file is the source of truth.
         * @param {string} name  the Vehicle cell, possibly empty
         * @returns {Object} the vehicle the row belongs to
         */
        function vehicleForImport(name) {
          var want = String(name || "").trim();
          if (!want) return importTargetVehicle();
          var low = want.toLowerCase();
          for (var i = 0; i < vehicles.length; i++) {
            if (vehicles[i].name.toLowerCase() === low) return vehicles[i];
          }
          var made = {
            id: uuid(),
            name: want,
            icon: "🚙",
            initialOdometer: 0,
            capacity: null,
          };
          vehicles.push(made);
          return made;
        }
        function sessionFromObject(o, idx, errors) {
          var get = function (k) {
            return o[k] === undefined || o[k] === null
              ? ""
              : String(o[k]).trim();
          };
          var d = validDate(get("date"));
          if (!d) {
            errors.push(TXT("err.date", { n: idx }));
            return null;
          }
          var t = validTime(get("time"));
          if (!t) {
            errors.push(TXT("err.time", { n: idx }));
            return null;
          }
          var loc = get("location");
          if (!loc) {
            errors.push(TXT("err.loc", { n: idx }));
            return null;
          }
          var eRaw = get("energy");
          if (eRaw === "" || !isNum(eRaw)) {
            errors.push(TXT("err.energy", { n: idx }));
            return null;
          }
          var e = +eRaw;
          if (e < 0) {
            errors.push(TXT("err.energyNeg", { n: idx }));
            return null;
          }
          var dur = get("duration");
          var hours =
            dur === ""
              ? 0
              : dur.indexOf(":") >= 0
                ? hmToHours(dur)
                : isNum(dur)
                  ? Math.max(0, +dur)
                  : NaN;
          if (isNaN(hours)) {
            errors.push(TXT("err.dur", { n: idx }));
            return null;
          }
          var mRaw = get("mileage");
          if (mRaw !== "" && !isNum(mRaw)) {
            errors.push(TXT("err.mileage", { n: idx }));
            return null;
          }
          var cRaw = get("cost");
          if (cRaw !== "" && !isNum(cRaw)) {
            errors.push(TXT("err.cost", { n: idx }));
            return null;
          }
          /* battery SoC is optional: an unusable value is dropped with a note rather than
   rejecting the whole row, because the other columns may still be valid */
          var ssRaw = get("socStart"),
            seRaw = get("socEnd");
          if (ssRaw !== "" && !isNum(ssRaw)) {
            errors.push(TXT("err.soc", { n: idx }));
            ssRaw = "";
          }
          if (seRaw !== "" && !isNum(seRaw)) {
            errors.push(TXT("err.soc", { n: idx }));
            seRaw = "";
          }
/* The raw id wins over the name, because it is unambiguous and the name is
                 not. A JSON export writes vehicleId; a CSV export writes only the
                 name, and a rename between the two splits the history. See the
                 rawVehicleId handoff in the import loop for why this cannot be
                 read straight off the normalised object. */
  var v = null;
                var raw = o.rawVehicleId || "";
                if (raw) v = vehById(raw);
                /* Only fall through to the name when the file had no id at all. A
                   file that HAD an id which resolves to nothing is a broken
                   reference: silently creating a vehicle named after a uuid is
                   what emptied the real cars in the first place. */
                if (!v && !raw) v = vehicleForImport(get("vehicle"));
                if (!v) {
                  errors.push(TXT("err.noVehicle", { n: idx }));
                  return null;
                }
            return {
            id: uuid(),
            vehicleId: v.id,
            date: d,
            time: t,
            duration: dur,
            hours: hours,
            location: loc,
            energy: e,
            mileage: mRaw === "" ? 0 : +mRaw,
            cost: cRaw === "" ? null : Math.max(0, +cRaw),
            socStart: soc(ssRaw),
            socEnd: soc(seRaw),
            notes: get("notes"),
            fast: isYes(get("fast")),
            home: isYes(get("home")),
            /* `fav`, not `favourite`. Every other reader of the flag — the log tag, the
               edit checkbox, the submit handler and the CSV export — uses s.fav,
               so writing a property nothing reads silently dropped the star on
               every round trip: the file looked lossless and the session
               re-exported as "no", and the favourite location was never
               auto-created. The CSV header "Favourite" still resolves to the
               `favourite` column and is read through this line. */
              fav: isYes(get("favourite")),
            created: Date.now(),
          };
        }
        function importText(text, fileName) {
          var name = String(fileName || "").toLowerCase();
          var errors = [],
            made = [],
            vehiclesAdded = 0,
            before = vehicles.length;
          if (/\.json$/.test(name) || /^\s*[[{]/.test(text)) {
            var data;
            try {
              data = JSON.parse(text);
            } catch (err) {
              showImport("bad", "Could not read the file as JSON.", [
                TXT("err.jsonBad", { m: err.message }),
              ]);
              return;
            }
if (data && !Array.isArray(data) && Array.isArray(data.sessions)) {
  /* Nothing is written here. Price, vehicles and favourites are all
                   collected and applied only after the sessions have been
                   validated and at least one has been accepted: a file where
                   every row fails used to leave the favourites list overwritten,
                   the price changed and phantom vehicles in memory, all while
                   reporting "nothing was imported". The next unrelated save from
                   any edit then made those permanent. */
                var pendFavs = null;
                var pendPrice = null;
                var pendVehAdds = [];
                if (Array.isArray(data.favourites)) {
                  pendFavs = data.favourites;
                }
                if (isNum(data.pricePerKwh)) {
                  pendPrice = Math.max(0, data.pricePerKwh);
                }
                if (Array.isArray(data.vehicles)) {
                  for (var va = 0; va < data.vehicles.length; va++) {
                    var bv = data.vehicles[va];
                    if (!bv || typeof bv !== "object" || !bv.name) continue;
                    if (vehById(bv.id)) continue;
                    pendVehAdds.push(bv);
                  }
                }
                data = data.sessions;
              }
            if (!Array.isArray(data)) {
              showImport("bad", TXT("err.json"), [TXT("err.jsonShape")]);
              return;
            }
            for (var i = 0; i < data.length; i++) {
              var o = data[i];
              if (!o || typeof o !== "object") {
                errors.push(TXT("err.rowObj", { n: i + 1 }));
                continue;
              }
var norm = {};
                for (var k in o) {
                  var ck = resolveHead(normHeader(k));
                  if (ck) norm[ck] = o[k];
                }
                /* The raw vehicleId is carried alongside, never through
                   normalise(): vehicleId maps to the canonical key "vehicle",
                   whose value is written as a NAME by toCSV and read as a name by
                   the resolver, so after normalisation the raw id is simply gone.
                   sessionFromObject's "raw id wins over the name" branch was
                   therefore dead code and every JSON round trip went down the name
                   path instead - matching nothing, because no vehicle is named
                   after a uuid. It then MANUFACTURED a second vehicle per real
                   one, named with the raw uuid, and put every session on it: the
                   real cars came back with empty histories and the history lived
                   on ownerless phantom cars that could not even be logged
                   against. Kept here, beside the normaliser that dropped it. */
                norm.rawVehicleId = o.vehicleId ? String(o.vehicleId) : "";
                var s = sessionFromObject(norm, i + 1, errors);
                if (s) made.push(s);
            }
          } else {
            var delim =
              /\.(tsv|tab)$|\.txt$/.test(name) || text.indexOf("\t") > -1
                ? "\t"
                : ",";
            var rows = parseDelimited(text, delim);
            if (rows.length < 2) {
              showImport("bad", TXT("err.empty"), [TXT("err.emptyMore")]);
              return;
            }
            var head = rows[0].map(normHeader);
            var idxMap = {};
            var unknown = [];
for (var c = 0; c < head.length; c++) {
                /* resolveHead does this lookup, correctly. It was duplicated
                   here with `hit` holding a canonical KEY and then used as an
                   ARRAY INDEX to compare alias lengths, which is undefined.re
                   and threw a TypeError the moment a header matched two column
                   lists — "Start date" matches date and time, "Home address"
                   matches location and home. The throw escaped importText into
                   FileReader.onload, which has no try/catch, so the file
                   appeared to do nothing at all: no panel, no toast, no error.
                   Any third-party CSV with such a header was unimportable. */
                var hit = resolveHead(head[c]);
                if (hit) {
                  if (idxMap[hit] === undefined) idxMap[hit] = c;
                } else if (head[c]) unknown.push(rows[0][c]);
              }
            if (
              idxMap.date === undefined ||
              idxMap.time === undefined ||
              idxMap.location === undefined ||
              idxMap.energy === undefined
            ) {
              showImport("bad", TXT("err.cols"), [
                TXT("err.colsReq"),
                TXT("err.colsFound", {
                  c: rows[0].join(", ") || "(empty)",
                }),
              ]);
              return;
            }
            for (var r = 1; r < rows.length; r++) {
              var line = rows[r];
              var obj = {};
              for (var key in idxMap) {
                var col = idxMap[key];
                if (key === "favourite") obj[key] = line[col];
                else obj[key] = line[col];
              }
              var s2 = sessionFromObject(obj, r + 1, errors);
              if (s2) made.push(s2);
            }
            if (unknown.length) {
              errors.push(TXT("err.ignored", { c: unknown.join(", ") }));
            }
          }
vehiclesAdded = vehicles.length - before;
            if (!made.length) {
              showImport(
                "bad",
                TXT("err.noneImported", { n: errors.length }),
                errors,
              );
              return;
            }
            /* Past the bail-out: at least one row survived, so the rest of the
               file's intent is now worth applying. */
            if (pendPrice !== null && pendPrice !== undefined) {
              price = pendPrice;
              persist();
              $("ppk").value = price;
            }
            if (pendFavs) {
              /* Replaced, so the bin they were split out of has to go too.
                 loadFavs() re-reads the bin key, and it was left pointing at the
                 OLD contents: importing the same backup twice after binning a
                 favourite put that place back live while its binned copy stayed,
                 so one place existed in two states and appeared in the bin
                 forever. Every favourite the file did not mention was destroyed
                 outright, with no bin entry and no undo. */
              try {
                localStorage.setItem(K.f, JSON.stringify(pendFavs));
                localStorage.setItem(K.bf, JSON.stringify([]));
              } catch (err) {
                /* favourites are a convenience; a failed write must not abort the restore */
              }
              loadFavs();
              binned.favs = [];
            }
            for (var pv = 0; pv < pendVehAdds.length; pv++) {
              var pa = pendVehAdds[pv];
              if (vehById(pa.id)) continue;
              vehicles.push({
                id: pa.id,
                name: String(pa.name || "Vehicle"),
                icon: String(pa.icon || "\u{1F697}"),
                /* Stamped, or the restored car belongs to nobody as far as this
                   device is concerned. ownsVehicle() compares userId with the
                   signed-in id, so a vehicle without one resolves to no role at
                   all and the interface reported the owner's own restored car as
                   "waiting for the owner to approve your access" - a request for
                   something nobody had asked for. It also made the row look
                   writable to everybody: mayWriteVehicle() treats a missing owner
                   as "not yet claimed", so an imported vehicle was pushed under
                   an id the server may already attribute to another account. */
                userId: ownerId() || null,
                initialOdometer: isNum(pa.initialOdometer)
                  ? num(pa.initialOdometer)
                  : 0,
                /* Carried through a backup restore, so a vehicle that had a
                   capacity set does not silently lose it on the way in. */
                capacity: isNum(pa.capacity) ? num(pa.capacity) : null,
              });
              vehiclesAdded++;
            }
            for (var m = 0; m < made.length; m++) sessions.push(made[m]);
            save();
            render();
            syncSessions(made);
            showImport(
              made.length && errors.length ? "warn" : "ok",
              TXT("imp.note", { n: made.length }),
              errors,
            );
            toast(TXT("toast.imported", { n: made.length }));
          }
        function showImport(kind, headline, list) {
          var box = $("impResult");
          box.hidden = false;
          box.className = "res " + kind;
          var h = "<h4>" + esc(headline) + "</h4>";
          if (list && list.length) {
            h += "<ul>";
            var shown = 0;
            for (var i = 0; i < list.length; i++) {
              if (shown >= 12) {
                h += "<li>" + TXT("more", { n: list.length - shown }) + "</li>";
                break;
              }
              h += "<li>" + esc(list[i]) + "</li>";
              shown++;
            }
            h += "</ul>";
          }
          box.innerHTML = h;
        }
        $("impGo").addEventListener("click", function () {
          $("impFile").click();
        });
        $("redeemGo").addEventListener("click", function () {
          doRedeem();
        });
        $("redeemCode").addEventListener("keydown", function (e) {
          if (e.key !== "Enter") return;
          e.preventDefault();
          doRedeem();
        });
        $("impFile").addEventListener("change", function () {
          var f = this.files && this.files[0];
          if (!f) return;
          var r = new FileReader();
          r.onload = function () {
            importText(String(r.result || ""), f.name);
          };
          r.onerror = function () {
            showImport("bad", TXT("err.fileOpen"), [TXT("err.open")]);
          };
          r.readAsText(f);
          this.value = "";
        });
        $("tplCsv").addEventListener("click", function () {
          download(
            "ev-import-template.csv",
            "\ufeff" +
              "date,time,duration,location,energy,socStart,socEnd,mileage,cost,vehicle,notes,fast,home,favourite\n" +
              "2026-09-28,08:15,00:45,Supercharger Vaasa,52.4,20,80,45000,12.50,Vehicle 1,150 kW 20-80%,yes,no,yes\n" +
              "2026-09-20,19:40,01:30,Home,30,35,80,44810,,Vehicle 1,,no,yes,no\n",
            "text/csv;charset=utf-8",
          );
          toast(TXT("toast.tplCsv"));
        });
        $("tplJson").addEventListener("click", function () {
          download(
            "ev-import-template.json",
            JSON.stringify(
              [
                {
                  date: "2026-09-28",
                  time: "08:15",
                  duration: "00:45",
                  location: "Supercharger Vaasa",
                  energy: 52.4,
                  mileage: 45000,
                  cost: 12.5,
                  vehicle: "Vehicle 1",
                  notes: "150 kW",
                  fast: true,
                  home: false,
                  favourite: true,
                },
              ],
              null,
              2,
            ),
            "application/json",
          );
          toast(TXT("toast.tplJson"));
        });

        /* ---------- modal focus management ----------
   Keeps keyboard focus inside an open dialog so Tab cannot wander into the
   page behind it, and hands focus back to the trigger on close. */
        var FOCUSABLE =
          'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
        function focusables(root) {
          var out = [];
          var list = (root || document).querySelectorAll(FOCUSABLE);
          for (var i = 0; i < list.length; i++) {
            var el = list[i];
            /* offsetParent is null for display:none, so it filters out hidden controls */
            if (el.offsetParent !== null || el === document.activeElement)
              out.push(el);
          }
          return out;
        }
        /* Restores focus to the trigger. Guarded because the trigger may have been
   re-rendered (innerHTML) while the modal was open, which detaches the node. */
        function restoreFocus() {
          var t = lastFocus;
          lastFocus = null;
          if (t && t.focus && t.isConnected)
            try {
              t.focus();
            } catch (e) {
              /* the trigger may have been re-rendered and is now detached */
            }
        }
        function trapFocus(e, sheet, firstId) {
          if (e.key !== "Tab") return;
          var f = focusables(sheet.querySelector(".sheet-box"));
          if (!f.length) return;
          var first = f[0],
            last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
        /* The background page must not be reachable by keyboard while a modal is open. */
        /**
         * Ask the user to confirm a destructive action.
         * Replaces window.confirm so the prompt matches the rest of the app,
         * traps focus, closes on Escape and hands focus back to the caller.
         * @param {string} message  plain text, already translated
         * @param {Object} [opts]   heading and a destructive/danger tone
         * @returns {Promise<boolean>} resolves true when confirmed
         */
        var confirmState = null;
        /* What the typed confirmation currently requires, or "" when the dialog
           was opened without one. Read by the input handler. */
        var confirmExpectWord = "";
        function askConfirm(message, opts) {
          opts = opts || {};
          confirmExpectWord = opts.expect || "";
          var sheet = $("confirmSheet");
          if (!sheet) return Promise.resolve(window.confirm(message));
/* A second request while the dialog is open resolves the first one
               as cancelled, so a pending promise is never left dangling.

               The existing lock is RELEASED first. Replacing the dialog in place
               means the number of locks must not grow: the incoming call locks
               again further down, and only one close ever runs, so every repeat
               left backgroundLocks permanently above zero. `.wrap`, `.side` and
               `footer` would stay inert and aria-hidden for the rest of the
               session — every nav button and form dead, recoverable only by
               reloading. Discard inside the sync panel was the one reachable
               trigger, because the sheets are not themselves inert. */
            if (confirmState) {
              confirmState.resolve(false);
              lockBackground(false);
            }
          var body = $("confirmBody");
          var heading = $("confirmHeading");
          if (body) {
            /* Assigning textContent clears any previous warning, so a reused
               dialog never stacks one message on top of another. */
            body.textContent = message;
            /* opts.irreversible names a translation key. Destructive actions
               pass one so the dialog states plainly that there is no undo,
               rather than leaving the user to guess from the verb. */
            if (opts.irreversible) {
              var warn = document.createElement("p");
              warn.className = "confirm-warn";
              warn.textContent = TXT(opts.irreversible);
              body.appendChild(warn);
            }
          }
          if (heading)
            heading.textContent = TXT(opts.heading || "confirm.title");
          var ok = $("confirmOk");
          if (ok) ok.textContent = TXT(opts.ok || "confirm.ok");
          var cancel = $("confirmCancel");
          if (cancel) cancel.textContent = TXT(opts.cancel || "confirm.cancel");
          /* Typed confirmation. Exact and case-sensitive on purpose: if the
             instruction says RESET, then someone who cannot type RESET exactly
             has not acknowledged what they are about to destroy. */
          var wrap = $("confirmExpect");
          if (wrap) {
            if (opts.expect) {
              wrap.hidden = false;
              var lab = $("confirmExpectLabel");
              if (lab) lab.textContent = TXT(opts.expectLabel || "confirm.typeToConfirm");
              var hint = $("confirmExpectHint");
              if (hint) hint.textContent = TXT("confirm.expectHint", { w: opts.expect });
              var field = $("confirmExpectInput");
              if (field) {
                field.value = "";
                if (ok) ok.disabled = true;
              }
            } else {
              wrap.hidden = true;
              /* Left disabled by a previous typed confirm, so it must be
                 explicitly re-enabled every time the dialog opens. */
              if (ok) ok.disabled = false;
            }
          }
          /* opts.altKey names a third action, which resolves the promise with
             the string "alt" instead of true. Existing callers test for truth,
             so they are unaffected: only the dialogs that ask for this branch
             on it, and they compare explicitly.
             Truthiness is the reason a string is used at all: any object would
             read as "yes" to the older callers. */
          var alt = $("confirmAlt");
          if (alt) {
            if (opts.altKey) {
              alt.hidden = false;
              alt.textContent = TXT(opts.altKey);
            } else {
              alt.hidden = true;
              alt.textContent = "";
            }
          }
          $("confirmSheet").classList.add("on");
          lockBackground(true);
          return new Promise(function (resolve) {
            confirmState = {
              resolve: resolve,
              trigger: document.activeElement,
            };
            if (ok) ok.focus();
          });
        }
        function closeConfirm(result) {
          var sheet = $("confirmSheet");
          if (!sheet || !sheet.classList.contains("on")) return;
          sheet.classList.remove("on");
          lockBackground(false);
          var st = confirmState;
          confirmState = null;
          if (st) {
            if (st.trigger && st.trigger.focus && st.trigger.isConnected)
/* Focusing a trigger inside a sheet that has just been closed is a silent
                 no-op, and focus then falls to the body with the dialog still up.
                 Walk up to something still on screen. */
                try {
                  if (
                    st.trigger &&
                    st.trigger.isConnected &&
                    st.trigger.offsetParent !== null
                  )
                    st.trigger.focus();
                  else if (st.trigger && st.trigger.isConnected) {
                    var host =
                      st.trigger.closest("tr, .item, .panel, .sheet-box") ||
                      st.trigger;
                    if (host && host.offsetParent !== null) host.focus();
                  }
                } catch (e) {}
              /* The "alt" marker is preserved. !!result collapsed it to true, so a
                 caller comparing against "alt" could never reach that branch and
                 the third button silently took the primary action. Nothing passes
                 altKey today, so this is latent rather than live, but the
                 mechanism was documented as working. */
              st.resolve(result === "alt" ? "alt" : !!result);
          }
        }
/* Reference-counted. Two sheets can be open at once: the delete button on the
               edit sheet opens the confirmation dialog, so askConfirm locks the
               background and closeEdit then unlocks it unconditionally. The first
               release wins and the page behind the dialog is left inert-off,
               with focus restored to the sheet that is closing, so Tab walked out
               of an open dialog. A counter makes the last close the one that
               actually unlocks. */
          var backgroundLocks = 0;
          function lockBackground(on) {
            backgroundLocks += on ? 1 : -1;
            if (backgroundLocks < 0) backgroundLocks = 0;
            var apply = backgroundLocks > 0;
            var app = document.querySelector(".wrap"),
              side = document.querySelector(".side"),
              foot = document.querySelector("footer");
            [app, side, foot].forEach(function (n) {
              if (!n) return;
              if (apply) {
              if (!n.hasAttribute("data-a11y-inert")) {
                n.setAttribute("data-a11y-inert", "1");
                n.setAttribute("aria-hidden", "true");
                n.setAttribute("inert", "");
              }
            } else {
              n.removeAttribute("inert");
              n.removeAttribute("aria-hidden");
              n.removeAttribute("data-a11y-inert");
            }
          });
        }

        /* ---------- edit session ---------- */
        var editId = null,
          lastFocus = null;
        function openEdit(id) {
          var s = null;
          for (var i = 0; i < sessions.length; i++)
            if (sessions[i].id === id) s = sessions[i];
          if (!s) return;
          /* The button is already hidden for anyone without the role, but the
             edit sheet is reachable from the event delegation as well, so the
             check is repeated where the change would actually happen. */
          if (!canEditSession(s)) {
            toast(TXT("toast.noPermission"));
            return;
          }
          editId = id;
          lastFocus = document.activeElement;
          $("editFor").textContent = TXT("ed.for", {
            n:
              vehicles
                .map(function (v) {
                  return v.id;
                })
                .indexOf(s.vehicleId) + 1,
            d: new Date(s.created || Date.now()).toLocaleDateString(),
          });
          $("eDate").value = s.date || "";
          $("eTime").value = fmtTime(s.time);
          /* The editor always offers seconds, and always shows them. It used to
             read the add form's checkbox, so the granularity of this field
             depended on a control in a different view that the user may not
             have visited since the last reload. */
          $("eDuration").value = hoursToHM(s.hours, true);
          $("eLocation").value = s.location || "";
          $("eMileage").value = s.mileage;
          $("eEnergy").value = s.energy;
          $("eCost").value = isNum(s.cost) ? s.cost : "";
          if ($("eSocStart"))
            $("eSocStart").value = soc(s.socStart) === null ? "" : s.socStart;
          if ($("eSocEnd"))
            $("eSocEnd").value = soc(s.socEnd) === null ? "" : s.socEnd;
          $("eNotes").value = s.notes || "";
          $("eFast").checked = !!s.fast;
          $("eHome").checked = !!s.home;
          $("eFav").checked = !!s.fav;
          $("editSheet").classList.add("on");
          lockBackground(true);
          $("eDate").focus();
        }
        function closeEdit() {
          if (!$("editSheet").classList.contains("on")) return;
          $("editSheet").classList.remove("on");
          lockBackground(false);
          editId = null;
          restoreFocus();
        }
        function saveEdit(e) {
          e.preventDefault();
          var s = null;
          for (var i = 0; i < sessions.length; i++)
            if (sessions[i].id === editId) s = sessions[i];
          if (!s) {
            closeEdit();
            return;
          }
if (!$("editForm").reportValidity()) return;
          var v = veh();
          /* Same warning as the add form, and the same shape: three actions via
             the confirm dialog, with "use the previous reading" as the primary.
             The row being edited is excluded from the comparison, because asking
             "is 92,000 less than the 92,000 this row already holds?" is not a
             useful question - it is how a mistyped odometer gets corrected. */
          confirmMileage(
            { target: $("editForm"), mileage: $("eMileage"), date: $("eDate") },
            null,
            function () {
              commitEdit(s, v);
            },
            editId,
          );
        }
        function commitEdit(s, v) {
          s.date = $("eDate").value;
          s.time = fmtTime($("eTime").value);
          s.duration = $("eDuration").value;
          s.hours = hmToHours($("eDuration").value);
          s.location = $("eLocation").value.trim();
          s.energy = num($("eEnergy").value);
          /* An absent reading stays absent, as on the add form. */
          s.mileage = $("eMileage").value === "" ? null : num($("eMileage").value);
          s.cost =
            $("eCost").value === "" ? null : Math.max(0, num($("eCost").value));
          s.socStart = soc($("eSocStart") ? soc($("eSocStart").value) : null);
          s.socEnd = soc($("eSocEnd") ? soc($("eSocEnd").value) : null);
          s.notes = $("eNotes").value.trim();
          s.fast = $("eFast").checked;
          s.home = $("eHome").checked;
          s.fav = $("eFav").checked;
          s.vehicleId = v.id;
          s.edited = Date.now();
          save();
          syncSession(s);
          if (s.fav) {
            var matched = null;
            for (var fi = 0; fi < favs.length; fi++)
              if (
                favs[fi].address === s.location ||
                favs[fi].name === s.location
              )
                matched = favs[fi];
            upsertFavFromSession(
              s.location,
              s.location,
              matched ? matched.lat : null,
              matched ? matched.lng : null,
            );
          }
closeEdit();
          render();
          toast(TXT("toast.updated"));
        }

        /* ---------- date / time pickers ---------- */
        function enhancePickers(root) {
          var list = (root || document).querySelectorAll(
            'input[type="date"],input[type="time"],input[type="datetime-local"]',
          );
          for (var i = 0; i < list.length; i++) {
            (function (el) {
              if (el.dataset.pickerReady) return;
              el.dataset.pickerReady = "1";
              el.addEventListener("click", function () {
                if (typeof el.showPicker === "function") {
                  try {
                    el.showPicker();
                  } catch (err) {
                    /* unsupported, or the click was not user-activated: the native control still opens */
                  }
                }
              });
            })(list[i]);
          }
        }

        /* ---------- favourites ---------- */
        function favById(id) {
          for (var i = 0; i < favs.length; i++)
            if (favs[i].id === id) return favs[i];
          return null;
        }
        function refreshDatalist() {
          var dl = document.getElementById("favOptions");
          if (!dl) return;
          var seen = {},
            out = [];
          for (var i = 0; i < favs.length; i++) {
            var vals = [favs[i].name, favs[i].address];
            for (var j = 0; j < vals.length; j++) {
              var v = vals[j];
              if (v && !seen[v]) {
                seen[v] = 1;
                out.push('<option value="' + esc(v) + '"></option>');
              }
            }
          }
          dl.innerHTML = out.join("");
        }
        function readFavForm() {
          var name = $("fName").value.trim(),
            addr = $("fAddr").value.trim();
          var la = $("fLat").value.trim(),
            lo = $("fLng").value.trim();
          /* Cents win when both are filled, because they are the exact form. */
          var cents = $("fPriceCents") ? $("fPriceCents").value.trim() : "";
          var eur = $("fPrice") ? $("fPrice").value.trim() : "";
          var price = null;
          if (cents !== "" && isNum(cents)) price = Math.max(0, +cents) / 100;
          else if (eur !== "" && isNum(eur)) price = Math.max(0, +eur);
          return {
            name: name || addr,
            address: addr || name,
            lat: la === "" ? null : isNum(+la) ? +la : null,
            lng: lo === "" ? null : isNum(+lo) ? +lo : null,
            /* An empty or unusable field means "no own price", which is not the
               same as a price of 0, so it is stored as null rather than 0. */
            price: price,
          };
        }
        /** Mirror the euro price into whole cents, or clear both when empty. */
        function syncFavCents() {
          var e = $("fPrice"),
            c = $("fPriceCents");
          if (!e || !c) return;
          var p = isNum(e.value) ? Math.max(0, +e.value) : null;
          c.value = p === null ? "" : Math.round(p * 100);
          var m = $("fPriceMirror");
          if (m)
            m.textContent =
              p === null
                ? ""
                : TXT("toast.centsMirror", {
                    c: c.value,
                    v: fmtCents(+c.value),
                  });
        }
        /** Mirror whole cents into the euro price. An empty box is ignored, exactly
         like the session form's cents field: euro is the master, so clearing
         the cents box must not wipe a price that is still shown in euro. */
        function syncFavPrice() {
          var e = $("fPrice"),
            c = $("fPriceCents");
          if (!e || !c) return;
          if (c.value === "" || !isNum(c.value)) return;
          e.value = (Math.max(0, +c.value) / 100).toFixed(2);
          var m = $("fPriceMirror");
          if (m)
            m.textContent = TXT("toast.centsMirror", {
              c: c.value,
              v: fmtCents(Math.max(0, +c.value)),
            });
        }
        /**
         * The place's own price per kWh, or null when it has none.
         * @param {Object} f  a favourite
         * @returns {number|null}
         */
        function favPrice(f) {
          return f && isNum(f.price) && f.price >= 0 ? +f.price : null;
        }
        /**
         * Load a favourite into the form for editing.
         * @param {Object} f  a favourite from the favs array
         */
        function fillFavForm(f) {
          $("fName").value = f.name || "";
          $("fAddr").value = f.address || "";
          $("fLat").value = isNum(f.lat) ? f.lat : "";
          $("fLng").value = isNum(f.lng) ? f.lng : "";
          if ($("fPrice")) {
            var fp = favPrice(f);
            $("fPrice").value = fp === null ? "" : fp.toFixed(2);
            syncFavCents();
          }
          editFav = f.id || null;
          $("fSave").textContent = f.id ? TXT("fav.update") : TXT("fav.save");
          if (isNum(f.lat) && isNum(f.lng))
            showPin("map", f.lat, f.lng, f.name, favPinDragged);
        }
        /** Empty the favourite form and clear any stored coordinates. */
        function clearFavForm() {
          $("fName").value = "";
          $("fAddr").value = "";
          $("fLat").value = "";
          $("fLng").value = "";
          if ($("fPrice")) $("fPrice").value = "";
          if ($("fPriceCents")) $("fPriceCents").value = "";
          if ($("fPriceMirror")) $("fPriceMirror").textContent = "";
          editFav = null;
          $("fSave").textContent = TXT("fav.save");
          $("geoStat").textContent = TXT("fav.findHint");
          clearPin("map");
        }
        function saveFavourite() {
          var f = readFavForm();
          if (!f.name) {
            toast(TXT("toast.favName"));
            $("fName").focus();
            return;
          }
          if (isNum(f.lat) !== isNum(f.lng)) {
            toast(TXT("toast.favCoords"));
            return;
          }
          if (editFav) {
            var old = favById(editFav);
            /* A stale id means the favourite was deleted elsewhere, for example
               in another tab. Saving has to create the new entry instead of
               silently throwing the data away. */
            if (old) {
              f.id = old.id;
              favs[favs.indexOf(old)] = f;
            } else editFav = null;
          }
          if (!editFav) {
            var dup = null;
            for (var i = 0; i < favs.length; i++) {
              if (
                favs[i].name.toLowerCase() === f.name.toLowerCase() &&
                favs[i].address.toLowerCase() === f.address.toLowerCase()
              )
                dup = favs[i];
            }
            if (dup) {
              f.id = dup.id;
              favs[favs.indexOf(dup)] = f;
            } else {
              f.id = uid();
              favs.push(f);
            }
          }
          saveFavs();
          renderFavs();
          fillFavForm(f);
          toast(
            TXT(isNum(f.lat) ? "toast.favSavedMap" : "toast.favSavedNo", {
              v: f.name,
            }),
          );
        }
        /**
         * Fill the session location from a favourite and load its coordinates.
         * A favourite that carries its own price also applies it, so home and
         * the office always charge at the rate that applies there.
         * @param {string} id  favourite id
         */
        function useFav(id) {
          var f = favById(id);
          if (!f) return;
          $("location").value = f.address || f.name;
          go("add-session");
          var fp = favPrice(f);
          if (fp !== null) {
            setPriceCents(Math.round(fp * 100));
            recalcFromPrice();
            syncCents();
            toast(TXT("toast.favPrice", { p: fmtCents(Math.round(fp * 100)) }));
          }
          $("location").focus();
        }
        /**
         * Start editing a favourite: copy it into the form and scroll there.
         * @param {string} id  favourite id
         */
        function editFavById(id) {
          var f = favById(id);
          if (!f) return;
          fillFavForm(f);
          go("favourites");
          $("fName").focus();
        }
        /**
         * Delete a favourite after confirmation.
         * @param {string} id  favourite id
         */
        function delFav(id) {
          var f = favById(id);
          if (!f) return;
          return askConfirm(TXT("toast.delFavQ", { n: f.name }), {
            heading: "confirm.deleteFav",
            ok: "confirm.delete",
          }).then(function (yes) {
            if (!yes) return false;
            doDeleteFav(id);
            return true;
          });
        }
        /**
         * Create or update a favourite from a saved session, so ticking
         * "save this location" keeps the coordinates in step.
         * @param {string} name     display name
         * @param {string} address  the text stored as the address
         * @param {number} [lat]    null when unknown, which leaves the old value alone
         * @param {number} [lng]
         */
        function upsertFavFromSession(name, address, lat, lng) {
          var n = (name || address || "").trim();
          for (var i = 0; i < favs.length; i++) {
            if (favs[i].name.toLowerCase() === n.toLowerCase()) {
              if (address) favs[i].address = address;
              if (isNum(lat) && isNum(lng)) {
                favs[i].lat = lat;
                favs[i].lng = lng;
              }
              saveFavs();
              renderFavs();
              return;
            }
          }
          favs.push({
            id: uid(),
            name: n,
            address: address || n,
            lat: isNum(lat) ? lat : null,
            lng: isNum(lng) ? lng : null,
            /* A place saved from a session has no price of its own yet; when the
               favourite already exists above, its price is deliberately kept. */
            price: null,
          });
          saveFavs();
          renderFavs();
        }

        /* ---------- geocoding + map ---------- */
        var maps = {},
          leafletState = 0,
          lastGeo = 0;
        /**
         * Look up coordinates for saved places that have none.
         *
         * Only fills in what is MISSING. A place that already has coordinates
         * is left alone even if they look wrong, because re-geocoding a correct
         * pin can move it and quietly break proximity matching. Anything that
         * needs fixing is a deliberate per-place edit, where the change is
         * visible before it is saved.
         *
         * Nominatim's usage policy asks for at most one request a second, so
         * this is deliberately sequential and paced rather than fired in
         * parallel. @returns {Promise<{filled:number, failed:number, skipped:number}>}
         */
        function geocodeMissingFavs() {
          var todo = favs.filter(function (f) {
            return f && !f.deletedAt && !isNum(f.lat) && !isNum(f.lng);
          });
          var skipped = favs.filter(function (f) {
            return f && !f.deletedAt && (isNum(f.lat) || isNum(f.lng));
          }).length;
          var stat = $("favGeoStat");
          var out = { filled: 0, failed: 0, skipped: skipped };
          if (!todo.length) {
            if (stat)
              stat.textContent = TXT("toast.geoNoneMissing", { s: skipped });
            return Promise.resolve(out);
          }
          var btn = $("favGeoBtn");
          if (btn) btn.disabled = true;
          var i = 0;
          function next() {
            if (i >= todo.length) {
              if (btn) btn.disabled = false;
              saveFavs();
              renderFavs();
              if (stat)
                stat.textContent = TXT("toast.geoDone", {
                  n: out.filled,
                  f: out.failed,
                  s: skipped,
                });
              return Promise.resolve(out);
            }
            var f = todo[i++];
            var q = (f.address || f.name || "").trim();
            /* Paced, and it never starts faster than a request a second. */
            var wait = Math.max(0, 1100 - (Date.now() - lastGeo));
            lastGeo = Date.now() + wait;
            return new Promise(function (resolve) {
              setTimeout(function () {
                if (!q) {
                  out.failed++;
                  resolve();
                  return;
                }
                fetch(nomUrl(q, 1))
                  .then(function (r) {
                    if (!r.ok) throw new Error("http " + r.status);
                    return r.json();
                  })
                  .then(function (res) {
                    var hit = pickBestHit(res, q);
                    if (!hit) {
                      out.failed++;
                      return;
                    }
                    var lat = parseFloat(hit.lat),
                      lng = parseFloat(hit.lon);
                    if (!isFinite(lat) || !isFinite(lng)) {
                      out.failed++;
                      return;
                    }
                    f.lat = lat;
                    f.lng = lng;
                    out.filled++;
                  })
                  .catch(function () {
                    out.failed++;
                  })
                  .then(function () {
                    if (stat)
                      stat.textContent = TXT("toast.geoProgress", {
                        d: i,
                        t: todo.length,
                        n: out.filled,
                      });
                    next();
                  });
              }, wait);
            });
          }
          return next();
        }
        function nomUrl(q, limit) {
          return (
            "https://nominatim.openstreetmap.org/search?format=jsonv2" +
            "&addressdetails=1&namedetails=1" +
            "&accept-language=fi" /* always Finnish names, whatever the browser asks for */ +
            "&limit=" +
            (limit || 6) +
            "&q=" +
            encodeURIComponent(q)
          );
        }
        /**
         * Choose the most specific hit from a Nominatim result list.
         * Free-text search ranks a whole road above one house, so asking for a
         * single result meant "Kostilantie 5" often resolved to the road itself
         * with no street number. Asking for several results and choosing here
         * is what makes house numbers appear.
         * @param {Array}  res  results from Nominatim
         * @param {string} q    what the user typed
         * @returns {Object|null}
         */
        function pickBestHit(res, q) {
          if (!res || !res.length) return null;
          /* a trailing number in the query is almost always a street number */
          var want = String(q || "").match(/\s(\d{1,5}\s?[A-Za-z]?)\s*$/);
          want = want ? want[1].toLowerCase().replace(/\s+/g, "") : "";
          var best = null;
          var bestScore = -1;
          for (var i = 0; i < res.length; i++) {
            var hit = res[i];
            var a = hit.address || {};
            var num = String(a.house_number || "")
              .toLowerCase()
              .replace(/\s+/g, "");
            var score = 0;
            /* an exact street-number match beats everything */
            if (want && num && num === want) score += 100;
            else if (want && num) score += 40;
            else if (num) score += 20;
            /* a real address beats a road, a municipality or a POI */
            if (a.house_number) score += 10;
            if (a.road || a.pedestrian || a.footway) score += 4;
            if (isNum(hit.importance))
              score += Math.max(0, Math.min(9, hit.importance));
            /* earlier results are Nominatim's own preference */
            score += Math.max(0, 3 - i) * 0.5;
            if (score > bestScore) {
              bestScore = score;
              best = hit;
            }
          }
          return best;
        }
        /** True when the text carries a house number, e.g. "Kostilantie 5". */
        function looksLikeHouseNumber(q) {
          return /\s\d{1,5}\s?[A-Za-z]?\s*$/.test(String(q || ""));
        }
        function escapeRe(s) {
          return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
        function firstOf(o, keys) {
          for (var i = 0; i < keys.length; i++) {
            if (o && o[keys[i]]) return String(o[keys[i]]);
          }
          return "";
        }
        /* Builds "POI, Street 12, 33100 Tampere" from the structured address,
   dropping the duplicates Nominatim leaves in display_name.
   Postcode/city order follows the visitor's country. */
        function shortAddress(hit) {
          var a = (hit && hit.address) || {};
          var city = firstOf(a, [
            "city",
            "town",
            "village",
            "municipality",
            "hamlet",
            "borough",
            "suburb",
          ]);
          var road = firstOf(a, [
            "road",
            "pedestrian",
            "footway",
            "path",
            "residential",
            "address",
          ]);
          var num = firstOf(a, ["house_number"]);
          var pc = firstOf(a, ["postcode"]);
          var name = String(hit && hit.name ? hit.name : "").trim();
          if (!name)
            name = firstOf(a, [
              "amenity",
              "shop",
              "tourism",
              "leisure",
              "office",
              "public_transport",
            ]);
          name = name.trim();
          if (name && city && name.toLowerCase() === city.toLowerCase())
            name = "";
          if (name && city) {
            var dup = new RegExp("\\s+" + escapeRe(city) + "$", "i");
            if (dup.test(name)) name = name.replace(dup, "").trim();
          }
          /* Searching a bare road name returns the road itself, where hit.name
             and address.road are the same string. Keeping both produced
             "Kostilantie, Kostilantie, Punkalaidun, 31900". */
          if (name && road && name.toLowerCase() === road.toLowerCase())
            name = "";
          var parts = [];
          if (name) parts.push(name);
          if (road) parts.push(num ? road + " " + num : road);
          else if (num) parts.push(num);
          var place = cityLine(city, pc);
          if (place) parts.push(place);
          /* last line of defence: never repeat an identical part */
          var out = [];
          for (var p = 0; p < parts.length; p++) {
            var t = String(parts[p]).trim();
            if (!t) continue;
            var dupSeen = false;
            for (var q2 = 0; q2 < out.length; q2++)
              if (out[q2].toLowerCase() === t.toLowerCase()) dupSeen = true;
            if (!dupSeen) out.push(t);
          }
          return out.join(", ");
        }
        /**
         * Load Leaflet once and run the callback when it is ready.
         * Calls back immediately if Leaflet is already present, so callers can
         * treat it as fire-and-forget.
         * @param {Function} cb
         */
        function loadLeaflet(cb) {
          if (window.L) {
            cb();
            return;
          }
          if (leafletState === 1) {
            setTimeout(function () {
              loadLeaflet(cb);
            }, 120);
            return;
          }
          leafletState = 1;
          var css = document.createElement("link");
          css.rel = "stylesheet";
          css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(css);
          var s = document.createElement("script");
          s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          s.async = true;
          s.onload = function () {
            leafletState = 2;
            cb();
          };
          s.onerror = function () {
            leafletState = 0;
            $("mapMsg").hidden = false;
            $("sessMapMsg").hidden = false;
          };
          document.head.appendChild(s);
        }
        function getMap(id, onDrag) {
          var slot = maps[id] || (maps[id] = {});
          if (slot.map) return slot;
          var el = $(id);
          if (!el || !window.L) return null;
          try {
            slot.map = L.map(el, {
              scrollWheelZoom: false,
            }).setView([63.1, 21.6], 11);
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
              maxZoom: 19,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(slot.map);
slot.map.on("click", function (e) {
                /* onDrag is fired here as well as from dragend. It used to be
                   wired only to dragend, so tapping the map moved the pin and
                   zoomed to it while the stored coordinates stayed at the old
                   point: the submit handler then saved the previous location, or
                   none at all on the favourites form where the change listeners
                   only react to typed values. The map looked accepted and the row
                   was wrong. */
                pinAt(id, e.latlng.lat, e.latlng.lng, null, onDrag);
                if (onDrag) onDrag(e.latlng.lat, e.latlng.lng);
              });
            slot.marker = null;
            slot.onDrag = onDrag || null;
            return slot;
          } catch (e) {
            return null;
          }
        }
        function pinAt(id, lat, lng, label, onDrag) {
          var o = getMap(id, onDrag);
          if (!o) return false;
          try {
            if (!o.marker)
              o.marker = L.marker([lat, lng], {
                draggable: true,
              }).addTo(o.map);
            else o.marker.setLatLng([lat, lng]);
            if (o.marker.off) o.marker.off("dragend");
            o.marker.on("dragend", function () {
              var p = o.marker.getLatLng();
              if (o.onDrag) o.onDrag(p.lat, p.lng);
            });
            /* Cleared before rebinding. A map click passes no label, and the previous
               address stayed bound to the moved pin, so the popup showed one
               place while the pin sat on another. */
              if (o.marker.unbindPopup) o.marker.unbindPopup();
              if (label && o.marker.bindPopup) o.marker.bindPopup(esc(label));
            o.map.setView([lat, lng], 16, { animate: false });
            o.map.invalidateSize();
            return true;
          } catch (e) {
            return false;
          }
        }
        /* showPin remembers the request, so a pin asked for before Leaflet has
   finished loading is still drawn once the map exists */
        function showPin(id, lat, lng, label, onDrag) {
          if (!isNum(lat) || !isNum(lng)) return;
          maps[id] = maps[id] || {};
          maps[id].pending = {
            lat: +lat,
            lng: +lng,
            label: label || "",
            onDrag: onDrag || null,
          };
          loadLeaflet(function () {
            var o = getMap(
              id,
              maps[id].pending ? maps[id].pending.onDrag : null,
            );
            if (!o) return;
            var p = maps[id].pending;
            if (p) pinAt(id, p.lat, p.lng, p.label, p.onDrag);
          });
        }
        /**
         * Remove the draggable pin from a map.
         * @param {string} id  "map" for favourites, "sessMap" for the session form
         */
        function clearPin(id) {
          var o = maps[id];
          if (o && o.marker && o.map) {
            try {
              o.map.removeLayer(o.marker);
            } catch (e) {
              /* the marker may never have been added */
            }
          }
          if (o) o.marker = null;
          if (maps[id]) delete maps[id].pending;
        }
        function suggest(q, cb) {
          if (!navigator.onLine) return;
          var wait = lastGeo + 1000 - new Date().getTime();
          var go = function () {
            lastGeo = new Date().getTime();
            fetch(nomUrl(q, 6))
              .then(function (r) {
                return r.ok ? r.json() : [];
              })
              .then(function (res) {
                cb(Array.isArray(res) ? res : []);
              })
              .catch(function () {
                cb([]);
              });
          };
          if (wait > 0) setTimeout(go, wait);
          else go();
        }
        /**
         * Look the typed address up through OpenStreetMap Nominatim, then fill
         * the coordinates and drop a pin. Needs an address first, and is
         * rate limited, so it is deliberately a manual button rather than
         * something that fires on every keystroke.
         */
        function geocode() {
          var q = $("fAddr").value.trim();
          if (!q) {
            toast(TXT("toast.locFirst"));
            $("fAddr").focus();
            return;
          }
          if (!navigator.onLine) {
            $("geoStat").textContent = TXT("toast.offline");
            return;
          }
          $("geoStat").textContent = TXT("toast.looking", { q: q });
          /* Several results, then choose the most specific one, so a street
             number in the query actually resolves to that house. */
          fetch(nomUrl(q, 10))
            .then(function (r) {
              if (!r.ok) throw new Error("http " + r.status);
              return r.json();
            })
            .then(function (res) {
              var hit = pickBestHit(res, q);
              if (!hit) {
                $("geoStat").textContent = TXT("toast.noMatch", { q: q });
                return;
              }
              var short = shortAddress(hit);
              var lat = parseFloat(hit.lat),
                lng = parseFloat(hit.lon);
              $("fLat").value = lat.toFixed(5);
              $("fLng").value = lng.toFixed(5);
              if (!$("fName").value.trim())
                $("fName").value = hit.name || short || q;
              if (short) $("fAddr").value = short;
              showPin("map", lat, lng, hit.name || short, favPinDragged);
              /* A successful lookup now stores the place straight away. Finding
                 an address used to only fill the form, which read as "nothing
                 happened" on the saved list until Save was pressed as well. */
              /* Looking up a different address in the same form means a new
                 place, not a silent overwrite of the one being edited. */
              var beingEdited = editFav ? favById(editFav) : null;
              if (beingEdited) {
                var wasAddr = (beingEdited.address || "").toLowerCase();
                if (
                  wasAddr &&
                  ($("fAddr").value || "").toLowerCase() !== wasAddr
                )
                  editFav = null;
              }
              saveFavourite();
              $("geoStat").textContent = TXT("toast.found", {
                v: short,
              });
            })
            .catch(function () {
              $("geoStat").textContent = TXT("toast.geoFail");
            });
        }
        function favPinDragged(lat, lng) {
          $("fLat").value = lat.toFixed(5);
          $("fLng").value = lng.toFixed(5);
        }

        /* ---------- address suggestions on the session form ---------- */
        var locGeo = { lat: null, lng: null, label: "" },
          locTimer = 0,
          sugIndex = -1,
          lastSuggest = [];
        function setLocStatus(t) {
          $("locStat").textContent = t || "";
        }
        /** Hide the address suggestion list and reset the combobox state. */
        function closeSuggest() {
          var ul = $("locSuggest");
          ul.hidden = true;
          ul.innerHTML = "";
          $("location").setAttribute("aria-expanded", "false");
          sugIndex = -1;
        }
        function showSuggest(list) {
          var ul = $("locSuggest");
          lastSuggest = list || [];
          if (!list || !list.length) {
            closeSuggest();
            return;
          }
          var h = "";
          for (var i = 0; i < list.length; i++) {
            h +=
              '<li role="option" data-i="' +
              i +
              '" tabindex="-1">' +
              esc(shortAddress(list[i]) || list[i].display_name) +
              "</li>";
          }
          ul.innerHTML = h;
          ul.hidden = false;
          $("location").setAttribute("aria-expanded", "true");
          sugIndex = -1;
        }
        function pickSuggest(i, list) {
          var hit = list[i];
          if (!hit) return;
          var short = shortAddress(hit);
          $("location").value = short || hit.display_name || "";
          closeSuggest();
          locGeo = {
            lat: parseFloat(hit.lat),
            lng: parseFloat(hit.lon),
            label: short || hit.display_name,
          };
          $("sessMapBox").hidden = false;
          setLocStatus(TXT("toast.showing", { v: short || hit.display_name }));
          showPin(
            "sessMap",
            locGeo.lat,
            locGeo.lng,
            hit.name || short,
            sessPinDragged,
          );
        }
        function sessPinDragged(lat, lng) {
          locGeo.lat = lat;
          locGeo.lng = lng;
          setLocStatus(
            TXT("toast.pinMoved", {
              a: lat.toFixed(5),
              b: lng.toFixed(5),
            }),
          );
        }
        function lookupLocation() {
          var q = $("location").value.trim();
          if (!q) {
            setLocStatus(TXT("toast.locFirst2"));
            return;
          }
          if (!navigator.onLine) {
            setLocStatus(TXT("toast.offline2"));
            return;
          }
          setLocStatus(TXT("toast.looking", { q: q }));
          fetch(nomUrl(q, 10))
            .then(function (r) {
              return r.ok ? r.json() : [];
            })
            .then(function (res) {
              var hit = pickBestHit(res, q);
              if (!hit) {
                setLocStatus(TXT("toast.noMatch2", { q: q }));
                return;
              }
              var short = shortAddress(hit);
              $("location").value = short || hit.display_name || "";
              locGeo = {
                lat: parseFloat(hit.lat),
                lng: parseFloat(hit.lon),
                label: short,
              };
              $("sessMapBox").hidden = false;
              setLocStatus(TXT("toast.found", { v: short }));
              showPin(
                "sessMap",
                locGeo.lat,
                locGeo.lng,
                hit.name || short,
                sessPinDragged,
              );
            })
            .catch(function () {
              setLocStatus(TXT("toast.geoFail2"));
            });
        }
        function onLocInput() {
          var q = $("location").value.trim();
          if (q.length < 3) {
            closeSuggest();
            setLocStatus("");
            return;
          }
          clearTimeout(locTimer);
          locTimer = setTimeout(function () {
            suggest(q, function (list) {
              showSuggest(list);
            });
          }, 800);
        }

        /* ---------- use the device location ---------- */
        function haversine(a, b) {
          var R = 6371000,
            toRad = Math.PI / 180;
          var dLat = (b.lat - a.lat) * toRad,
            dLon = (b.lng - a.lng) * toRad;
          var s =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * toRad) *
              Math.cos(b.lat * toRad) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
        }
        function knownPlaces() {
          var out = [],
            seen = {};
          for (var i = 0; i < favs.length; i++) {
            var f = favs[i];
            if (isNum(f.lat) && isNum(f.lng)) {
              out.push({
                name: f.name,
                address: f.address,
                lat: +f.lat,
                lng: +f.lng,
                kind: "favourite",
              });
            }
          }
          for (var j = 0; j < sessions.length; j++) {
            var s = sessions[j];
            if (isNum(s.lat) && isNum(s.lng) && !seen[s.location]) {
              seen[s.location] = 1;
              out.push({
                name: s.location,
                address: s.location,
                lat: +s.lat,
                lng: +s.lng,
                kind: "charging location",
              });
            }
          }
          return out;
        }
        /**
 * Nearby chargers, grouped and de-duplicated, for the list under the location
 * field.
 *
 * Priority is the order the groups appear in:
 *   1. places you have charged at before   - you know them, and they may carry
 *      your own price
 *   2. your saved favourites                - deliberate, named by you
 *   3. the Digitraffic registry            - anyone can be anywhere
 *
 * De-duplication is by POSITION first and name second, and the first group to
 * claim a position keeps it. That is the whole point of the ordering: a charger
 * you have already used and a registry row for the same charger are one place,
 * and showing both - one labelled "where you charged before", one labelled
 * "nearby station" - makes the list look like it found more than it did.
 *
 * 25 m is the distance threshold. The app already treats two places within 25 m
 * of each other as indistinguishable on a single position reading (the
 * favourites matcher calls that ambiguous); using the same number here means
 * the two screens cannot disagree about whether two rows are the same place.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {Array} stationRows from StationData, already ranked and within range
 * @returns {{sessions:Array, favs:Array, stations:Array}}
 */
        function nearbyChargers(lat, lng, stationRows) {
          var SAME_PLACE_M = 25;
          var claimed = [];
          var groups = { sessions: [], favs: [], stations: [] };

          function claim(p) {
            /* Distance from the point being offered to each position already
               claimed. One comparison, no cleverness: an earlier version tried
               to express "within 25 m" as a difference of two distances and
               got it wrong, dropping stations a few hundred metres apart. */
            for (var i = 0; i < claimed.length; i++) {
              var d = haversine(p, claimed[i]);
              if (d < SAME_PLACE_M) return true;
            }
            claimed.push({ lat: p.lat, lng: p.lng });
            return false;
          }

          function byName(p) {
            var n = String(p.name || "")
              .trim()
              .toLowerCase();
            return n;
          }

          var seenNames = {};

          function add(group, p) {
            var n = byName(p);
            /* Name second, for the case where the same charger is recorded
               twice at coordinates far enough apart to be a different pin but is
               obviously the same name. */
            if (n && seenNames[n]) return;
            if (claim(p)) return;
            if (n) seenNames[n] = 1;
            p.dist = haversine({ lat: lat, lng: lng }, { lat: p.lat, lng: p.lng });
            groups[group].push(p);
          }

          /* 1. Places charged at before, most recent first so the one you used
             yesterday beats the one from last summer. */
          var hist = sessions
            .filter(function (s) {
              return isNum(s.lat) && isNum(s.lng);
            })
            .slice()
            .sort(function (a, b) {
              return String(b.date || "").localeCompare(String(a.date || ""));
            });
          for (var h = 0; h < hist.length; h++) {
            add("sessions", {
              name: hist[h].location,
              address: hist[h].location,
              lat: +hist[h].lat,
              lng: +hist[h].lng,
              kind: "session",
            });
          }

          /* 2. Saved favourites. */
          for (var f = 0; f < favs.length; f++) {
            var fv = favs[f];
            if (fv && isNum(fv.lat) && isNum(fv.lng)) {
              add("favs", {
                name: fv.name,
                address: fv.address,
                lat: +fv.lat,
                lng: +fv.lng,
                kind: "favourite",
              });
            }
          }

          /* 3. The registry, already nearest-first by the data layer. */
          var rows = stationRows || [];
          for (var r = 0; r < rows.length; r++) {
            add("stations", {
              name: rows[r].name,
              address: rows[r].address,
              lat: rows[r].lat,
              lng: rows[r].lng,
              kind: "station",
              power: rows[r].power,
              plugs: rows[r].plugs,
            });
          }

          return groups;
        }

        /** Nearest two of each, which is what the list shows. */
        function capGroups(groups, perGroup) {
          var n = perGroup || 2;
          return {
            sessions: groups.sessions.slice(0, n),
            favs: groups.favs.slice(0, n),
            stations: groups.stations.slice(0, n),
          };
        }

        function nearestPlace(lat, lng) {
          var list = knownPlaces(),
            best = null;
          for (var i = 0; i < list.length; i++) {
            var d = haversine(
              { lat: lat, lng: lng },
              { lat: list[i].lat, lng: list[i].lng },
            );
            if (!best || d < best.dist) best = { p: list[i], dist: d };
          }
          return best;
        }
/**
 * The nearby-chargers list under the location field.
 *
 * Rendered from whatever has arrived, and re-rendered as each group does. The
 * first two groups are local and appear immediately; the registry takes a few
 * seconds on a cold cache, and a blank space with a spinner reads as "nothing
 * found" rather than "still looking".
 */
        var nearToken = 0;
        function renderNearby(groups) {
          var box = $("locNear");
          if (!box) return;
          var order = [
            ["sessions", "locNearUsed"],
            ["favs", "locNearSaved"],
            ["stations", "locNearStation"],
          ];
          var out = [];
          var any = false;
          for (var g = 0; g < order.length; g++) {
            var key = order[g][0];
            var list = groups[key] || [];
            if (!list.length) continue;
            any = true;
            out.push('<div class="loc-near-group"><h4>' + TXT(order[g][1]) + "</h4><ul>");
            for (var i = 0; i < list.length; i++) {
              var p = list[i];
              out.push(
                '<li><button type="button" class="loc-near-row" data-near-lat="' +
                  p.lat +
                  '" data-near-lng="' +
                  p.lng +
                  '" data-near-name="' +
                  esc(p.address || p.name || "") +
                  '">' +
                  '<span class="loc-near-name">' +
                  esc(p.name || TXT("st.unnamed")) +
                  "</span>" +
                  (p.power
                    ? '<span class="loc-near-meta">' +
                      esc(p.power) +
                      (p.plugs && p.plugs.length
                        ? " · " + esc(p.plugs.slice(0, 2).join(", "))
                        : "") +
                      "</span>"
                    : '<span class="loc-near-meta">' +
                      Math.round(p.dist) +
                      " m</span>") +
                  "</button></li>",
              );
            }
            out.push("</ul></div>");
          }
          box.hidden = !any;
          box.innerHTML = out.join("");
        }

        /** Ask the registry for stations near a point, and fold them in. */
        function loadNearStations(lat, lng, mine) {
          var box = $("locNear");
          if (box && !box.innerHTML) {
            box.hidden = false;
            box.innerHTML = '<p class="loc-near-wait">' + TXT("st.searching") + "</p>";
          }
          StationData.findStations({ lat: lat, lng: lng }, LOC_RADIUS_M)
            .then(function (res) {
              if (mine !== nearToken) return;
              var groups = capGroups(nearbyChargers(lat, lng, res.rows), 2);
              renderNearby(groups);
            })
            .catch(function () {
              /* Silent on the registry alone. The first two groups are local and
                 still on screen, and a charger search failing is no reason to
                 throw away a favourite the user can already see. */
              if (mine !== nearToken) return;
              var box2 = $("locNear");
              if (box2 && /loc-near-wait/.test(box2.innerHTML)) {
                box2.hidden = true;
                box2.innerHTML = "";
              }
            });
        }

        /** Put a suggested place into the form, pin it, and close the list. */
        function useNearbyPlace(lat, lng, name) {
          $("location").value = name || "";
          locGeo = { lat: +lat, lng: +lng, label: name || "" };
          var box = $("sessMapBox");
          if (box) box.hidden = false;
          var list = $("locNear");
          if (list) {
            list.hidden = true;
            list.innerHTML = "";
          }
          loadLeaflet(function () {
            showPin("sessMap", +lat, +lng, name || "", sessPinDragged);
          });
          setLocStatus(TXT("st.chosen", { v: name || TXT("st.unnamed") }));
        }

        /**
 * Ask the browser where we are and use it as this session's location.
 *
 * Unchanged behaviour, deliberately: it still fills the field from the nearest
 * place you have already used, which is the common case and needs no further
 * choice. What is new is the list underneath, because until now a favourite
 * near you meant the charger registry was never consulted at all.
 */
        function useMyLocation() {
          if (!navigator.geolocation) {
            setLocStatus(TXT("toast.geoNone"));
            return;
          }
          setLocStatus(TXT("toast.geoWait"));
          $("locGeo").disabled = true;
          navigator.geolocation.getCurrentPosition(
            function (pos) {
              $("locGeo").disabled = false;
              var lat = pos.coords.latitude,
                lng = pos.coords.longitude;
              var near = nearestPlace(lat, lng);
              var threshold = 1000;
              if (near && near.dist <= threshold) {
                $("location").value = near.p.address || near.p.name;
                locGeo = {
                  lat: near.p.lat,
                  lng: near.p.lng,
                  label: near.p.address || near.p.name,
                };
                $("sessMapBox").hidden = false;
                setLocStatus(
                  TXT("toast.geoNear", {
                    v: near.p.name,
                    d: Math.round(near.dist),
                  }),
                );
                if ($("fav").checked) $("favName").value = near.p.name;
                showPin(
                  "sessMap",
                  near.p.lat,
                  near.p.lng,
                  near.p.name,
                  sessPinDragged,
                );
              } else if (near) {
                $("location").value = near.p.address || near.p.name;
                locGeo = {
                  lat: lat,
                  lng: lng,
                  label: near.p.name,
                };
                $("sessMapBox").hidden = false;
                setLocStatus(
                  TXT("toast.geoNearF", {
                    v: near.p.name,
                    d: Math.round(near.dist),
                  }),
                );
                showPin("sessMap", lat, lng, near.p.name, sessPinDragged);
              } else {
                locGeo = { lat: lat, lng: lng, label: "" };
                $("sessMapBox").hidden = false;
                setLocStatus(TXT("toast.geoNoNear"));
                showPin("sessMap", lat, lng, "", sessPinDragged);
              }
              /* The list, in every case above - including the one where a saved
                 place filled the field. Until now, a favourite within 1000 m
                 meant the charger registry was never asked, so the places you
                 had never used were unreachable from this screen even when they
                 were fifty metres away. The field is filled exactly as before;
                 this only adds the choices underneath it. */
              var mine = ++nearToken;
              renderNearby(capGroups(nearbyChargers(lat, lng, []), 2));
              loadNearStations(lat, lng, mine);
            },
            function (err) {
              $("locGeo").disabled = false;
              var msg =
                err && err.code === 1
                  ? "Location permission was denied."
                  : err && err.code === 2
                    ? "Your location is not available right now."
                    : "Could not read your location.";
              setLocStatus(msg + " You can still search for the address.");
            },
            {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 60000,
            },
          );
        }

        /* ---------- charging stations ----------
           The data work lives in app/stations.js. What remains here is the
           screen: ask for a position, ask the module, draw the answer.

           Inside Finland the answer comes from Digitraffic's cached registry,
           which lists 3,840 stations with connector type, power, operator and
           live status. Outside Finland it comes from Overpass, because
           Digitraffic is Finnish only. Both paths return the same row shape, so
           nothing below this point knows or cares which one answered. */
var STATION_RADIUS_M = 10000;
        /* How many are shown before the "show more" button. Five is what fits
           above the fold on a phone, which is where this is usually used. */
        var STATION_NEAREST = 5;
var STATION_PAGE = 10;
        /* The full ranked answer, kept so "show more" can page through it
           without re-querying. `stationResults` is only what is on screen. */
        var stationAll = [];
        var stationResults = [];
var stationCentre = null;
          var stationPage = 0;
          var stationOpen = null;
          /* Bumped by every search and every camera load. A response whose token
             no longer matches is discarded rather than rendered. */
          var stationToken = 0;
          var cameraToken = 0;
          var stationCameraToken = 0;
          /* Reported accuracy of the fix each search ran from, in metres, or
             null when unknown. Not a gate - see findStationsNearMe. */
          var stationFixM = null;
          var cameraFixM = null;

          /**
           * The result line, with a plain statement of how good the fix was.
           *
           * Only mentioned when it is worth mentioning. A five-metre fix needs
           * no commentary, and a status line that always carries a caveat reads
           * as a warning about everything.
           *
           * @param {string} clean the message for a good fix
           * @param {string} rough the message template, given {a}
           */
          function fixNote(clean, rough, fixM) {
            if (!isNum(fixM) || fixM <= LOC_MAX_ACCURACY_M) return clean;
            return TXT(rough, { a: Math.round(fixM) });
          }

        function setStationStatus(t) {
          var el = $("stationStat");
          if (el) el.textContent = t;
        }

        /**
         * The nearest five, always.
         *
         * The full list can run to hundreds within 10 km in a city, and a
         * scrolling wall of them buries the one the user wanted. Five is what
         * fits above the fold, and the rest are a deliberate second step.
         */
        function stationSlice(list) {
          if (list.length <= STATION_NEAREST) return list;
          return list.slice(0, STATION_NEAREST);
        }

        function renderStations() {
          var box = $("stationList");
          if (!box) return;
          if (!stationResults.length) {
            box.innerHTML = "";
            return;
          }
var shown = stationResults;
          var out = [];
          for (var i = 0; i < shown.length; i++) {
            var s = shown[i];
            var bits = [];
            if (s.power) bits.push(esc(s.power));
            if (s.plugs && s.plugs.length) bits.push(esc(s.plugs.join(", ")));
            /* One row per station. The pole count is a single number here
               because a station with 200 connectors otherwise renders as a
               paragraph nobody reads; the detail sheet lists them. */
            if (s.polesTotal > 1) bits.push(TXT("st.poles", { n: s.polesTotal }));
out.push(
              '<li class="station-row' +
                (stationOpen === s.id ? " on" : "") +
                '"><div>' +
                '<button type="button" class="station-name" data-station-detail="' +
                esc(s.id) +
                '">' +
                esc(s.name || TXT("st.unnamed")) +
                (s.operator ? ' <span class="station-meta">' + esc(s.operator) + "</span>" : "") +
                "</button>" +
                (bits.length ? '<div class="station-meta">' + bits.join(" · ") + "</div>" : "") +
                (s.address ? '<div class="station-meta">' + esc(s.address) + "</div>" : "") +
                '</div><div class="station-end"><span class="station-meta">' +
                Math.round(s.dist / 10) / 100 +
                " km</span>" +
                '<button type="button" class="btn sm" data-station-use="' +
                esc(s.id) +
                '">' +
                TXT("st.use") +
                "</button></div></li>",
            );
          }
var rest = stationAll.length - shown.length;
          box.innerHTML = '<ul class="station-list">' + out.join("") + "</ul>";
          /* The rest is never hidden behind a scroll: it is a button, so the
             count is stated and the user chooses to see it. */
          var more = $("stationMore");
          if (more) {
            more.hidden = rest <= 0;
            var lab = $("stationMoreLabel");
            if (lab) lab.textContent = TXT("st.moreCount", { n: rest });
          }
        }

        function drawStationPins(list) {
          var slot = maps["stationMap"];
          if (!slot || !slot.map) return;
          if (slot.stationPins) {
            for (var i = 0; i < slot.stationPins.length; i++)
              slot.map.removeLayer(slot.stationPins[i]);
          }
          slot.stationPins = [];
          for (var k = 0; k < list.length; k++) {
            var s = list[k];
            var m = L.circleMarker([s.lat, s.lng], {
              radius: 5,
              color: "#10b981",
              weight: 2,
              fillColor: "#10b981",
              fillOpacity: 0.75,
            });
            m.bindPopup(
              "<b>" +
                esc(s.name || TXT("st.unnamed")) +
                "</b><br>" +
                esc(s.power || "") +
                (s.dist != null
                  ? "<br>" + TXT("st.away", { d: Math.round(s.dist) }) + " m"
                  : ""),
            );
            m.addTo(slot.map);
            slot.stationPins.push(m);
          }
        }

        function stationFromId(id) {
          for (var i = 0; i < stationResults.length; i++)
            if (stationResults[i].id === id) return stationResults[i];
          return null;
        }

        /**
         * Run a search and put the answer on screen.
         *
         * Every failure mode here has been observed in the wild rather than
         * imagined, and each is reported instead of shown as "no stations":
         * a mirror answering 200 with zero rows, a non-JSON rate-limit page, a
         * cache older than a week, and a quota that refused the write.
         */
function runStationSearch(lat, lng) {
          /* A monotonically increasing token. Two searches in flight resolve in
             arbitrary order, so without this the slower one can land last and
             overwrite the newer answer - showing stations for the place the
             user has already navigated away from. */
          var mine = ++stationToken;
          setStationStatus(TXT("st.searching"));
          StationData.findStations({ lat: lat, lng: lng }, STATION_RADIUS_M, {
            onCache: function (at, stale, total) {
              if (stale && mine === stationToken)
                setStationStatus(TXT("st.cacheStale", { n: total }));
            },
            onAttempt: function (info) {
              stationEvent(info.which, {
                endpoint: info.endpoint,
                ok: info.ok,
                elements: info.elements,
                error: info.error,
              });
            },
          })
            .then(function (res) {
              if (mine !== stationToken) return;
              /* Both lists are replaced, not appended to: a second search from a
                 different place must not leave the old results behind. */
              stationAll = res.rows;
              stationResults = res.rows.slice(0, STATION_NEAREST);
              stationCentre = { lat: lat, lng: lng };
              var box = $("stationMapBox");
              if (box) box.hidden = false;
              var list = $("stationList");
              if (!stationResults.length) {
                /* The fix note matters MORE here than on a successful search.
                   "No stations within 10 km" from a fix that was 400 m out is
                   indistinguishable from a street with no chargers, and that is
                   exactly the moment the user needs to know which it was. */
                setStationStatus(
                  fixNote(
                    TXT("st.noneNear", { n: STATION_RADIUS_M / 1000 }),
                    "st.noneRough",
                    stationFixM,
                  ),
                );
                if (list) list.innerHTML = "";
                var more = $("stationMore");
                if (more) more.hidden = true;
                /* The previous search's pins are still on the map. Leaving them
                   there puts a confident green marker next to the words "no
                   stations", which is worse than an empty map. */
                drawStationPins([]);
                return;
              }
              /* The true total, not the five on screen. Saying "5 stations" when the search
                 found 84 would be a different lie from the one the map tells. */
              var n = stationAll.length;
              setStationStatus(
                fixNote(
                  TXT(res.cached ? "st.foundCached" : "st.found", {
                    n: n,
                    r: STATION_RADIUS_M / 1000,
                  }),
                  res.cached ? "st.foundRoughCached" : "st.foundRough",
                  stationFixM,
                ),
              );
              renderStations();
              loadLeaflet(function () {
                var slot = getMap("stationMap");
                if (!slot || !slot.map) return;
                try {
                  slot.map.setView([lat, lng], 13);
                  drawStationPins(stationSlice(stationResults));
                } catch (e) {}
              });
            })
            .catch(function (err) {
              if (mine !== stationToken) return;
              setStationStatus(
                TXT("st.lookupFailed", {
                  e: err && err.message ? err.message : "network",
                }),
              );
            });
        }

        function findStationsNearMe() {
          /* The button is disabled only for the duration of one fix, and re-enabled
           whatever the outcome. Leaving it disabled was a dead control: a
           second search from a different place was impossible, and the button
           stayed dead even after a failure the user could have retried. */
          var btn = $("stationFindBtn");
          if (btn) btn.disabled = true;
          var out = $("stationOut");
          if (out) out.innerHTML = "";
          if (!navigator.onLine) {
            setStationStatus(TXT("st.offline"));
            if (btn) btn.disabled = false;
            return;
          }
          if (!navigator.geolocation) {
            setStationStatus(TXT("st.geoUnavailable"));
            if (btn) btn.disabled = false;
            return;
          }
          setStationStatus(TXT("st.searching"));
          navigator.geolocation.getCurrentPosition(
            function (p) {
              /* Re-enabled before any early return below, so a refused fix
                 leaves the button usable. */
              if (btn) btn.disabled = false;
              /* No accuracy refusal here, unlike the automatic background fill.
                 The 50 m gate protects the pin written into a log entry; on this
                 screen nothing is written - "Use" pins the CHARGER's own
                 coordinates, not the device's. Refusing to show anything because
                 the fix was 180 m out is the unhelpful outcome: a charger 103 m
                 away was simply not listed, with no way to tell a missing
                 charger from a missing fix. The quality is reported instead. */
              stationFixM = isNum(p.coords.accuracy) ? p.coords.accuracy : null;
              runStationSearch(p.coords.latitude, p.coords.longitude);
            },
            function () {
              if (btn) btn.disabled = false;
              stationFixM = null;
              setStationStatus(TXT("st.geoFail", { n: "" }));
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 },
          );
        }

        /**
         * Open one station: its poles, and live status if it has any.
         *
         * Status is fetched here rather than with the station list because it is
         * 20,000 rows that changes by the minute; the list itself is public,
         * static and cached for days. The tariff list is fetched at the same
         * time, once, on the first open of any station.
         */
        function openStationDetail(id) {
          var s = stationFromId(id);
          if (!s) return;
          stationOpen = id;
          var box = $("stationDetail");
          if (!box) return;
          var poles = [];
            for (var i = 0; i < (s.poles || []).length; i++) {
              var p = s.poles[i];
              poles.push(
                "<li>" +
                  esc(p.plugs.join(", ") || TXT("st.poleUnknown")) +
                  (p.watts ? " · " + esc(StationData.powerText(p.watts)) : "") +
                  "</li>",
              );
            }
            /* The cached registry keeps every pole's id but only the first few
               poles' connector detail, so a site with two hundred of them would
               otherwise appear to have a dozen. Saying so is the difference
               between a truncated list and a wrong one. */
            var total = s.polesTotal || poles.length;
            if (total > poles.length)
              poles.push('<li class="station-meta">' + TXT("st.polesMore", { n: total - poles.length }) + "</li>");
            box.innerHTML =
              "<h3>" +
              esc(s.name || TXT("st.unnamed")) +
              "</h3>" +
              (s.operator ? '<p class="station-meta">' + esc(s.operator) + "</p>" : "") +
              (s.address ? '<p class="station-meta">' + esc(s.address) + "</p>" : "") +
              (poles.length
                ? "<h4>" +
                  TXT("st.polesTitle", { n: total }) +
                  '</h4><ul class="station-poles">' +
                  poles.join("") +
                  "</ul>"
                : "") +
'<p class="station-meta" id="stationLive"></p>' +
            '<button type="button" class="btn sm" data-station-cameras="' +
            esc(s.id) +
            '">' +
            TXT("cam.nearStation") +
            "</button>" +
            '<div class="camera-grid" id="stationCameras"></div>' +
            '<button type="button" class="btn sm" data-station-close="1">' +
            TXT("confirm.close") +
            "</button>";
          box.hidden = false;
          /* OpenStreetMap rows have no evse ids, so there is nothing to ask
             about; saying so plainly beats a spinner that never stops. */
          if (s.source !== "digitraffic") {
            var live = $("stationLive");
            if (live) live.textContent = TXT("st.noLive");
            return;
          }
          var live2 = $("stationLive");
          if (live2) live2.textContent = TXT("st.liveLoading");
          StationData.loadStatuses()
            .then(function (map) {
              /* Every id on site, not just the ones whose connector detail was
                 kept in the cache. A count drawn from a truncated list would
                 report "3 of 12 free" at a site with two hundred poles. */
              var ids = s.evseIds && s.evseIds.length ? s.evseIds : (s.poles || []).map(function (p) { return p.id; });
              var counts = {};
              var n = 0;
              for (var k = 0; k < ids.length; k++) {
                if (!ids[k] || !map[ids[k]]) continue;
                counts[map[ids[k]]] = (counts[map[ids[k]]] || 0) + 1;
                n++;
              }
              if (!n) {
                if (live2) live2.textContent = TXT("st.liveNone");
                return;
              }
              var free = counts.AVAILABLE || 0;
              if (live2) {
                live2.textContent = TXT("st.live", {
                  n: n,
                  a: free,
                  rest: TXT("st.liveRest", { c: statusWord(counts) }),
                });
              }
            })
            .catch(function () {
              if (live2) live2.textContent = TXT("st.liveFail");
            });
        }

        /** Cameras near one charger, for the detail panel. */
function camerasNearStation(id) {
          var s = stationFromId(id);
          if (!s) return;
          /* The box is looked up INSIDE the callback, not captured here.
             openStationDetail rebuilds #stationCameras every time it runs, so a
             box captured now can be detached by the time the response lands -
             and the reopened panel would sit empty with no error. */
          var mine = ++stationCameraToken;
          var target = $("stationCameras");
          if (target) target.innerHTML = '<p class="station-meta">' + TXT("cam.loading") + "</p>";
          StationData.findCameras({ lat: s.lat, lng: s.lng }, CAMERA_RADIUS_M)
            .then(function (rows) {
              var box = $("stationCameras");
              /* Discarded if the panel was closed, or reopened onto another
                 station, while the request was in flight. */
              if (mine !== stationCameraToken || stationOpen !== id || !box) return;
              if (!rows.length) {
                box.innerHTML = '<p class="station-meta">' + TXT("cam.none", { r: CAMERA_RADIUS_M / 1000 }) + "</p>";
                return;
              }
              var near = rows.slice(0, 3);
              var out = [];
              for (var i = 0; i < near.length; i++) {
                var c = near[i];
                out.push(
                  '<figure class="camera-card">' +
                    '<img src="' +
                    esc(c.thumb) +
                    '" alt="' +
                    esc(TXT("cam.alt", { v: c.name })) +
                    '" loading="lazy" decoding="async" width="320" height="180" />' +
                    "<figcaption>" +
                    '<span class="camera-name">' +
                    esc(c.name) +
                    "</span>" +
                    '<span class="station-meta">' +
                    Math.round(c.dist / 10) / 100 +
                    " km · " +
                    esc(cameraAge(c.updated)) +
                    "</span></figcaption></figure>",
                );
              }
              box.innerHTML = out.join("");
            })
            .catch(function () {
              var box = $("stationCameras");
              if (mine !== stationCameraToken || !box) return;
              box.innerHTML = '<p class="station-meta">' + TXT("cam.failed", { e: "" }) + "</p>";
            });
        }

/** "AVAILABLE 2, CHARGING 1", in the UI language, with a fallback. */
function statusWord(counts) {
          var names = Object.keys(counts);
          var out = [];
          for (var i = 0; i < names.length; i++) {
            /* Digitraffic also emits OCCUPIED, REMOVED, NOAPPLICABLE and
               UNPLANNED. i18n.t falls through to printing the key itself for an
               unknown one, so the panel would literally read
               "st.status_occupied". Anything without a string is shown as-is. */
            var key = "st.status_" + names[i].toLowerCase();
            out.push(
              hasKey(key)
                ? TXT(key, { n: counts[names[i]] })
                : TXT("st.statusOther", { s: names[i], n: counts[names[i]] }),
            );
          }
          return out.join(", ");
        }

        /** Is a translation defined? Mirrors the fallback chain in i18n.t. */
function hasKey(key) {
          var I = window.EV_I18N;
          if (!I || !I.dict) return true;
          /* Deliberately not the name of an i18n private: app.js is checked for
             reaching into another module's internals, and the check reads
             comments as well as code. */
          var code = typeof I.currentLang === "function" ? I.currentLang() : I.currentLang;
          var pack = I.dict[code];
          /* English is the fallback, so a key defined only in fi still counts
             as translated. */
          if (pack && Object.prototype.hasOwnProperty.call(pack, key)) return true;
          var en = I.dict.en;
          return !!(en && Object.prototype.hasOwnProperty.call(en, key));
        }

        /**
   * Who logged a charge, for the log.
   *
   * Already stored: sessions.user_id is written on insert and deliberately
   * preserved through every later edit, because the database checks
   * can_edit_session against that column and letting an editor overwrite it
   * would lock them out of their own row. So authorship needed no schema work
   * and no backfill - only somewhere to show it.
   *
   * Three cases, because two of them are not the same thing:
   *   you              a row of your own on your own car
   *   a named member   somebody who still holds a share, so the name is known
   *   somebody else    everybody else, INCLUDING a member who has since left
   *                    and whose name we no longer have
   *
   * The last case is deliberately not blank and not a guessed name. On a shared
   * car the author is the difference between "we agreed to share this" and "who
   * actually paid", and inventing a name would be worse than admitting we do
   * not know. Returns "" for a car with one member, where authorship is
   * meaningless noise.
   *
   * @param {object} s     the session
   * @param {object} v     the vehicle it belongs to
   * @returns {string} markup, or "" when there is nothing worth saying
   */
  function authorOf(s, v) {
    if (!s || !v) return "";
    var mine = ownsVehicle(v.id);
    /* One member and they are me: every row says "by me". Say nothing. */
    if (mine && !shareCount(v.id)) return "";
    var who = s.userId;
    if (!who) return "";
    if (mine && who === ownerId())
      return '<span class="log-by">' + TXT("log.byYou") + "</span>";
    /* Our own id on somebody else's car - a car shared with us. */
    if (!mine && who === ownerId())
      return '<span class="log-by">' + TXT("log.byYou") + "</span>";
    var name = shareLabel(v.id, who);
    if (name && name !== String(who).slice(0, 8)) {
      return '<span class="log-by">' + esc(TXT("log.by", { n: name })) + "</span>";
    }
    /* The id is all that is left: a member who has left, since a share row
       that no longer exists takes its cached name with it. */
    return '<span class="log-by dim">' + esc(TXT("log.byUnknown")) + "</span>";
  }

  function closeStationDetail() {
          stationOpen = null;
          /* Any camera request for the panel that is closing is now moot, and
             would otherwise land in the next panel opened onto the same id. */
          stationCameraToken++;
          var box = $("stationDetail");
          if (box) {
            box.hidden = true;
            box.innerHTML = "";
          }
          renderStations();
        }

        /* ---------- road-weather cameras ----------
           Digitraffic publishes 813 cameras on Finnish roads. They are road
           CONDITION cameras, not enforcement cameras, and the screen says so -
           a driver who sees a camera icon and thinks of fines has been misled
           badly enough to matter.

           They are fetched fresh every time rather than cached. A cached road
           camera is a picture of last hour's rain presented as this one, which
           is worse than showing nothing, and the list is small enough (813
           rows) that caching would buy nothing. */
        var CAMERA_RADIUS_M = 50000;
        var CAMERA_NEAREST = 6;
        var cameraResults = [];
        var cameraCentre = null;

        function setCameraStatus(t) {
          var el = $("cameraStat");
          if (el) el.textContent = t;
        }

        /** How old a picture is, in the user's language. */
        function cameraAge(iso) {
          if (!iso) return TXT("cam.ageUnknown");
          var then = Date.parse(iso);
          if (!isFinite(then)) return TXT("cam.ageUnknown");
          var mins = Math.max(0, Math.round((Date.now() - then) / 60000));
          /* A road camera older than a day has usually stopped being collected;
             `collectionStatus` says so, but the timestamp is the honest check. */
          if (mins >= 1440) return TXT("cam.ageDays", { n: Math.round(mins / 1440) });
          if (mins >= 60) return TXT("cam.ageHours", { n: Math.round(mins / 60) });
          return TXT("cam.ageMinutes", { n: mins });
        }

        function renderCameras() {
          var box = $("cameraList");
          if (!box) return;
          if (!cameraResults.length) {
            box.innerHTML = "";
            return;
          }
          var out = [];
          for (var i = 0; i < cameraResults.length; i++) {
            var c = cameraResults[i];
            /* The full-size picture is opened on click rather than fetched
               eagerly: 813 of them at 264 KB is 215 MB, and a grid of them is a
               wall of images nobody looks at. The thumbnail is 16 KB. */
            out.push(
              '<figure class="camera-card">' +
                '<button type="button" class="camera-shot" data-camera-full="' +
                esc(c.id) +
                '" aria-label="' +
                esc(TXT("cam.open", { v: c.name })) +
                '">' +
                '<img src="' +
                esc(c.thumb) +
                '" alt="' +
                esc(TXT("cam.alt", { v: c.name })) +
                '" loading="lazy" decoding="async" width="320" height="180" />' +
                "</button>" +
                "<figcaption>" +
                '<span class="camera-name">' +
                esc(c.name) +
                "</span>" +
                '<span class="station-meta">' +
                Math.round(c.dist / 10) / 100 +
                " km · " +
                esc(cameraAge(c.updated)) +
                "</span></figcaption></figure>",
            );
          }
          box.innerHTML = out.join("");
        }

        function findCamerasNearMe() {
          if (!navigator.onLine) {
            setCameraStatus(TXT("st.offline"));
            return;
          }
          if (!navigator.geolocation) {
            setCameraStatus(TXT("st.geoUnavailable"));
            return;
          }
          /* A fresh fix every time, rather than the one the charger search used.

             The reuse was there to avoid a second permission prompt, and on the
             same screen minutes apart it is free. It is wrong once the user has
             moved: the station search ran at the car park and the camera search
             runs at the charger two streets away, and the cameras are then
             quietly reported for the wrong place. A 60-second maximumAge keeps
             the prompt cheap when nothing has changed, so this is usually not
             even a new prompt. */
          setCameraStatus(TXT("st.searching"));
          navigator.geolocation.getCurrentPosition(
            function (p) {
              /* Same reasoning as the charger search: nothing is written from
                 this screen, so a coarse fix is reported rather than refused. */
              cameraFixM = isNum(p.coords.accuracy) ? p.coords.accuracy : null;
              loadCameras(p.coords.latitude, p.coords.longitude);
            },
            function () {
              cameraFixM = null;
              /* Falling back to the charger search's position is still better
                 than failing outright: a stale centre shows nearby cameras,
                 labelled as such, where no centre shows none. */
              if (stationCentre) {
                cameraFixM = stationFixM;
                loadCameras(stationCentre.lat, stationCentre.lng);
                setCameraStatus(TXT("cam.usedStationFix"));
                return;
              }
              setCameraStatus(TXT("st.geoFail", { n: "" }));
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
          );
        }

        function loadCameras(lat, lng) {
          var mine = ++cameraToken;
          setCameraStatus(TXT("cam.loading"));
          StationData.findCameras({ lat: lat, lng: lng }, CAMERA_RADIUS_M)
            .then(function (rows) {
              if (mine !== cameraToken) return;
              cameraResults = rows.slice(0, CAMERA_NEAREST);
              cameraCentre = { lat: lat, lng: lng };
              var box = $("cameraList");
              if (!cameraResults.length) {
                setCameraStatus(TXT("cam.none", { r: CAMERA_RADIUS_M / 1000 }));
                if (box) box.innerHTML = "";
                /* Same reason as the station search: the previous centre's pins
                   would otherwise sit under "no cameras". */
                drawCameraPins([]);
                return;
              }
              setCameraStatus(
                fixNote(
                  TXT("cam.found", {
                    n: rows.length,
                    n2: cameraResults.length,
                    r: CAMERA_RADIUS_M / 1000,
                  }),
                  "cam.foundRough",
                  cameraFixM,
                ),
              );
              renderCameras();
              /* Only asked to reveal the map when there is something to put on
                 it, for the same reason the station search does. */
              var mapBox = $("stationMapBox");
              if (mapBox) mapBox.hidden = false;
              loadLeaflet(function () {
                var slot = getMap("stationMap");
                if (!slot || !slot.map) return;
                try {
                  slot.map.setView([lat, lng], 11);
                  drawCameraPins(cameraResults);
                } catch (e) {}
              });
            })
            .catch(function (err) {
              if (mine !== cameraToken) return;
              setCameraStatus(
                TXT("cam.failed", { e: err && err.message ? err.message : "network" }),
              );
            });
        }

        function drawCameraPins(list) {
          var slot = maps["stationMap"];
          if (!slot || !slot.map) return;
          if (slot.cameraPins) {
            for (var i = 0; i < slot.cameraPins.length; i++)
              slot.map.removeLayer(slot.cameraPins[i]);
          }
          slot.cameraPins = [];
          for (var k = 0; k < list.length; k++) {
            var c = list[k];
            /* A camera is a distinct thing from a charger, so it gets a
               different colour and a square rather than another green dot. */
            var m = L.circleMarker([c.lat, c.lng], {
              radius: 6,
              color: "#38bdf8",
              weight: 2,
              fillColor: "#38bdf8",
              fillOpacity: 0.6,
            });
            m.bindPopup(
              "<b>" +
                esc(c.name) +
                "</b><br>" +
                esc(cameraAge(c.updated)) +
                '<br><img src="' +
                esc(c.thumb) +
                '" alt="" width="220" />',
            );
            m.addTo(slot.map);
            slot.cameraPins.push(m);
          }
        }

        function useStation(id) {
          var s = stationFromId(id);
          if (!s) return;
          go("add-session");
          var input = $("location");
          if (input) input.value = s.name || TXT("st.unnamed");
          locGeo = { lat: s.lat, lng: s.lng, label: s.name || "" };
          var box = $("sessMapBox");
          if (box) box.hidden = false;
          loadLeaflet(function () {
            showPin("sessMap", s.lat, s.lng, s.name || "");
          });
          /* No price is invented. Digitraffic has real tariffs, but they are
             per-operator, change weekly, and a wrong one is worse than none:
             the existing ambiguity logic exists precisely to avoid this. */
          if (s.address) {
            var hint = $("favName");
            if (hint && !hint.value.trim()) hint.value = s.name || "";
          }
          setLocStatus(TXT("st.chosen", { v: s.name || TXT("st.unnamed") }));
        }
        /* ---------- routing ---------- */
        function go(id) {
          view = id;
          var views = document.querySelectorAll(".view");
          for (var i = 0; i < views.length; i++)
            views[i].classList.toggle("on", views[i].id === id);
          var btns = document.querySelectorAll(".side-nav button");
          for (var j = 0; j < btns.length; j++) {
            if (btns[j].getAttribute("data-go") === id)
              btns[j].setAttribute("aria-current", "page");
            else btns[j].removeAttribute("aria-current");
          }
          if (location.hash.slice(1) !== id)
            history.replaceState(null, "", "#" + id);
          render();
          /* Only fills an empty field, so re-entering the view is safe and the
             default appears without ever overwriting a typed location. */
          if (id === "add-session") applyLocationDefaults();
          /* Leaving the station view drops the remembered position. It was only
             ever there to avoid asking the user for a second fix in the same
             sitting, and holding it for the life of the page meant the camera
             button could never ask again - even from somewhere else. */
          if (id !== "stations") {
            stationCentre = null;
            cameraResults = [];
            var cl = $("cameraList");
            if (cl) cl.innerHTML = "";
            setCameraStatus("");
          }
          if (id === "favourites") {
            loadLeaflet(function () {
              if (maps["map"] && maps["map"].map)
                setTimeout(function () {
                  try {
                    maps["map"].map.invalidateSize();
                  } catch (e) {
                    /* the map may not be ready yet; Leaflet recovers on the next resize */
                  }
                }, 80);
            });
          }
          /* Same problem on the station map: Leaflet measures the element it is
             given, and a hidden one measures zero, so the map comes up blank with
             no error. Only drawn when there are already results - the box itself
             stays hidden until a search produces some. */
          if (id === "stations" && stationResults.length) {
            loadLeaflet(function () {
              var slot = maps["stationMap"];
              if (!slot || !slot.map) return;
              setTimeout(function () {
                try {
                  slot.map.invalidateSize();
                  drawStationPins(stationResults);
                } catch (e) {}
              }, 80);
            });
          }
          window.scrollTo(0, 0);
        }

        /* ---------- actions ---------- */
        /**
         * Delete a vehicle and every session that belongs to it.
         * Split out of removeVehicle so the confirmation and the action are
         * separate steps and the action can be reused.
         * @param {string} id  vehicle id
         */
        /* ---------- the bin ---------- */
        function binStamp() {
          return new Date().toISOString();
        }
        /**
         * Move a vehicle and all of its sessions to the bin.
         * The timestamp is what the database stores, so the row stays
         * restorable on this device and on every other one.
         * @param {string} id
         */
        function doRemoveVehicle(id) {
          var v = vehById(id);
          if (!v) return;
          var gone = sessions.filter(function (s) {
            return s.vehicleId === id;
          });
          var at = binStamp();
          vehicles = vehicles.filter(function (x) {
            return x.id !== id;
          });
          sessions = sessions.filter(function (s) {
            return s.vehicleId !== id;
          });
          v.deletedAt = at;
          gone.forEach(function (s) {
            s.deletedAt = at;
          });
          binned.vehicles.push(v);
          binned.sessions = binned.sessions.concat(gone);
          if (cur >= vehicles.length) cur = vehicles.length - 1;
          save();
          render();
          toast(TXT("toast.vehBinned", { v: v.name }));
          /* An UPDATE, not a delete, so the cloud copy learns about it too. The
             dirty queue replays it if the device is offline. */
          for (var i = 0; i < gone.length; i++) {
            markDirty("sessions", gone[i].id);
            syncSession(gone[i]);
          }
          markDirty("vehicles", id);
          syncVehicle(v);
        }
        /** Bin one stored session. Called after the user confirms. */
        function doDeleteSession(id) {
          var s = null;
          for (var i = 0; i < sessions.length; i++)
            if (sessions[i].id === id) s = sessions[i];
          if (!s) return;
          sessions = sessions.filter(function (x) {
            return x.id !== id;
          });
          s.deletedAt = binStamp();
          binned.sessions.push(s);
          save();
          render();
          toast(TXT("toast.deleted"));
          markDirty("sessions", id);
          syncSession(s);
        }
        /**
         * Put one binned session back. Its original position in the history is
         * preserved because the row is never rebuilt, only moved.
         * @param {string} id
         */
function restoreSession(id) {
            var s = null;
            for (var i = 0; i < binned.sessions.length; i++)
              if (binned.sessions[i].id === id) s = binned.sessions[i];
if (!s) return;
              /* A restore is a real UPDATE, so it is refused by the same rules
                 as the delete that put the row in the bin. Ungated, this handed
                 every signed-in account a way to un-delete other people's
                 sessions. */
              if (!canEditSession(s)) {
                toast(TXT("toast.noPermission"));
                return;
              }
                /* The LIVE array only. sessionAnywhere() spans live AND bin, and
                 the row being restored is still in the bin at this point, so it
                 found the row itself: the guard was always true, the row was
                 removed from the bin, the restore branch below was dead code,
                 and Restore did nothing but delete the entry and re-import it on
                 the next pull. The test used is whether the id is already LIVE,
                 which is what "would duplicate" actually means. */
              var alreadyLive = false;
              for (var li = 0; li < sessions.length; li++)
                if (sessions[li].id === id) alreadyLive = true;
              if (alreadyLive) {
                binned.sessions = binned.sessions.filter(function (x) {
                  return x.id !== id;
                });
                forgetGoneRow("sessions", id);
                save();
                render();
                return;
              }
            binned.sessions = binned.sessions.filter(function (x) {
              return x.id !== id;
            });
            s.deletedAt = null;
            sessions.push(s);
          save();
          render();
          toast(TXT("toast.restored"));
          markDirty("sessions", id);
          syncSession(s);
        }
        /** Put one binned vehicle, and everything binned with it, back. */
        function restoreVehicle(id) {
          var v = null;
          for (var i = 0; i < binned.vehicles.length; i++)
            if (binned.vehicles[i].id === id) v = binned.vehicles[i];
if (!v) return;
            if (!mayWriteVehicle(id)) {
              toast(TXT("toast.noPermission"));
              return;
            }
            var back = [];
          var still = [];
          for (var j = 0; j < binned.sessions.length; j++) {
            if (binned.sessions[j].vehicleId === id) back.push(binned.sessions[j]);
            else still.push(binned.sessions[j]);
          }
          binned.vehicles = binned.vehicles.filter(function (x) {
            return x.id !== id;
          });
binned.sessions = still;
            /* Idempotent, for the same reason as restoreSession. A backup taken
               before the delete can leave the id live while its binned copy
               remains, and restoring again pushed a duplicate. */
            if (!vehById(id)) {
              v.deletedAt = null;
              vehicles.push(v);
            }
            for (var k = 0; k < back.length; k++) {
              if (sessionAnywhere(back[k].id)) {
                forgetGoneRow("sessions", back[k].id);
                continue;
              }
              back[k].deletedAt = null;
              sessions.push(back[k]);
              markDirty("sessions", back[k].id);
              syncSession(back[k]);
            }
          save();
          render();
          toast(TXT("toast.restored"));
          markDirty("vehicles", id);
          syncVehicle(v);
        }
        /** Remove one favourite location. Called after the user confirms. */
        function doDeleteFav(id) {
          var f = null;
          for (var i = 0; i < favs.length; i++) if (favs[i].id === id) f = favs[i];
          if (!f) return;
          favs = favs.filter(function (x) {
            return x.id !== id;
          });
          if (editFav === id) clearFavForm();
          saveFavs();
            render();
            toast(TXT("toast.delFav"));
        }
        /** Move every session to the bin, keeping vehicles and favourites. Reversible:
            the confirmation says so and the bin lists everything it took. */
function doClearSessions() {
            /* This and the wipe below were reachable by ANY signed-in account and
               touched EVERY row, including other people's sessions on vehicles
               shared with this user. A viewer or a driver - who cannot delete a
               single charge they did not write - could empty a shared car's whole
               history with one button. The bin then keeps those rows binned even
               though the server still has them live, so the history was gone from
               the device permanently and the refusals arrived as P0001, which is
               classified "waiting for the owner to approve" - held silently, with
               no banner and no way to undo. Refuse instead of binning. */
            var notMine = [];
            for (var ci = 0; ci < sessions.length; ci++)
              if (!canEditSession(sessions[ci])) notMine.push(sessions[ci]);
            if (notMine.length) {
              toast(TXT("toast.notAllYours", { n: notMine.length }));
              return;
            }
            var at = binStamp();
            var gone = sessions.slice();
            sessions = [];
            for (var i = 0; i < gone.length; i++) {
              gone[i].deletedAt = at;
              binned.sessions.push(gone[i]);
              markDirty("sessions", gone[i].id);
              syncSession(gone[i]);
            }
            save();
            render();
            toast(TXT("toast.cleared"));
          }
        /** Move everything to the bin and start again with a fresh baseline.
            Still recoverable: the bin keeps every row, and emptying it is the
            only step that cannot be undone. */
function doWipe() {
            /* Same gate as doClearSessions, plus the vehicles themselves. Binning
               a vehicle shared with someone else issues an UPDATE they will
               refuse, which strands their shared car in this account's Bin,
               restorable only by another refused write and purgeable only by a
               refused DELETE. */
            var wSess = [];
            for (var wi = 0; wi < sessions.length; wi++)
              if (!canEditSession(sessions[wi])) wSess.push(sessions[wi]);
            var wVeh = [];
            for (var wj = 0; wj < vehicles.length; wj++)
              if (!mayWriteVehicle(vehicles[wj].id)) wVeh.push(vehicles[wj]);
            if (wSess.length || wVeh.length) {
              toast(TXT("toast.notAllYours", { n: wSess.length + wVeh.length }));
              return;
            }
            var at = binStamp();
          var goneV = vehicles.slice();
          var goneS = sessions.slice();
          var goneF = favs.slice();
          var i;
          for (i = 0; i < goneS.length; i++) {
            goneS[i].deletedAt = at;
            binned.sessions.push(goneS[i]);
            markDirty("sessions", goneS[i].id);
            syncSession(goneS[i]);
          }
          for (i = 0; i < goneV.length; i++) {
            goneV[i].deletedAt = at;
            binned.vehicles.push(goneV[i]);
            markDirty("vehicles", goneV[i].id);
            syncVehicle(goneV[i]);
          }
          for (i = 0; i < goneF.length; i++) {
            goneF[i].deletedAt = at;
            binned.favs.push(goneF[i]);
          }
          vehicles = [
            {
              id: uuid(),
              name: TXT("veh.default"),
              icon: "🚗",
              initialOdometer: 0,
              capacity: null,
              userId: ownerId() || null,
            },
          ];
          sessions = [];
          favs = [];
          cur = 0;
          clearFavForm();
          save();
          saveFavs();
          render();
          toast(TXT("toast.wiped"));
          syncVehicle(vehicles[0]);
        }
        /** Move one favourite location to the bin, where it can be restored. */
        function binFav(id) {
          var f = null;
          for (var i = 0; i < favs.length; i++) if (favs[i].id === id) f = favs[i];
          if (!f) return;
          favs = favs.filter(function (x) {
            return x.id !== id;
          });
          if (editFav === id) clearFavForm();
          f.deletedAt = binStamp();
          binned.favs.push(f);
          saveFavs();
            render();
            toast(TXT("toast.favBinned"));
        }
        function restoreFav(id) {
          var f = null;
          for (var i = 0; i < binned.favs.length; i++)
            if (binned.favs[i].id === id) f = binned.favs[i];
          if (!f) return;
          binned.favs = binned.favs.filter(function (x) {
            return x.id !== id;
          });
          f.deletedAt = null;
          favs.push(f);
          saveFavs();
          renderFavs();
          toast(TXT("toast.restored"));
        }
        /**
         * Empty the bin for good. This is the only genuinely irreversible action
         * left in the app, and it says so.
         */
function emptyBin() {
            var n = binCount();
            if (!n) return Promise.resolve(false);
            /* These are permanent server DELETEs, and the bin can hold rows the
               current account was never allowed to write - anything that reached
               the bin through one of the ungated bulk actions above. Purging
               someone else's charge for good is not recoverable by anyone. */
            var notMine = 0;
            for (var ei = 0; ei < binned.vehicles.length; ei++)
              /* A detached row is not the server's to delete and cannot fail, so
                 counting it would block emptying the bin for no reason. */
              if (!binned.vehicles[ei].detached && !mayWriteVehicle(binned.vehicles[ei].id)) notMine++;
            for (var ej = 0; ej < binned.sessions.length; ej++)
              if (!binned.sessions[ej].detached && !canEditSession(binned.sessions[ej])) notMine++;
            if (notMine) {
              toast(TXT("toast.notAllYours", { n: notMine }));
              return Promise.resolve(false);
            }
            return askConfirm(TXT("toast.emptyBinQ", { n: n }), {
            heading: "confirm.emptyBin",
            ok: "confirm.deleteForever",
            irreversible: "confirm.irreversibleEmptyBin",
          }).then(function (yes) {
            if (!yes) return false;
            var goneVeh = binned.vehicles.slice();
            var goneSes = binned.sessions.slice();
            binned = { vehicles: [], sessions: [], favs: [] };
            save();
            saveFavs();
            render();
            toast(TXT("toast.binEmptied"));
/* Only now are these real deletes. The bookkeeping is cleared first, for the
                 same reason as in binPurge: a refused row that is then deleted
                 for good kept a stalled entry, so the sync panel kept reporting
                 a refusal for a row that existed nowhere and offered a Discard
                 button that did nothing. */
              for (var i = 0; i < goneSes.length; i++) {
                forgetGoneRow("sessions", goneSes[i].id);
                if (!goneSes[i].detached) syncDelete("sessions", goneSes[i].id);
              }
              for (var j = 0; j < goneVeh.length; j++) {
                forgetGoneRow("vehicles", goneVeh[j].id);
                if (!goneVeh[j].detached) syncDelete("vehicles", goneVeh[j].id);
              }
              return true;
          });
        }
        function addVehicle() {
          var name = $("vName").value.trim();
          if (!name) {
            toast(TXT("toast.vehName"));
            $("vName").focus();
            return;
          }
          var odo =
            $("vOdo").value === "" ? 0 : Math.max(0, num($("vOdo").value));
          var v = {
            id: uuid(),
            name: name,
            icon: "🚗",
            initialOdometer: odo,
            capacity: null,
            /* Record the owner locally straight away. Without it the sharing
               controls stay hidden on a brand new car until the server sends
               the row back, which leaves the Share button mysteriously absent
               for anyone creating their first vehicle. */
            userId: ownerId() || null,
          };
          vehicles.push(v);
          $("vName").value = "";
          $("vOdo").value = "";
          save();
          go("dashboard");
          toast(TXT("toast.vehAdd", { v: name }));
          syncVehicle(v);
        }
        /**
 * * Leave a car that was shared with you, or withdraw a request for one.
 *
 * * There was no way out at all before. The share panel returns early for
 * * anyone who is not the owner - it prints "you're not the owner" and stops -
 * * so a member who changed their mind had no button to press, and the
 * * database would have refused the row even if there had been one: the
 * * delete policy on vehicle_shares allowed only the vehicle's owner.
 *
 * * All three states are handled, because "remove this from my list" means
 * * something different in each:
 * *   accepted  you are a member and want to go
 * *   pending   you asked and want to withdraw the ask
 * *   rejected  you want the row cleared so the owner can invite you afresh
 *
 * * The car and its sessions are binned on THIS DEVICE ONLY, and marked
 * * `detached`. Nothing is pushed. That is deliberate:
 * *   - you have no right to write to that car's rows any more, so pushing
 * *     would produce a 42501 in the sync panel and stay there;
 * *   - a local-only binned row is not re-pushed by the next pull, because the
 * *     pull only re-pushes rows in the LIVE arrays;
 * *   - purging one later skips the server, so the bin can always be emptied.
 * *
 * * The sessions stay readable in the bin until then. The server will not
 * * serve them again, so that is a local copy and not a backup - the
 * * confirmation says so in as many words.
 *
 * * @returns {Promise<boolean>}
 */
function leaveShare(vehicleId) {
          var v = vehById(vehicleId);
          if (!v) return Promise.resolve(false);
          var share = myShare(vehicleId);
          if (!share || ownsVehicle(vehicleId)) return Promise.resolve(false);
          var pending = share.status === "pending";
          var n = ofVehicle(vehicleId).length;
          return askConfirm(
            TXT(pending ? "toast.leavePendingQ" : "toast.leaveQ", {
              v: v.name,
              n: n,
            }),
            {
              heading: pending ? "confirm.cancelRequest" : "confirm.leaveCar",
              ok: pending ? "confirm.cancelRequest" : "confirm.leaveCar",
              irreversible: pending
                ? ""
                : "confirm.irreversibleLeave",
            },
          ).then(function (yes) {
            if (!yes) return false;
            /* The server copy is removed FIRST. If that fails we have changed
               nothing locally, so the device still agrees with the server and
               the user can try again or ask for help. Doing it the other way
               round would bin the car and then fail, leaving a car that is gone
               locally but still shared. */
            return shareRemoveSelf(vehicleId).then(function (res) {
              if (!res.ok) {
                /* Three different messages, because they need three different
                   actions. A 42501 means migration 10 has not been run, and
                   telling somebody to check their connection would send them
                   looking in entirely the wrong place. */
                toast(
                  TXT(
                    res.rls
                      ? "toast.leaveNeedsSql"
                      : res.code === "offline" || res.code === "network"
                        ? "toast.leaveOffline"
                        : res.code === "signedout"
                          ? "toast.leaveSignedOut"
                          : "toast.leaveBlocked",
                  ),
                );
                return false;
              }
              detachVehicle(vehicleId);
              /* Forget the share so the card stops offering to leave, and so a
                 later pull cannot put the vehicle straight back. */
              delete shares[vehicleId];
              if (shareNames[vehicleId]) delete shareNames[vehicleId][share.user_id];
              saveShareNames();
              save();
              render();
              toast(TXT(pending ? "toast.requestCancelled" : "toast.leftCar", {
                v: v.name,
                n: n,
              }));
              return true;
            });
          });
        }

        /**
 * * Move a car and its sessions to this device's bin without telling anyone.
 *
 * * Deliberately NOT doRemoveVehicle: that marks every row dirty and pushes it,
 * * which is right for an owner deleting their own car and exactly wrong here.
 */
function detachVehicle(id) {
          var v = vehById(id);
          if (!v) return;
          var gone = sessions.filter(function (s) {
            return s.vehicleId === id;
          });
          var at = binStamp();
          vehicles = vehicles.filter(function (x) {
            return x.id !== id;
          });
          sessions = sessions.filter(function (s) {
            return s.vehicleId !== id;
          });
          v.deletedAt = at;
          v.detached = true;
          gone.forEach(function (s) {
            s.deletedAt = at;
            s.detached = true;
          });
          binned.vehicles.push(v);
          binned.sessions = binned.sessions.concat(gone);
          if (cur >= vehicles.length) cur = vehicles.length - 1;
          /* No markDirty, no syncVehicle, no syncSession. Nothing about this
             row concerns the server any more. */
        }

        /**
         * Delete the signed-in user's own share row, reporting WHY it failed.
         *
         * shareRemove collapses every failure to `false`, which is right for
         * the owner's "remove this member" button. It is wrong here: the most
         * likely failure is the database refusing because migration 10 has not
         * been run, and a generic "could not leave" would send the user looking
         * for the problem in the app. 42501 is a row-level-security refusal,
         * which for this statement has exactly one cause.
         *
         * @returns {Promise<{ok: boolean, code: string, rls: boolean}>}
         */
        function shareRemoveSelf(vehicleId) {
          if (!syncOn() || !vehicleId) {
            return Promise.resolve({ ok: false, code: "offline", rls: false });
          }
          /* authUser, not uid(): `uid()` mints a random id for local rows and would
             delete somebody else's share - or none at all. */
          var who = authUser && authUser.id;
          if (!who) return Promise.resolve({ ok: false, code: "signedout", rls: false });
          return authClient
            .from("vehicle_shares")
            .delete()
            .eq("vehicle_id", vehicleId)
            .eq("user_id", who)
            .then(function (res) {
              var err = res && res.error;
              if (err) {
                return {
                  ok: false,
                  code: err.code || err.error_code || "",
                  rls: (err.code || err.error_code) === "42501",
                };
              }
              return { ok: true, code: "", rls: false };
            })
            .catch(function () {
              return { ok: false, code: "network", rls: false };
            });
        }

        function removeVehicle(id) {
          var v = vehById(id);
          if (!v) return;
          /* Deleting the vehicle is owner-only, matching the delete policy. An
             admin can clear the history but not remove the car itself. */
          if (!ownsVehicle(id)) {
            toast(TXT("toast.noPermission"));
            return;
          }
          return askConfirm(
            TXT("toast.remQ", { v: v.name, n: ofVehicle(id).length }),
            {
              heading: "confirm.removeVehicle",
              ok: "confirm.toBin",
              irreversible: "confirm.irreversibleVehicle",
            },
          ).then(function (yes) {
            if (!yes) return false;
            doRemoveVehicle(id);
            return true;
          });
        }
        /* ---------- usable battery capacity ----------
           Gross and usable are entered in one place and only the usable figure is
           kept. 95% is a middle-of-the-road guess - real ratios run from about
           90% (e-NV200) to 95% (BMW i4) - which is why the derived box is
           editable rather than read-only: anyone who knows their real figure, or
           an OBD2 reading, corrects it once and never sees the guess again. */
        var CAP_GROSS_FACTOR = 0.95;

        function capMode() {
          var n = $("vfCapNetMode");
          return n && n.checked ? "net" : "gross";
        }

        /** Re-derive the usable box from the gross one, and explain. */
        function capDerive() {
          var g = $("vfGross"),
            u = $("vfUsable"),
            hint = $("vfCapHint");
          if (!g || !u) return;
          var gross = num(g.value);
          if (capMode() === "gross" && gross > 0) {
            u.value = (gross * CAP_GROSS_FACTOR).toFixed(2);
          }
          if (!hint) return;
          var usable = num(u.value);
          if (capMode() === "net") {
            hint.textContent = usable > 0 ? TXT("set.capHintNet", { n: usable }) : "";
            return;
          }
          hint.textContent =
            usable > 0
              ? TXT("set.capHintGross", { n: usable })
              : TXT("set.capHintNone");
        }

        /** Store only the usable figure; the mode is deliberately not kept. */
        function capRead() {
          var u = $("vfUsable");
          if (!u || u.value === "") return null;
          var n = num(u.value);
          /* Negative or absurd values are dropped rather than stored. A capacity
             is not a hard limit, so there is no database constraint to lean on;
             the editor is the only place it can be entered. */
          if (!(n > 0) || n > 500) return null;
          return Math.round(n * 100) / 100;
        }

        /**
 * The consumption tiles.
 *
 * Two independent measurements, and they are not interchangeable:
 *
 *   from the battery     SoC difference between consecutive charges. Immune to
 *                        how often you charge, because it measures the pack.
 *   from charging        Charged kWh over the odometer delta. Needs the vehicle
 *                        to have no initial odometer set before every charge
 *                        has a distance behind it.
 *
 * The battery figure wins where it exists. Where both exist and disagree by
 * more than DIVERGE_PCT, BOTH are shown: a gap that size usually means a
 * charge was missed or a reading is wrong, and that is worth seeing rather
 * than resolving silently in favour of one method.
 *
 * Cost per 100 km uses the charging method only. Money cannot be read off a
 * battery percentage, and attributing a charge's cost to a drive the battery
 * method measured would be inventing a link. It is on the leg basis rather than
 * the raw total, because the newest charge's money belongs to kilometres that
 * have not been driven yet - exactly the error that made the kWh figure wrong.
 *
 * @param {Array} sel  sessions for this vehicle
 * @param {Object} v   the vehicle
 */
        function renderConsumption(sel, v) {
          var DIVERGE_PCT = 0.15;
          var eff = $("sEff"),
            effNote = $("sEffNote"),
            cost100 = $("sCost100"),
            costNote = $("sCost100Note");
          var legs = legStats(sel, v.initialOdometer);
          var soc = socLegStats(sel, v.capacity);
          var byCharge = legs.km > 0 ? (legs.kwh / legs.km) * 100 : null;
          var bySoc = soc.km > 0 ? (soc.kwh / soc.km) * 100 : null;

          var main = bySoc !== null ? bySoc : byCharge;
          if (eff) eff.textContent = main === null ? "—" : main.toFixed(1);

          if (effNote) {
            var parts = [];
            if (bySoc !== null)
              parts.push(TXT("tile.fromBattery", { n: soc.legs }));
            if (byCharge !== null) {
              parts.push(
                TXT("tile.fromCharging", {
                  n: legs.legs,
                  v: byCharge.toFixed(1),
                }),
              );
            }
            /* Divergence is worth a word of its own: it is usually a data
               problem, and a data problem the user can fix. */
            var apart =
              bySoc !== null &&
              byCharge !== null &&
              Math.abs(bySoc - byCharge) / Math.max(bySoc, byCharge) > DIVERGE_PCT;
            if (apart) parts.push(TXT("tile.disagree"));
            if (!parts.length && legs.unattributed > 0)
              parts.push(
                TXT("tile.noLegs", { n: Math.round(legs.unattributed) }),
              );
            effNote.textContent = parts.join(" · ");
          }

          if (cost100) {
            cost100.textContent =
              legs.km > 0 ? fmtMoney((legs.cost / legs.km) * 100) : "—";
          }
          if (costNote) {
            costNote.textContent =
              legs.km > 0
                ? TXT("tile.costLegs", { n: legs.legs })
                : "";
          }
        }

        function openVeh(id) {
          var v = vehById(id);
          if (!v) return;
          if (!canEditVehicle(id)) {
            toast(TXT("toast.noPermission"));
            return;
          }
          editVehId = id;
          lastFocus = document.activeElement;
          $("vfName").value = v.name || "";
          $("vfOdo").value = soc0(v.initialOdometer);
          /* Opened in gross mode with the gross box blank, because only the
             usable figure was ever stored and inventing a gross figure for it
             would put a number in the user's hand that they did not type. The
             usable box shows what is actually stored; typing a gross figure
             overwrites it. */
          $("vfGross").value = "";
          $("vfUsable").value = isNum(v.capacity) ? String(v.capacity) : "";
          var gm = $("vfCapGrossMode");
          if (gm) gm.checked = true;
          capDerive();
          $("vehSheet").classList.add("on");
          lockBackground(true);
          $("vfName").focus();
        }
        function closeVeh() {
          if (!$("vehSheet").classList.contains("on")) return;
          $("vehSheet").classList.remove("on");
          lockBackground(false);
          editVehId = null;
          restoreFocus();
        }
        function saveVeh(e) {
          if (e) e.preventDefault();
          var v = vehById(editVehId);
          if (!v) {
            closeVeh();
            return;
          }
          var n = $("vfName").value.trim();
          if (!n) {
            toast(TXT("toast.vehName"));
            $("vfName").focus();
            return;
          }
          v.name = n;
          v.initialOdometer =
            $("vfOdo").value === "" ? 0 : Math.max(0, num($("vfOdo").value));
          v.capacity = capRead();
          /* Renaming the placeholder makes it real. Without this, syncPull still
             treats the row as a guess and discards it on the next pull, which is
             how renaming the default vehicle appeared to work for a moment and
             then made it vanish. */
          v.provisional = false;
          save();
          closeVeh();
          render();
          syncVehicle(v);
        }
        /* odometer values are whole kilometres; -1 means "not recorded yet" */
        function soc0(v) {
          return isNum(v) && v > 0 ? String(v) : "";
        }
        function delSession(id) {
          var s = sessions.filter(function (x) {
            return x.id === id;
          })[0];
          if (!s) return;
          if (!canEditSession(s)) {
            toast(TXT("toast.noPermission"));
            return;
          }
          return askConfirm(TXT("toast.delQ", { loc: s.location }), {
            heading: "confirm.deleteSession",
            ok: "confirm.toBin",
            irreversible: "confirm.irreversibleSession",
          }).then(function (yes) {
            if (!yes) return false;
            doDeleteSession(id);
            return true;
          });
        }
        function download(name, text, type) {
          var b = new Blob([text], { type: type }),
            u = URL.createObjectURL(b);
          var a = document.createElement("a");
          a.href = u;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          setTimeout(function () {
            URL.revokeObjectURL(u);
            a.remove();
          }, 0);
        }
        function scopeList() {
          var s = $("scope").value;
          return s === "all" ? sessions.slice() : ofVehicle(s);
        }
        function toCSV(list) {
          var head = [
            "Date",
            "Time",
            "Duration",
            "Vehicle",
            "Location",
            "Energy (kWh)",
            "Start SoC (%)",
            "End SoC (%)",
            "Mileage (km)",
            "Cost (EUR)",
            "Cost basis",
            "Fast",
            "Home",
            "Favourite",
            "Notes",
          ];
          var q = function (v) {
            v = v == null ? "" : String(v);
            return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
          };
          var rows = list.map(function (s) {
            var v = (vehById(s.vehicleId) || {}).name || "";
            var a = soc(s.socStart),
              b = soc(s.socEnd);
            return [
              s.date,
              fmtTime(s.time),
              hoursToHM(s.hours),
              v,
              s.location,
              num(s.energy).toFixed(2),
              a === null ? "" : a,
              b === null ? "" : b,
              num(s.mileage).toFixed(1),
              costOf(s).toFixed(2),
              hasCost(s)
                ? "entered"
                : /* "At your price", matching the log tag. This was
                     "estimated at X EUR/kWh", which called a multiplication of
                     the user's own kWh by their own saved price an estimate -
                     the number is exactly right for the price in force, and the
                     column already says which price. */
                  "at your price (" + price.toFixed(2) + " EUR/kWh)",
              s.fast ? "yes" : "no",
              s.home ? "yes" : "no",
              s.fav ? "yes" : "no",
              s.notes || "",
            ]
              .map(q)
              .join(",");
          });
          return head.join(",") + "\n" + rows.join("\n");
        }

        /* ---------- events ---------- */
        document.addEventListener("click", function (e) {
          var t = e.target.closest(
            "[data-go],[data-v],[data-del],[data-edit],[data-ren],[data-rm],[data-use],[data-fedit],[data-fdel],[data-share],[data-leave],[data-unshare],[data-accept],[data-reject],[data-bin-restore],[data-bin-purge],[data-discard],[data-station-use],[data-station-detail],[data-station-close],[data-station-cameras],[data-camera-find],[data-camera-full],[data-station-find]",
          );
          if (!t) return;
          if (t.hasAttribute("data-go")) {
            go(t.getAttribute("data-go"));
            return;
          }
          if (t.hasAttribute("data-v")) {
            for (var i = 0; i < vehicles.length; i++)
              if (vehicles[i].id === t.getAttribute("data-v")) {
                cur = i;
                break;
              }
            save();
            render();
            return;
          }
          if (t.hasAttribute("data-edit")) {
            openEdit(t.getAttribute("data-edit"));
            return;
          }
          if (t.hasAttribute("data-use")) {
            useFav(t.getAttribute("data-use"));
            return;
          }
          if (t.hasAttribute("data-fedit")) {
            editFavById(t.getAttribute("data-fedit"));
            return;
          }
          if (t.hasAttribute("data-fdel")) {
            binFav(t.getAttribute("data-fdel"));
            return;
          }
          if (t.hasAttribute("data-del")) {
            delSession(t.getAttribute("data-del"));
            return;
          }
          if (t.hasAttribute("data-ren")) {
            openVeh(t.getAttribute("data-ren"));
            return;
          }
          if (t.hasAttribute("data-rm")) {
            removeVehicle(t.getAttribute("data-rm"));
            return;
          }
          if (t.hasAttribute("data-share")) {
            openShare(t.getAttribute("data-share"));
            return;
          }
          if (t.hasAttribute("data-leave")) {
            leaveShare(t.getAttribute("data-leave"));
            return;
          }
          /* A nearby charger suggestion. The button carries its own position,
             so the name can never drift out of step with the pin. */
          if (t.classList.contains("loc-near-row")) {
            useNearbyPlace(
              t.getAttribute("data-near-lat"),
              t.getAttribute("data-near-lng"),
              t.getAttribute("data-near-name"),
            );
            return;
          }
          if (t.hasAttribute("data-unshare")) {
            unshare(t.getAttribute("data-unshare"));
            return;
          }
          if (t.hasAttribute("data-accept")) {
            decideShare(t.getAttribute("data-accept"), "accepted");
            return;
          }
          if (t.hasAttribute("data-reject")) {
            decideShare(t.getAttribute("data-reject"), "rejected");
            return;
          }
          /* "kind:id" in one attribute, because the bin is rebuilt from scratch
             on every render and cannot keep per-element handlers. */
          if (t.hasAttribute("data-bin-restore")) {
            var br = (t.getAttribute("data-bin-restore") || "").split(":");
            if (br[0] && br[1]) binRestore(br[0], br[1]);
            return;
          }
          if (t.hasAttribute("data-bin-purge")) {
            var bp = (t.getAttribute("data-bin-purge") || "").split(":");
            if (bp[0] && bp[1]) binPurge(bp[0], bp[1]);
            return;
          }
          if (t.hasAttribute("data-discard")) {
            var dc = (t.getAttribute("data-discard") || "").split(":");
            if (dc[0] && dc[1]) discardUnsynced(dc[0], dc[1]);
            return;
          }
          if (t.hasAttribute("data-station-use")) {
            useStation(t.getAttribute("data-station-use"));
            return;
          }
          if (t.hasAttribute("data-station-detail")) {
            openStationDetail(t.getAttribute("data-station-detail"));
            return;
          }
          if (t.hasAttribute("data-station-close")) {
            closeStationDetail();
            return;
          }
          if (t.hasAttribute("data-station-cameras")) {
            camerasNearStation(t.getAttribute("data-station-cameras"));
            return;
          }
          if (t.hasAttribute("data-station-find")) findStationsNearMe();
          if (t.hasAttribute("data-camera-find")) findCamerasNearMe();
          /* The full-size picture opens in a new tab. Loading 264 KB into the
             page for a picture the user may never look at is the wrong default,
             and the service worker would rather not cache 813 of them.
             `window.open`, not a bare global: app.js has no `global`, and a
             ReferenceError here would be thrown from a click handler, where it
             is least visible. */
          if (t.hasAttribute("data-camera-full")) {
            var cam = null;
            for (var ci = 0; ci < cameraResults.length; ci++)
              if (cameraResults[ci].id === t.getAttribute("data-camera-full")) cam = cameraResults[ci];
            if (cam) {
              var opened = null;
              try {
                opened = window.open(cam.image, "_blank", "noopener");
              } catch (e) {
                opened = null;
              }
              /* A blocked popup is not an error worth reporting, but the url
                 must not vanish with it. */
              if (!opened) setCameraStatus(cam.image);
            }
            return;
          }
        });
        /* "Show the rest" is on the button in the markup rather than in the
           delegated list above: it is one fixed element that survives every
           re-render of the results, so a plain listener cannot be lost when the
           list is rebuilt underneath it. */
        $("stationMore").addEventListener("click", function () {
          /* Ten more each time, from the full ranked list, and never past its
             end. The button hides itself in renderStations once everything is
             showing, so it cannot be clicked into an empty state. */
          if (stationResults.length >= stationAll.length) return;
          var next = stationResults.length + STATION_PAGE;
          stationResults = stationAll.slice(0, next);
          renderStations();
          drawStationPins(stationSlice(stationResults));
        });
        /* The role dropdown carries its target in one attribute because the
           share panel is rebuilt from scratch on every render and cannot keep
           per-element handlers. Wired once here rather than inside renderShare,
           which would stack another listener on #shareBody each time it ran. */
        document.addEventListener("change", function (e) {
          var sel = e.target.closest
            ? e.target.closest("select.role-sel")
            : null;
          if (!sel) return;
          var bits = (sel.getAttribute("data-role-set") || "").split("|");
          if (!bits[0] || !bits[1]) return;
          changeShareRole(bits[0], bits[1], sel.value);
        });
        $("vSave").addEventListener("click", addVehicle);
        $("vName").addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            addVehicle();
          }
        });
        $("vOdo").addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            addVehicle();
          }
        });
        $("ppk").addEventListener("change", function () {
          price = Math.max(0, num(this.value));
          this.value = price.toFixed(2);
          persist();
          render();
          syncCents();
        });
        $("ppkCents").addEventListener("input", function () {
          if (this.value === "" || !isNum(this.value)) return;
          price = Math.min(99, Math.max(0, num(this.value))) / 100;
          persist();
          recalcFromPrice();
        });
        $("ppkCents").addEventListener("change", function () {
          var c = Math.round(Math.min(99, Math.max(0, num(this.value))));
          this.value = c;
          price = c / 100;
          $("ppk").value = price.toFixed(2);
          persist();
          syncCents();
          render();
        });
        $("cost").addEventListener("input", recalcFromCost);
        $("energy").addEventListener("input", recalcFromEnergy);
        function syncCents() {
          var c = Math.round(price * 100);
          if ($("ppkCents")) $("ppkCents").value = c;
          if ($("ppk")) $("ppk").value = price.toFixed(2);
          if ($("ppkHint"))
            $("ppkHint").value = TXT("toast.centsMirror", {
              c: c,
              v: fmtCents(c),
            });
          if ($("priceHint"))
            $("priceHint").textContent = TXT("toast.priceHint", {
              v: fmtCents(c),
            });
        }

        /* ---------- duration input ----------
           Every time field offers seconds now: step="1" in the markup, which is
           what makes the browser's picker draw its third wheel. The "add
           seconds" checkbox, the durShowSec global and applyDurStep() are gone
           with it.

           That global was more than redundant. openEdit() read it to decide the
           edit sheet's step, so ticking the box while adding one session
           silently changed the granularity of the editor for every later edit -
           a setting that lived in the DOM of a different view and was never
           saved anywhere. */
        function defaultDuration() {
          var el = $("duration");
          if (!el) return;
          var d = durationDefault(sessions);
          /* NOT hoursToHM(h, true).
             durationDefault is minute-resolution by construction - avgDuration
             rounds to a whole minute - so asking for seconds appended ":00" to
             every value: a 30-minute default rendered as "00:30:00". The
             seconds are still counted, because the average is taken over the
             fractional `hours` value and rounded only at the very end. */
          el.value = hoursToHM(d.hours);
          setDurationHint(d);
        }

        /**
         * Say whether the duration field holds your average or the default.
         *
         * Written into its own element rather than into #durHint itself: that
         * one carries data-i18n, so a language switch rewrites its textContent
         * and any dynamic value put there would be silently discarded.
         */
        function setDurationHint(d) {
          var box = $("durHintNow");
          if (!box) return;
          box.textContent = TXT(
            d.fromAverage ? "durHintAvg" : "durHintDefault",
            { n: d.n },
          );
          box.setAttribute(
            "data-state",
            d.fromAverage ? "average" : "default",
          );
        }

        /* ---------- two-way price / total ---------- */
        var calcLock = false,
          costAuto = false,
          priceAuto = false;
        function setPriceCents(c) {
          price = Math.min(99, Math.max(0, c)) / 100;
          if ($("ppkCents")) $("ppkCents").value = Math.round(price * 100);
          if ($("ppk")) $("ppk").value = price.toFixed(2);
          persist();
        }
        function recalcFromCost() {
          if (calcLock) return;
          calcLock = true;
          var e = num($("energy").value),
            raw = $("cost").value;
          costAuto = false;
          if (raw !== "" && isNum(raw) && e > 0) {
            setPriceCents(Math.round((+raw / e) * 100));
            priceAuto = true;
          }
          syncHints();
          calcLock = false;
        }
        function recalcFromPrice() {
          if (calcLock) return;
          calcLock = true;
          var e = num($("energy").value),
            raw = $("ppkCents").value;
          costAuto = false;
          if (raw !== "" && isNum(raw) && e > 0) {
            $("cost").value = (e * price).toFixed(2);
            costAuto = true;
          }
          syncHints();
          calcLock = false;
        }
        function recalcFromEnergy() {
          if (calcLock) return;
          calcLock = true;
          var e = num($("energy").value);
          if (costAuto) {
            $("cost").value = e > 0 ? (e * price).toFixed(2) : "";
          } else if (priceAuto) {
            var raw = $("cost").value;
            if (raw !== "" && isNum(raw) && e > 0)
              setPriceCents(Math.round((+raw / e) * 100));
          } else if (e > 0 && price > 0) {
            /* Neither side has been typed yet, so both flags are false and the
               field used to stay empty until the PRICE field was touched. The
               price is not unknown though - syncCents prefilled it from the
               saved setting when the form opened - so entering the energy was
               enough information and the cost was left blank anyway. That read
               as a broken form: kWh alone did nothing, and only re-entering a
               price produced a number. */
            $("cost").value = (e * price).toFixed(2);
            costAuto = true;
          }
          syncHints();
          calcLock = false;
        }
        function syncHints() {
          var e = num($("energy").value);
          var bits = [];
          if (e > 0) bits.push(fmtNum(e, 2) + " kWh");
          else bits.push("energy needed");
          if ($("ppkCents"))
            $("ppkCentsHint").textContent =
              TXT("toast.priceNow", {
                v: fmtCents(Math.round(price * 100)),
              }) +
              (costAuto
                ? TXT("toast.priceFromPrice")
                : priceAuto
                  ? TXT("toast.priceFromTotal")
                  : "");
          if ($("priceHint"))
            $("priceHint").textContent =
              e > 0
                ? TXT("toast.priceHint", {
                    v: fmtCents(Math.round(price * 100)),
                  })
                : TXT("toast.priceNeedE");
        }
        $("locGeo").addEventListener("click", function () {
          closeSuggest();
          useMyLocation();
        });
        $("favGeoBtn").addEventListener("click", function () {
          geocodeMissingFavs();
        });
        $("logoutBtn2").addEventListener("click", function () {
          return doLogout();
        });
        $("resetDeviceBtn").addEventListener("click", function () {
          return resetThisDevice();
        });
        $("themeSel").addEventListener("change", function () {
          applyThemeSel(this.value);
        });
        $("langSel2").addEventListener("change", function () {
          var sel = $("langSel");
          sel.value = this.value;
          sel.dispatchEvent(new Event("change"));
        });
        $("defLoc").addEventListener("change", function () {          locDefaults.loc = this.value || null;
          saveLocDefaults();
          toast(TXT("toast.defSaved"));
        });
        $("defHour").addEventListener("change", function () {
          locDefaults.hour = this.value === "" ? null : parseInt(this.value, 10);
          saveLocDefaults();
          toast(TXT("toast.defSaved"));
        });
        $("defGeo").addEventListener("change", function () {
          locDefaults.geo = !!this.checked;
          saveLocDefaults();
          /* Ask once, at the moment it is switched on, so the browser prompt is
             not deferred to a moment the user will not connect with it. */
          if (locDefaults.geo && navigator.geolocation)
            navigator.geolocation.getCurrentPosition(
              function () {
                locDefaults.geoState = "";
                toast(TXT("toast.geoAllowed"));
              },
              function () {
                locDefaults.geoState = "";
                locDefaults.geo = false;
                saveLocDefaults();
                var cb = $("defGeo");
                if (cb) cb.checked = false;
                toast(TXT("toast.geoDenied"));
              },
              { enableHighAccuracy: true, timeout: 10000 },
            );
          else toast(TXT("toast.defSaved"));
        });
        $("exCsv").addEventListener("click", doCSV);
$("exJson").addEventListener("click", function () {
            var list = sorted(scopeList());
            /* Same guard as the CSV path. Without it a scope naming a deleted
               vehicle produced a file containing zero sessions and reported
               "JSON exported 0", which reads as a successful export of an empty
               dataset rather than as nothing to export. */
            if (!list.length) {
              toast(TXT("toast.nothing"));
              return;
            }
            download(
            "ev-sessions-" + now().y + pad(now().m) + pad(now().d) + ".json",
            JSON.stringify(
              {
                exported: new Date().toISOString(),
                pricePerKwh: price,
                vehicles: vehicles,
                sessions: list,
              },
              null,
              2,
            ),
            "application/json",
          );
          toast(TXT("toast.json", { n: list.length }));
        });
        function doCSV() {
          var list = sorted(scopeList());
          if (!list.length) {
            toast(TXT("toast.nothing"));
            return;
          }
          download(
            "ev-sessions-" + now().y + pad(now().m) + pad(now().d) + ".csv",
            "\ufeff" + toCSV(list),
            "text/csv;charset=utf-8",
          );
          toast(TXT("toast.csv", { n: list.length }));
        }
        $("diagBtn").addEventListener("click", function () {
          return copyDiagnostics();
        });
        $("backup").addEventListener("click", function () {
          download(
            "ev-backup-" + now().y + pad(now().m) + pad(now().d) + ".json",
            JSON.stringify(
              {
                v: 1,
                exported: new Date().toISOString(),
                pricePerKwh: price,
                vehicles: vehicles,
                sessions: sessions,
                favourites: favs,
              },
              null,
              2,
            ),
            "application/json",
          );
          toast(TXT("toast.backup"));
        });
        $("restoreBtn").addEventListener("click", function () {
          $("restoreFile").click();
        });
        $("restoreFile").addEventListener("change", function () {
          var f = this.files && this.files[0];
          if (!f) return;
          var r = new FileReader();
          r.onload = function () {
            try {
              var d = JSON.parse(r.result);
              if (
                !d ||
                !Array.isArray(d.vehicles) ||
                !Array.isArray(d.sessions)
              )
throw 0;
                /* The bin is replaced along with the data. It used to be left
                   alone, so a backup taken after deleting a session restored that
                   session as live while its binned copy stayed in the bin: the
                   same charge appeared twice, totals and the chart double
                   counted it, and restoring the stale bin row deleted the live one
                   from the server. */
                binned = { vehicles: [], sessions: [], favs: [] };
                vehicles = d.vehicles;
              if (!vehicles.length)
                vehicles = [
                  {
                    id: uuid(),
                    name: TXT("veh.default"),
                    icon: "🚗",
                    initialOdometer: 0,
                    capacity: null,
                  },
                ];
              sessions = d.sessions;
              cur = 0;
              /* A restored backup may carry legacy non-uuid ids, which Postgres
                 would reject on the id column. Replace each one and remember the
                 mapping, because the sessions in the same file still point at
                 the OLD id: without this the reference dangles, the ownership
                 trigger rejects the insert, and the whole restore fails to sync. */
              var idMap = {};
              for (var rv = 0; rv < vehicles.length; rv++) {
                if (!vehicles[rv]) continue;
                var oldId = vehicles[rv].id;
                if (!isUuid(oldId)) {
                  var newId = uuid();
                  idMap[oldId] = newId;
                  vehicles[rv].id = newId;
                }
              }
              for (var rs = 0; rs < sessions.length; rs++)
                if (sessions[rs] && !isUuid(sessions[rs].id))
                  sessions[rs].id = uuid();
              /* Re-point sessions at the new uuids: by the id map first, then by
                 vehicle name, which is how exported CSV/JSON files refer to a
                 vehicle when no id was stored. */
              for (var rm = 0; rm < sessions.length; rm++) {
                if (!sessions[rm]) continue;
                var ref = sessions[rm].vehicleId;
                if (idMap[ref]) {
                  sessions[rm].vehicleId = idMap[ref];
                } else if (!isUuid(ref)) {
                  for (var rvx = 0; rvx < vehicles.length; rvx++) {
                    if (vehicles[rvx] && vehicles[rvx].name === ref) {
                      sessions[rm].vehicleId = vehicles[rvx].id;
                      break;
                    }
                  }
                }
              }
              /* Drop sessions that still point at a vehicle that is not in the
                 file. They cannot be synced and would fail the whole batch, so
                 they are removed here and counted for the user. */
              var orphans = 0;
              for (var ro = 0; ro < sessions.length; ro++) {
                if (!sessions[ro] || !vehById(sessions[ro].vehicleId)) {
                  if (sessions[ro]) orphans++;
                }
              }
              sessions = sessions.filter(function (s) {
                return s && vehById(s.vehicleId);
              });
              /* Keep the selected vehicle pointing at something real. */
              if (cur >= vehicles.length) cur = 0;
              save();
              if (isFinite(d.pricePerKwh)) {
                price = Math.max(0, d.pricePerKwh);
                $("ppk").value = price;
                persist();
              }
/* Only when the file actually carries the key. This handler also accepts an
                   "Export JSON" file, which is the same shape minus
                   `favourites`; writing [] for a missing key wiped every saved
                   charging location and every binned row, unrecoverably, and then
                   synced the wipe to the server. A file that says nothing about
                   favourites must not be allowed to delete them. */
                  if (Array.isArray(d.favourites))
                    try {
                      localStorage.setItem(
                        K.f,
                        JSON.stringify(d.favourites),
                      );
/* The favourites bin has its own key, so clearing the bin
                       above did not touch it and loadFavs() below re-read it. The
                       deleted favourites therefore survived the restore and
                       could be restored afterwards, resurrecting a place the
                       backup did not contain. The bin is replaced, so its source
                       is replaced too. */
                      localStorage.setItem(K.bf, JSON.stringify([]));
                    } catch (e) {
                      /* favourites are optional here; sessions are the part being restored */
                    }
                    loadFavs();
                    /* loadFavs() splits the bin out of the favourites list, so the
                       in-memory copy has to be dropped again to match the storage
                       just written. */
                    binned.favs = [];
              render();
              /* Report what was restored, including any session that referenced a
                 vehicle the file did not contain and had to be dropped. */
              toast(
                orphans
                  ? TXT("toast.restoreOrphans", {
                      n: sessions.length,
                      f: favs.length,
                      o: orphans,
                    })
                  : TXT("toast.restore", {
                      n: sessions.length,
                      f: favs.length,
                    }),
              );
              /* a restored backup replaces the account, so the server copy is reset too */
              syncReplaceAll();
            } catch (err) {
              toast(TXT("toast.badRestore"));
            }
          };
          r.readAsText(f);
          this.value = "";
        });
        $("clearBtn").addEventListener("click", function () {          return askConfirm(TXT("toast.clearQ", { n: sessions.length }), {
            heading: "confirm.clearSessions",
            irreversible: "confirm.irreversibleClear",
          }).then(function (yes) {
            if (!yes) return false;
            doClearSessions();
            return true;
          });
        });
        $("emptyBinBtn").addEventListener("click", function () {
          return emptyBin();
        });
$("syncBadge").addEventListener("click", function () {
            openSyncPanel(this);
          });
          $("syncBadgeM").addEventListener("click", function () {
            openSyncPanel(this);
          });
          $("syncBannerBtn").addEventListener("click", function () {
            openSyncPanel(this);
          });
        $("syncCloseBtn").addEventListener("click", function () {
          closeSyncPanel();
        });
        $("syncRetryBtn").addEventListener("click", function () {
          retryNow();
        });
        $("syncPanel").addEventListener("click", function (e) {
          if (e.target === this) closeSyncPanel();
        });
        $("wipeBtn").addEventListener("click", function () {
          return askConfirm(TXT("toast.wipeQ"), {
            heading: "confirm.wipe",
            ok: "confirm.deleteEverything",
            irreversible: "confirm.irreversibleWipe",
          }).then(function (yes) {
            if (!yes) return false;
            doWipe();
            return true;
          });
        });
        $("sForm").addEventListener("submit", function (e) {
          e.preventDefault();
          var f = e.target,
            d = f.elements;
          if (!f.reportValidity()) return;
          /* The one rule that can legitimately hold up a save, and only that.
             Everything below this point runs unconditionally once it passes. */
          confirmMileage(e, d, function () {
            commitSession(f, d);
          });
        });
        /**
         * Ask about a mileage that reads lower than the vehicle's own history.
         *
         * Date-relative, not a global maximum. The odometer is cumulative, so a
         * reading lower than everything on record means one of two things: a
         * mistake, or a session being backdated into a gap that predates the rows
         * already stored. A global maximum cannot tell those apart and would
         * forbid filling in a session you forgot last week. So the comparison is
         * against the highest reading among sessions dated EARLIER than this one,
         * which is the case the mistake actually shows up in: 9 Oct at 1,000 km
         * followed by 10 Oct at 100 km.
         *
         * A warning rather than a refusal. The user decides; a hard block here
         * would make the bin and the import paths the only ways to fix a real
         * typo, which is not a trade anyone asked for.
         *
         * @param {function(): void} onOk runs when the save may proceed.
         */
        function confirmMileage(e, d, onOk, excludeId) {
          var raw = d.mileage ? d.mileage.value : "";
          var v = veh();
          /* Absent is not a mistake, it is an unknown. Refusing to save a charge
             because the odometer was not written down would lose the whole
             session over a field the app has never required to be accurate. */
          if (!raw || raw.trim() === "") {
            if (typeof onOk === "function") onOk();
            return Promise.resolve(true);
          }
          var val = num(raw);
          var floor = mileageFloor(v ? v.id : null, d.date ? d.date.value : "", excludeId);
          if (!(val < floor.value)) {
            if (typeof onOk === "function") onOk();
            return Promise.resolve(true);
          }
          return askConfirm(
            TXT("odo.lowerThanHistory", {
              v: floor.label,
              d: num(raw).toLocaleString(LOCALE),
              f: floor.value.toLocaleString(LOCALE),
            }),
            {
              heading: "odo.title",
              /* Primary is "correct it": fills the field with the last reading so
                 the user can accept or adjust it, then saves. */
              ok: "odo.usePrevious",
              /* The second action resolves the string "alt", which the older
                 callers never see because they only test truthiness. */
              altKey: "odo.keepAnyway",
              cancel: "confirm.cancel",
            },
          ).then(function (choice) {
            if (choice === "alt") {
              if (typeof onOk === "function") onOk();
              return true;
            }
            if (choice === true) {
              if (d.mileage) d.mileage.value = String(floor.value);
              if (typeof onOk === "function") onOk();
              return true;
            }
            /* Cancelled, or the dialog was replaced by another request. The
               save does not happen, which is the safe reading of both. */
            return false;
          });
        }
        /**
         * The lowest reading that makes sense for a session on `date`.
         *
         * Highest mileage among sessions for this vehicle dated strictly before
         * `date`, or the vehicle's initial odometer, or 0. `excludeId` lets an
         * edit pass without comparing a row against itself, so correcting a
         * mistyped odometer is not asking "is 92,000 less than 92,000?".
         *
         * @returns {{value: number, label: string}}
         */
        function mileageFloor(vehicleId, date, excludeId) {
          var floor = 0,
            label = "";
          var base = 0;
          for (var vi = 0; vi < vehicles.length; vi++)
            if (vehicles[vi] && vehicles[vi].id === vehicleId)
              base = Math.max(0, num(vehicles[vi].initialOdometer));
          var when = validDate(date || "");
          var best = -1;
          for (var i = 0; i < sessions.length; i++) {
            var s = sessions[i];
            if (!s || s.deletedAt) continue;
            if (excludeId && s.id === excludeId) continue;
            if (s.vehicleId !== vehicleId) continue;
            var m = num(s.mileage);
            /* Only rows with a real reading constrain anything. A reading of 0
               means "not written down", not "the car was new". */
            if (!(m > 0)) continue;
            /* A row has to genuinely predate this one to be a floor, and an
               undated row cannot be shown to do either. Counting it anyway let
               a session imported without dates outrank every real reading and
               demand a nonsensical correction. */
            var sd = validDate(s.date);
            if (!when || !sd || sd >= when) continue;
            if (m > best) {
              best = m;
              label = s.date || "";
            }
          }
          if (best > 0 && best >= base) return { value: best, label: label };
          /* The floor came from the vehicle's own starting odometer, which has
             no date. The label is the sentence's "recorded on {v}", so an empty
             one renders as "…is lower than the 50 000 km recorded on ." */
          return { value: base, label: TXT("odo.startReading") };
        }
        function commitSession(f, d) {
          var v = veh();
          var hadMileage = d.mileage.value.trim() !== "";
          /* Viewers and anyone still awaiting approval cannot log sessions.
             The insert policy would refuse the row anyway; catching it here
             keeps the reason visible instead of surfacing a sync error. */
          if (!canAddSession(v.id)) {
            toast(
              TXT(
                isPending(v.id) ? "toast.pendingNoAdd" : "toast.noPermission",
              ),
            );
            return;
          }
          var s = {
            id: uuid(),
            vehicleId: v.id,
            date: d.date.value,
            time: d.time.value,
            duration: d.duration.value,
            hours: hmToHours(d.duration.value),
            location: d.location.value.trim(),
            energy: num(d.energy.value),
            /* An absent reading stays absent rather than becoming a zero.
               num() would turn "" into 0, which is indistinguishable from "the
               car had done zero kilometres" and silently changes the distance
               total for that vehicle. */
            mileage: d.mileage.value === "" ? null : num(d.mileage.value),
            cost: d.cost.value === "" ? null : Math.max(0, num(d.cost.value)),
            socStart: soc(d.socStart ? soc(d.socStart.value) : null),
            socEnd: soc(d.socEnd ? soc(d.socEnd.value) : null),
            notes: d.notes.value.trim(),
            fast: d.fast.checked,
            home: d.home.checked,
            fav: d.fav.checked,
            lat: isNum(locGeo.lat) ? locGeo.lat : null,
            lng: isNum(locGeo.lng) ? locGeo.lng : null,
            created: Date.now(),
          };
          sessions.push(s);
          save();
          syncSession(s);
          if (s.fav) {
            var matched = null;
            for (var fi = 0; fi < favs.length; fi++) {
              if (
                favs[fi].address === s.location ||
                favs[fi].name === s.location
              )
                matched = favs[fi];
            }
            upsertFavFromSession(
              d.favName.value.trim() || s.location,
              s.location,
              matched ? matched.lat : null,
              matched ? matched.lng : null,
            );
          }
          f.reset();
          $("favNameWrap").hidden = true;
          stampDefaults();
          costAuto = false;
          priceAuto = false;
          defaultDuration();
          syncCents();
          syncHints();
          locGeo = { lat: null, lng: null, label: "" };
          closeSuggest();
          clearPin("sessMap");
          $("sessMapBox").hidden = true;
          setLocStatus("");
          go("dashboard");
          /* A session saved with no reading is a legitimate outcome, so it is
             said plainly rather than left to look like a dropped field. Captured
             before f.reset() above, because by now the field is empty again and
             the evidence of what the user actually typed is gone. Kept local
             rather than stored on the row: an extra property would be pushed to
             a table that has no such column and the insert would be refused. */
          toast(
            s.mileage === null && hadMileage
              ? TXT("odo.savedWithout")
              : TXT(s.fav ? "toast.savedFav" : "toast.saved", {
                  v: v.name,
                }),
          );
        }
        $("fav").addEventListener("change", function () {
          $("favNameWrap").hidden = !this.checked;
          if (this.checked) {
            if (!$("favName").value.trim())
              $("favName").value = $("location").value.trim();
            $("favName").focus();
          }
        });
        $("fFind").addEventListener("click", geocode);
        $("fSave").addEventListener("click", saveFavourite);
        $("fClear").addEventListener("click", clearFavForm);
        $("fAddr").addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            geocode();
          }
        });
        $("fName").addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            $("fAddr").focus();
          }
        });
        $("fLat").addEventListener("change", function () {
          var la = parseFloat(this.value),
            lo = parseFloat($("fLng").value);
          if (isFinite(la) && isFinite(lo))
            showPin("map", la, lo, $("fName").value.trim(), favPinDragged);
        });
        $("fLng").addEventListener("change", function () {
          var lo = parseFloat(this.value),
            la = parseFloat($("fLat").value);
          if (isFinite(la) && isFinite(lo))
            showPin("map", la, lo, $("fName").value.trim(), favPinDragged);
        });
        /* The two price boxes stay in step, so the whole-centre form is always
           as usable as the euro one. */
        if ($("fPrice")) $("fPrice").addEventListener("input", syncFavCents);
        if ($("fPriceCents"))
          $("fPriceCents").addEventListener("input", syncFavPrice);
        $("locFind").addEventListener("click", function () {
          closeSuggest();
          lookupLocation();
        });
        $("location").addEventListener("input", onLocInput);
        $("location").addEventListener("keydown", function (e) {
          var ul = $("locSuggest");
          var items = ul.querySelectorAll ? ul.querySelectorAll("li") : [];
          if (e.key === "Escape") {
            closeSuggest();
            return;
          }
          if (!items.length) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            sugIndex += e.key === "ArrowDown" ? 1 : -1;
            if (sugIndex < 0) sugIndex = items.length - 1;
            if (sugIndex >= items.length) sugIndex = 0;
            for (var i = 0; i < items.length; i++)
              items[i].classList.toggle("on", i === sugIndex);
          } else if (e.key === "Enter" && sugIndex >= 0) {
            e.preventDefault();
            pickSuggest(sugIndex, lastSuggest);
          }
        });
        document.addEventListener("click", function (e) {
          var li = e.target.closest ? e.target.closest("#locSuggest li") : null;
          if (li) pickSuggest(+li.getAttribute("data-i"), lastSuggest);
          else if (!$("location").contains(e.target)) closeSuggest();
        });

        /* only the decorative glyph changes; the accessible name stays on aria-label */
        /* The nav labels are hidden with display:none at narrow widths, which also
         removes them from the accessibility tree, so every nav button announced
         as a bare "button". aria-label is set here from the button's own visible
         label, after translation, so it can never drift from the text the user
         sees and there is no second string to maintain in the markup. */
        function syncNavButtonNames() {
          var btns = document.querySelectorAll("[data-go]");
          for (var i = 0; i < btns.length; i++) {
            var b = btns[i];
            var label = b.querySelector("span[data-i18n]:not(.ic)");
            var text = label ? String(label.textContent || "").trim() : "";
            if (text) b.setAttribute("aria-label", text);
          }
        }
        function setThemeIcon(icon) {
          var b = $("themeBtn");
          if (!b) return;
          var s = b.querySelector("span");
          if (s) s.textContent = icon;
          else b.textContent = icon;
        }
        $("themeBtn").addEventListener("click", function () {
          var d = document.body.classList.toggle("dark");
          setThemeIcon(d ? "🌙" : "☀️");
          try {
            localStorage.setItem(K.t, d ? "dark" : "light");
          } catch (e) {
            /* the theme applies now; only the remembered choice is lost */
          }
          renderChart();
        });
        $("editForm").addEventListener("submit", saveEdit);
        $("eCancel").addEventListener("click", closeEdit);
$("eDelete").addEventListener("click", function () {
            if (!editId) return;
            var id = editId;
            /* Close the sheet first, then ask. The other order left the
               confirmation dialog open while its trigger, the Delete button, was
               inside a display:none sheet, so restoring focus on close was a
               silent no-op and focus fell to the body with the dialog still up. */
            closeEdit();
            delSession(id);
          });
        $("editSheet").addEventListener("click", function (e) {
          if (e.target === this) closeEdit();
        });
        $("confirmOk").addEventListener("click", function () {
          closeConfirm(true);
        });
        $("confirmCancel").addEventListener("click", function () {
          closeConfirm(false);
        });
        $("confirmAlt").addEventListener("click", function () {
          closeConfirm("alt");
        });
        $("confirmExpectInput").addEventListener("input", function () {
          var want = confirmExpectWord;
          var ok = $("confirmOk");
          if (ok) ok.disabled = !want || this.value !== want;
        });
        $("confirmSheet").addEventListener("click", function (e) {
          if (e.target === this) closeConfirm(false);
        });

        $("authForm").addEventListener("submit", submitAuth);
        $("authToggle").addEventListener("click", function () {
          authMode = authMode === "in" ? "up" : "in";
          syncAuthButtons(false);
          $("authPass").setAttribute(
            "autocomplete",
            authMode === "up" ? "new-password" : "current-password",
          );
          /* clear any error from the previous attempt */
          authMsg("");
          $("authUser").focus();
        });
        $("logoutBtn").addEventListener("click", doLogout);
        $("vehForm").addEventListener("submit", saveVeh);
          /* The gross box is the only input that changes the usable one, and the
             mode decides whether it is allowed to. Wired here rather than in
             openVeh so it is live while the sheet is open. */
          $("vfGross").addEventListener("input", capDerive);
          $("vfCapGrossMode").addEventListener("change", capDerive);
          $("vfCapNetMode").addEventListener("change", capDerive);
        $("vfCancel").addEventListener("click", closeVeh);
        $("vehSheet").addEventListener("click", function (e) {
          if (e.target === this) closeVeh();
        });
        document.addEventListener("keydown", function (e) {
          /* Escape closes the topmost dialog, unless the address combobox is open. */
          if (e.key === "Escape") {
            /* the confirmation dialog sits on top of everything */
            if ($("confirmSheet").classList.contains("on")) {
              closeConfirm(false);
              return;
            }
            if ($("editSheet").classList.contains("on")) {
              closeEdit();
              return;
            }
if ($("vehSheet").classList.contains("on")) {
                closeVeh();
                return;
              }
              /* The sync panel was missing here. It is role="dialog"
                 aria-modal="true", so Escape had to dismiss it; a keyboard user
                 could only leave via the Close button or a backdrop click. */
              if ($("syncPanel").classList.contains("on")) {
                closeSyncPanel();
                return;
              }
              return;
            }
            /* Tab is confined to the open dialog. */
            if (e.key === "Tab") {
              if ($("confirmSheet").classList.contains("on")) {
                trapFocus(e, $("confirmSheet"));
                return;
              }
              if ($("editSheet").classList.contains("on")) {
                trapFocus(e, $("editSheet"));
                return;
              }
              if ($("vehSheet").classList.contains("on")) {
                trapFocus(e, $("vehSheet"));
                return;
              }
              /* Likewise: without a trap, Tab walked out of the sync panel and
                 into the page behind it. */
              if ($("syncPanel").classList.contains("on")) {
                trapFocus(e, $("syncPanel"));
                return;
              }
            }
          });
        window.addEventListener("hashchange", function () {
          var h = location.hash.slice(1);
          if (h && document.getElementById(h)) go(h);
        });
        var rt;
        window.addEventListener("resize", function () {
          clearTimeout(rt);
          rt = setTimeout(render, 150);
        });

        /* ---------- boot ---------- */
        if (localStorage.getItem(K.t) === "dark") {
          document.body.classList.add("dark");
          setThemeIcon("🌙");
        }
        /* Before the first read, so the signed-out bucket is already whole. The
           module reports how many slots it moved rather than showing a toast
           itself, which keeps it free of any dependency on the interface. */
        STORAGE.migrateLegacyStorage(function (n) {
          if (window.console && window.console.info)
            window.console.info(
              "[storage] moved " +
                n +
                " pre-scoped slot(s) into the signed-out bucket",
            );
          try {
            toast(TXT("toast.legacyMoved", { n: n }));
          } catch (e) {}
        });
        load();
        loadFavs();
        loadLocDefaults();
        initAuth();
        authWatchdog();
        var dl = document.createElement("datalist");
        dl.id = "favOptions";
        document.body.appendChild(dl);
        $("location").setAttribute("list", "favOptions");
        renderFavs();
        stampDefaults();
        var start = location.hash.slice(1);
        go(document.getElementById(start) ? start : "dashboard");
        watchChartLib();
        window.addEventListener("online", function () {
          /* A phone that slept through a failure re-arms the backoff from the
             start, because the reason it was waiting is gone. */
          scheduleRetry();
          leafletState = 0;
          /* Clear the badge first. When there is no session there is nothing to
             pull, and the offline notice would otherwise stay on screen even
             though the connection is back. */
          syncNote("");
          if (syncOn()) syncPull();
        });
        window.addEventListener("offline", function () {
          syncNote(TXT("sync.offline"), "warn");
        });
        setInterval(function () {
          var ae = document.activeElement;
          if (ae !== $("date") && ae !== $("time") && !$("sForm").contains(ae))
            stampDefaults();
        }, 60000);
        enhancePickers();
        defaultDuration();
        syncCents();
        syncHints();
        if (window.EV_I18N) window.EV_I18N.bootLang();
      })();

      /* Register the offline service worker.
         Deferred to the load event so it never competes with first paint, and
         feature-guarded because file:// and older browsers have no
         ServiceWorkerContainer. Registration failure is silent on purpose: the
         app is fully usable without it, and a rejected promise here would be
         an unhandled rejection for the user. */
      var swReloading = false;
      window.addEventListener("load", function () {
        if (!("serviceWorker" in navigator)) return;
        if (location.protocol !== "http:" && location.protocol !== "https:")
          return;
        navigator.serviceWorker
          .register("sw.js")
          .then(function (reg) {
            /* The worker calls skipWaiting() during install, so once it reaches
               "installed" it takes over immediately. Left alone, a phone keeps
               running whatever build it first cached until the cache name in
               sw.js changes, which is exactly the bug this replaces. */
            function takeOver(worker) {
              if (!worker) return;
              if (worker.state === "installed") worker.postMessage("skip-waiting");
              else
                worker.addEventListener("statechange", function () {
                  if (worker.state === "installed")
                    worker.postMessage("skip-waiting");
                });
            }
            if (reg.installing) takeOver(reg.installing);
            if (reg.waiting) takeOver(reg.waiting);
            reg.addEventListener("updatefound", function () {
              takeOver(reg.installing);
            });
          })
          .catch(function () {});
        /* Fires when the new worker claims this page. */
        navigator.serviceWorker.addEventListener("controllerchange", function () {
          if (swReloading) return;
          /* Reloading while somebody is halfway through typing a session would
             throw their entry away, so leave them on the current build; the
             next navigation picks the new one up. */
          var a = document.activeElement;
          if (
            a &&
            (a.tagName === "INPUT" ||
              a.tagName === "TEXTAREA" ||
              a.tagName === "SELECT")
          )
            return;
          swReloading = true;
          location.reload();
        });
      });