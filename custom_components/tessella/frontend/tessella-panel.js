/*
 * Tessella – Kachel-Dashboards für Smartphone und Tablet.
 *
 * Bewusst in ES5 geschrieben (keine let/const, Pfeilfunktionen, async, Spread, ?. oder ??),
 * ohne CSS-Grid und ohne Pfeil-Syntax, damit auch iOS 9 (Safari 9) läuft.
 *
 * Zwei Einstiege:
 *  - window.Tessella: der Kern. Bekommt ein Wurzelelement (Shadow Root oder normales div)
 *    und ein hass-Objekt. Wird von der eigenständigen Seite (standalone.html) benutzt.
 *  - <tessella-panel>: das HA-Panel. Nur in Browsern mit Custom Elements.
 */
(function (global) {
  "use strict";

  var TYPES = {
    toggle: "Schalter",
    light: "Licht (ziehen = dimmen)",
    sensor: "Sensor",
    button: "Knopf (Dienst)",
    climate: "Thermostat",
    cover: "Rollo / Tor",
    camera: "Kamera",
    history: "Verlauf (24 h)",
    clock: "Uhr",
    text: "Text",
    web: "Webseite",
    image: "Bild mit Werten"
  };
  var TYPE_ORDER = ["toggle", "light", "sensor", "button", "climate", "cover", "camera", "history", "clock", "text", "web", "image"];

  var NEEDS_ENTITY = ["toggle", "light", "sensor", "climate", "cover", "camera", "history"];

  var DEFAULT_ICON = {
    toggle: "mdi:toggle-switch",
    light: "mdi:lightbulb",
    sensor: "mdi:gauge",
    button: "mdi:gesture-tap-button",
    climate: "mdi:thermostat",
    cover: "mdi:window-shutter",
    camera: "mdi:cctv",
    history: "mdi:chart-line",
    clock: "mdi:clock-outline",
    text: "mdi:text",
    web: "mdi:web",
    image: "mdi:image"
  };

  var STATE_TEXT = { on: "An", off: "Aus", unavailable: "Nicht verfügbar", unknown: "Unbekannt" };

  var ROW_H = 80;
  var GAP = 10;
  var PAD = 12;

  var STYLE = [
    "* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }",
    ".app { min-height: 100%; display: -webkit-box; display: -webkit-flex; display: flex; -webkit-flex-direction: column; flex-direction: column;",
    "       background: var(--primary-background-color, #111); color: var(--primary-text-color, #eee);",
    "       font-family: system-ui, -apple-system, sans-serif; }",
    "header { position: relative; z-index: 5; display: -webkit-box; display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center;",
    "         padding: 8px 10px; background: var(--app-header-background-color, var(--primary-background-color, #111));",
    "         border-bottom: 1px solid var(--divider-color, #333); }",
    ".title { -webkit-box-flex: 1; -webkit-flex: 1; flex: 1; font-size: 1.15rem; font-weight: 600; overflow: hidden; white-space: nowrap; cursor: pointer; }",
    ".status { font-size: .75rem; color: var(--secondary-text-color, #999); margin-right: 4px; }",
    ".ib { -webkit-appearance: none; appearance: none; border: 0; background: transparent; color: inherit; width: 40px; height: 40px;",
    "      border-radius: 50%; display: inline-block; text-align: center; line-height: 40px; cursor: pointer; font-size: 0; }",
    ".ib ha-icon { display: inline-block; vertical-align: middle; }",
    ".ib:active { background: rgba(128,128,128,.25); }",
    ".ib.on { color: var(--primary-color, #03a9f4); }",
    ".ib[hidden] { display: none; }",
    "nav.pages { padding: 8px 10px 0; overflow-x: auto; white-space: nowrap; }",
    ".pill { -webkit-appearance: none; appearance: none; border: 1px solid var(--divider-color, #444); background: transparent; color: inherit;",
    "        border-radius: 999px; padding: 6px 14px; margin-right: 6px; font: inherit; font-size: .9rem; white-space: nowrap; cursor: pointer; }",
    ".pill.active { background: var(--primary-color, #03a9f4); border-color: transparent; color: #fff; }",
    "main { position: relative; -webkit-box-flex: 1; -webkit-flex: 1; flex: 1; }",
    ".grid { position: relative; width: 100%; }",
    ".empty { position: absolute; padding: 40px 20px; text-align: center; color: var(--secondary-text-color, #999); }",
    ".tile { position: absolute; overflow: hidden; border-radius: 18px; padding: 12px; display: -webkit-box; display: -webkit-flex; display: flex;",
    "        -webkit-flex-direction: column; flex-direction: column;",
    "        background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); color: inherit;",
    "        box-shadow: 0 1px 3px rgba(0,0,0,.25); cursor: default; -webkit-user-select: none; user-select: none; }",
    ".tile .tl-head { display: block; font-size: .9rem; color: var(--secondary-text-color, #aaa); white-space: nowrap; overflow: hidden; }",
    ".tile .tl-head ha-icon { --mdc-icon-size: 22px; vertical-align: middle; margin-right: 6px; }",
    ".tile .tl-value { margin-top: auto; font-size: 1.35rem; font-weight: 600; }",
    ".tile.on { background: var(--primary-color, #03a9f4); color: #fff; }",
    ".tile.unavail { opacity: .5; }",
    ".tile.flash { opacity: .75; }",
    ".tile.toggle, .tile.button { cursor: pointer; }",
    ".edit .tile { outline: 2px dashed var(--primary-color, #03a9f4); outline-offset: -2px; cursor: pointer; }",
    ".add-tile { position: absolute; text-align: center; border: 2px dashed var(--divider-color, #555); background: transparent;",
    "            border-radius: 18px; color: var(--secondary-text-color, #999); font: inherit; cursor: pointer; }",
    ".tile.light { padding: 0; touch-action: none; }",
    ".tile.light .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: var(--primary-color, #03a9f4); opacity: .85; pointer-events: none; }",
    ".tile.light .lbl { position: relative; padding: 12px; height: 100%; pointer-events: none; }",
    ".tile.light .pct { position: absolute; top: 10px; right: 12px; margin: 0; font-size: 1rem; font-weight: 700; }",
    ".tile.light .lbl { position: relative; padding: 10px 12px; height: 100%; box-sizing: border-box; }",
    ".tile.light .lrow { position: relative; margin-top: 8px; pointer-events: auto; }",
    ".tile.light .ltrack { pointer-events: auto; }",
    ".lbtn { -webkit-appearance: none; appearance: none; border: 0; border-radius: 10px; width: 34px; min-width: 34px; height: 32px; padding: 0; font-size: 1.1rem; background: rgba(0,0,0,.35); color: #fff; }",
    ".lrow { display: -webkit-box; display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; }",
    ".ltrack { position: relative; -webkit-box-flex: 1; -webkit-flex: 1; flex: 1; min-width: 30px; height: 32px; margin: 0 4px; border-radius: 10px; background: rgba(0,0,0,.35); overflow: hidden; }",
    ".lfill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: rgba(255,255,255,.4); }",
    ".lknob { position: absolute; top: 4px; bottom: 4px; left: 0; width: 6px; margin-left: -3px; background: #fff; border-radius: 3px; }",
    ".tile.camera { padding: 0; }",
    ".tile.camera img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block; }",
    ".tile.camera .cam-lbl { position: absolute; left: 0; right: 0; bottom: 0; padding: 6px 10px; background: rgba(0,0,0,.45); color: #fff; font-size: .85rem; }",
    ".climate-row { margin-top: auto; }",
    ".climate-row .big { font-size: 1.6rem; font-weight: 700; }",
    ".stepper { margin-top: 6px; }",
    ".stepper button { -webkit-appearance: none; appearance: none; border: 0; border-radius: 50%; width: 40px; height: 40px; font-size: 1.3rem; cursor: pointer;",
    "                  background: rgba(128,128,128,.3); color: inherit; display: inline-block; vertical-align: middle; margin: 0 4px; }",
    ".stepper button:disabled { opacity: .4; }",
    ".cover-row { margin-top: auto; }",
    ".cover-row button { -webkit-appearance: none; appearance: none; border: 0; border-radius: 12px; height: 44px; width: 31%; margin-right: 2%; cursor: pointer;",
    "                    background: rgba(128,128,128,.3); color: inherit; font-size: 1.2rem; }",
    ".spark { width: 100%; height: 60px; margin-top: 6px; }",
    ".spark polyline { fill: none; stroke: var(--primary-color, #03a9f4); stroke-width: 2; }",
    ".spark-meta { font-size: .75rem; color: var(--secondary-text-color, #999); }",
    ".clock-time { font-size: 2.6rem; font-weight: 300; margin-top: auto; line-height: 1; }",
    ".clock-date { color: var(--secondary-text-color, #aaa); font-size: .9rem; margin-top: 4px; }",
    ".text-body { white-space: pre-wrap; margin-top: 6px; font-size: 1rem; }",
    ".tile.web iframe { position: absolute; top: 0; left: 0; border: 0; width: 100%; height: 100%; }",
    ".tile.web .tl-head { position: absolute; z-index: 1; left: 12px; top: 12px; background: #1e1e1e; border-radius: 8px; padding: 2px 6px; }",
    ".sheet-back { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 20; background: rgba(0,0,0,.45); }",
    ".sheet-back[hidden] { display: none; }",
    ".sheet { position: absolute; bottom: 0; left: 0; right: 0; max-height: 92%; overflow-y: auto; -webkit-overflow-scrolling: touch;",
    "         background: var(--ha-card-background, var(--card-background-color, #222)); color: var(--primary-text-color, #eee);",
    "         border-radius: 20px 20px 0 0; padding: 16px 16px 24px; }",
    ".sheet h2 { margin: 0 0 12px; font-size: 1.1rem; }",
    ".sheet .row { margin-bottom: 12px; }",
    ".sheet label { display: block; font-size: .8rem; color: var(--secondary-text-color, #aaa); margin-bottom: 4px; }",
    ".sheet input, .sheet select, .sheet textarea { font: inherit; font-size: 1rem; padding: 10px; border-radius: 10px; border: 1px solid var(--divider-color, #444);",
    "            background: var(--primary-background-color, #111); color: inherit; width: 100%; }",
    ".sheet textarea { min-height: 80px; font-family: monospace; font-size: .85rem; }",
    ".sheet .btns { margin-top: 8px; }",
    ".btn { -webkit-appearance: none; appearance: none; display: inline-block; border: 0; border-radius: 12px; padding: 11px 16px; margin: 0 6px 6px 0; font: inherit; cursor: pointer;",
    "       background: rgba(128,128,128,.3); color: inherit; }",
    ".btn.primary { background: var(--primary-color, #03a9f4); color: #fff; }",
    ".btn.danger { background: var(--error-color, #db4437); color: #fff; }",
    ".btn:disabled { opacity: .4; }",
    ".types .btn { display: block; width: 100%; text-align: left; margin: 0 0 8px 0; }",
    ".list-item { display: block; width: 100%; text-align: left; margin-bottom: 6px; }",
    ".list-item.current { outline: 2px solid var(--primary-color, #03a9f4); }",
    ".hint { font-size: .8rem; color: var(--secondary-text-color, #999); margin: -6px 0 10px; }",
    ".toast { position: fixed; left: 10%; right: 10%; bottom: 24px; z-index: 30; background: #333; color: #fff; padding: 10px 16px; border-radius: 12px;",
    "         font-size: .9rem; text-align: center; }",
    ".toast[hidden] { display: none; }",
    ".readonly .edit-only { display: none; }",
    ".ico { display: inline-block; width: 0; }",
    ".lgroup { margin-bottom: 12px; }",
    ".lrow2 { padding: 8px 0; border-bottom: 1px solid rgba(128,128,128,.25); }",
    ".lr-head { display: block; font-size: 1rem; margin-bottom: 6px; }",
    ".lr-val { float: right; color: #aaa; font-size: .9rem; }",
    ".tile.on .tl-head { color: #fff; }",
    ".climate-row .big { font-size: 1.4rem; }",
    ".stepper button { width: 34px; height: 34px; font-size: 1.1rem; }",
    ".cover-row button { height: 34px; font-size: 1rem; }",
    ".tile.climate, .tile.cover { padding: 8px 10px; }",
    ".tile.image { padding: 0; background: transparent; box-shadow: none; }",
    ".ibox { position: absolute; }",
    ".ibox img { position: absolute; top: 0; left: 0; display: block; }",
    ".omask { position: absolute; border-radius: 3px; }",
    ".oval, .otext { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; font-weight: 600; line-height: 1; }",
    ".climate-row > div { display: inline-block; vertical-align: middle; }",
    ".climate-row .stepper { margin-top: 0; float: right; white-space: nowrap; }",
    ".stepper div { display: inline-block; vertical-align: middle; margin: 0 4px; font-size: 1.1rem; font-weight: 700; }",
    ".tile.climate .tl-head { font-size: .8rem; }"
  ].join("\n");

  // ---------- Hilfsfunktionen ----------

  function uid(prefix) {
    return (prefix || "k") + Math.random().toString(36).slice(2, 9);
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function haptic() {
    try {
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (e) { /* ignorieren */ }
  }

  function flat(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (Object.prototype.toString.call(arr[i]) === "[object Array]") out = out.concat(flat(arr[i]));
      else out.push(arr[i]);
    }
    return out;
  }

  function copyObj(src) {
    var out = {};
    for (var k in src) if (src.hasOwnProperty(k)) out[k] = src[k];
    return out;
  }

  function keysOf(obj) {
    var out = [];
    for (var k in obj) if (obj.hasOwnProperty(k)) out.push(k);
    return out;
  }

  function includes(arr, v) {
    return arr.indexOf(v) >= 0;
  }

  // h(tag, props, ...children) – erzeugt Elemente ohne moderne Syntax
  function h(tag, props) {
    var el = document.createElement(tag);
    var k;
    props = props || {};
    for (k in props) {
      if (!props.hasOwnProperty(k)) continue;
      var v = props[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = String(v);
      else if (k.indexOf("on") === 0 && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") {
        for (var s in v) if (v.hasOwnProperty(s)) el.style[s] = v[s];
      } else if (k === "value" || k === "checked" || k === "disabled" || k === "selected") el[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    var kids = flat(Array.prototype.slice.call(arguments, 2));
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // Icons nur, wenn das HA-Frontend das Element ha-icon bereitstellt (auf der eigenständigen Seite nicht).
  function hasHaIcon() {
    return !!(window.customElements && window.customElements.get && window.customElements.get("ha-icon"));
  }

  function icon(name, cls) {
    if (hasHaIcon()) return h("ha-icon", { icon: name, "class": cls || "" });
    return h("span", { "class": "ico" });
  }

  function replaceKids(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    var nodes = flat(Array.prototype.slice.call(arguments, 1));
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n === null || n === undefined || n === false) continue;
      el.appendChild(n instanceof Node ? n : document.createTextNode(String(n)));
    }
  }

  function hasClass(el, c) {
    return !!el && !!el.className && typeof el.className === "string" && (" " + el.className + " ").indexOf(" " + c + " ") >= 0;
  }

  function setClass(el, c, on) {
    var has = hasClass(el, c);
    if (on && !has) el.className = (el.className + " " + c).replace(/^\s+/, "");
    else if (!on && has) el.className = (" " + el.className + " ").replace(" " + c + " ", " ").replace(/^\s+|\s+$/g, "");
  }

  // Nächstes Elternelement (inklusive el), für das pred true liefert
  function findUp(el, pred) {
    var n = el;
    while (n && n.nodeType === 1) {
      if (pred(n)) return n;
      n = n.parentNode;
    }
    return null;
  }

  function pathOf(e) {
    if (e.composedPath) return e.composedPath();
    var out = [];
    var n = e.target;
    while (n) {
      out.push(n);
      n = n.parentNode || n.host;
    }
    return out;
  }

  // Zahlen passend zur Einheit runden (z. B. 14,508911 kWh -> 14,51 kWh)
  function formatValue(txt, unit) {
    var n = Number(txt);
    if (txt !== "" && isFinite(n) && /^-?\d+(\.\d+)?$/.test(txt)) {
      var dec = 1;
      if (unit === "kWh" || unit === "V" || unit === "A") dec = 2;
      else if (unit === "W" && Math.abs(n) >= 100) dec = 0;
      txt = n.toFixed(dec).replace(".", ",");
    }
    return txt + (unit ? " " + unit : "");
  }

  function stateText(st) {
    if (!st) return "—";
    return STATE_TEXT[st.state] != null ? STATE_TEXT[st.state] : st.state;
  }

  function numberOr(v, fallback) {
    var n = Number(v);
    return isFinite(n) && v !== null && v !== "" ? n : fallback;
  }

  function queryParam(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Zeiger-Ereignisse: auf iOS 9 gibt es keine Pointer-Events, dort nehmen wir Touch-Ereignisse.
  var HAS_POINTER = typeof window !== "undefined" && "PointerEvent" in window;
  var TOUCH_FOR = { pointerdown: "touchstart", pointermove: "touchmove", pointerup: "touchend", pointercancel: "touchcancel" };

  function onPtr(el, name, fn) {
    if (HAS_POINTER) {
      el.addEventListener(name, fn);
      return;
    }
    el.addEventListener(TOUCH_FOR[name], function (ev) {
      var t = ev.changedTouches && ev.changedTouches[0];
      if (!t) return;
      fn({
        clientX: t.clientX,
        clientY: t.clientY,
        pointerId: 1,
        target: ev.target,
        preventDefault: function () { ev.preventDefault(); },
        composedPath: function () { return pathOf(ev); }
      });
    }, false);
  }

  function mqListen(mq, fn) {
    if (mq.addEventListener) mq.addEventListener("change", fn);
    else if (mq.addListener) mq.addListener(fn);
  }

  // Platzierung der Kacheln: wie CSS-Grid (zeilenweise, dicht nicht nötig), aber in JS,
  // weil iOS 9 kein CSS-Grid kennt.
  function placeTiles(items, cols) {
    var occ = [];
    var out = [];
    var cr = 0;
    var cc = 0;
    var maxRow = 0;
    var i;

    function free(r, c, w, hgt) {
      if (c + w > cols) return false;
      for (var a = 0; a < hgt; a++) {
        for (var b = 0; b < w; b++) {
          if (occ[r + a] && occ[r + a][c + b]) return false;
        }
      }
      return true;
    }

    function mark(r, c, w, hgt) {
      for (var a = 0; a < hgt; a++) {
        occ[r + a] = occ[r + a] || [];
        for (var b = 0; b < w; b++) occ[r + a][c + b] = true;
      }
    }

    for (i = 0; i < items.length; i++) {
      var w = Math.min(items[i].w, cols);
      var hgt = items[i].h;
      var placed = false;
      while (!placed) {
        if (cc + w > cols) {
          cc = 0;
          cr++;
          continue;
        }
        if (free(cr, cc, w, hgt)) {
          mark(cr, cc, w, hgt);
          out.push({ c: cc, r: cr, w: w, h: hgt });
          cc += w;
          placed = true;
        } else {
          cc++;
        }
      }
      maxRow = Math.max(maxRow, cr + hgt);
    }
    return { items: out, rows: maxRow };
  }

  // ---------- Stil ----------

  // ---------- Kern ----------

  function Tessella(root, opts) {
    var self = this;
    this.root = root;
    this.opts = opts || {};
    this.hass = null;
    this.data = null;
    this.loading = false;
    this.dashId = null;
    this.pageIdx = 0;
    this.edit = false;
    this.tiles = [];
    this.layoutItems = [];
    this.timers = [];
    this.saveTimer = null;
    this.toastTimer = null;
    this.raf = 0;
    this.wakeLock = null;
    this.swipe = null;
    this.connectedFlag = false;
    this.mq = window.matchMedia ? window.matchMedia("(max-width: 520px)") : { matches: false };
    mqListen(this.mq, function () { self.renderPage(); });
    this.onVisible = function () {
      if (document.visibilityState === "visible" && self.wantWake()) self.setWake(true, true);
    };
    this.onResize = function () { self.layout(); };
    this.build();
  }

  Tessella.prototype.build = function () {
    var self = this;
    var styleEl = h("style", { text: STYLE });
    this.titleEl = h("div", { "class": "title", onclick: function () { self.openMenu(); } });
    this.statusEl = h("span", { "class": "status" });
    this.wakeBtn = h("button", { "class": "ib", title: "Display wach halten", onclick: function () { self.setWake(!self.wantWake()); } }, icon("mdi:monitor-eye"));
    this.fsBtn = h("button", { "class": "ib", title: "Vollbild", onclick: function () { self.toggleFullscreen(); } }, icon("mdi:fullscreen"));
    this.editBtn = h("button", { "class": "ib edit-only", title: "Bearbeiten", onclick: function () { self.toggleEdit(); } }, icon("mdi:pencil"));
    this.menuBtn = h("button", { "class": "ib", title: "Dashboards und Seiten", onclick: function () { self.openMenu(); } }, icon("mdi:cog"));
    this.header = h("header", null, this.titleEl, this.statusEl, this.wakeBtn, this.fsBtn, this.menuBtn, this.editBtn);
    this.pagesEl = h("nav", { "class": "pages" });
    this.gridEl = h("div", { "class": "grid" });
    this.gridEl.addEventListener("click", function (e) { self.onGridClick(e); });
    this.mainEl = h("main", null, this.gridEl);
    onPtr(this.mainEl, "pointerdown", function (e) { self.swipeStart(e); });
    onPtr(this.mainEl, "pointerup", function (e) { self.swipeEnd(e); });
    onPtr(this.mainEl, "pointercancel", function () { self.swipe = null; });
    this.sheetEl = h("div", { "class": "sheet" });
    this.sheetOpenedAt = 0;
    this.sheetBack = h("div", { "class": "sheet-back", hidden: true, onclick: function (e) {
      // Klick nach dem Loslassen eines langen Drucks ignorieren, sonst schließt die Übersicht sofort
      if (e.target === self.sheetBack && Date.now() - self.sheetOpenedAt > 700) self.closeSheet();
    } }, this.sheetEl);
    this.toastEl = h("div", { "class": "toast", hidden: true });
    this.app = h("div", { "class": "app" }, this.header, this.pagesEl, this.mainEl, this.sheetBack, this.toastEl);
    replaceKids(this.root, styleEl, this.app);
    this.built = true;
    this.setWakeButton();
    if (this.wantWake()) this.setWake(true, true);
  };

  Tessella.prototype.connected = function () {
    if (this.connectedFlag) return;
    this.connectedFlag = true;
    document.addEventListener("visibilitychange", this.onVisible, false);
    window.addEventListener("resize", this.onResize, false);
    this.maybeLoad();
    this.layout();
  };

  Tessella.prototype.disconnected = function () {
    this.connectedFlag = false;
    document.removeEventListener("visibilitychange", this.onVisible, false);
    window.removeEventListener("resize", this.onResize, false);
    this.clearTiles();
    if (this.wakeLock && this.wakeLock.release) {
      var r = this.wakeLock.release();
      if (r && r.catch) r.catch(function () {});
    }
    this.wakeLock = null;
  };

  Tessella.prototype.setHass = function (hass) {
    var self = this;
    this.hass = hass;
    if (!this.data) this.maybeLoad();
    if (!this.raf) {
      this.raf = requestAnimationFrame(function () {
        self.raf = 0;
        self.updateTiles();
      });
    }
    this.refreshAdminVisibility();
  };

  Tessella.prototype.refreshAdminVisibility = function () {
    if (!this.app) return;
    var isAdmin = !!(this.hass && this.hass.user && this.hass.user.is_admin);
    setClass(this.app, "readonly", !isAdmin);
    if (!isAdmin && this.edit) this.edit = false;
    setClass(this.app, "edit", this.edit);
    setClass(this.editBtn, "on", this.edit);
    replaceKids(this.editBtn, icon(this.edit ? "mdi:check" : "mdi:pencil"));
  };

  // ---------- Laden und Speichern ----------

  Tessella.prototype.maybeLoad = function () {
    var self = this;
    if (this.loading || this.data || !this.hass || !this.built) return;
    this.loading = true;
    this.hass.callWS({ type: "tessella/get" }).then(function (d) {
      self.loading = false;
      self.data = d;
      self.pickDashboard();
      self.renderAll();
    }, function (err) {
      self.loading = false;
      self.toast("Laden fehlgeschlagen: " + ((err && err.message) || err));
    });
  };

  Tessella.prototype.pickDashboard = function () {
    var ids = keysOf(this.data.dashboards);
    var candidates = [queryParam("d"), localStorage.getItem("tessella.dashboard"), this.dashId, ids[0]];
    var chosen = null;
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && this.data.dashboards[candidates[i]]) {
        chosen = candidates[i];
        break;
      }
    }
    this.dashId = chosen || ids[0];
    this.pageIdx = 0;
  };

  Tessella.prototype.scheduleSave = function () {
    var self = this;
    this.setStatus("Ändert…");
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(function () { self.saveNow(); }, 600);
  };

  Tessella.prototype.saveNow = function () {
    var self = this;
    if (!this.data || !this.hass) return;
    this.setStatus("Speichere…");
    // Antwort nicht übernehmen: inzwischen getippte Änderungen würden sonst verloren gehen.
    this.hass.callWS({ type: "tessella/save", data: this.data }).then(function () {
      self.setStatus("Gespeichert");
    }, function (err) {
      self.setStatus("Fehler");
      self.toast((err && err.message) || String(err));
    });
  };

  Tessella.prototype.setStatus = function (text) {
    if (this.statusEl) this.statusEl.textContent = text || "";
  };

  Tessella.prototype.mutate = function (fn) {
    fn(this.data);
    this.scheduleSave();
    this.renderAll();
  };

  // ---------- Zugriff auf Daten ----------

  Tessella.prototype.dash = function () {
    return this.data.dashboards[this.dashId];
  };

  Tessella.prototype.pages = function () {
    return this.dash().pages;
  };

  Tessella.prototype.page = function () {
    var pages = this.pages();
    this.pageIdx = clamp(this.pageIdx, 0, pages.length - 1);
    return pages[this.pageIdx];
  };

  Tessella.prototype.cols = function () {
    var page = this.page();
    return this.mq.matches ? Math.min(page.columns, 2) : page.columns;
  };

  Tessella.prototype.wantWake = function () {
    try {
      return localStorage.getItem("tessella.wake") === "1";
    } catch (e) {
      return false;
    }
  };

  // ---------- Darstellung ----------

  Tessella.prototype.renderAll = function () {
    if (!this.data || !this.built) return;
    this.titleEl.textContent = this.dash().title;
    this.renderPages();
    this.renderPage();
  };

  Tessella.prototype.renderPages = function () {
    var self = this;
    var pages = this.pages();
    var children = [];
    for (var i = 0; i < pages.length; i++) {
      children.push(h("button", {
        "class": "pill" + (i === this.pageIdx ? " active" : ""),
        onclick: (function (idx) { return function () { self.gotoPage(idx); }; })(i)
      }, pages[i].title));
    }
    if (this.edit) children.push(h("button", { "class": "pill", onclick: function () { self.addPage(); } }, "+ Seite"));
    replaceKids(this.pagesEl, children);
    this.pagesEl.hidden = pages.length <= 1 && !this.edit;
  };

  Tessella.prototype.gotoPage = function (i) {
    this.pageIdx = i;
    this.renderPages();
    this.renderPage();
    this.mainEl.scrollTop = 0;
  };

  Tessella.prototype.renderPage = function () {
    if (!this.data || !this.built) return;
    this.clearTiles();
    var page = this.page();
    var cols = this.cols();
    var nodes = [];
    var items = [];
    for (var i = 0; i < page.tiles.length; i++) {
      var tile = page.tiles[i];
      var made = this.makeTile(tile);
      this.tiles.push(made);
      nodes.push(made.el);
      items.push({ el: made.el, w: Math.min(tile.w, cols), h: tile.h, fit: made.fit });
    }
    if (this.edit) {
      var addEl = h("button", { "class": "add-tile", "data-add": "1" }, icon("mdi:plus"));
      nodes.push(addEl);
      items.push({ el: addEl, w: 1, h: 1 });
    }
    if (!page.tiles.length && !this.edit) {
      var emptyEl = h("div", { "class": "empty" }, "Noch keine Kacheln. Tippe oben auf das Zahnrad und dann auf Bearbeiten.");
      nodes.push(emptyEl);
      items.push({ el: emptyEl, w: cols, h: 2 });
    }
    replaceKids(this.gridEl, nodes);
    this.layoutItems = items;
    this.layout();
    this.updateTiles();
  };

  // Positioniert alle Kacheln in Pixeln passend zur aktuellen Breite
  Tessella.prototype.layout = function () {
    if (!this.built || !this.data || !this.layoutItems) return;
    var cols = this.cols();
    var width = this.gridEl.clientWidth || window.innerWidth || 320;
    var cell = (width - 2 * PAD - (cols - 1) * GAP) / cols;
    var pl = placeTiles(this.layoutItems, cols);
    for (var i = 0; i < pl.items.length; i++) {
      var p = pl.items[i];
      var el = this.layoutItems[i].el;
      el.style.left = (PAD + p.c * (cell + GAP)) + "px";
      el.style.top = (PAD + p.r * (ROW_H + GAP)) + "px";
      el.style.width = (p.w * cell + (p.w - 1) * GAP) + "px";
      el.style.height = (p.h * ROW_H + (p.h - 1) * GAP) + "px";
      if (this.layoutItems[i].fit) this.layoutItems[i].fit();
    }
    var rows = Math.max(pl.rows, 1);
    this.gridEl.style.height = (2 * PAD + rows * ROW_H + (rows - 1) * GAP) + "px";
  };

  Tessella.prototype.clearTiles = function () {
    var i;
    for (i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i].destroy) this.tiles[i].destroy();
    }
    for (i = 0; i < this.timers.length; i++) clearInterval(this.timers[i]);
    this.timers = [];
    this.tiles = [];
  };

  Tessella.prototype.timer = function (fn, ms) {
    var id = setInterval(fn, ms);
    this.timers.push(id);
    return id;
  };

  Tessella.prototype.updateTiles = function () {
    if (!this.hass) return;
    if (this.sheetRefresh) this.sheetRefresh(this.hass);
    for (var i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i].update) this.tiles[i].update(this.hass);
    }
  };

  Tessella.prototype.onGridClick = function (e) {
    if (!this.edit) return;
    var self = this;
    var add = findUp(e.target, function (n) { return n.getAttribute && n.getAttribute("data-add") !== null; });
    if (add) return this.newTile();
    var tileEl = findUp(e.target, function (n) { return hasClass(n, "tile"); });
    if (!tileEl) return;
    var id = tileEl.getAttribute("data-id");
    var tiles = this.page().tiles;
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].id === id) {
        self.tileEditor(tiles[i], false);
        return;
      }
    }
  };

  // Gemeinsame Hilfe: Dienst aufrufen, Fehler als Hinweis zeigen
  Tessella.prototype.call = function (domain, service, data) {
    var self = this;
    return this.hass.callService(domain, service, data).catch(function (e) {
      self.toast("Fehler: " + ((e && e.message) || e));
    });
  };

  Tessella.prototype.makeTile = function (tile) {
    var self = this;
    var el = h("div", { "class": "tile " + tile.type, "data-id": tile.id });
    var headOf = function (name, ico) {
      return h("div", { "class": "tl-head" }, icon(ico || tile.icon || DEFAULT_ICON[tile.type]), h("span", null, name));
    };
    var isEdit = function () { return self.edit; };
    var stateOf = function (hass) { return tile.entity ? hass.states[tile.entity] : undefined; };
    var nameOf = function (st) {
      return tile.name || (st && st.attributes && st.attributes.friendly_name) || tile.entity || TYPES[tile.type];
    };

    switch (tile.type) {
      case "toggle": return this.tileToggle(tile, el, headOf, stateOf, nameOf, isEdit);
      case "light": return this.tileLight(tile, el, headOf, stateOf, nameOf, isEdit);
      case "sensor": return this.tileSensor(tile, el, headOf, stateOf, nameOf);
      case "button": return this.tileButton(tile, el, headOf, stateOf, isEdit);
      case "climate": return this.tileClimate(tile, el, headOf, stateOf, nameOf, isEdit);
      case "cover": return this.tileCover(tile, el, headOf, stateOf, nameOf, isEdit);
      case "camera": return this.tileCamera(tile, el, stateOf, nameOf);
      case "history": return this.tileHistory(tile, el, headOf, stateOf, nameOf);
      case "clock": return this.tileClock(tile, el);
      case "image": return this.tileImage(tile, el);
      case "text":
        el.appendChild(h("div", { "class": "tl-head" }, icon(tile.icon || DEFAULT_ICON.text), h("span", null, tile.name || "")));
        el.appendChild(h("div", { "class": "text-body" }, tile.text || ""));
        return { el: el, update: function () {} };
      case "web":
        el.setAttribute("data-noswipe", "1");
        el.appendChild(h("div", { "class": "tl-head" }, icon(tile.icon || DEFAULT_ICON.web), h("span", null, tile.name || "")));
        // Im Bearbeiten-Modus kein iframe, damit Tipps den Editor öffnen.
        if (!isEdit()) el.appendChild(h("iframe", { src: tile.url, sandbox: "allow-scripts allow-forms allow-popups", referrerpolicy: "no-referrer" }));
        return { el: el, update: function () {} };
      default:
        el.appendChild(h("div", { "class": "tl-value" }, "Unbekannter Typ: " + tile.type));
        return { el: el, update: function () {} };
    }
  };

  Tessella.prototype.tileToggle = function (tile, el, headOf, stateOf, nameOf, isEdit) {
    var self = this;
    var head = headOf("");
    var label = h("div", { "class": "tl-value" });
    el.appendChild(head);
    el.appendChild(label);
    el.addEventListener("click", function () {
      if (isEdit() || !tile.entity) return;
      haptic();
      self.call("homeassistant", "toggle", { entity_id: tile.entity });
    });
    return {
      el: el,
      update: function (hass) {
        var st = stateOf(hass);
        head.querySelector("span").textContent = nameOf(st);
        label.textContent = stateText(st);
        setClass(el, "on", !!st && st.state === "on");
        setClass(el, "unavail", !st || st.state === "unavailable");
      }
    };
  };

  Tessella.prototype.tileLight = function (tile, el, headOf, stateOf, nameOf, isEdit) {
    var self = this;
    el.setAttribute("data-noswipe", "1");
    var bar = h("div", { "class": "bar" });
    var labelHead = headOf("");
    var pct = h("div", { "class": "pct" });
    var fill = h("div", { "class": "lfill" });
    var knob = h("div", { "class": "lknob" });
    var track = h("div", { "class": "ltrack" }, fill, knob);
    var value = 0;
    var busyUntil = 0;
    var lastOn = 100;
    var dragging = false;
    var lastSend = 0;

    var curPct = function (st) {
      if (!st || st.state !== "on") return 0;
      if (st.attributes.brightness == null) return 100;
      return Math.round((st.attributes.brightness / 255) * 100);
    };
    var show = function (p) {
      value = p;
      bar.style.height = p + "%";
      pct.textContent = p + " %";
      fill.style.width = p + "%";
      knob.style.left = p + "%";
    };
    var sendLevel = function (p) {
      if (!tile.entity) return;
      if (p <= 0) self.call("light", "turn_off", { entity_id: tile.entity });
      else self.call("light", "turn_on", { entity_id: tile.entity, brightness_pct: p });
    };
    var setLevel = function (p) {
      if (isEdit() || !tile.entity) return;
      p = Math.max(0, Math.min(100, Math.round(p)));
      busyUntil = Date.now() + 2000;
      show(p);
      if (p > 0) lastOn = p;
      sendLevel(p);
    };
    var levelFromX = function (x) {
      var rect = track.getBoundingClientRect();
      if (!rect.width) return value;
      return ((x - rect.left) / rect.width) * 100;
    };
    var xOf = function (e) {
      var pt = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e;
      return pt.clientX;
    };
    var stop = function (fn) {
      return function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        fn();
      };
    };

    // Regler: Tippen setzt den Wert, Ziehen verändert ihn live
    var onStart = function (e) {
      if (isEdit() || !tile.entity) return;
      dragging = true;
      busyUntil = Date.now() + 2000;
      if (e.stopPropagation) e.stopPropagation();
      show(Math.max(0, Math.min(100, Math.round(levelFromX(xOf(e))))));
    };
    var onMove = function (e) {
      if (!dragging) return;
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      var p = Math.max(0, Math.min(100, Math.round(levelFromX(xOf(e)))));
      show(p);
      busyUntil = Date.now() + 2000;
      var now = Date.now();
      if (now - lastSend > 200) {
        lastSend = now;
        sendLevel(p);
      }
    };
    var onEnd = function (e) {
      if (!dragging) return;
      dragging = false;
      if (e && e.stopPropagation) e.stopPropagation();
      if (value > 0) lastOn = value;
      sendLevel(value);
    };
    track.addEventListener("touchstart", onStart, false);
    track.addEventListener("touchmove", onMove, false);
    track.addEventListener("touchend", onEnd, false);
    track.addEventListener("touchcancel", onEnd, false);
    track.addEventListener("mousedown", function (e) {
      onStart(e);
      var up = function (ev) {
        window.removeEventListener("mousemove", onMove, false);
        window.removeEventListener("mouseup", up, false);
        onEnd(ev);
      };
      window.addEventListener("mousemove", onMove, false);
      window.addEventListener("mouseup", up, false);
    }, false);
    track.addEventListener("click", function (e) {
      if (e.stopPropagation) e.stopPropagation();
    }, false);

    var minus = h("button", { "class": "lbtn", onclick: stop(function () { setLevel(value - 10); }) }, "−");
    var plus = h("button", { "class": "lbtn", onclick: stop(function () { setLevel(value + 10); }) }, "+");

    // Tipp auf die Kachel selbst: an oder aus
    el.addEventListener("click", function () {
      if (longFired) {
        longFired = false;
        return;
      }
      if (isEdit() || !tile.entity) return;
      haptic();
      var st = stateOf(self.hass);
      if (st && st.state === "on") {
        lastOn = curPct(st) || lastOn;
        self.call("light", "turn_off", { entity_id: tile.entity });
      } else if (st && st.attributes && st.attributes.brightness != null) {
        setLevel(lastOn);
      } else {
        self.call("light", "turn_on", { entity_id: tile.entity });
      }
    });

    // Langes Drücken auf die Kachel: Übersicht aller Lichter dieses Raums
    var pressTimer = null;
    var longFired = false;
    var pressX = 0;
    var pressY = 0;
    var pointOf = function (e) {
      return e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e;
    };
    var pressStart = function (e) {
      if (isEdit() || !tile.entity) return;
      if (findUp(e.target, function (n) { return hasClass(n, "lrow"); })) return;
      var pt = pointOf(e);
      pressX = pt.clientX;
      pressY = pt.clientY;
      longFired = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(function () {
        longFired = true;
        haptic();
        self.openLightGroup(tile);
      }, 600);
    };
    var pressMove = function (e) {
      var pt = pointOf(e);
      if (Math.abs(pt.clientX - pressX) > 10 || Math.abs(pt.clientY - pressY) > 10) clearTimeout(pressTimer);
    };
    var pressEnd = function () {
      clearTimeout(pressTimer);
    };
    el.addEventListener("touchstart", pressStart, false);
    el.addEventListener("touchmove", pressMove, false);
    el.addEventListener("touchend", pressEnd, false);
    el.addEventListener("touchcancel", pressEnd, false);
    el.addEventListener("mousedown", pressStart, false);
    el.addEventListener("mouseup", pressEnd, false);

    el.appendChild(bar);
    el.appendChild(h("div", { "class": "lbl" }, labelHead, pct, h("div", { "class": "lrow" }, minus, track, plus)));

    return {
      el: el,
      update: function (hass) {
        var st = stateOf(hass);
        replaceKids(labelHead, icon(tile.icon || DEFAULT_ICON.light), h("span", null, nameOf(st)));
        setClass(el, "on", !!st && st.state === "on");
        setClass(el, "unavail", !st || st.state === "unavailable");
        if (Date.now() > busyUntil && !dragging) {
          var p = curPct(st);
          show(p);
          if (st && st.state === "on") lastOn = p || lastOn;
        }
      }
    };
  };

  // Eine Zeile pro Licht in der Übersicht: Name, Wert, − , Regler und +
  Tessella.prototype.lightRow = function (eid) {
    var self = this;
    var name = h("span", { "class": "lr-name" });
    var val = h("span", { "class": "lr-val" });
    var fill = h("div", { "class": "lfill" });
    var knob = h("div", { "class": "lknob" });
    var track = h("div", { "class": "ltrack" }, fill, knob);
    var level = 0;
    var busyUntil = 0;
    var dragging = false;
    var lastSend = 0;

    var show = function (p) {
      level = p;
      fill.style.width = p + "%";
      knob.style.left = p + "%";
      val.textContent = p > 0 ? p + " %" : "Aus";
    };
    var send = function (p) {
      if (p <= 0) self.call("light", "turn_off", { entity_id: eid });
      else self.call("light", "turn_on", { entity_id: eid, brightness_pct: p });
    };
    var setLevel = function (p) {
      p = Math.max(0, Math.min(100, Math.round(p)));
      busyUntil = Date.now() + 2000;
      show(p);
      send(p);
    };
    var levelFromX = function (x) {
      var rect = track.getBoundingClientRect();
      if (!rect.width) return level;
      return Math.max(0, Math.min(100, Math.round(((x - rect.left) / rect.width) * 100)));
    };
    var xOf = function (e) {
      var pt = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e;
      return pt.clientX;
    };
    var onStart = function (e) {
      dragging = true;
      busyUntil = Date.now() + 2000;
      if (e.stopPropagation) e.stopPropagation();
      show(levelFromX(xOf(e)));
    };
    var onMove = function (e) {
      if (!dragging) return;
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      var p = levelFromX(xOf(e));
      show(p);
      busyUntil = Date.now() + 2000;
      if (Date.now() - lastSend > 200) {
        lastSend = Date.now();
        send(p);
      }
    };
    var onEnd = function () {
      if (!dragging) return;
      dragging = false;
      send(level);
    };
    track.addEventListener("touchstart", onStart, false);
    track.addEventListener("touchmove", onMove, false);
    track.addEventListener("touchend", onEnd, false);
    track.addEventListener("touchcancel", onEnd, false);
    track.addEventListener("mousedown", function (e) {
      onStart(e);
      var up = function (ev) {
        window.removeEventListener("mousemove", onMove, false);
        window.removeEventListener("mouseup", up, false);
        onEnd(ev);
      };
      window.addEventListener("mousemove", onMove, false);
      window.addEventListener("mouseup", up, false);
    }, false);

    var minus = h("button", { "class": "lbtn", onclick: function () { setLevel(level - 10); } }, "−");
    var plus = h("button", { "class": "lbtn", onclick: function () { setLevel(level + 10); } }, "+");
    var el = h("div", { "class": "lrow2" },
      h("div", { "class": "lr-head" }, name, val),
      h("div", { "class": "lrow" }, minus, track, plus));
    return {
      el: el,
      update: function (hass) {
        var st = hass.states[eid];
        name.textContent = (st && st.attributes && st.attributes.friendly_name) || eid;
        var on = !!st && st.state === "on";
        var p = !on ? 0 : (st.attributes.brightness == null ? 100 : Math.round((st.attributes.brightness / 255) * 100));
        if (!dragging && Date.now() > busyUntil) show(p);
      }
    };
  };

  Tessella.prototype.openLightGroup = function (tile) {
    var self = this;
    var ids = tile.group && tile.group.length ? tile.group : [tile.entity];
    var rows = [];
    for (var i = 0; i < ids.length; i++) rows.push(this.lightRow(ids[i]));
    var all = function (on) {
      for (var k = 0; k < ids.length; k++) {
        if (on) self.call("light", "turn_on", { entity_id: ids[k] });
        else self.call("light", "turn_off", { entity_id: ids[k] });
      }
    };
    this.openSheet(function () {
      var els = [];
      for (var j = 0; j < rows.length; j++) els.push(rows[j].el);
      return [
        h("h2", null, (tile.name || "Lichter") + " – alle"),
        h("div", { "class": "lgroup" }, els),
        h("div", { "class": "btns" },
          h("button", { "class": "btn primary", onclick: function () { all(true); } }, "Alle an"),
          h("button", { "class": "btn", onclick: function () { all(false); } }, "Alle aus"),
          h("button", { "class": "btn", onclick: function () { self.closeSheet(); } }, "Schließen"))
      ];
    });
    this.sheetRefresh = function (hass) {
      for (var j = 0; j < rows.length; j++) rows[j].update(hass);
    };
    if (this.hass) this.sheetRefresh(this.hass);
  };

  Tessella.prototype.tileSensor = function (tile, el, headOf, stateOf, nameOf) {
    var head = headOf("");
    var val = h("div", { "class": "tl-value" });
    el.appendChild(head);
    el.appendChild(val);
    return {
      el: el,
      update: function (hass) {
        var st = stateOf(hass);
        head.querySelector("span").textContent = nameOf(st);
        var unit = st && st.attributes && st.attributes.unit_of_measurement;
        val.textContent = st ? st.state + (unit ? " " + unit : "") : "—";
        setClass(el, "unavail", !st || st.state === "unavailable");
      }
    };
  };

  Tessella.prototype.tileButton = function (tile, el, headOf, stateOf, isEdit) {
    var self = this;
    var head = headOf("");
    var val = h("div", { "class": "tl-value" });
    el.appendChild(head);
    el.appendChild(val);
    el.addEventListener("click", function () {
      if (isEdit() || !tile.service) return;
      var parts = tile.service.split(".");
      var data = copyObj(tile.data || {});
      if (tile.entity) data.entity_id = tile.entity;
      haptic();
      setClass(el, "flash", true);
      setTimeout(function () { setClass(el, "flash", false); }, 300);
      self.call(parts[0], parts[1], data);
    });
    return {
      el: el,
      update: function (hass) {
        var st = stateOf(hass);
        head.querySelector("span").textContent = tile.name || TYPES.button;
        val.textContent = st ? stateText(st) : "";
      }
    };
  };

  Tessella.prototype.tileClimate = function (tile, el, headOf, stateOf, nameOf, isEdit) {
    var self = this;
    el.setAttribute("data-noswipe", "1");
    var cur = h("div", { "class": "big" });
    var target = h("div", { "class": "big" });
    var head = headOf("");
    var pending = null;
    var timer = null;
    var send = function (value) {
      clearTimeout(timer);
      timer = setTimeout(function () {
        self.call("climate", "set_temperature", { entity_id: tile.entity, temperature: value });
        pending = null;
      }, 700);
    };
    var step = function (dir, st) {
      if (isEdit() || !st) return;
      var s = numberOr(st.attributes.target_temp_step, 0.5);
      var base = pending != null ? pending : numberOr(st.attributes.temperature, 20);
      pending = Math.round((base + dir * s) * 10) / 10;
      target.textContent = pending.toFixed(1) + "°";
      send(pending);
    };
    var minus = h("button", { onclick: function () { step(-1, stateOf(self.hass)); } }, "−");
    var plus = h("button", { onclick: function () { step(1, stateOf(self.hass)); } }, "+");
    el.appendChild(head);
    el.appendChild(h("div", { "class": "climate-row" }, cur, h("div", { "class": "stepper" }, minus, target, plus)));
    return {
      el: el,
      update: function (hass) {
        var st = stateOf(hass);
        head.querySelector("span").textContent = nameOf(st);
        var unit = (st && st.attributes && st.attributes.temperature_unit) || "°";
        cur.textContent = st && st.attributes.current_temperature != null ? st.attributes.current_temperature + unit : stateText(st);
        if (pending == null) target.textContent = st && st.attributes.temperature != null ? st.attributes.temperature + unit : "—";
        minus.disabled = !st;
        plus.disabled = !st;
      }
    };
  };

  Tessella.prototype.tileCover = function (tile, el, headOf, stateOf, nameOf, isEdit) {
    var self = this;
    var head = headOf("");
    var val = h("div", { "class": "tl-value", style: { fontSize: "1rem" } });
    var act = function (service) {
      if (isEdit() || !tile.entity) return;
      haptic();
      self.call("cover", service, { entity_id: tile.entity });
    };
    var btn = function (ico, service, txt) {
      return h("button", { onclick: function () { act(service); } }, hasHaIcon() ? icon(ico) : txt);
    };
    el.appendChild(head);
    el.appendChild(val);
    el.appendChild(h("div", { "class": "cover-row" }, btn("mdi:arrow-up", "open_cover", "▲"), btn("mdi:stop", "stop_cover", "■"), btn("mdi:arrow-down", "close_cover", "▼")));
    return {
      el: el,
      update: function (hass) {
        var st = stateOf(hass);
        head.querySelector("span").textContent = nameOf(st);
        var pos = st && st.attributes ? st.attributes.current_position : null;
        val.textContent = pos != null ? stateText(st) + " · " + pos + " %" : stateText(st);
      }
    };
  };

  Tessella.prototype.tileCamera = function (tile, el, stateOf, nameOf) {
    var self = this;
    el.setAttribute("data-noswipe", "1");
    setClass(el, "camera", true);
    var img = h("img", { alt: "" });
    var label = h("div", { "class": "cam-lbl" });
    el.appendChild(img);
    el.appendChild(label);
    // Live-Bild über den MJPEG-Strom von Home Assistant (camera_proxy_stream), das
    // SecuritySpy und andere Kameras liefern. Schlägt das fehl, fällt die Kachel auf
    // Standbilder alle 2 s zurück.
    var base = "";
    var streaming = true;
    var snapshot = function () {
      if (!base) return;
      img.src = base.indexOf("data:") === 0 ? base : base + (base.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
    };
    var setStream = function () {
      if (!base) return;
      if (base.indexOf("data:") === 0) return snapshot();
      img.src = base.replace("/api/camera_proxy/", "/api/camera_proxy_stream/");
    };
    img.onerror = function () {
      if (streaming) {
        streaming = false;
        snapshot();
      }
    };
    var refresh = function () {
      if (!streaming) snapshot();
    };
    var timerId = this.timer(refresh, 2000);
    return {
      el: el,
      destroy: function () { clearInterval(timerId); },
      update: function (hass) {
        var st = stateOf(hass);
        label.textContent = nameOf(st);
        var pic = st && st.attributes ? st.attributes.entity_picture : null;
        if (pic && pic !== base) {
          base = pic;
          if (streaming) setStream();
          else snapshot();
        }
      }
    };
  };

  Tessella.prototype.tileHistory = function (tile, el, headOf, stateOf, nameOf) {
    var self = this;
    var val = h("div", { "class": "tl-value", style: { fontSize: "1.1rem" } });
    var polyline = h("polyline", { points: "" });
    var svg = h("svg", { "class": "spark", viewBox: "0 0 100 40", preserveAspectRatio: "none" }, polyline);
    var metaMin = h("span", null, "");
    var metaMax = h("span", null, "");
    var meta = h("div", { "class": "spark-meta" }, metaMin, " ", metaMax);
    var head = headOf("");
    el.appendChild(head);
    el.appendChild(val);
    el.appendChild(svg);
    el.appendChild(meta);
    var load = function () {
      if (!tile.entity || !self.hass) return;
      var end = new Date();
      var start = new Date(end.getTime() - 24 * 3600 * 1000);
      self.hass.callWS({
        type: "history/history_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: [tile.entity],
        minimal_response: true,
        no_attributes: true
      }).then(function (res) {
        var rows = (res && res[tile.entity]) || [];
        var pts = [];
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var v = parseFloat(r.state != null ? r.state : r.s);
          var t = r.lu ? r.lu * 1000 : Date.parse(r.last_updated || r.last_changed);
          if (isFinite(v) && isFinite(t)) pts.push([t, v]);
        }
        if (pts.length < 2) {
          polyline.setAttribute("points", "");
          metaMin.textContent = "zu wenig Daten";
          metaMax.textContent = "";
          return;
        }
        var vmin = Infinity;
        var vmax = -Infinity;
        for (var j = 0; j < pts.length; j++) {
          vmin = Math.min(vmin, pts[j][1]);
          vmax = Math.max(vmax, pts[j][1]);
        }
        var range = vmax - vmin || 1;
        var tspan = end.getTime() - start.getTime();
        var d = [];
        for (var k = 0; k < pts.length; k++) {
          var x = ((pts[k][0] - start.getTime()) / tspan) * 100;
          var y = 38 - ((pts[k][1] - vmin) / range) * 36;
          d.push(x.toFixed(2) + "," + y.toFixed(2));
        }
        polyline.setAttribute("points", d.join(" "));
        metaMin.textContent = "min " + vmin.toFixed(1);
        metaMax.textContent = "max " + vmax.toFixed(1);
      }, function () {
        metaMin.textContent = "Verlauf nicht verfügbar";
        metaMax.textContent = "";
      });
    };
    load();
    var timerId = this.timer(load, 5 * 60 * 1000);
    return {
      el: el,
      destroy: function () { clearInterval(timerId); },
      update: function (hass) {
        var st = stateOf(hass);
        head.querySelector("span").textContent = nameOf(st);
        var unit = st && st.attributes ? st.attributes.unit_of_measurement : null;
        val.textContent = st ? st.state + (unit ? " " + unit : "") : "—";
      }
    };
  };

  Tessella.prototype.tileClock = function (tile, el) {
    var time = h("div", { "class": "clock-time" });
    var date = h("div", { "class": "clock-date" });
    el.appendChild(h("div", { "class": "tl-head" }, icon(tile.icon || DEFAULT_ICON.clock), h("span", null, tile.name || "Uhr")));
    el.appendChild(time);
    el.appendChild(date);
    var self = this;
    var tick = function () {
      var now = new Date();
      var loc = (self.hass && self.hass.language) || navigator.language || "de-DE";
      var hasIntl = typeof Intl !== "undefined" && Intl.DateTimeFormat;
      if (hasIntl) {
        time.textContent = new Intl.DateTimeFormat(loc, { hour: "2-digit", minute: "2-digit" }).format(now);
        date.textContent = new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long" }).format(now);
      } else {
        var mm = now.getMinutes();
        time.textContent = (now.getHours() < 10 ? "0" : "") + now.getHours() + ":" + (mm < 10 ? "0" : "") + mm;
      }
    };
    tick();
    var timerId = this.timer(tick, 1000);
    return { el: el, destroy: function () { clearInterval(timerId); }, update: function () {} };
  };

  Tessella.prototype.tileImage = function (tile, el) {
    var ratio = 1048 / 1864;
    var box = h("div", { "class": "ibox" });
    var img = h("img", { src: tile.src, alt: "" });
    box.appendChild(img);
    el.appendChild(box);
    el.setAttribute("data-noswipe", "1");
    setClass(el, "image", true);

    var fontSpans = [];
    var valueEls = [];
    var overlays = tile.overlays || [];
    for (var i = 0; i < overlays.length; i++) {
      var o = overlays[i];
      var node;
      if (o.kind === "mask") {
        node = h("div", { "class": "omask" });
        node.style.left = o.x + "%";
        node.style.top = o.y + "%";
        node.style.width = o.w + "%";
        node.style.height = o.h + "%";
        node.style.background = o.color || "#1c1c1c";
      } else if (o.kind === "text") {
        node = h("span", { "class": "otext" }, o.text);
        node.style.left = o.x + "%";
        node.style.top = o.y + "%";
        node.style.color = o.color || "#eee";
        fontSpans.push({ el: node, size: o.size || 14 });
      } else {
        node = h("span", { "class": "oval" }, "–");
        node.style.left = o.x + "%";
        node.style.top = o.y + "%";
        node.style.color = o.color || "#eee";
        fontSpans.push({ el: node, size: o.size || 14 });
        valueEls.push({ el: node, entity: o.entity, unit: o.unit || "" });
      }
      box.appendChild(node);
    }

    var fit = function () {
      var W = el.clientWidth;
      var H = el.clientHeight;
      if (!W || !H) return;
      var bw = Math.min(W, H / ratio);
      var bh = bw * ratio;
      box.style.width = bw + "px";
      box.style.height = bh + "px";
      box.style.left = ((W - bw) / 2) + "px";
      box.style.top = ((H - bh) / 2) + "px";
      img.style.width = "100%";
      img.style.height = "100%";
      var scale = bw / 1864;
      for (var k = 0; k < fontSpans.length; k++) {
        fontSpans[k].el.style.fontSize = Math.max(6, fontSpans[k].size * scale) + "px";
      }
    };
    img.onload = function () {
      if (img.naturalWidth) ratio = img.naturalHeight / img.naturalWidth;
      fit();
    };

    return {
      el: el,
      fit: fit,
      update: function (hass) {
        for (var j = 0; j < valueEls.length; j++) {
          var v = valueEls[j];
          var st = hass.states[v.entity];
          var unit = v.unit || (st && st.attributes && st.attributes.unit_of_measurement) || "";
          if (!st || st.state === "unavailable" || st.state === "unknown") {
            v.el.textContent = "–";
          } else {
            v.el.textContent = formatValue(String(st.state), unit);
          }
        }
      }
    };
  };

  // ---------- Seitenwechsel per Wischen ----------

  Tessella.prototype.swipeStart = function (e) {
    if (this.edit && findUp(e.target, function (n) { return hasClass(n, "tile"); })) return;
    var path = pathOf(e);
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (n && n.getAttribute && n.getAttribute("data-noswipe")) {
        this.swipe = null;
        return;
      }
    }
    this.swipe = { x: e.clientX, y: e.clientY, t: Date.now() };
  };

  Tessella.prototype.swipeEnd = function (e) {
    var s = this.swipe;
    this.swipe = null;
    if (!s) return;
    var dx = e.clientX - s.x;
    var dy = e.clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    var pages = this.pages();
    if (dx < 0 && this.pageIdx < pages.length - 1) this.gotoPage(this.pageIdx + 1);
    if (dx > 0 && this.pageIdx > 0) this.gotoPage(this.pageIdx - 1);
  };

  // ---------- Bearbeiten ----------

  Tessella.prototype.toggleEdit = function () {
    if (!(this.hass && this.hass.user && this.hass.user.is_admin)) return this.toast("Nur Administratoren können bearbeiten.");
    this.edit = !this.edit;
    this.refreshAdminVisibility();
    this.renderAll();
  };

  Tessella.prototype.newTile = function () {
    var self = this;
    var cols = this.page().columns;
    this.openSheet(function () {
      var buttons = [];
      for (var i = 0; i < TYPE_ORDER.length; i++) {
        (function (type) {
          buttons.push(h("button", {
            "class": "btn",
            onclick: function () {
              self.tileEditor({ id: uid("t"), type: type, name: "", icon: "", entity: "", w: 1, h: 1, cols: cols }, true);
            }
          }, icon(DEFAULT_ICON[type]), " ", TYPES[type]));
        })(TYPE_ORDER[i]);
      }
      return [h("h2", null, "Kachel-Typ wählen"), h("div", { "class": "types" }, buttons)];
    });
  };

  Tessella.prototype.tileEditor = function (tile, isNew) {
    var self = this;
    var cols = this.page().columns;
    var draft = copyObj(tile);
    delete draft.cols;
    var inputs = {};
    var entityList = this.entityDatalist();
    var needsEntity = function (t) { return includes(NEEDS_ENTITY, t) || t === "button"; };

    var field = function (label, control, hint) {
      return h("div", { "class": "row" }, h("label", null, label), control, hint ? h("div", { "class": "hint" }, hint) : null);
    };
    var input = function (key, props) {
      var val = draft[key] != null ? draft[key] : "";
      var el = h("input", copyObj(props || {}));
      el.value = val;
      inputs[key] = el;
      return el;
    };
    var select = function (key, options, current) {
      var opts = [];
      for (var i = 0; i < options.length; i++) {
        opts.push(h("option", { value: String(options[i][0]), selected: String(options[i][0]) === String(current) }, options[i][1]));
      }
      var el = h("select", null, opts);
      inputs[key] = el;
      return el;
    };
    var textarea = function (key, value, props) {
      var el = h("textarea", props || {}, value != null ? value : "");
      inputs[key] = el;
      return el;
    };

    // Alle sichtbaren Felder in den Entwurf übernehmen. Wirft bei ungültigem JSON.
    var collect = function () {
      for (var k in inputs) if (inputs.hasOwnProperty(k)) draft[k] = inputs[k].value;
      draft.w = Number(draft.w) || 1;
      draft.h = Number(draft.h) || 1;
      if (draft.type === "image") {
        var rawOv = String(draft.overlays != null && typeof draft.overlays === "string" ? draft.overlays : "").trim();
        if (!rawOv) draft.overlays = [];
        else {
          try {
            draft.overlays = JSON.parse(rawOv);
          } catch (err2) {
            throw new Error("Overlays sind kein gültiges JSON.");
          }
        }
      }
      if (draft.type === "button") {
        var raw = String(draft.data != null ? draft.data : "").trim();
        if (!raw) draft.data = {};
        else {
          try {
            draft.data = JSON.parse(raw);
          } catch (err) {
            throw new Error("Daten sind kein gültiges JSON.");
          }
        }
      }
    };

    var overlaysText = function () {
      if (typeof draft.overlays === "string") return draft.overlays;
      return JSON.stringify(draft.overlays != null ? draft.overlays : [], null, 2);
    };

    var dataText = function () {
      if (typeof draft.data === "string") return draft.data;
      return JSON.stringify(draft.data != null ? draft.data : {}, null, 2);
    };

    var move = function (dir) {
      self.mutate(function (d) {
        var tiles = d.dashboards[self.dashId].pages[self.pageIdx].tiles;
        var i = -1;
        for (var k = 0; k < tiles.length; k++) if (tiles[k].id === tile.id) i = k;
        var j = i + dir;
        if (i >= 0 && j >= 0 && j < tiles.length) {
          var tmp = tiles[i];
          tiles[i] = tiles[j];
          tiles[j] = tmp;
        }
      });
      self.closeSheet();
    };

    var remove = function () {
      if (!confirm("Kachel wirklich löschen?")) return;
      self.mutate(function (d) {
        var pg = d.dashboards[self.dashId].pages[self.pageIdx];
        pg.tiles = pg.tiles.filter(function (t) { return t.id !== tile.id; });
      });
      self.closeSheet();
    };

    var save = function () {
      try {
        collect();
      } catch (err) {
        return self.toast(err.message);
      }
      var clean = { id: draft.id, type: draft.type, name: draft.name || "", icon: draft.icon || "", w: draft.w, h: draft.h };
      if (needsEntity(draft.type) && draft.entity) clean.entity = draft.entity;
      if (draft.type === "button") {
        clean.service = draft.service || "";
        clean.data = draft.data;
      }
      if (draft.type === "text") clean.text = draft.text || "";
      if (draft.type === "web") clean.url = draft.url || "";
      if (draft.type === "image") {
        clean.src = draft.src || "";
        clean.overlays = draft.overlays || [];
      }
      self.mutate(function (d) {
        var pg = d.dashboards[self.dashId].pages[self.pageIdx];
        var found = -1;
        for (var i = 0; i < pg.tiles.length; i++) if (pg.tiles[i].id === clean.id) found = i;
        if (found >= 0) pg.tiles[found] = clean;
        else pg.tiles.push(clean);
      });
      self.closeSheet();
    };

    var build = function () {
      inputs = {};
      var type = draft.type;
      var nodes = [
        h("h2", null, isNew ? "Neue Kachel" : "Kachel bearbeiten"),
        field("Typ", select("type", typeOptions(), type)),
        field("Name", input("name", { placeholder: "leer = Entitätsname" })),
        field("Symbol (mdi:…)", input("icon", { placeholder: DEFAULT_ICON[type] || "mdi:…" }))
      ];
      if (needsEntity(type)) {
        nodes.push(field(
          type === "button" ? "Entität (optional)" : "Entität",
          input("entity", { list: "tessella-entities", placeholder: "light.wohnzimmer", autocapitalize: "off", autocorrect: "off" }),
          type === "light" ? "Ziehen = dimmen, Tippen = an/aus" : null
        ));
      }
      if (type === "button") {
        nodes.push(field("Dienst", input("service", { placeholder: "script.gute_nacht", autocapitalize: "off" })));
        nodes.push(field("Daten (JSON)", textarea("data", dataText(), { placeholder: "{}" })));
      }
      if (type === "text") nodes.push(field("Text", textarea("text", draft.text)));
      if (type === "web") nodes.push(field("Adresse", input("url", { type: "url", placeholder: "https://…" }), "Viele Seiten erlauben kein Einbetten (iframe)."));
      if (type === "image") {
        nodes.push(field("Bild-Adresse", input("src", { placeholder: "/tessella_static/img/energie.png" })));
        nodes.push(field("Overlays (JSON)", textarea("overlays", overlaysText(), { placeholder: "[]" }), "Werte mit kind value und entity, Abdeckungen mit kind mask. x und y in Prozent des Bildes."));
      }
      var widths = [];
      for (var i = 1; i <= cols; i++) widths.push([i, String(i)]);
      nodes.push(field("Breite (Spalten)", select("w", widths, draft.w || 1)));
      nodes.push(field("Höhe (Reihen)", select("h", [[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"], [6, "6"]], draft.h || 1)));
      nodes.push(h("div", { "class": "btns" },
        h("button", { "class": "btn primary", onclick: save }, "Speichern"),
        h("button", { "class": "btn", onclick: function () { self.closeSheet(); } }, "Abbrechen")
      ));
      if (!isNew) {
        nodes.push(h("div", { "class": "btns" },
          h("button", { "class": "btn", onclick: function () { move(-1); } }, "← früher"),
          h("button", { "class": "btn", onclick: function () { move(1); } }, "später →"),
          h("button", { "class": "btn danger", onclick: remove }, "Löschen")
        ));
      }
      nodes.push(entityList);
      // Typwechsel: Eingaben sichern und Felder für den neuen Typ neu aufbauen.
      inputs.type.addEventListener("change", function () {
        try {
          collect();
        } catch (err) { /* ungültiges JSON beim Typwechsel: Text bleibt erhalten */ }
        self.openSheet(build);
      });
      return nodes;
    };

    this.openSheet(build);
  };

  function typeOptions() {
    var out = [];
    for (var i = 0; i < TYPE_ORDER.length; i++) out.push([TYPE_ORDER[i], TYPES[TYPE_ORDER[i]]]);
    return out;
  }

  Tessella.prototype.entityDatalist = function () {
    var states = (this.hass && this.hass.states) || {};
    var ids = keysOf(states).sort();
    var opts = [];
    for (var i = 0; i < ids.length; i++) {
      var st = states[ids[i]];
      opts.push(h("option", { value: ids[i] }, (st && st.attributes && st.attributes.friendly_name) || ""));
    }
    return h("datalist", { id: "tessella-entities" }, opts);
  };

  // ---------- Menü ----------

  Tessella.prototype.openMenu = function () {
    var self = this;
    if (!this.data) return;
    var isAdmin = !!(this.hass && this.hass.user && this.hass.user.is_admin);
    var items = [h("h2", null, "Dashboards")];
    var ids = keysOf(this.data.dashboards);
    for (var i = 0; i < ids.length; i++) {
      (function (id) {
        items.push(h("button", {
          "class": "btn list-item" + (id === self.dashId ? " current" : ""),
          onclick: function () {
            self.dashId = id;
            localStorage.setItem("tessella.dashboard", id);
            self.pageIdx = 0;
            self.closeSheet();
            self.renderAll();
          }
        }, icon("mdi:view-dashboard"), " ", self.data.dashboards[id].title));
      })(ids[i]);
    }
    if (isAdmin && this.edit) {
      items.push(h("div", { "class": "btns" },
        h("button", { "class": "btn", onclick: function () { self.newDashboard(); } }, "+ Dashboard"),
        h("button", { "class": "btn", onclick: function () { self.renameDashboard(); } }, "Titel ändern"),
        h("button", { "class": "btn danger", onclick: function () { self.deleteDashboard(); } }, "Dashboard löschen")
      ));
      var page = this.page();
      items.push(h("h2", null, "Seite: " + page.title));
      var colOpts = [];
      var choices = [2, 3, 4, 5, 6];
      for (var c = 0; c < choices.length; c++) colOpts.push(h("option", { value: choices[c], selected: choices[c] === page.columns }, String(choices[c])));
      items.push(h("div", { "class": "row" }, h("label", null, "Spalten (Tablet / Smartphone)"),
        h("select", {
          onchange: function (e) {
            var v = Number(e.target.value);
            self.mutate(function (d) { d.dashboards[self.dashId].pages[self.pageIdx].columns = v; });
          }
        }, colOpts)));
      items.push(h("div", { "class": "btns" },
        h("button", { "class": "btn", onclick: function () { self.renamePage(); } }, "Seite umbenennen"),
        h("button", { "class": "btn", onclick: function () { self.addPage(); } }, "+ Seite"),
        h("button", { "class": "btn danger", onclick: function () { self.deletePage(); } }, "Seite löschen")
      ));
      items.push(h("h2", null, "Export / Import"));
      items.push(h("div", { "class": "btns" },
        h("button", { "class": "btn", onclick: function () { self.exportDashboard(); } }, "Exportieren"),
        h("button", { "class": "btn", onclick: function () { self.importDashboard(); } }, "Importieren")
      ));
    }
    items.push(h("h2", null, "Anzeige"));
    items.push(h("div", { "class": "btns" },
      h("button", { "class": "btn", onclick: function () { self.setWake(!self.wantWake()); self.closeSheet(); } }, self.wantWake() ? "Wach halten: an" : "Wach halten: aus"),
      h("button", { "class": "btn", onclick: function () { self.toggleFullscreen(); self.closeSheet(); } }, "Vollbild")
    ));
    this.openSheet(function () { return items; });
  };

  Tessella.prototype.newDashboard = function () {
    var name = prompt("Name des neuen Dashboards:");
    if (!name || !name.trim()) return;
    var id = uid("d");
    this.dashId = id;
    this.pageIdx = 0;
    localStorage.setItem("tessella.dashboard", id);
    this.mutate(function (d) {
      d.dashboards[id] = { title: name.trim().slice(0, 60), pages: [{ id: uid("p"), title: "Start", columns: 3, tiles: [] }] };
    });
    this.closeSheet();
  };

  Tessella.prototype.renameDashboard = function () {
    var name = prompt("Neuer Titel:", this.dash().title);
    if (!name || !name.trim()) return;
    var id = this.dashId;
    this.mutate(function (d) { d.dashboards[id].title = name.trim().slice(0, 60); });
    this.closeSheet();
  };

  Tessella.prototype.deleteDashboard = function () {
    var self = this;
    if (keysOf(this.data.dashboards).length <= 1) return this.toast("Das letzte Dashboard kann nicht gelöscht werden.");
    if (!confirm("Dashboard „" + this.dash().title + "“ wirklich löschen?")) return;
    var doomed = this.dashId;
    var ids = keysOf(this.data.dashboards);
    for (var i = 0; i < ids.length; i++) {
      if (ids[i] !== doomed) {
        this.dashId = ids[i];
        break;
      }
    }
    this.pageIdx = 0;
    localStorage.setItem("tessella.dashboard", this.dashId);
    this.mutate(function (d) { delete d.dashboards[doomed]; });
    this.closeSheet();
    void self;
  };

  Tessella.prototype.addPage = function () {
    var name = prompt("Name der neuen Seite:", "Seite " + (this.pages().length + 1));
    if (!name || !name.trim()) return;
    var id = this.dashId;
    this.mutate(function (d) {
      d.dashboards[id].pages.push({ id: uid("p"), title: name.trim().slice(0, 40), columns: 3, tiles: [] });
    });
    this.pageIdx = this.pages().length - 1;
    this.closeSheet();
    this.renderAll();
  };

  Tessella.prototype.renamePage = function () {
    var name = prompt("Neuer Seitenname:", this.page().title);
    if (!name || !name.trim()) return;
    var id = this.dashId;
    var idx = this.pageIdx;
    this.mutate(function (d) { d.dashboards[id].pages[idx].title = name.trim().slice(0, 40); });
    this.closeSheet();
  };

  Tessella.prototype.deletePage = function () {
    if (this.pages().length <= 1) return this.toast("Die letzte Seite kann nicht gelöscht werden.");
    if (!confirm("Seite „" + this.page().title + "“ mit allen Kacheln löschen?")) return;
    var doomedIdx = this.pageIdx;
    this.pageIdx = Math.max(0, doomedIdx - 1);
    var id = this.dashId;
    this.mutate(function (d) { d.dashboards[id].pages.splice(doomedIdx, 1); });
    this.closeSheet();
  };

  Tessella.prototype.exportDashboard = function () {
    var text = JSON.stringify(this.dash(), null, 2);
    var self = this;
    var cb = navigator.clipboard;
    if (cb && cb.writeText) {
      cb.writeText(text).then(function () {
        self.toast("In die Zwischenablage kopiert");
      }, function () {
        self.showExport(text);
      });
    } else {
      this.showExport(text);
    }
  };

  Tessella.prototype.showExport = function (text) {
    this.openSheet(function () {
      return [h("h2", null, "Export"), h("textarea", { readonly: true, style: { minHeight: "240px" } }, text)];
    });
  };

  Tessella.prototype.importDashboard = function () {
    var self = this;
    var area;
    this.openSheet(function () {
      return [
        h("h2", null, "Import"),
        h("div", { "class": "hint" }, "Dashboard-JSON einfügen. Es ersetzt das aktuelle Dashboard."),
        (area = h("textarea", { placeholder: "{ … }" })),
        h("div", { "class": "btns" },
          h("button", {
            "class": "btn primary",
            onclick: function () {
              var parsed;
              try {
                parsed = JSON.parse(area.value);
              } catch (err) {
                return self.toast("Kein gültiges JSON.");
              }
              if (!parsed || !parsed.pages || parsed.pages.length === undefined) return self.toast("Das ist kein Tessella-Dashboard.");
              var id = self.dashId;
              self.mutate(function (d) { d.dashboards[id] = parsed; });
              self.pageIdx = 0;
              self.closeSheet();
            }
          }, "Übernehmen")
        )
      ];
    });
  };

  // ---------- Sheets, Toast, Vollbild, Wachhalten ----------

  Tessella.prototype.openSheet = function (build) {
    this.sheetOpenedAt = Date.now();
    replaceKids(this.sheetEl, build());
    this.sheetBack.hidden = false;
  };

  Tessella.prototype.closeSheet = function () {
    this.sheetRefresh = null;
    this.sheetBack.hidden = true;
    replaceKids(this.sheetEl);
  };

  Tessella.prototype.toast = function (text) {
    var self = this;
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(function () { self.toastEl.hidden = true; }, 3200);
  };

  Tessella.prototype.toggleFullscreen = function () {
    try {
      var de = document.documentElement;
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
      } else if (de.requestFullscreen) {
        de.requestFullscreen();
      } else {
        this.toast("Vollbild wird von diesem Browser nicht unterstützt.");
      }
    } catch (err) {
      this.toast("Vollbild wird von diesem Browser nicht unterstützt.");
    }
  };

  Tessella.prototype.setWakeButton = function () {
    setClass(this.wakeBtn, "on", this.wantWake());
  };

  Tessella.prototype.storeWake = function (value) {
    try {
      localStorage.setItem("tessella.wake", value);
    } catch (e) { /* ignorieren */ }
  };

  Tessella.prototype.setWake = function (on, silent) {
    var self = this;
    if (on) {
      if (!navigator.wakeLock || !navigator.wakeLock.request) {
        this.storeWake("0");
        if (!silent) this.toast("Wach halten wird von diesem Browser nicht unterstützt.");
      } else {
        navigator.wakeLock.request("screen").then(function (lock) {
          self.wakeLock = lock;
          self.storeWake("1");
          self.setWakeButton();
        }, function () {
          self.storeWake("0");
          if (!silent) self.toast("Wach halten braucht HTTPS oder wird vom Browser nicht unterstützt.");
          self.setWakeButton();
        });
      }
    } else {
      var lock = this.wakeLock;
      this.wakeLock = null;
      this.storeWake("0");
      if (lock && lock.release) {
        var r = lock.release();
        if (r && r.catch) r.catch(function () {});
      }
    }
    this.setWakeButton();
  };

  // Veraltete Aufrufe aus dem HA-Panel, kompatibel halten
  Tessella.prototype.refresh = function () {
    this.renderAll();
  };

  global.Tessella = Tessella;

  // ---------- HA-Panel (<tessella-panel>), nur mit Custom Elements ----------

  if (global.customElements && global.Reflect && global.HTMLElement && global.HTMLElement.prototype.attachShadow) {
    var PanelEl = function () {
      var el = Reflect.construct(HTMLElement, [], PanelEl);
      el.attachShadow({ mode: "open" });
      el._core = new Tessella(el.shadowRoot, {});
      return el;
    };
    PanelEl.prototype = Object.create(HTMLElement.prototype);
    PanelEl.prototype.constructor = PanelEl;
    PanelEl.prototype.connectedCallback = function () {
      this._core.connected();
    };
    PanelEl.prototype.disconnectedCallback = function () {
      this._core.disconnected();
    };
    Object.defineProperty(PanelEl.prototype, "hass", {
      set: function (v) { this._core.setHass(v); },
      get: function () { return this._core.hass; }
    });
    Object.setPrototypeOf(PanelEl, HTMLElement);
    if (!global.customElements.get("tessella-panel")) {
      global.customElements.define("tessella-panel", PanelEl);
    }
  }
})(window);
