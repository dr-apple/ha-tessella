"""Tessella: Kachel-Dashboards für Smartphone und Tablet im Browser."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import frontend, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    DOMAIN,
    MODULE_URL,
    PANEL_ELEMENT,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL,
    STORAGE_KEY,
    STORAGE_VERSION,
    URL_BASE,
)
from .layout_model import LayoutError, default_data, normalize_data

FRONTEND_DIR = Path(__file__).parent / "frontend"


class TessellaStore:
    """Speichert alle Dashboards in .storage/tessella.dashboards."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] | None = None

    async def async_get(self) -> dict[str, Any]:
        if self._data is None:
            stored = await self._store.async_load()
            if stored is None:
                stored = default_data()
            try:
                self._data = normalize_data(stored)
            except LayoutError:
                # Beschädigte Daten nicht überschreiben, sondern neutral starten.
                self._data = default_data()
        return self._data

    async def async_save(self, raw: Any) -> dict[str, Any]:
        """Prüft und speichert. Wirft LayoutError bei ungültigen Daten."""
        data = normalize_data(raw)
        await self._store.async_save(data)
        self._data = data
        return data


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Einmalige Registrierung: Websocket-Befehle."""
    hass.data.setdefault(DOMAIN, {})
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_save)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Statische Dateien ausliefern und Seitenleisten-Eintrag anlegen."""
    store = TessellaStore(hass)
    hass.data[DOMAIN]["store"] = store

    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_BASE, str(FRONTEND_DIR), cache_headers=False)]
    )
    async_register_panel(
        hass,
        frontend_url_path=PANEL_URL,
        webcomponent_name=PANEL_ELEMENT,
        module_url=MODULE_URL,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=False,
    )
    entry.async_on_unload(lambda: frontend.async_remove_panel(hass, PANEL_URL, warn_if_unknown=False))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.get(DOMAIN, {}).pop("store", None)
    return True


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get"})
@websocket_api.async_response
async def ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Alle Dashboards laden (für jeden angemeldeten Benutzer)."""
    store: TessellaStore = hass.data[DOMAIN]["store"]
    connection.send_result(msg["id"], await store.async_get())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/save", vol.Required("data"): dict}
)
@websocket_api.async_response
async def ws_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Komplette Daten speichern. Nur Administratoren, damit Layouts nicht von Gästen geändert werden."""
    store: TessellaStore = hass.data[DOMAIN]["store"]
    try:
        saved = await store.async_save(msg["data"])
    except LayoutError as err:
        connection.send_error(msg["id"], "invalid_layout", str(err))
        return
    connection.send_result(msg["id"], saved)
