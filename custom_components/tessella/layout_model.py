"""Datenmodell und Validierung für Tessella-Dashboards.

Bewusst ohne Home-Assistant-Importe, damit die Prüfungen mit normalem
Python (pytest) getestet werden können.
"""

from __future__ import annotations

import copy
import re
from typing import Any

SCHEMA_VERSION = 1

TILE_TYPES = frozenset(
    {
        "toggle",   # Schalter für light/switch/input_boolean/… (Tipp = umschalten)
        "light",    # Licht mit Helligkeitsbalken (Ziehen = dimmen, Tipp = an/aus)
        "sensor",   # Zahl/Zustand mit Einheit
        "button",   # Dienst aufrufen (Skript, Szene, button, …)
        "climate",  # Thermostat: Soll-Temperatur mit +/-
        "cover",    # Rollo/Garagentor: auf/stopp/zu
        "camera",   # Kamerabild, aktualisiert sich selbst
        "history",  # Verlauf als Liniendiagramm (letzte 24 h)
        "clock",    # Uhrzeit und Datum
        "text",     # frei eingegebener Text
        "web",      # eingebettete Webseite (iframe)
    }
)

# Typen, die eine Entität brauchen
ENTITY_TYPES = frozenset({"toggle", "light", "sensor", "climate", "cover", "camera", "history"})

MAX_DASHBOARDS = 20
MAX_PAGES = 30
MAX_TILES_PER_PAGE = 120
MAX_COLUMNS = 6
MAX_TILE_SPAN = 6

_ENTITY_RE = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")
_SERVICE_RE = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_ICON_RE = re.compile(r"^mdi:[a-z0-9-]{1,64}$")


class LayoutError(ValueError):
    """Ungültige Layout-Daten."""


def default_dashboard() -> dict[str, Any]:
    """Ein leeres Start-Dashboard."""
    return {
        "title": "Tessella",
        "pages": [{"id": "start", "title": "Start", "columns": 3, "tiles": []}],
    }


def default_data() -> dict[str, Any]:
    """Komplette Speicherstruktur mit einem Dashboard."""
    return {"version": SCHEMA_VERSION, "dashboards": {"default": default_dashboard()}}


def _str(value: Any, field: str, *, max_len: int, required: bool = False) -> str:
    if value is None or value == "":
        if required:
            raise LayoutError(f"{field} fehlt")
        return ""
    if not isinstance(value, str):
        raise LayoutError(f"{field} muss Text sein")
    if len(value) > max_len:
        raise LayoutError(f"{field} ist zu lang (max. {max_len})")
    return value.strip()


def _int(value: Any, field: str, lo: int, hi: int, default: int) -> int:
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int):
        raise LayoutError(f"{field} muss eine ganze Zahl sein")
    if not lo <= value <= hi:
        raise LayoutError(f"{field} muss zwischen {lo} und {hi} liegen")
    return value


def _check_id(value: Any, field: str) -> str:
    text = _str(value, field, max_len=64, required=True)
    if not _ID_RE.match(text):
        raise LayoutError(f"{field} hat ungültige Zeichen: {text!r}")
    return text


def _normalize_tile(raw: Any, page_columns: int, seen_ids: set[str]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise LayoutError("Kachel muss ein Objekt sein")

    tile_id = _check_id(raw.get("id"), "Kachel-id")
    if tile_id in seen_ids:
        raise LayoutError(f"Kachel-id doppelt: {tile_id}")
    seen_ids.add(tile_id)

    tile_type = raw.get("type")
    if tile_type not in TILE_TYPES:
        raise LayoutError(f"Unbekannter Kachel-Typ: {tile_type!r}")

    tile: dict[str, Any] = {
        "id": tile_id,
        "type": tile_type,
        "name": _str(raw.get("name"), "name", max_len=60),
        "icon": "",
        # Zu breite Kacheln werden auf die Spaltenzahl gekürzt (z. B. nach Verkleinern der Seite).
        "w": min(_int(raw.get("w"), "w", 1, MAX_TILE_SPAN, 1), page_columns),
        "h": _int(raw.get("h"), "h", 1, MAX_TILE_SPAN, 1),
    }

    icon = _str(raw.get("icon"), "icon", max_len=64)
    if icon:
        if not _ICON_RE.match(icon):
            raise LayoutError(f"icon muss mdi:name sein, nicht {icon!r}")
        tile["icon"] = icon

    entity = _str(raw.get("entity"), "entity", max_len=255)
    if tile_type in ENTITY_TYPES:
        if not entity:
            raise LayoutError(f"Kachel {tile_id} ({tile_type}) braucht eine Entität")
    if entity:
        if not _ENTITY_RE.match(entity):
            raise LayoutError(f"Ungültige Entität: {entity!r}")
        tile["entity"] = entity

    if tile_type == "button":
        service = _str(raw.get("service"), "service", max_len=128, required=True)
        if not _SERVICE_RE.match(service):
            raise LayoutError(f"Ungültiger Dienst: {service!r} (erwartet domain.service)")
        tile["service"] = service
        data = raw.get("data", {})
        if not isinstance(data, dict):
            raise LayoutError("data muss ein Objekt sein")
        if len(repr(data)) > 2000:
            raise LayoutError("data ist zu groß")
        tile["data"] = data

    if tile_type == "text":
        tile["text"] = _str(raw.get("text"), "text", max_len=2000)

    if tile_type == "web":
        url = _str(raw.get("url"), "url", max_len=2000, required=True)
        if not (url.startswith("https://") or url.startswith("http://")):
            raise LayoutError("url muss mit http:// oder https:// beginnen")
        tile["url"] = url

    return tile


def _normalize_page(raw: Any, seen_page_ids: set[str], seen_tile_ids: set[str]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise LayoutError("Seite muss ein Objekt sein")
    page_id = _check_id(raw.get("id"), "Seiten-id")
    if page_id in seen_page_ids:
        raise LayoutError(f"Seiten-id doppelt: {page_id}")
    seen_page_ids.add(page_id)

    columns = _int(raw.get("columns"), "columns", 1, MAX_COLUMNS, 3)
    tiles_raw = raw.get("tiles", [])
    if not isinstance(tiles_raw, list):
        raise LayoutError("tiles muss eine Liste sein")
    if len(tiles_raw) > MAX_TILES_PER_PAGE:
        raise LayoutError(f"Zu viele Kacheln auf einer Seite (max. {MAX_TILES_PER_PAGE})")

    return {
        "id": page_id,
        "title": _str(raw.get("title"), "title", max_len=40) or "Seite",
        "columns": columns,
        "tiles": [_normalize_tile(t, columns, seen_tile_ids) for t in tiles_raw],
    }


def normalize_dashboard(raw: Any) -> dict[str, Any]:
    """Prüft ein Dashboard und gibt eine bereinigte Kopie zurück."""
    if not isinstance(raw, dict):
        raise LayoutError("Dashboard muss ein Objekt sein")
    pages_raw = raw.get("pages")
    if not isinstance(pages_raw, list) or not pages_raw:
        raise LayoutError("Dashboard braucht mindestens eine Seite")
    if len(pages_raw) > MAX_PAGES:
        raise LayoutError(f"Zu viele Seiten (max. {MAX_PAGES})")

    seen_page_ids: set[str] = set()
    seen_tile_ids: set[str] = set()
    return {
        "title": _str(raw.get("title"), "title", max_len=60) or "Tessella",
        "pages": [_normalize_page(p, seen_page_ids, seen_tile_ids) for p in pages_raw],
    }


def normalize_dashboards(raw: Any) -> dict[str, Any]:
    """Prüft alle Dashboards (id -> Dashboard)."""
    if not isinstance(raw, dict) or not raw:
        raise LayoutError("dashboards muss ein Objekt mit mindestens einem Dashboard sein")
    if len(raw) > MAX_DASHBOARDS:
        raise LayoutError(f"Zu viele Dashboards (max. {MAX_DASHBOARDS})")
    return {_check_id(key, "Dashboard-id"): normalize_dashboard(value) for key, value in raw.items()}


def normalize_data(raw: Any) -> dict[str, Any]:
    """Prüft die komplette Speicherstruktur."""
    if not isinstance(raw, dict):
        raise LayoutError("Daten müssen ein Objekt sein")
    return {
        "version": SCHEMA_VERSION,
        "dashboards": normalize_dashboards(copy.deepcopy(raw.get("dashboards"))),
    }
