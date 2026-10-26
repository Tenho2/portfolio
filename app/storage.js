/* Per-account local storage.
 *
 * Why this is a separate file
 *   Storage used to be one anonymous blob, so signing in as a second account
 *   showed the first account's vehicles. Everything here exists to stop that:
 *   every key carries the account id, and the pre-scoped leftovers are moved
 *   into a bucket that no account will ever claim.
 *
 *   This module owns naming and bucket selection only. It never touches the
 *   vehicles or sessions arrays, which belong to the application script, and
 *   never renders anything. That is what keeps the boundary real: there is no
 *   state here to accidentally reach back into.
 *
 * Keys are published rather than hidden so callers cannot cache a stale set. The
 * application script keeps a local `K` alias and refreshes it after
 * useAccount(), which is cheaper than a property lookup on every save.
 */
(function () {
  "use strict";

  /* Theme and language are deliberately global. They describe the device, not
     the account, so a shared phone does not inherit somebody else's font size
     or language choice. Navigation handedness is the same kind of device
     preference, so it is global too. */
  var K_THEME = "theme";
  var K_NAVALIGN = "navAlign";
  /* Night-vision red for the HUD layout. Like the theme and the navigation
     handedness, it describes the device rather than the account, so it is a
     global key and not part of any account's bucket. */
  var K_REDMODE = "redMode";
  /* Which layout page the device launches into. A device preference, not an
     account one: a shared phone should not put the next person into the previous
     person's cockpit. Read on the canonical start page, which redirects to the
     remembered layout; a direct link to any layout page is still honoured. */
  var K_LAYOUT = "layout";
  /* The HUD's decorative scanline wash. Opt-in, global and off until chosen:
     it is a texture, not a setting the car needs. */
  var K_SCANLINES = "scanlines";

  /**
   * The full key set for one account's bucket.
   * @param {?string} userId null means the signed-out bucket.
   * @returns {{v: string, s: string, bv: string, bs: string, pd: string,
   *            pw: string, p: string, df: string, f: string, bf: string,
   *            fr: string, n: string, t: string, na: string, rm: string,
   *            layout: string, scan: string}}
   */
  function keysFor(userId) {
    var pre = userId ? "ev.v1." + userId + "." : "ev.v1.local.";
    return {
      v: pre + "vehicles",
      s: pre + "sessions",
      /* The bin is stored under its own keys rather than inside the live ones,
         so nothing that already reads vehicles/sessions has to learn about it. */
      bv: pre + "binVehicles",
      bs: pre + "binSessions",
      /* Deletes and ordinary writes that have not been confirmed by the
         server. Persisted so an offline save or bin move cannot disappear on
         reload before it has been replayed. */
      pd: pre + "pendingDeletes",
      pw: pre + "pendingWrites",
      p: pre + "price",
      /* Location defaults: which favourite to prefill, after what hour, and
         whether to use device position. */
      df: pre + "locDefaults",
      f: pre + "favs",
    /* The favourites bin. It was never persisted, so deleting a favourite
       removed it from the only key that is written and it was gone on the next
       load — and "start over", which promises everything is still recoverable,
       unrecoverably emptied the whole favourites list. */
    bf: pre + "binFavs",
      /* The private address book behind the payer picker: names the user has
         saved so they can be offered when splitting a charge. Per account for
         the same reason as every other key, and the one piece of local state
         that must never be readable by another member - it is a list of
         people, not data about a car. */
      fr: pre + "friends",
      /* usernames of people we invited, keyed by vehicle and user id. The share
         table only stores ids, so this is what lets the owner recognise "Anna"
         instead of a bare uuid. */
      n: pre + "shareNames",
      t: K_THEME,
      na: K_NAVALIGN,
      rm: K_REDMODE,
      layout: K_LAYOUT,
      scan: K_SCANLINES,
    };
  }

  /* Keys from before storage was scoped per account. Everything written before
     that landed in one global bucket for every account, which is what let one
     account's vehicles appear under another. Read once and moved, then left
     alone. */
  var K_OLD = {
    v: "ev.v1.vehicles",
    s: "ev.v1.sessions",
    f: "ev.v1.favs",
    p: "ev.v1.price",
    n: "ev.v1.shareNames",
  };
  var K_MIGRATED = "ev.v1.migratedToAccounts";

  /* The active bucket. Kept here rather than in the application script so a
     sign-out cannot leave one half of the app reading account A's keys and the
     other half reading account B's. */
  var current = keysFor(null);

  /**
   * Move any leftover pre-scoped data into the signed-out local bucket.
   *
   * It deliberately does NOT guess an owner. That bucket could hold rows
   * belonging to several different accounts, which is precisely the bug it came
   * from, and quietly handing the lot to whoever signs in next would be the same
   * mistake wearing a different hat. So it lands in "local", where it is
   * visible when signed out and never claimed by an account that did not create
   * it. Signed-in users get their data from the server, which is where it has
   * been all along.
   *
   * Runs once, guarded by a flag, and never throws.
   *
   * @param {function(number): void} [onMoved] told how many slots were moved, so
   *   the caller can surface it. Reporting is deliberately the caller's job:
   *   this module must not depend on the toast or the translation layer.
   * @returns {number} slots moved, 0 if already done or nothing to move.
   */
  function migrateLegacyStorage(onMoved) {
    var moved = 0;
    try {
      if (localStorage.getItem(K_MIGRATED)) return 0;
      /* Only adopt a slot if its new home is still empty, so this can never
         overwrite real per-account data. */
      function adopt(oldKey, newKey) {
        var raw = localStorage.getItem(oldKey);
        if (raw === null) return;
        var existing = localStorage.getItem(newKey);
        if (existing !== null && existing !== "[]" && existing !== "") return;
        try {
          var parsed = JSON.parse(raw);
          if (!Array.isArray(parsed) || !parsed.length) return;
          localStorage.setItem(newKey, raw);
          moved++;
        } catch (e) {
          /* unparseable leftovers are left where they are */
        }
      }
      var local = keysFor(null);
      adopt(K_OLD.v, local.v);
      adopt(K_OLD.s, local.s);
      adopt(K_OLD.f, local.f);
      var oldPrice = localStorage.getItem(K_OLD.p);
      if (oldPrice !== null && localStorage.getItem(local.p) === null) {
        localStorage.setItem(local.p, oldPrice);
        moved++;
      }
      var oldNames = localStorage.getItem(K_OLD.n);
      if (oldNames !== null && localStorage.getItem(local.n) === null) {
        localStorage.setItem(local.n, oldNames);
        moved++;
      }
      localStorage.setItem(K_MIGRATED, String(Date.now()));
    } catch (e) {
      /* A migration failure must never stop the app booting. */
      return 0;
    }
    /* Say so rather than letting the data quietly reappear as a signed-out
       mystery. Anything that WAS synced is already coming back from the server;
       this is only what never made it up. */
    if (moved && typeof onMoved === "function") {
      try {
        onMoved(moved);
      } catch (e) {
        /* a reporting failure must not undo the migration */
      }
    }
    return moved;
  }

  /**
   * Point storage at one account's bucket. Must run before the data is read.
   * @param {?string} userId
   * @returns {{keys: object, changed: boolean}} the new key set, and true when
   *   the bucket actually moved, so the caller knows whether a reload is needed.
   */
  function useAccount(userId) {
    var next = keysFor(userId);
    var changed = next.v !== current.v;
    current = next;
    return { keys: next, changed: changed };
  }

  window.EV_STORAGE = {
    keysFor: keysFor,
    /* Published so 'sign out and clear this device' can keep the theme while
       wiping everything else, without the caller having to know the literal.
       It would otherwise have to reach for the private K_THEME, which is the
       exact mistake this module exists to prevent. */
    theme: K_THEME,
    navAlign: K_NAVALIGN,
    layout: K_LAYOUT,
    scanlines: K_SCANLINES,
    current: function () {
      return current;
    },
    useAccount: useAccount,
    migrateLegacyStorage: migrateLegacyStorage,
  };
})();