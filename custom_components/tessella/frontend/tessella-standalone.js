/*
 * Tessella – eigenständige Seite ohne die HA-Oberfläche (für ältere Browser wie iOS 12).
 * Stellt die Verbindung zu Home Assistant über die Websocket-API her und gibt dem Panel
 * ein `hass`-Objekt mit denselben Eigenschaften, die das Panel auch vom HA-Frontend bekommt.
 * Syntax bewusst ES2017, ohne ?. und ??.
 */
(function () {
  "use strict";

  var TOKEN_KEY = "tessella.token";
  var app = document.getElementById("app");
  var statusEl = document.getElementById("status");
  var formEl = document.getElementById("login");
  var inputEl = document.getElementById("token");
  var logoutBtn = document.getElementById("logout");

  var sock = null;
  var panel = null;
  var hass = { states: {}, user: { is_admin: false }, language: "de", callWS: null, callService: null };

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  // Diagnose für ältere Geräte: Fehler direkt auf dem Bildschirm anzeigen.
  window.onerror = function (msg, src, line) {
    setStatus("Fehler: " + msg + " (" + (src || "").split("/").pop() + ":" + line + ")");
  };
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    setStatus("Fehler: " + ((r && r.message) || r));
  });

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function saveToken(t) {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch (e) {
      setStatus("Der Token kann nicht gespeichert werden (Browser blockiert Speicher).");
    }
  }

  function forgetToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* ignorieren */ }
  }

  // ---------- Websocket ----------

  function Socket(token, handlers) {
    this.token = token;
    this.h = handlers;
    this.nextId = 1;
    this.pending = {};
    this.subs = {};
    this.ws = null;
    this.retry = 1000;
    this.stopped = false;
  }

  Socket.prototype.connect = function () {
    var self = this;
    var proto = location.protocol === "https:" ? "wss://" : "ws://";
    var ws = new WebSocket(proto + location.host + "/api/websocket");
    this.ws = ws;
    ws.onmessage = function (ev) {
      var msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      self._onMessage(msg);
    };
    ws.onclose = function () {
      if (self.stopped) return;
      self.h.onClosed();
      setTimeout(function () {
        self.connect();
      }, self.retry);
      self.retry = Math.min(self.retry * 2, 30000);
    };
  };

  Socket.prototype.stop = function () {
    this.stopped = true;
    if (this.ws) this.ws.close();
  };

  Socket.prototype._onMessage = function (msg) {
    if (msg.type === "auth_required") {
      this.ws.send(JSON.stringify({ type: "auth", access_token: this.token }));
    } else if (msg.type === "auth_ok") {
      this.retry = 1000;
      this.subs = {};
      this.h.onAuthed();
    } else if (msg.type === "auth_invalid") {
      this.stopped = true;
      this.h.onInvalid();
    } else if (msg.type === "result") {
      var p = this.pending[msg.id];
      if (!p) return;
      delete this.pending[msg.id];
      if (msg.success) {
        p.resolve(msg.result);
      } else {
        p.reject(new Error((msg.error && msg.error.message) || "Fehler"));
      }
    } else if (msg.type === "event") {
      var cb = this.subs[msg.id];
      if (cb) cb(msg.event);
    }
  };

  Socket.prototype.send = function (obj) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var id = self.nextId++;
      obj.id = id;
      self.pending[id] = { resolve: resolve, reject: reject };
      self.ws.send(JSON.stringify(obj));
    });
  };

  Socket.prototype.subscribe = function (obj, cb) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var id = self.nextId++;
      obj.id = id;
      self.subs[id] = cb;
      self.pending[id] = { resolve: resolve, reject: reject };
      self.ws.send(JSON.stringify(obj));
    });
  };

  // ---------- Zustand (Entitäten) ----------

  function applyEntities(event) {
    var states = hass.states;
    var eid;
    if (event.a) {
      for (eid in event.a) {
        states[eid] = makeState(eid, event.a[eid]);
      }
    }
    if (event.c) {
      for (eid in event.c) {
        var diff = event.c[eid]["+"];
        var removed = event.c[eid]["-"];
        var cur = states[eid] || makeState(eid, { s: "unknown", a: {} });
        if (diff) {
          if (diff.s !== undefined) cur.state = diff.s;
          if (diff.lu !== undefined) cur.last_updated = diff.lu;
          if (diff.lc !== undefined) cur.last_changed = diff.lc;
          if (diff.a) {
            for (var k in diff.a) cur.attributes[k] = diff.a[k];
          }
        }
        if (removed && removed.a) {
          for (var i = 0; i < removed.a.length; i++) delete cur.attributes[removed.a[i]];
        }
        states[eid] = cur;
      }
    }
    if (event.r) {
      for (var j = 0; j < event.r.length; j++) delete states[event.r[j]];
    }
  }

  function makeState(eid, data) {
    return {
      entity_id: eid,
      state: data.s,
      attributes: data.a || {},
      last_changed: data.lc,
      last_updated: data.lu,
      context: data.c,
    };
  }

  // ---------- Ablauf ----------

  function showForm(message) {
    formEl.hidden = false;
    logoutBtn.hidden = true;
    setStatus(message || "");
    if (panel) {
      panel.remove();
      panel = null;
    }
  }

  function mountPanel() {
    if (panel) return;
    panel = document.createElement("tessella-panel");
    app.appendChild(panel);
    formEl.hidden = true;
    logoutBtn.hidden = false;
    setStatus("");
  }

  function startConnection(token) {
    if (sock) sock.stop();
    setStatus("Verbinde…");

    sock = new Socket(token, {
      onAuthed: function () {
        hass.callWS = function (msg) {
          return sock.send(Object.assign({}, msg));
        };
        hass.callService = function (domain, service, data) {
          return sock.send({ type: "call_service", domain: domain, service: service, service_data: data || {} });
        };
        setStatus("Verbunden, lade Dashboard…");
        sock.send({ type: "auth/current_user" })
          .then(function (user) {
            hass.user = { is_admin: !!(user && user.is_admin), name: user && user.name };
            return sock.send({ type: "get_config" });
          })
          .then(function (cfg) {
            hass.language = (cfg && cfg.language) || "de";
            return sock.subscribe({ type: "subscribe_entities" }, function (event) {
              applyEntities(event);
              mountPanel();
              panel.hass = hass;
              setStatus("");
            });
          })
          .catch(function (err) {
            setStatus("Fehler: " + (err.message || err));
          });
      },
      onInvalid: function () {
        forgetToken();
        showForm("Der Token ist ungültig oder abgelaufen. Bitte neu eingeben.");
      },
      onClosed: function () {
        setStatus("Verbindung verloren, verbinde neu…");
      },
    });
    sock.connect();
  }

  // ---------- Start ----------

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = (inputEl.value || "").trim();
    if (!t) {
      setStatus("Bitte einen Token eingeben.");
      return;
    }
    saveToken(t);
    startConnection(t);
  });

  logoutBtn.addEventListener("click", function () {
    forgetToken();
    if (sock) sock.stop();
    window.location.reload();
  });

  var token = getToken();
  if (token) {
    startConnection(token);
  } else {
    showForm("");
  }
})();
