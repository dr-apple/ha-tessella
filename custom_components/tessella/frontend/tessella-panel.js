/*
 * Tessella – Kachel-Dashboards für Smartphone und Tablet.
 * Eine Datei, kein Build-Schritt. Läuft als HA-Panel (bekommt `hass` von Home Assistant).
 */

const TYPES = {
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
};

const NEEDS_ENTITY = ["toggle", "light", "sensor", "climate", "cover", "camera", "history"];

const DEFAULT_ICON = {
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
};

const STATE_TEXT = { on: "An", off: "Aus", unavailable: "Nicht verfügbar", unknown: "Unbekannt" };

const uid = (prefix = "k") => prefix + Math.random().toString(36).slice(2, 9);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const haptic = () => { try { navigator.vibrate && navigator.vibrate(12); } catch (_) { /* ignorieren */ } };

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = String(v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "value" || k === "checked" || k === "disabled" || k === "selected") el[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const icon = (name, cls = "") => h("ha-icon", { icon: name, class: cls });

// Kompatibilität mit älteren Safari-Versionen (iOS 12/13): replaceChildren, Pointer-Events
// und addEventListener auf MediaQueryList fehlen dort.
function replaceKids(el, ...nodes) {
  while (el.firstChild) el.removeChild(el.firstChild);
  for (const n of nodes.flat()) {
    if (n === null || n === undefined || n === false) continue;
    el.appendChild(n instanceof Node ? n : document.createTextNode(String(n)));
  }
}

const HAS_POINTER = "PointerEvent" in window;
const TOUCH_FOR = { pointerdown: "touchstart", pointermove: "touchmove", pointerup: "touchend", pointercancel: "touchcancel" };

function onPtr(el, name, fn) {
  if (HAS_POINTER) {
    el.addEventListener(name, fn);
    return;
  }
  el.addEventListener(
    TOUCH_FOR[name],
    (ev) => {
      const t = ev.changedTouches && ev.changedTouches[0];
      if (!t) return;
      fn({
        clientX: t.clientX,
        clientY: t.clientY,
        pointerId: 1,
        target: ev.target,
        preventDefault: () => ev.preventDefault(),
        composedPath: () => (ev.composedPath ? ev.composedPath() : [ev.target]),
      });
    },
    { passive: true }
  );
}

function mqListen(mq, fn) {
  if (mq.addEventListener) mq.addEventListener("change", fn);
  else mq.addListener(fn);
}

function stateText(st) {
  if (!st) return "—";
  return STATE_TEXT[st.state] != null ? STATE_TEXT[st.state] : st.state;
}

function numberOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const STYLE = `
  :host { display: block; height: 100%; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  .app { min-height: 100%; display: flex; flex-direction: column;
         background: var(--primary-background-color, #111); color: var(--primary-text-color, #eee);
         font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif); }
  header { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 6px;
           padding: calc(env(safe-area-inset-top, 0px) + 8px) 10px 8px; background: var(--app-header-background-color, var(--primary-background-color));
           border-bottom: 1px solid var(--divider-color, #333); }
  .title { flex: 1; font-size: 1.15rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .status { font-size: .75rem; color: var(--secondary-text-color, #999); }
  .ib { appearance: none; border: 0; background: transparent; color: inherit; width: 40px; height: 40px;
        border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }
  .ib:active { background: var(--divider-color, rgba(128,128,128,.25)); }
  .ib.on { color: var(--primary-color, #03a9f4); }
  .ib[hidden] { display: none; }
  nav.pages { display: flex; gap: 6px; overflow-x: auto; padding: 8px 10px 0; scrollbar-width: none; }
  nav.pages::-webkit-scrollbar { display: none; }
  .pill { appearance: none; border: 1px solid var(--divider-color, #444); background: transparent; color: inherit;
          border-radius: 999px; padding: 6px 14px; font: inherit; font-size: .9rem; white-space: nowrap; cursor: pointer; }
  .pill.active { background: var(--primary-color, #03a9f4); border-color: transparent; color: var(--text-primary-color, #fff); }
  main { flex: 1; touch-action: pan-y; }
  .grid { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
          grid-auto-rows: minmax(96px, auto); gap: 10px; padding: 12px; }
  .empty { padding: 40px 20px; text-align: center; color: var(--secondary-text-color, #999); grid-column: 1 / -1; }
  .tile { position: relative; overflow: hidden; border-radius: 18px; padding: 12px; display: flex; flex-direction: column;
          background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); color: inherit;
          box-shadow: 0 1px 3px rgba(0,0,0,.25); cursor: default; user-select: none; -webkit-user-select: none; }
  .tile .tl-head { display: flex; align-items: center; gap: 8px; font-size: .9rem; color: var(--secondary-text-color, #aaa); min-width: 0; }
  .tile .tl-head span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tile .tl-head ha-icon { --mdc-icon-size: 22px; flex: none; }
  .tile .tl-value { margin-top: auto; font-size: 1.35rem; font-weight: 600; }
  .tile.on { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
  .tile.on .tl-head { color: inherit; }
  .tile.unavail { opacity: .5; }
  .tile.flash { filter: brightness(1.35); }
  .tile.toggle, .tile.button, .tile.web-tap { cursor: pointer; }
  .tile.toggle:active, .tile.button:active { transform: scale(.97); }
  .tile { transition: transform .12s ease, background-color .2s ease, filter .2s ease; }
  .edit .tile { outline: 2px dashed var(--primary-color, #03a9f4); outline-offset: -2px; cursor: pointer; }
  .add-tile { display: flex; align-items: center; justify-content: center; border: 2px dashed var(--divider-color, #555);
              background: transparent; border-radius: 18px; color: var(--secondary-text-color, #999); font: inherit; cursor: pointer; min-height: 96px; }
  .add-tile ha-icon { --mdc-icon-size: 34px; }
  /* Licht */
  .tile.light { touch-action: none; padding: 0; }
  .tile.light .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: var(--primary-color, #03a9f4);
                     opacity: .85; transition: height .15s linear; pointer-events: none; }
  .tile.light .lbl { position: relative; padding: 12px; display: flex; flex-direction: column; height: 100%; pointer-events: none; }
  .tile.light .pct { font-size: 1.6rem; font-weight: 700; margin-top: auto; }
  .tile.light.dragging .bar { transition: none; }
  /* Kamera */
  .tile.camera { padding: 0; }
  .tile.camera img { width: 100%; height: 100%; object-fit: cover; display: block; position: absolute; top: 0; right: 0; bottom: 0; left: 0; }
  .tile.camera .cam-lbl { position: absolute; left: 0; right: 0; bottom: 0; padding: 6px 10px; background: rgba(0,0,0,.45); color: #fff; font-size: .85rem; }
  /* Thermostat */
  .climate-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: auto; }
  .climate-row .big { font-size: 1.6rem; font-weight: 700; }
  .stepper { display: flex; align-items: center; gap: 6px; }
  .stepper button { appearance: none; border: 0; border-radius: 50%; width: 40px; height: 40px; font-size: 1.3rem; cursor: pointer;
                    background: var(--divider-color, rgba(128,128,128,.3)); color: inherit; }
  .stepper button:disabled { opacity: .4; }
  /* Rollo */
  .cover-row { display: flex; gap: 6px; margin-top: auto; }
  .cover-row button { flex: 1; appearance: none; border: 0; border-radius: 12px; height: 44px; cursor: pointer;
                      background: var(--divider-color, rgba(128,128,128,.3)); color: inherit; }
  .cover-row button ha-icon { --mdc-icon-size: 24px; }
  /* Verlauf */
  .spark { width: 100%; height: 60px; margin-top: 6px; }
  .spark polyline { fill: none; stroke: var(--primary-color, #03a9f4); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .spark-meta { font-size: .75rem; color: var(--secondary-text-color, #999); display: flex; justify-content: space-between; }
  /* Uhr */
  .clock-time { font-size: 2.6rem; font-weight: 300; margin-top: auto; line-height: 1; font-variant-numeric: tabular-nums; }
  .clock-date { color: var(--secondary-text-color, #aaa); font-size: .9rem; margin-top: 4px; }
  .text-body { white-space: pre-wrap; margin-top: 6px; font-size: 1rem; }
  .tile.web iframe { border: 0; width: 100%; height: 100%; position: absolute; top: 0; right: 0; bottom: 0; left: 0; }
  .tile.web .tl-head { position: absolute; z-index: 1; left: 12px; top: 12px; background: var(--ha-card-background, #1e1e1e); border-radius: 8px; padding: 2px 6px; }
  /* Sheets */
  .sheet-back { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 20; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; justify-content: center; }
  .sheet-back[hidden] { display: none; }
  .sheet { width: 100%; max-width: 640px; max-height: 92vh; overflow-y: auto; background: var(--ha-card-background, var(--card-background-color, #222));
           color: var(--primary-text-color, #eee); border-radius: 20px 20px 0 0; padding: 16px 16px calc(env(safe-area-inset-bottom, 0px) + 20px);
           box-shadow: 0 -6px 24px rgba(0,0,0,.4); }
  .sheet h2 { margin: 0 0 12px; font-size: 1.1rem; }
  .sheet .row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
  .sheet label { font-size: .8rem; color: var(--secondary-text-color, #aaa); }
  .sheet input, .sheet select, .sheet textarea { font: inherit; font-size: 1rem; padding: 10px; border-radius: 10px; border: 1px solid var(--divider-color, #444);
            background: var(--primary-background-color, #111); color: inherit; width: 100%; }
  .sheet textarea { min-height: 80px; font-family: ui-monospace, monospace; font-size: .85rem; }
  .sheet .btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .btn { appearance: none; border: 0; border-radius: 12px; padding: 11px 16px; font: inherit; cursor: pointer;
         background: var(--divider-color, rgba(128,128,128,.3)); color: inherit; }
  .btn.primary { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
  .btn.danger { background: var(--error-color, #db4437); color: #fff; }
  .btn:disabled { opacity: .4; }
  .types { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
  .types .btn { display: flex; align-items: center; gap: 8px; text-align: left; }
  .list-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; margin-bottom: 6px; }
  .list-item.current { outline: 2px solid var(--primary-color, #03a9f4); }
  .hint { font-size: .8rem; color: var(--secondary-text-color, #999); margin: -6px 0 10px; }
  .toast { position: fixed; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 24px); transform: translateX(-50%); z-index: 30;
           background: #333; color: #fff; padding: 10px 16px; border-radius: 12px; max-width: 92vw; font-size: .9rem; box-shadow: 0 4px 16px rgba(0,0,0,.4); }
  .toast[hidden] { display: none; }
  .readonly .ib.edit-only { display: none; }
`;

class TessellaPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._data = null;
    this._loading = false;
    this._dashId = null;
    this._pageIdx = 0;
    this._edit = false;
    this._tiles = [];
    this._saveTimer = null;
    this._timers = new Map();
    this._raf = 0;
    this._wakeLock = null;
    this._mq = window.matchMedia("(max-width: 520px)");
    mqListen(this._mq, () => this._renderPage());
    this._built = false;
    this._onVisible = () => {
      if (document.visibilityState === "visible" && this._wantWake()) this._setWake(true, true);
    };
  }

  connectedCallback() {
    if (!this._built) this._build();
    this._maybeLoad();
    document.addEventListener("visibilitychange", this._onVisible);
  }

  disconnectedCallback() {
    document.removeEventListener("visibilitychange", this._onVisible);
    this._clearTiles();
    // Nur die Sperre freigeben; die gespeicherte Einstellung "wach halten" bleibt erhalten.
    if (this._wakeLock) this._wakeLock.release().catch(() => {});
    this._wakeLock = null;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._data) this._maybeLoad();
    if (!this._raf) {
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this._updateTiles();
      });
    }
    this._refreshAdminVisibility();
  }

  get hass() {
    return this._hass;
  }

  // ---------- Aufbau ----------

  _build() {
    this._built = true;
    const root = this.shadowRoot;
    this._styleEl = h("style", { text: STYLE });
    this._titleEl = h("div", { class: "title", onclick: () => this._openMenu() });
    this._statusEl = h("span", { class: "status" });
    this._wakeBtn = h("button", { class: "ib", title: "Display wach halten", onclick: () => this._setWake(!this._wantWake()) }, icon("mdi:monitor-eye"));
    this._fsBtn = h("button", { class: "ib", title: "Vollbild", onclick: () => this._toggleFullscreen() }, icon("mdi:fullscreen"));
    this._editBtn = h("button", { class: "ib edit-only", title: "Bearbeiten", onclick: () => this._toggleEdit() }, icon("mdi:pencil"));
    this._menuBtn = h("button", { class: "ib", title: "Dashboards und Seiten", onclick: () => this._openMenu() }, icon("mdi:cog"));
    this._header = h("header", null, this._titleEl, this._statusEl, this._wakeBtn, this._fsBtn, this._menuBtn, this._editBtn);
    this._pagesEl = h("nav", { class: "pages" });
    this._gridEl = h("div", { class: "grid" });
    this._mainEl = h("main", null, this._gridEl);
    onPtr(this._mainEl, "pointerdown", (e) => this._swipeStart(e));
    onPtr(this._mainEl, "pointerup", (e) => this._swipeEnd(e));
    onPtr(this._mainEl, "pointercancel", () => (this._swipe = null));
    this._gridEl.addEventListener("click", (e) => this._onGridClick(e));
    this._sheetBack = h("div", { class: "sheet-back", hidden: true, onclick: (e) => { if (e.target === this._sheetBack) this._closeSheet(); } });
    this._sheetEl = h("div", { class: "sheet" });
    this._sheetBack.append(this._sheetEl);
    this._toastEl = h("div", { class: "toast", hidden: true });
    this._app = h("div", { class: "app" }, this._header, this._pagesEl, this._mainEl, this._sheetBack, this._toastEl);
    replaceKids(root, this._styleEl, this._app);
    this._wantWakeFromStorage();
    this._setWakeButton();
  }

  _refreshAdminVisibility() {
    if (!this._app) return;
    const isAdmin = !!(this._hass && this._hass.user && this._hass.user.is_admin);
    this._app.classList.toggle("readonly", !isAdmin);
    if (!isAdmin && this._edit) this._edit = false;
    this._app.classList.toggle("edit", this._edit);
    this._editBtn.classList.toggle("on", this._edit);
    replaceKids(this._editBtn, icon(this._edit ? "mdi:check" : "mdi:pencil"));
  }

  // ---------- Laden und Speichern ----------

  async _maybeLoad() {
    if (this._loading || this._data || !this._hass || !this._built) return;
    this._loading = true;
    try {
      this._data = await this._hass.callWS({ type: "tessella/get" });
      this._pickDashboard();
      this._renderAll();
    } catch (err) {
      this._toast("Laden fehlgeschlagen: " + (err.message || err));
    } finally {
      this._loading = false;
    }
  }

  _pickDashboard() {
    const ids = Object.keys(this._data.dashboards);
    const fromUrl = new URLSearchParams(location.search).get("d");
    const fromStore = localStorage.getItem("tessella.dashboard");
    const candidates = [fromUrl, fromStore, this._dashId, ids[0]];
    this._dashId = candidates.find((c) => c && this._data.dashboards[c]) || ids[0];
    this._pageIdx = 0;
  }

  _scheduleSave() {
    this._setStatus("Ändert…");
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveNow(), 600);
  }

  async _saveNow() {
    if (!this._data || !this._hass) return;
    this._setStatus("Speichere…");
    try {
      // Antwort nicht übernehmen: inzwischen getippte Änderungen würden sonst verloren gehen.
      await this._hass.callWS({ type: "tessella/save", data: this._data });
      this._setStatus("Gespeichert");
    } catch (err) {
      this._setStatus("Fehler");
      this._toast(err.message || String(err));
    }
  }

  _setStatus(text) {
    if (this._statusEl) this._statusEl.textContent = text;
  }

  _mutate(fn) {
    fn(this._data);
    this._scheduleSave();
    this._renderAll();
  }

  // ---------- Zugriff auf Daten ----------

  _dash() {
    return this._data.dashboards[this._dashId];
  }

  _pages() {
    return this._dash().pages;
  }

  _page() {
    const pages = this._pages();
    this._pageIdx = clamp(this._pageIdx, 0, pages.length - 1);
    return pages[this._pageIdx];
  }

  _cols() {
    const page = this._page();
    return this._mq.matches ? Math.min(page.columns, 2) : page.columns;
  }

  _wantWake() {
    return localStorage.getItem("tessella.wake") === "1";
  }

  // ---------- Darstellung ----------

  _renderAll() {
    if (!this._data || !this._built) return;
    this._titleEl.textContent = this._dash().title;
    this._renderPages();
    this._renderPage();
  }

  _renderPages() {
    const pages = this._pages();
    const children = pages.map((p, i) =>
      h("button", { class: "pill" + (i === this._pageIdx ? " active" : ""), onclick: () => this._gotoPage(i) }, p.title)
    );
    if (this._edit) children.push(h("button", { class: "pill", onclick: () => this._addPage() }, "+ Seite"));
    replaceKids(this._pagesEl, ...children);
    this._pagesEl.hidden = pages.length <= 1 && !this._edit;
  }

  _gotoPage(i) {
    this._pageIdx = i;
    this._renderPages();
    this._renderPage();
    this._mainEl.scrollTop = 0;
  }

  _renderPage() {
    if (!this._data || !this._built) return;
    this._clearTiles();
    const page = this._page();
    const cols = this._cols();
    this._gridEl.style.setProperty("--cols", cols);
    const nodes = [];
    for (const tile of page.tiles) {
      const made = this._makeTile(tile, cols);
      this._tiles.push(made);
      nodes.push(made.el);
    }
    if (this._edit) {
      nodes.push(h("button", { class: "add-tile", "data-add": "1", style: { gridColumn: "span 1" } }, icon("mdi:plus")));
    }
    if (!page.tiles.length && !this._edit) {
      nodes.push(h("div", { class: "empty" }, "Noch keine Kacheln. Tippe oben auf das Zahnrad und dann auf Bearbeiten."));
    }
    replaceKids(this._gridEl, ...nodes);
    this._updateTiles();
  }

  _clearTiles() {
    for (const t of this._tiles) if (t.destroy) t.destroy();
    for (const id of this._timers.values()) clearInterval(id);
    this._timers.clear();
    this._tiles = [];
  }

  _timer(fn, ms) {
    const id = setInterval(fn, ms);
    this._timers.set(id, id);
    return id;
  }

  _updateTiles() {
    if (!this._hass) return;
    for (const t of this._tiles) if (t.update) t.update(this._hass);
  }

  _onGridClick(e) {
    if (!this._edit) return;
    const add = e.target.closest("[data-add]");
    if (add) return this._newTile();
    const tileEl = e.target.closest(".tile");
    if (tileEl) {
      const tile = this._page().tiles.find((t) => t.id === tileEl.dataset.id);
      if (tile) this._tileEditor(tile);
    }
  }

  _span(tile, cols) {
    return { w: Math.min(tile.w, cols), h: tile.h };
  }

  _makeTile(tile, cols) {
    const span = this._span(tile, cols);
    const el = h("div", {
      class: `tile ${tile.type}`,
      "data-id": tile.id,
      style: { gridColumn: `span ${span.w}`, gridRow: `span ${span.h}` },
    });
    const head = (name, ico) => h("div", { class: "tl-head" }, icon(ico || tile.icon || DEFAULT_ICON[tile.type]), h("span", null, name));
    const isEdit = () => this._edit;
    const callService = (domain, service, data) =>
      this._hass.callService(domain, service, data).catch((e) => this._toast("Fehler: " + (e.message || e)));
    const stateOf = (hass) => (tile.entity ? hass.states[tile.entity] : undefined);
    const nameOf = (st) => tile.name || (st && st.attributes && st.attributes.friendly_name) || tile.entity || TYPES[tile.type];

    switch (tile.type) {
      case "toggle": {
        const label = h("div", { class: "tl-value" });
        const head_ = head("");
        el.append(head_, label);
        el.addEventListener("click", () => {
          if (isEdit() || !tile.entity) return;
          haptic();
          callService("homeassistant", "toggle", { entity_id: tile.entity });
        });
        return {
          el,
          update: (hass) => {
            const st = stateOf(hass);
            head_.querySelector("span").textContent = nameOf(st);
            label.textContent = stateText(st);
            el.classList.toggle("on", (st && st.state) === "on");
            el.classList.toggle("unavail", !st || st.state === "unavailable");
          },
        };
      }

      case "light": {
        el.dataset.noswipe = "1";
        const bar = h("div", { class: "bar" });
        const headL = head("");
        const pct = h("div", { class: "pct" });
        el.append(bar, h("div", { class: "lbl" }, headL, pct));
        let drag = null;
        let startPct = 0;
        let lastSent = 0;
        let lastOn = 100;
        const curPct = (st) => {
          if (!st || st.state !== "on") return 0;
          if (st.attributes.brightness == null) return 100;
          return Math.round((st.attributes.brightness / 255) * 100);
        };
        const setBar = (p) => {
          bar.style.height = p + "%";
          pct.textContent = p + " %";
        };
        const canDim = (st) => st && st.attributes.brightness != null;
        onPtr(el, "pointerdown", (e) => {
          if (isEdit() || !tile.entity) return;
          const st = stateOf(this._hass);
          try {
            el.setPointerCapture(e.pointerId);
          } catch (_) { /* Zeiger nicht aktiv (z. B. synthetisches Ereignis) */ }
          startPct = curPct(st);
          drag = { id: e.pointerId, y0: e.clientY, t0: Date.now(), moved: false, pct: startPct, h: el.clientHeight || 1, canDim: canDim(st) };
        });
        onPtr(el, "pointermove", (e) => {
          if (!drag || drag.id !== e.pointerId || !drag.canDim) return;
          const dy = drag.y0 - e.clientY;
          if (!drag.moved && Math.abs(dy) < 8) return;
          if (!drag.moved) el.classList.add("dragging");
          drag.moved = true;
          const p = clamp(Math.round(startPct + (dy / drag.h) * 100), 1, 100);
          drag.pct = p;
          setBar(p);
          const now = Date.now();
          if (now - lastSent > 150) {
            lastSent = now;
            callService("light", "turn_on", { entity_id: tile.entity, brightness_pct: p });
          }
        });
        const end = (e, cancelled) => {
          if (!drag || drag.id !== e.pointerId) return;
          const d = drag;
          drag = null;
          el.classList.remove("dragging");
          if (cancelled || !tile.entity) return;
          const st = stateOf(this._hass);
          if (d.moved && d.canDim) {
            lastOn = d.pct;
            callService("light", "turn_on", { entity_id: tile.entity, brightness_pct: d.pct });
          } else if (!d.moved && Date.now() - d.t0 < 450) {
            haptic();
            if ((st && st.state) === "on") {
              lastOn = curPct(st) || lastOn;
              callService("light", "turn_off", { entity_id: tile.entity });
            } else {
              callService("light", "turn_on", d.canDim ? { entity_id: tile.entity, brightness_pct: lastOn } : { entity_id: tile.entity });
            }
          }
        };
        onPtr(el, "pointerup", (e) => end(e, false));
        onPtr(el, "pointercancel", (e) => end(e, true));
        return {
          el,
          update: (hass) => {
            const st = stateOf(hass);
            replaceKids(headL, icon(tile.icon || DEFAULT_ICON.light), h("span", null, nameOf(st)));
            el.classList.toggle("on", (st && st.state) === "on");
            el.classList.toggle("unavail", !st || st.state === "unavailable");
            if (!drag || !drag.moved) {
              const p = curPct(st);
              setBar(p);
              if ((st && st.state) === "on") lastOn = p || lastOn;
            }
          },
        };
      }

      case "sensor": {
        const val = h("div", { class: "tl-value" });
        const headS = head("");
        el.append(headS, val);
        return {
          el,
          update: (hass) => {
            const st = stateOf(hass);
            headS.querySelector("span").textContent = nameOf(st);
            const unit = (st && st.attributes && st.attributes.unit_of_measurement);
            val.textContent = st ? `${st.state}${unit ? " " + unit : ""}` : "—";
            el.classList.toggle("unavail", !st || st.state === "unavailable");
          },
        };
      }

      case "button": {
        const val = h("div", { class: "tl-value" });
        const headB = head("");
        el.append(headB, val);
        el.addEventListener("click", () => {
          if (isEdit() || !tile.service) return;
          const [domain, service] = tile.service.split(".");
          const data = { ...(tile.data || {}) };
          if (tile.entity) data.entity_id = tile.entity;
          haptic();
          el.classList.add("flash");
          setTimeout(() => el.classList.remove("flash"), 300);
          callService(domain, service, data);
        });
        return {
          el,
          update: (hass) => {
            const st = stateOf(hass);
            headB.querySelector("span").textContent = tile.name || TYPES.button;
            val.textContent = st ? stateText(st) : "";
          },
        };
      }

      case "climate": {
        el.dataset.noswipe = "1";
        const cur = h("div", { class: "big" });
        const target = h("div", { class: "big" });
        const headC = head("");
        let pending = null;
        let timer = null;
        const send = (value) => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            callService("climate", "set_temperature", { entity_id: tile.entity, temperature: value });
            pending = null;
          }, 700);
        };
        const step = (dir, st) => {
          if (isEdit() || !st) return;
          const s = numberOr(st.attributes.target_temp_step, 0.5);
          const base = pending != null ? pending : numberOr(st.attributes.temperature, 20);
          pending = Math.round((base + dir * s) * 10) / 10;
          target.textContent = pending.toFixed(1) + "°";
          send(pending);
        };
        const minus = h("button", { onclick: () => step(-1, stateOf(this._hass)) }, "−");
        const plus = h("button", { onclick: () => step(1, stateOf(this._hass)) }, "+");
        el.append(
          headC,
          h("div", { class: "climate-row" }, h("div", null, cur), h("div", { class: "stepper" }, minus, target, plus))
        );
        return {
          el,
          update: (hass) => {
            const st = stateOf(hass);
            headC.querySelector("span") && (headC.querySelector("span").textContent = nameOf(st));
            const unit = (st && st.attributes && st.attributes.temperature_unit) || "°";
            cur.textContent = (st && st.attributes && st.attributes.current_temperature) != null ? `${st.attributes.current_temperature}${unit}` : stateText(st);
            if (pending == null) target.textContent = (st && st.attributes && st.attributes.temperature) != null ? `${st.attributes.temperature}${unit}` : "—";
            minus.disabled = !st;
            plus.disabled = !st;
          },
        };
      }

      case "cover": {
        const val = h("div", { class: "tl-value", style: { fontSize: "1rem" } });
        const headV = head("");
        const act = (service) => {
          if (isEdit() || !tile.entity) return;
          haptic();
          callService("cover", service, { entity_id: tile.entity });
        };
        const btn = (ico, service) =>
          h("button", { onclick: () => act(service), "aria-label": service }, icon(ico));
        el.append(headV, val, h("div", { class: "cover-row" }, btn("mdi:arrow-up", "open_cover"), btn("mdi:stop", "stop_cover"), btn("mdi:arrow-down", "close_cover")));
        return {
          el,
          update: (hass) => {
            const st = stateOf(hass);
            headV.querySelector("span") && (headV.querySelector("span").textContent = nameOf(st));
            const pos = (st && st.attributes && st.attributes.current_position);
            val.textContent = pos != null ? `${stateText(st)} · ${pos} %` : stateText(st);
          },
        };
      }

      case "camera": {
        el.classList.add("camera");
        el.dataset.noswipe = "1";
        const img = h("img", { alt: "" });
        const label = h("div", { class: "cam-lbl" });
        el.append(img, label);
        let base = "";
        const refresh = () => {
          if (!base) return;
          // Datenadressen (data:) nicht mit Zeitstempel versehen, sonst werden sie ungültig.
          img.src = base.startsWith("data:") ? base : base + (base.includes("?") ? "&" : "?") + "t=" + Date.now();
        };
        const timer = this._timer(refresh, 15000);
        return {
          el,
          destroy: () => clearInterval(timer),
          update: (hass) => {
            const st = stateOf(hass);
            label.textContent = nameOf(st);
            const pic = (st && st.attributes && st.attributes.entity_picture);
            if (pic && pic !== base) {
              base = pic;
              refresh();
            }
          },
        };
      }

      case "history": {
        const val = h("div", { class: "tl-value", style: { fontSize: "1.1rem" } });
        const svg = h("svg", { class: "spark", viewBox: "0 0 100 40", preserveAspectRatio: "none" }, h("polyline", { points: "" }));
        const meta = h("div", { class: "spark-meta" }, h("span", null, ""), h("span", null, ""));
        const headH = head("");
        el.append(headH, val, svg, meta);
        const load = async () => {
          if (!tile.entity || !this._hass) return;
          const end = new Date();
          const start = new Date(end.getTime() - 24 * 3600 * 1000);
          try {
            const res = await this._hass.callWS({
              type: "history/history_during_period",
              start_time: start.toISOString(),
              end_time: end.toISOString(),
              entity_ids: [tile.entity],
              minimal_response: true,
              no_attributes: true,
            });
            const rows = (res && res[tile.entity]) || [];
            const pts = [];
            for (const r of rows) {
              const v = parseFloat(r.state != null ? r.state : r.s);
              const t = r.lu ? r.lu * 1000 : Date.parse(r.last_updated || r.last_changed);
              if (Number.isFinite(v) && Number.isFinite(t)) pts.push([t, v]);
            }
            if (pts.length < 2) {
              svg.querySelector("polyline").setAttribute("points", "");
              meta.children[0].textContent = "zu wenig Daten";
              return;
            }
            const vmin = Math.min(...pts.map((p) => p[1]));
            const vmax = Math.max(...pts.map((p) => p[1]));
            const span = vmax - vmin || 1;
            const tspan = end.getTime() - start.getTime();
            const d = pts
              .map(([t, v]) => `${(((t - start.getTime()) / tspan) * 100).toFixed(2)},${(38 - ((v - vmin) / span) * 36).toFixed(2)}`)
              .join(" ");
            svg.querySelector("polyline").setAttribute("points", d);
            meta.children[0].textContent = `min ${vmin.toFixed(1)}`;
            meta.children[1].textContent = `max ${vmax.toFixed(1)}`;
          } catch (err) {
            meta.children[0].textContent = "Verlauf nicht verfügbar";
          }
        };
        load();
        const timer = this._timer(load, 5 * 60 * 1000);
        return {
          el,
          destroy: () => clearInterval(timer),
          update: (hass) => {
            const st = stateOf(hass);
            headH.querySelector("span").textContent = nameOf(st);
            const unit = (st && st.attributes && st.attributes.unit_of_measurement);
            val.textContent = st ? `${st.state}${unit ? " " + unit : ""}` : "—";
          },
        };
      }

      case "clock": {
        const time = h("div", { class: "clock-time" });
        const date = h("div", { class: "clock-date" });
        el.append(h("div", { class: "tl-head" }, icon(tile.icon || DEFAULT_ICON.clock), h("span", null, tile.name || "Uhr")), time, date);
        const tick = () => {
          const now = new Date();
          const loc = (this._hass && this._hass.language) || navigator.language || "de-DE";
          time.textContent = new Intl.DateTimeFormat(loc, { hour: "2-digit", minute: "2-digit" }).format(now);
          date.textContent = new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long" }).format(now);
        };
        tick();
        const timer = this._timer(tick, 1000);
        return { el, destroy: () => clearInterval(timer), update: () => {} };
      }

      case "text": {
        el.append(h("div", { class: "tl-head" }, icon(tile.icon || DEFAULT_ICON.text), h("span", null, tile.name || "")), h("div", { class: "text-body" }, tile.text || ""));
        return { el, update: () => {} };
      }

      case "web": {
        el.classList.add("web");
        el.dataset.noswipe = "1";
        el.append(h("div", { class: "tl-head" }, icon(tile.icon || DEFAULT_ICON.web), h("span", null, tile.name || "")));
        // Im Bearbeiten-Modus kein iframe, damit Tipps den Editor öffnen.
        if (!isEdit()) {
          el.append(h("iframe", { src: tile.url, sandbox: "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox", referrerpolicy: "no-referrer", loading: "lazy" }));
        }
        return { el, update: () => {} };
      }

      default:
        el.append(h("div", { class: "tl-value" }, "Unbekannter Typ: " + tile.type));
        return { el, update: () => {} };
    }
  }

  // ---------- Seitenwechsel per Wischen ----------

  _swipeStart(e) {
    if (this._edit && e.target.closest(".tile")) return;
    if (e.composedPath().some((n) => n.dataset && n.dataset.noswipe)) {
      this._swipe = null;
      return;
    }
    this._swipe = { x: e.clientX, y: e.clientY, t: Date.now() };
  }

  _swipeEnd(e) {
    const s = this._swipe;
    this._swipe = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const pages = this._pages();
    if (dx < 0 && this._pageIdx < pages.length - 1) this._gotoPage(this._pageIdx + 1);
    if (dx > 0 && this._pageIdx > 0) this._gotoPage(this._pageIdx - 1);
  }

  // ---------- Bearbeiten ----------

  _toggleEdit() {
    if (!(this._hass && this._hass.user && this._hass.user.is_admin)) return this._toast("Nur Administratoren können bearbeiten.");
    this._edit = !this._edit;
    this._refreshAdminVisibility();
    this._renderAll();
  }

  _newTile() {
    const cols = this._page().columns;
    this._openSheet(() => {
      const types = Object.entries(TYPES).map(([type, label]) =>
        h("button", {
          class: "btn",
          onclick: () => this._tileEditor({ id: uid("t"), type, name: "", icon: "", entity: "", w: 1, h: 1, cols }, true),
        }, icon(DEFAULT_ICON[type]), " ", label)
      );
      return [h("h2", null, "Kachel-Typ wählen"), h("div", { class: "types" }, types)];
    });
  }

  _tileEditor(tile, isNew = false) {
    const cols = this._page().columns;
    const draft = { ...tile };
    delete draft.cols;
    const inputs = {};
    const entityList = this._entityDatalist();
    const needsEntity = (t) => NEEDS_ENTITY.includes(t) || t === "button";

    const field = (label, control, hint) =>
      h("div", { class: "row" }, h("label", null, label), control, hint ? h("div", { class: "hint" }, hint) : null);
    const input = (key, props = {}) => {
      const el = h("input", { value: draft[key] != null ? draft[key] : "", ...props });
      inputs[key] = el;
      return el;
    };
    const select = (key, options, current) => {
      const el = h(
        "select",
        null,
        options.map(([v, l]) => h("option", { value: String(v), selected: String(v) === String(current) }, l))
      );
      inputs[key] = el;
      return el;
    };
    const textarea = (key, value, props = {}) => {
      const el = h("textarea", props, value != null ? value : "");
      inputs[key] = el;
      return el;
    };

    // Alle sichtbaren Felder in den Entwurf übernehmen. Wirft bei ungültigem JSON.
    const collect = () => {
      for (const [k, el] of Object.entries(inputs)) draft[k] = el.value;
      draft.w = Number(draft.w) || 1;
      draft.h = Number(draft.h) || 1;
      if (draft.type === "button") {
        const raw = String(draft.data != null ? draft.data : "").trim();
        if (!raw) draft.data = {};
        else {
          try {
            draft.data = JSON.parse(raw);
          } catch (_) {
            throw new Error("Daten sind kein gültiges JSON.");
          }
        }
      }
    };

    const dataText = () => (typeof draft.data === "string" ? draft.data : JSON.stringify(draft.data != null ? draft.data : {}, null, 2));

    const build = () => {
      for (const k of Object.keys(inputs)) delete inputs[k];
      const type = draft.type;
      const nodes = [
        h("h2", null, isNew ? "Neue Kachel" : "Kachel bearbeiten"),
        field("Typ", select("type", Object.entries(TYPES), type)),
        field("Name", input("name", { placeholder: "leer = Entitätsname" })),
        field("Symbol (mdi:…)", input("icon", { placeholder: DEFAULT_ICON[type] || "mdi:…" })),
      ];
      if (needsEntity(type)) {
        nodes.push(
          field(
            type === "button" ? "Entität (optional)" : "Entität",
            input("entity", { list: "tessella-entities", placeholder: "light.wohnzimmer", autocapitalize: "off", autocorrect: "off" }),
            type === "light" ? "Ziehen = dimmen, Tippen = an/aus" : null
          )
        );
      }
      if (type === "button") {
        nodes.push(field("Dienst", input("service", { placeholder: "script.gute_nacht", autocapitalize: "off" })));
        nodes.push(field("Daten (JSON)", textarea("data", dataText(), { placeholder: "{}" })));
      }
      if (type === "text") nodes.push(field("Text", textarea("text", draft.text)));
      if (type === "web") {
        nodes.push(field("Adresse", input("url", { type: "url", placeholder: "https://…" }), "Viele Seiten erlauben kein Einbetten (iframe)."));
      }
      nodes.push(field("Breite (Spalten)", select("w", Array.from({ length: cols }, (_, i) => [i + 1, String(i + 1)]), draft.w || 1)));
      nodes.push(field("Höhe (Reihen)", select("h", [1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]), draft.h || 1)));
      nodes.push(
        h(
          "div",
          { class: "btns" },
          h("button", { class: "btn primary", onclick: save }, "Speichern"),
          h("button", { class: "btn", onclick: () => this._closeSheet() }, "Abbrechen")
        )
      );
      if (!isNew) {
        nodes.push(
          h(
            "div",
            { class: "btns" },
            h("button", { class: "btn", onclick: () => move(-1) }, "← früher"),
            h("button", { class: "btn", onclick: () => move(1) }, "später →"),
            h("button", { class: "btn danger", onclick: remove }, "Löschen")
          )
        );
      }
      nodes.push(entityList);
      // Typwechsel: Eingaben sichern und Felder für den neuen Typ neu aufbauen.
      inputs.type.addEventListener("change", () => {
        try {
          collect();
        } catch (_) {
          /* ungültiges JSON beim Typwechsel: Text bleibt erhalten */
        }
        this._openSheet(build);
      });
      return nodes;
    };

    const save = () => {
      try {
        collect();
      } catch (err) {
        return this._toast(err.message);
      }
      const clean = {
        id: draft.id,
        type: draft.type,
        name: draft.name || "",
        icon: draft.icon || "",
        w: draft.w,
        h: draft.h,
      };
      if (needsEntity(draft.type) && draft.entity) clean.entity = draft.entity;
      if (draft.type === "button") {
        clean.service = draft.service || "";
        clean.data = draft.data;
      }
      if (draft.type === "text") clean.text = draft.text || "";
      if (draft.type === "web") clean.url = draft.url || "";
      this._mutate((d) => {
        const pg = d.dashboards[this._dashId].pages[this._pageIdx];
        const i = pg.tiles.findIndex((t) => t.id === clean.id);
        if (i >= 0) pg.tiles[i] = clean;
        else pg.tiles.push(clean);
      });
      this._closeSheet();
    };

    const move = (dir) => {
      this._mutate((d) => {
        const tiles = d.dashboards[this._dashId].pages[this._pageIdx].tiles;
        const i = tiles.findIndex((t) => t.id === tile.id);
        const j = i + dir;
        if (i >= 0 && j >= 0 && j < tiles.length) [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
      });
      this._closeSheet();
    };

    const remove = () => {
      if (!confirm("Kachel wirklich löschen?")) return;
      this._mutate((d) => {
        const pg = d.dashboards[this._dashId].pages[this._pageIdx];
        pg.tiles = pg.tiles.filter((t) => t.id !== tile.id);
      });
      this._closeSheet();
    };

    this._openSheet(build);
  }

  _entityDatalist() {
    const states = (this._hass && this._hass.states) || {};
    const opts = Object.keys(states)
      .sort()
      .map((id) => h("option", { value: id }, (states[id] && states[id].attributes && states[id].attributes.friendly_name) || ""));
    return h("datalist", { id: "tessella-entities" }, opts);
  }

  // ---------- Menü ----------

  _openMenu() {
    if (!this._data) return;
    const isAdmin = !!(this._hass && this._hass.user && this._hass.user.is_admin);
    const dashes = Object.entries(this._data.dashboards).map(([id, d]) =>
      h("button", {
        class: "btn list-item" + (id === this._dashId ? " current" : ""),
        onclick: () => {
          this._dashId = id;
          localStorage.setItem("tessella.dashboard", id);
          this._pageIdx = 0;
          this._closeSheet();
          this._renderAll();
        },
      }, icon("mdi:view-dashboard"), " ", d.title)
    );
    const items = [h("h2", null, "Dashboards"), ...dashes];
    if (isAdmin && this._edit) {
      items.push(
        h("div", { class: "btns" },
          h("button", { class: "btn", onclick: () => this._newDashboard() }, "+ Dashboard"),
          h("button", { class: "btn", onclick: () => this._renameDashboard() }, "Titel ändern"),
          h("button", { class: "btn danger", onclick: () => this._deleteDashboard() }, "Dashboard löschen")
        )
      );
      const page = this._page();
      items.push(h("h2", null, "Seite: " + page.title));
      items.push(
        h("div", { class: "row" }, h("label", null, "Spalten (Tablet / Smartphone)"),
          h("select", {
            onchange: (e) => this._mutate((d) => { d.dashboards[this._dashId].pages[this._pageIdx].columns = Number(e.target.value); }),
          }, [2, 3, 4, 5, 6].map((n) => h("option", { value: n, selected: n === page.columns }, String(n)))))
      );
      items.push(
        h("div", { class: "btns" },
          h("button", { class: "btn", onclick: () => this._renamePage() }, "Seite umbenennen"),
          h("button", { class: "btn", onclick: () => this._addPage() }, "+ Seite"),
          h("button", { class: "btn danger", onclick: () => this._deletePage() }, "Seite löschen")
        )
      );
      items.push(h("h2", null, "Export / Import"));
      items.push(
        h("div", { class: "btns" },
          h("button", { class: "btn", onclick: () => this._exportDashboard() }, "Exportieren"),
          h("button", { class: "btn", onclick: () => this._importDashboard() }, "Importieren")
        )
      );
    }
    items.push(
      h("h2", null, "Anzeige"),
      h("div", { class: "btns" },
        h("button", { class: "btn", onclick: () => { this._setWake(!this._wantWake()); this._closeSheet(); } }, this._wantWake() ? "Wach halten: an" : "Wach halten: aus"),
        h("button", { class: "btn", onclick: () => { this._toggleFullscreen(); this._closeSheet(); } }, "Vollbild")
      )
    );
    this._openSheet(() => items);
  }

  _newDashboard() {
    const name = prompt("Name des neuen Dashboards:");
    if (!name || !name.trim()) return;
    const id = uid("d");
    this._dashId = id;
    this._pageIdx = 0;
    localStorage.setItem("tessella.dashboard", id);
    this._mutate((d) => {
      d.dashboards[id] = { title: name.trim().slice(0, 60), pages: [{ id: uid("p"), title: "Start", columns: 3, tiles: [] }] };
    });
    this._closeSheet();
  }

  _renameDashboard() {
    const name = prompt("Neuer Titel:", this._dash().title);
    if (!name || !name.trim()) return;
    this._mutate((d) => { d.dashboards[this._dashId].title = name.trim().slice(0, 60); });
    this._closeSheet();
  }

  _deleteDashboard() {
    if (Object.keys(this._data.dashboards).length <= 1) return this._toast("Das letzte Dashboard kann nicht gelöscht werden.");
    if (!confirm(`Dashboard „${this._dash().title}“ wirklich löschen?`)) return;
    const doomed = this._dashId;
    this._dashId = Object.keys(this._data.dashboards).find((id) => id !== doomed);
    this._pageIdx = 0;
    localStorage.setItem("tessella.dashboard", this._dashId);
    this._mutate((d) => { delete d.dashboards[doomed]; });
    this._closeSheet();
  }

  _addPage() {
    const name = prompt("Name der neuen Seite:", "Seite " + (this._pages().length + 1));
    if (!name || !name.trim()) return;
    this._mutate((d) => {
      d.dashboards[this._dashId].pages.push({ id: uid("p"), title: name.trim().slice(0, 40), columns: 3, tiles: [] });
    });
    this._pageIdx = this._pages().length - 1;
    this._closeSheet();
    this._renderAll();
  }

  _renamePage() {
    const name = prompt("Neuer Seitenname:", this._page().title);
    if (!name || !name.trim()) return;
    this._mutate((d) => { d.dashboards[this._dashId].pages[this._pageIdx].title = name.trim().slice(0, 40); });
    this._closeSheet();
  }

  _deletePage() {
    if (this._pages().length <= 1) return this._toast("Die letzte Seite kann nicht gelöscht werden.");
    if (!confirm(`Seite „${this._page().title}“ mit allen Kacheln löschen?`)) return;
    const doomedIdx = this._pageIdx;
    this._pageIdx = Math.max(0, doomedIdx - 1);
    this._mutate((d) => { d.dashboards[this._dashId].pages.splice(doomedIdx, 1); });
    this._closeSheet();
  }

  _exportDashboard() {
    const text = JSON.stringify(this._dash(), null, 2);
    const copy = navigator.clipboard ? navigator.clipboard.writeText(text) : null;
    if (copy) copy.then(() => this._toast("In die Zwischenablage kopiert")).catch(() => this._showExport(text));
    else this._showExport(text);
  }

  _showExport(text) {
    this._openSheet(() => [
      h("h2", null, "Export"),
      h("textarea", { readonly: true, style: { minHeight: "240px" } }, text),
    ]);
  }

  _importDashboard() {
    let area;
    this._openSheet(() => [
      h("h2", null, "Import"),
      h("div", { class: "hint" }, "Dashboard-JSON einfügen. Es ersetzt das aktuelle Dashboard."),
      (area = h("textarea", { placeholder: "{ … }" })),
      h("div", { class: "btns" },
        h("button", { class: "btn primary", onclick: () => {
          let parsed;
          try { parsed = JSON.parse(area.value); } catch (_) { return this._toast("Kein gültiges JSON."); }
          if (!parsed || !Array.isArray(parsed.pages)) return this._toast("Das ist kein Tessella-Dashboard.");
          this._mutate((d) => { d.dashboards[this._dashId] = parsed; });
          this._pageIdx = 0;
          this._closeSheet();
        } }, "Übernehmen")
      ),
    ]);
  }

  // ---------- Sheets, Toast, Vollbild, Wachhalten ----------

  _openSheet(build) {
    replaceKids(this._sheetEl, ...build());
    this._sheetBack.hidden = false;
  }

  _closeSheet() {
    this._sheetBack.hidden = true;
    replaceKids(this._sheetEl, );
  }

  _toast(text) {
    this._toastEl.textContent = text;
    this._toastEl.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => (this._toastEl.hidden = true), 3200);
  }

  _toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (_) {
      this._toast("Vollbild wird von diesem Browser nicht unterstützt.");
    }
  }

  _wantWakeFromStorage() {
    if (this._wantWake()) this._setWake(true, true);
  }

  _setWakeButton() {
    this._wakeBtn.classList.toggle("on", this._wantWake());
  }

  async _setWake(on, silent = false) {
    try {
      if (on) {
        if (!("wakeLock" in navigator)) throw new Error("nicht verfügbar");
        this._wakeLock = await navigator.wakeLock.request("screen");
        localStorage.setItem("tessella.wake", "1");
      } else {
        if (this._wakeLock) await this._wakeLock.release();
        this._wakeLock = null;
        localStorage.setItem("tessella.wake", "0");
      }
    } catch (err) {
      localStorage.setItem("tessella.wake", "0");
      if (!silent) this._toast("Wach halten braucht HTTPS oder wird vom Browser nicht unterstützt.");
    }
    this._setWakeButton();
  }
}

if (!customElements.get("tessella-panel")) {
  customElements.define("tessella-panel", TessellaPanel);
}
