/*
 * Charging-station lookup, and road-weather cameras.
 *
 * Two sources, chosen by where the user actually is:
 *
 *   INSIDE Finland  Digitraffic (Fintraffic), the official national network.
 *                   It is a curated, operator-fed registry: 3,840 stations,
 *                   every EVSE with its connector type and power, opening
 *                   hours, and live status. OpenStreetMap has better coverage
 *                   outside the cities and nothing useful inside them.
 *   OUTSIDE Finland Overpass, because Digitraffic is Finnish only.
 *
 * Every shape below was verified by CALLING the API, not by reading its
 * documentation, and several of these differ from what the docs suggest:
 *
 *   - `limit` accepts ONLY 500 or ALL. `?limit=2` is a 400, not a short page.
 *   - The response is GeoJSON under `features[]`, not a `result[]` array.
 *   - Coordinates are [longitude, latitude], in that order.
 *   - `maxElectricPower` is in WATTS: 12800 means 12.8 kW. Read as kW it would
 *     advertise a 12.8 MW charger.
 *   - `connector.standard` is IEC_62196_T2 / CHADEMO / IEC_62196_T2_COMBO /
 *     DOMESTIC_F / DOMESTIC_H, which need translating before display.
 *   - `tariffIds` on a connector is null for most stations; the tariff list is
 *     separate and joined by station party.
 *   - Filters such as `evseStatus=AVAILABLE` are accepted and then IGNORED. The
 *     response still contains everything, so filtering must be done here.
 *   - The server refuses a request whose Accept-Encoding is not gzip.
 *
 * Status and tariffs are fetched only when a station is opened, because they
 * are 20,000 and 4,000 rows and change by the minute. The station list is
 * fetched once and cached on the DEVICE, not per account: it is public data
 * about charging stations, and it costs 23 MB to download.
 *
 *   node tools/check-stations.mjs   prints the live shapes
 */
(function (global) {
  "use strict";

  /* ---------- endpoints ---------- */
  var API = "https://afir.digitraffic.fi/api/charging-network/v1/";
  var CAMERAS = "https://tie.digitraffic.fi/api/weathercam/v1/stations";
  var CAMERA_IMAGE = "https://weathercam.digitraffic.fi/";

  /* `limit=ALL` is the only way to get everything in one request. Cursoring
     through 500-row pages would mean eight round trips for the same bytes. */
  var LOCATIONS_URL = API + "locations?limit=ALL";
  var STATUS_URL = API + "locations/statuses?limit=ALL";
  var TARIFF_URL = API + "tariffs?limit=ALL";

  /* Overpass is only for outside Finland, and every instance of it is unreliable
     in a different way. Measured from a script over one afternoon:

       overpass-api.de       504 under load, 406 to a client that sends no
                             meaningful User-Agent
       overpass.kumi.systems 429 constantly
       overpass.private.coffee 429 under load

     overpass.osm.ch is deliberately NOT here: it answered HTTP 200 with zero
     elements for a Stockholm query where Stockholm has hundreds of chargers. A
     stale mirror is indistinguishable from an absence unless the caller knows
     which endpoint answered, which is why an empty answer from a non-primary
     endpoint is treated as a failure rather than as "nothing nearby".

     Order matters: the fastest, best-funded instance is tried first. */
  var OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];

  /* How much of the registry to keep in localStorage. The full response is
     ~23.5 MB; this is the same stations reduced to the fields that are
     actually shown, and measures about 330 KB. */
  var CACHE_MAX = 4000;

  /* How many poles are stored in full, per station. Beyond this the detail panel
     stops being information and starts being a wall: the registry contains a
     site with 219 of them. The remaining poles still count, and their ids are
     kept, so live status stays accurate - it is only the per-pole plug list
     that is truncated. */
  var POLE_DETAIL_MAX = 12;

  /* ---------- the cached form ----------
     The cache is held in localStorage alongside the user's own sessions,
     vehicles and favourites, and the quota is shared. The obvious shape - one
     JSON object per pole, with named keys - measured 2.1 MB for the registry,
     of which 1.2 MB was poles. That is most of a typical 5 MB quota spent on
     public reference data, and if it pushes the quota over then the failure
     lands on the user's charge history, not on the station list.

     So poles are stored positionally rather than by name, the plug labels are
     a small per-station lookup instead of a repeated string per pole, and only
     the first POLE_DETAIL_MAX poles keep their detail. Measured about 550 KB.

     Every evse id is kept, joined into one string: that is what live status is
     looked up by, and dropping the tail of a 219-pole site would make the
     status count wrong - which is worse than showing no status at all. */
  function packRow(row) {
    var detail = [];
    var plugs = [];
    var plugIx = {};
    for (var i = 0; i < row.poles.length && detail.length < POLE_DETAIL_MAX; i++) {
      var p = row.poles[i];
      var key = p.plugs.join("|");
      if (plugIx[key] === undefined) {
        plugIx[key] = plugs.length;
        plugs.push(p.plugs);
      }
      detail.push([p.id || "", plugIx[key], p.watts || 0]);
    }
    var ids = [];
    for (var k = 0; k < row.poles.length; k++) if (row.poles[k].id) ids.push(row.poles[k].id);
    return {
      i: row.id,
      n: row.name,
      o: row.operator,
      y: row.lat,
      x: row.lng,
      g: row.plugs,
      w: row.power,
      a: row.address,
      /* Only ever true in practice, but kept rather than assumed. */
      c: row.alwaysOpen ? 1 : 0,
      p: detail,
      t: row.poles.length,
      /* Every id, so a station's live status is not truncated by the cap above. */
      d: ids.join("|"),
    };
  }

  function unpackRow(p) {
    /* Already unpacked - a v1 cache, or a row straight from the network. Doing
       this unconditionally is how a v1 payload came back with blank names. */
    if (p.name !== undefined) return p;
    var detail = p.p || [];
    var poles = [];
    for (var i = 0; i < detail.length; i++) {
      poles.push({ id: detail[i][0], plugs: p.g || [], watts: detail[i][2] });
    }
    return {
      source: "digitraffic",
      id: p.i,
      name: p.n || "",
      operator: p.o || "",
      lat: p.y,
      lng: p.x,
      plugs: p.g || [],
      power: p.w || "",
      address: p.a || "",
      alwaysOpen: !!p.c,
      poles: poles,
      polesTotal: p.t || poles.length,
      evseIds: p.d ? p.d.split("|") : [],
    };
  }

  /* ---------- storage ----------
     The cache lives in localStorage beside the user's own sessions, vehicles
     and favourites, and the quota is shared - typically 5 MB for the whole
     origin. So the size of this thing is not a tidiness question: if it tips
     the quota over, the write that fails is somebody's charge history.

     Measured, for the 3,840-station registry:

       one JSON object per pole, named keys            2,125 KB
       the packed positional form below                1,511 KB
       the same, gzipped and base64'd                    440 KB

     So it is both packed and compressed. Compression is what makes it safe -
     packing alone still spends a third of the budget on public reference data -
     and `CompressionStream` is a browser built-in, so it costs no library.

     Compression is not assumed: a browser without it stores the packed JSON
     under a different marker, and reads either. A cache written by one version
     is still readable by the next. */
  var K_STATIONS = "ev.v1.stations";
  var MARK_RAW = "js:";
  var MARK_GZ = "gz:";

  function bytesToBase64(bytes) {
    /* Chunked, because String.fromCharCode.apply over 330k bytes blows the
       argument limit. */
    var out = "";
    var CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return global.btoa(out);
  }

  function base64ToBytes(text) {
    var bin = global.atob(text);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /**
   * Drain a readable stream into one Uint8Array.
   *
   * Deliberately not `new Response(stream).arrayBuffer()`: `Response.stream()`
   * is not implemented everywhere this app runs, and a cache path that throws
   * on the second visit is worse than a slightly larger cache. Reading through
   * the reader is the part that is actually standard.
   */
  function readAll(readable) {
    var reader = readable.getReader();
    var chunks = [];
    var total = 0;
    function pump() {
      return reader.read().then(function (step) {
        if (step.done) {
          var out = new Uint8Array(total);
          var at = 0;
          for (var i = 0; i < chunks.length; i++) {
            out.set(chunks[i], at);
            at += chunks[i].length;
          }
          return out;
        }
        chunks.push(step.value);
        total += step.value.length;
        return pump();
      });
    }
    return pump();
  }

  /**
   * Feed bytes into a TransformStream and collect the result.
   *
   * Three details, each of which is a hang or a crash rather than an error
   * message:
   *
   *   - The read starts FIRST and runs alongside the writes. Awaiting the
   *     write before reading deadlocks on a large payload: the transform
   *     applies backpressure, the write promise waits for the reader, and the
   *     reader has not started. With 1.5 MB of JSON that hang is indefinite.
   *
   *   - Both writer promises are handled. Writing invalid bytes into a gzip
   *     decompressor rejects the writer, and an unhandled rejection there is
   *     fatal to the whole page - which is what a corrupt cache did.
   *
   *   - The reader is cancelled on failure so the stream is left closed rather
   *     than holding a file handle or a timer.
   */
  function through(stream, bytes) {
    var reading = readAll(stream.readable);
    var writer = stream.writable.getWriter();
    /* Not awaited before the read is under way; see above. */
    var written = writer.write(bytes).catch(function () {});
    var closed = writer.close().catch(function () {});
    return Promise.all([written, closed]).then(function () {
      return reading;
    });
  }

  /** gzip -> base64, or null when the browser cannot compress. */
  function compress(text) {
    if (typeof global.CompressionStream !== "function" || !global.TextEncoder) {
      return Promise.resolve(null);
    }
    try {
      return through(
        new global.CompressionStream("gzip"),
        new global.TextEncoder().encode(text),
      )
        .then(bytesToBase64)
        .catch(function () {
          return null;
        });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function decompress(b64) {
    return through(new global.DecompressionStream("gzip"), base64ToBytes(b64)).then(
      function (bytes) {
        return new global.TextDecoder().decode(bytes);
      },
    );
  }

  /** @returns {Promise<?object>} null when there is nothing usable cached. */
  function readCache() {
    var raw;
    try {
      raw = global.localStorage.getItem(K_STATIONS);
    } catch (e) {
      return Promise.resolve(null);
    }
    if (!raw) return Promise.resolve(null);
    var work;
    if (raw.indexOf(MARK_GZ) === 0) {
      if (typeof global.DecompressionStream !== "function") return Promise.resolve(null);
      work = decompress(raw.slice(MARK_GZ.length));
    } else if (raw.indexOf(MARK_RAW) === 0) {
      work = Promise.resolve(raw.slice(MARK_RAW.length));
    } else {
      /* Written before the marker existed. Read it, then let the next write
         replace it in the current form. */
      work = Promise.resolve(raw);
    }
    return work
      .then(function (text) {
        var j = JSON.parse(text);
        if (!j || !Array.isArray(j.stations) || !j.stations.length) return null;
        if (!j.fetchedAt) return null;
        /* Version 1 stored full rows with named keys; version 2 stores them
           packed. Unpacking a v1 payload would read `name` from a row that has
           `n`, and quietly produce stations with no name at all - which is
           exactly what happened before this branch existed. */
        j.stations = j.v >= 2 ? j.stations.map(unpackRow) : j.stations;
        return j;
      })
      .catch(function () {
        /* A corrupt or truncated cache is not worth an error; the registry is
           public and can be fetched again. */
        return null;
      });
  }

  function writeCache(stations, fetchedAt) {
    var text = JSON.stringify({
      v: 2,
      fetchedAt: fetchedAt,
      stations: stations.map(packRow),
    });
    return compress(text).then(function (b64) {
      try {
        global.localStorage.setItem(K_STATIONS, (b64 ? MARK_GZ : MARK_RAW) + (b64 || text));
        return true;
      } catch (e) {
        /* A full quota must not lose the fetch that just succeeded, and must
           not propagate: the caller has real stations in hand either way. */
        return false;
      }
    });
  }

  function clearCache() {
    try {
      global.localStorage.removeItem(K_STATIONS);
    } catch (e) {
      /* nothing to do: a cache that cannot be cleared is not worth failing */
    }
  }

  /* ---------- fetch helper ----------
     A plain fetch with a deadline. The app's own `timed()` takes a Supabase
     query builder and calls .abortSignal() on it; a fetch returns a Promise,
     which has no such method, so passing one there throws
     `builder.abortSignal is not a function`. This is why the station search
     needs its own timeout rather than reusing that helper. */
  function fetchWithTimeout(url, ms, signal) {
    var ctl = null;
    if (typeof AbortController !== "undefined") {
      ctl = new AbortController();
      if (signal) signal.addEventListener("abort", function () { ctl.abort(); });
    }
    var opts = { headers: { Accept: "application/json" } };
    if (ctl) opts.signal = ctl.signal;
    var timer = null;
    if (ctl) {
      timer = global.setTimeout(function () { ctl.abort(); }, ms);
    }
    return fetch(url, opts).then(
      function (r) {
        if (timer) global.clearTimeout(timer);
        if (!r.ok) {
          var e = new Error("HTTP " + r.status);
          e.status = r.status;
          throw e;
        }
        return r.json();
      },
      function (err) {
        if (timer) global.clearTimeout(timer);
        throw err;
      },
    );
  }

  /* ---------- inside/outside Finland ----------
     A bounding box, deliberately generous. It only decides which source to ask,
     so being slightly wrong is cheap: the wrong source returns nothing nearby,
     not wrong data. Finland proper is roughly 20.5-31.6 E, 59.8-70.1 N. */
  function inFinland(lat, lng) {
    return (
      isNum(lat) &&
      isNum(lng) &&
      lat >= 59.5 &&
      lat <= 70.5 &&
      lng >= 19.0 &&
      lng <= 32.0
    );
  }

  function isNum(v) {
    return v !== null && v !== undefined && v !== "" && isFinite(+v);
  }

  /* ---------- Digitraffic normalisation ---------- */

  /* The API's connector names are protocol identifiers, not words. */
  var STANDARD_TEXT = {
    IEC_62196_T2: "Type 2",
    IEC_62196_T2_COMBO: "Type 2 combo",
    CHADEMO: "CHAdeMO",
    DOMESTIC_F: "Type F (Schuko)",
    DOMESTIC_H: "Type K",
  };

  function standardText(s) {
    return STANDARD_TEXT[s] || s || "";
  }

  /**
   * Watts to a readable label: 12800 -> "12.8 kW", 22000 -> "22 kW".
   *
   * One decimal is kept below 100 kW because the values that matter are not
   * round: 11 kW and 22 kW are the two most common AC chargers in Finland, and
   * rounding 7.4 kW to 7 kW would describe a car that does not exist. Above
   * that, whole kilowatts only - 150 kW, not 147.5 - because a tenth of a kW is
   * not information a driver can act on.
   */
  function powerText(watts) {
    if (!isNum(watts) || +watts <= 0) return "";
    var kw = +watts / 1000;
    if (kw >= 100) return Math.round(kw) + " kW";
    var rounded = Math.round(kw * 10) / 10;
    /* 22 rather than 22.0: the trailing zero is noise. */
    if (Math.abs(rounded - Math.round(rounded)) < 0.001) return Math.round(rounded) + " kW";
    return rounded + " kW";
  }

  /**
   * One station row from one GeoJSON feature.
   *
   * Every EVSE is kept, not just the first. The registry holds stations with
   * two hundred connectors, and a search result that says "Type 2, 11 kW"
   * because it looked at connectors[0] is worse than no result: it understates
   * what is there. The summary carries the highest power seen and the set of
   * distinct connectors, and `evses` keeps the rest for the detail panel.
   *
   * @returns {object|null} null when the feature has no usable position.
   */
  function stationFromFeature(feature) {
    var g = feature && feature.geometry;
    var c = g && g.coordinates;
    /* GeoJSON is [lng, lat]. Reading it the other way round puts every Finnish
       station in the Baltic and returns an empty map with no error. */
    if (!c || c.length < 2 || !isNum(c[0]) || !isNum(c[1])) return null;
    var p = feature.properties || {};
    /* No name and no operator means there is nothing to show in a list, and a
       row reading just "Laturi" is worse than no row. */
    var op = (p.operator && (p.operator.details || {}).name) || "";
    if (!p.name && !op) return null;
    var evses = Array.isArray(p.evses) ? p.evses : [];
    var plugs = {};
    var poles = [];
    var maxWatts = 0;
    for (var i = 0; i < evses.length; i++) {
      var conns = Array.isArray(evses[i].connectors) ? evses[i].connectors : [];
      /* Collected per pole first, then collapsed. Building `plugs` inside this
         loop would mix every pole's connectors into one list and lose which
         plug belongs to which, which is the whole point of showing poles. */
      var seen = {};
      var labels = [];
      var poleWatts = 0;
      for (var k = 0; k < conns.length; k++) {
        var label = standardText(conns[k] && conns[k].standard);
        if (label) plugs[label] = 1;
        if (label && !seen[label]) {
          seen[label] = 1;
          labels.push(label);
        }
        /* Watts, not kW: the API reports 12800 for a 12.8 kW charger. */
        var w = +((conns[k] || {}).maxElectricPower || 0);
        if (w > poleWatts) poleWatts = w;
        if (w > maxWatts) maxWatts = w;
      }
      poles.push({ id: evses[i].id || "", plugs: labels, watts: poleWatts });
    }

    var a = p.address || {};
    return {
      source: "digitraffic",
      id: p.id || "",
      name: p.name || op || "",
      operator: op,
      lat: +c[1],
      lng: +c[0],
      plugs: Object.keys(plugs),
      /* One row per station, with the pole count and the best power available,
         which is the number a driver is actually choosing on. */
      power: powerText(maxWatts),
      poles: poles,
      address: [a.street, a.postalCode, a.city].filter(Boolean).join(", "),
      alwaysOpen: p.chargingWhenClosed === true,
    };
  }

  /** Whole registry -> cacheable rows, sorted so reads are cheap. */
  function stationsFromCollection(payload) {
    var feats = (payload && payload.features) || [];
    var out = [];
    for (var i = 0; i < feats.length && out.length < CACHE_MAX; i++) {
      var row = stationFromFeature(feats[i]);
      if (row) out.push(row);
    }
    return out;
  }

  /* ---------- Overpass normalisation (outside Finland) ---------- */

  function overpassUrl(lat, lng, radius) {
    var q =
      '[out:json][timeout:20];(' +
      'node["amenity"="charging_station"](around:' +
      radius +
      "," +
      lat +
      "," +
      lng +
      ");" +
      'way["amenity"="charging_station"](around:' +
      radius +
      "," +
      lat +
      "," +
      lng +
      ");" +
      ");out center 40;";
    return OVERPASS_ENDPOINTS[0] + "?data=" + encodeURIComponent(q);
  }

  /* The tags are `socket:*`. Written from memory as `connector:*`, which
     matches nothing and produces an empty plug list that looks like data. */
  function stationSockets(tags) {
    var out = [];
    if (!tags) return out;
    for (var key in tags) {
      if (key.indexOf("socket:") !== 0) continue;
      var parts = key.split(":");
      var type = parts[1];
      /* `socket:<type>:output` is that connector's RATING, not a type. Listing
         it produced a column of rows literally called "output". */
      if (!type || parts[2]) continue;
      var label = type.replace(/_/g, " ");
      var watts = tags[key + ":output"];
      var kw = /([\d.]+)\s*kW/i.exec(watts || "");
      if (kw) label += " " + kw[1] + " kW";
      out.push(label);
    }
    return out;
  }

  function stationFromElement(el, lat, lng, origin) {
    if (!el || !el.tags) return null;
    var la = el.lat !== undefined ? el.lat : el.center && el.center.lat;
    var lo = el.lon !== undefined ? el.lon : el.center && el.center.lon;
    if (!isNum(la) || !isNum(lo)) return null;
    return {
      source: "osm",
      id: "osm:" + el.type + ":" + el.id,
      name: stationName(el.tags),
      operator: el.tags.operator || el.tags.brand || "",
      lat: +la,
      lng: +lo,
      plugs: stationSockets(el.tags),
      power: "",
      poles: [],
      address: "",
      alwaysOpen: false,
      dist: origin && isNum(origin.lat) ? metresBetween(lat, lng, origin.lat, origin.lng) : null,
    };
  }

  function stationName(tags) {
    if (!tags) return "";
    return tags.name || tags.brand || tags.operator || "";
  }

  /* ---------- distance ---------- */
  function metresBetween(lat1, lng1, lat2, lng2) {
    /* Spherical law of haversines. Accurate to well under a metre at these
       distances, which matters because the alternative - a flat-earth
       approximation - is wrong by ~30% at 100 km, enough to reorder results. */
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
    return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  /* ---------- the search ---------- */

  /**
   * Stations near a point.
   *
   * Inside Finland the cached registry answers instantly and offline. Outside
   * it, Overpass is queried live, one endpoint at a time, and an EMPTY answer
   * from a fallback is treated as a failure rather than as "nothing nearby" -
   * a stale mirror was observed returning HTTP 200 with zero elements for a
   * query the primary answered with eleven.
   *
   * @param {{lat:number,lng:number}} origin
   * @param {number} radius metres
   * @returns {Promise<{rows:Array, source:string, cached:boolean, warning:string}>}
   */
  function findStations(origin, radius, opts) {
    opts = opts || {};
    if (!origin || !isNum(origin.lat) || !isNum(origin.lng)) {
      return Promise.reject(new Error("no position"));
    }
    var inside = inFinland(origin.lat, origin.lng);
    if (inside) return fromRegistry(origin, radius, opts);
    return fromOverpass(origin, radius, opts);
  }

  function fromRegistry(origin, radius, opts) {
    /* Async all the way down: reading the cache may mean decompressing it. */
    return readCache().then(function (cached) {
      if (cached) {
        /* A registry older than a week is offered with a refresh rather than
           silently used, but it is still returned: a month-old list beats none,
           and the alternative is an empty screen on a train. */
        var age = Date.now() - cached.fetchedAt;
        var stale = age > 7 * 24 * 3600 * 1000;
        var rows = rank(cached.stations, origin, radius);
        if (opts.onCache) opts.onCache(cached.fetchedAt, stale, rows.length);
        /* Still refresh in the background when stale, so the next search is
           fast. A failure here is silent on purpose: the user already has a
           usable answer on screen. */
        if (stale && !opts.noRefresh) refreshRegistry().catch(function () {});
        return {
          rows: rows,
          source: "digitraffic",
          cached: true,
          fetchedAt: cached.fetchedAt,
          warning: stale ? "stale" : "",
        };
      }
      return refreshRegistry().then(function (r) {
        /* When the cache write failed the rows were kept in memory precisely
           so they could be used here. Returning an empty list in that case
           would turn a full quota into "no stations near you", which is the
           one thing this whole function exists not to do. */
        /* The same rows either way; `cached` records whether they will still be
           here next time. */
        var rows = rank(r.rows, origin, radius);
        if (opts.onCache) opts.onCache(r.fetchedAt, false, r.rows.length);
        return {
          rows: rows,
          source: "digitraffic",
          cached: false,
          fetchedAt: r.fetchedAt,
          warning: r.cached ? "" : "cachefailed",
        };
      });
    });
  }

  /**
   * Fetch the whole registry, normalise it, and cache it.
   *
   * @returns {Promise<{fetchedAt:number, rows:Array, cached:boolean}>}
   *   `cached` is false when the write was refused. The rows come back either
   *   way, because a full quota should cost the next search a re-download, not
   *   the search itself.
   */
  function refreshRegistry() {
    return fetchWithTimeout(LOCATIONS_URL, 60000).then(function (payload) {
      var rows = stationsFromCollection(payload);
      if (!rows.length) throw new Error("empty");
      var at = Date.now();
      return writeCache(rows, at).then(function (ok) {
        return { fetchedAt: at, rows: rows, cached: ok };
      });
    });
  }

  function fromOverpass(origin, radius, opts) {
    var url = overpassUrl(origin.lat, origin.lng, radius);
    var q = decodeURIComponent(url.slice(url.indexOf("data=") + 5));
    var tried = 0;
    function attempt() {
      var ep = OVERPASS_ENDPOINTS[tried];
      if (!ep) {
        return Promise.reject(new Error("no endpoint answered"));
      }
      var mine = tried;
      tried++;
      var full = ep + "?data=" + q;
      return fetchWithTimeout(full, 20000).then(
        function (payload) {
          var body = payload;
          var els = (body && body.elements) || [];
          var list = [];
          for (var i = 0; i < els.length; i++) {
            var row = stationFromElement(els[i], origin.lat, origin.lng, origin);
            if (row) list.push(row);
          }
          if (opts.onAttempt) {
            opts.onAttempt({
              endpoint: ep,
              which: mine === 0 ? "primary" : "fallback",
              ok: true,
              bytes: 0,
              elements: els.length,
              fallback: mine > 0 ? "yes" : "no",
            });
          }
          /* A mirror that answers with nothing is not evidence of absence. */
          if (!list.length && mine > 0) throw new Error("fallback returned no data");
          return { rows: rank(list, origin, radius), source: "osm", cached: false, warning: "" };
        },
        function (err) {
          if (opts.onAttempt) {
            opts.onAttempt({
              endpoint: ep,
              which: mine === 0 ? "primary" : "fallback",
              ok: false,
              error: err && err.message ? err.message : "network",
            });
          }
          return attempt();
        },
      );
    }
    return attempt();
  }

  /** Distance, then nearest first, then capped. */
  function rank(rows, origin, radius) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!isNum(r.lat) || !isNum(r.lng)) continue;
      var d = metresBetween(origin.lat, origin.lng, r.lat, r.lng);
      if (d > radius) continue;
      out.push({
        id: r.id,
        name: r.name,
        operator: r.operator,
        lat: r.lat,
        lng: r.lng,
        plugs: r.plugs,
        power: r.power,
        poles: r.poles,
        /* Carried through explicitly: the cached form truncates the per-pole
           detail, so `poles.length` is not the number of poles on site and
           showing it in the list would under-report the station. */
        polesTotal: r.polesTotal || (r.poles || []).length,
        /* Every evse id, so live status covers the whole site. */
        evseIds: r.evseIds || [],
        address: r.address,
        alwaysOpen: r.alwaysOpen,
        source: r.source,
        dist: d,
      });
    }
    out.sort(function (a, b) {
      if (a.dist !== b.dist) return a.dist - b.dist;
      return String(a.name).localeCompare(String(b.name));
    });
    return out;
  }

  /* ---------- live status and prices, on demand ---------- */

  function loadStatuses() {
    return fetchWithTimeout(STATUS_URL, 60000).then(function (payload) {
      var rows = (payload && payload.statuses) || [];
      var map = {};
      for (var i = 0; i < rows.length; i++) map[rows[i].evseId] = rows[i].status;
      return map;
    });
  }

  /**
 * * Tariffs, keyed by the station's operator party.
 *
 * * The feed mixes five kinds of price component. Only one of them is a price
 * * per kWh, and the others are not close:
 * *
* *   ENERGY            0.29 EUR per kWh - this is the one to show
    *   TIME              2.50 EUR per hour of charging
    *   PARKING_TIME      237.80 EUR per hour of standing still - the 237 is a
    *                    parking tariff, and displaying it as a charging price
    *                    is a factor of eight out and looks absurd
    *   FLAT              a fixed fee for using the station at all
    *   CONGESTION_TIME   a surcharge during busy periods
    *
    * Taking elements[0].priceComponents[0] regardless of type is how the
    * parking number ends up in a field labelled price per kWh.
    *
    * `stepSize` is the unit the price is quoted in. One is per kWh; a thousand
    * means the operator quotes per MWh, which is the same number times a
    * thousand and must be divided before it is shown.
    *
    * Currencies are not all euros - the feed carries SEK, DKK, PLN, CZK, HUF,
    * CHF, NOK and GBP. The currency travels with the price so the UI can refuse
    * to label a Swedish krona as euros.
    *
    * @returns {Promise<Object<string, {price:number, currency:string, vat:?number}>>}
    */
  function loadTariffs() {
    return fetchWithTimeout(TARIFF_URL, 60000).then(function (payload) {
      var rows = (payload && payload.tariffs) || [];
      var byParty = {};
      for (var i = 0; i < rows.length; i++) {
        var t = rows[i];
        var price = null;
        for (var e = 0; e < (t.elements || []).length && price === null; e++) {
          for (var c = 0; c < ((t.elements[e].priceComponents || []).length); c++) {
            var pc = t.elements[e].priceComponents[c];
            if (!pc || pc.type !== "ENERGY" || !isNum(pc.price)) continue;
            var unit = isNum(pc.stepSize) && pc.stepSize > 0 ? pc.stepSize : 1;
            price = +pc.price / unit;
            break;
          }
        }
        /* No energy component means there is nothing to quote as a charging
           price. Recording 0 instead would show the station as free. */
        if (price === null) continue;
        byParty[t.id] = {
          price: price,
          currency: t.currency || "EUR",
          vat: isNum(pcVat(t)) ? pcVat(t) : null,
        };
      }
      return byParty;
    });
  }

  /** The VAT on the energy component, which is not on the tariff itself. */
  function pcVat(t) {
    for (var e = 0; e < (t.elements || []).length; e++) {
      for (var c = 0; c < (t.elements[e].priceComponents || []).length; c++) {
        var pc = t.elements[e].priceComponents[c];
        if (pc && pc.type === "ENERGY") return pc.vat;
      }
    }
    return null;
  }

  /* ---------- cameras ---------- */

  function cameraFromFeature(f) {
    var c = f && f.geometry && f.geometry.coordinates;
    var p = (f && f.properties) || {};
    if (!c || c.length < 2 || !isNum(c[0]) || !isNum(c[1])) return null;
    var preset = (p.presets || [])[0];
    if (!preset || !preset.id) return null;
    return {
      id: p.id || "",
      name: p.name || p.id || "",
      lat: +c[1],
      lng: +c[0],
      presetId: preset.id,
      updated: p.dataUpdatedTime || "",
      image: CAMERA_IMAGE + preset.id + ".jpg",
      thumb: CAMERA_IMAGE + preset.id + ".jpg?thumbnail=true",
    };
  }

  function camerasFromCollection(payload) {
    var feats = (payload && payload.features) || [];
    var out = [];
    for (var i = 0; i < feats.length; i++) {
      var row = cameraFromFeature(feats[i]);
      if (row) out.push(row);
    }
    return out;
  }

  function findCameras(origin, radius, opts) {
    opts = opts || {};
    if (opts.cached && opts.cached.length) {
      return Promise.resolve(rankCameras(opts.cached, origin, radius));
    }
    return fetchWithTimeout(CAMERAS, 30000).then(function (payload) {
      var all = camerasFromCollection(payload);
      if (opts.onAll) opts.onAll(all, (payload && payload.dataUpdatedTime) || "");
      return rankCameras(all, origin, radius);
    });
  }

  function rankCameras(rows, origin, radius) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var d = metresBetween(origin.lat, origin.lng, r.lat, r.lng);
      if (d > radius) continue;
      out.push({
        id: r.id,
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        presetId: r.presetId,
        image: r.image,
        thumb: r.thumb,
        updated: r.updated,
        dist: d,
      });
    }
    out.sort(function (a, b) { return a.dist - b.dist; });
    return out;
  }

  global.StationData = {
    findStations: findStations,
    refreshRegistry: refreshRegistry,
    loadStatuses: loadStatuses,
    loadTariffs: loadTariffs,
    findCameras: findCameras,
    camerasFromCollection: camerasFromCollection,
    stationFromFeature: stationFromFeature,
    stationsFromCollection: stationsFromCollection,
    stationFromElement: stationFromElement,
    stationSockets: stationSockets,
    stationName: stationName,
    overpassUrl: overpassUrl,
    powerText: powerText,
    standardText: standardText,
    inFinland: inFinland,
    metresBetween: metresBetween,
    readCache: readCache,
    clearCache: clearCache,
    OVERPASS_ENDPOINTS: OVERPASS_ENDPOINTS,
    LOCATIONS_URL: LOCATIONS_URL,
    STATUS_URL: STATUS_URL,
    TARIFF_URL: TARIFF_URL,
    CAMERAS: CAMERAS,
    K_STATIONS: K_STATIONS,
  };
})(typeof window !== "undefined" ? window : globalThis);