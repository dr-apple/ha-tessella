"""Tests für die Layout-Validierung (ohne Home Assistant, nur Standardbibliothek).

Ausführen: python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

_MODULE = Path(__file__).resolve().parent.parent / "custom_components" / "tessella" / "layout_model.py"
_spec = importlib.util.spec_from_file_location("layout_model", _MODULE)
lm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lm)


def _data(tiles, columns=3):
    return {
        "dashboards": {
            "default": {
                "title": "Test",
                "pages": [{"id": "p1", "title": "Start", "columns": columns, "tiles": tiles}],
            }
        }
    }


class DefaultDataTests(unittest.TestCase):
    def test_default_data_is_valid(self):
        out = lm.normalize_data(lm.default_data())
        self.assertIn("default", out["dashboards"])
        self.assertEqual(out["dashboards"]["default"]["pages"][0]["columns"], 3)


class TileTests(unittest.TestCase):
    def test_light_tile_ok(self):
        out = lm.normalize_data(_data([{"id": "l1", "type": "light", "entity": "light.wohnzimmer", "w": 2, "h": 1}]))
        tile = out["dashboards"]["default"]["pages"][0]["tiles"][0]
        self.assertEqual(tile["entity"], "light.wohnzimmer")
        self.assertEqual(tile["w"], 2)

    def test_entity_required_for_light(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "l1", "type": "light"}]))

    def test_clock_needs_no_entity(self):
        out = lm.normalize_data(_data([{"id": "c1", "type": "clock"}]))
        self.assertNotIn("entity", out["dashboards"]["default"]["pages"][0]["tiles"][0])

    def test_unknown_type_rejected(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "x", "type": "script_injection"}]))

    def test_duplicate_tile_ids_rejected(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "a", "type": "clock"}, {"id": "a", "type": "clock"}]))

    def test_span_is_clamped_to_columns(self):
        out = lm.normalize_data(_data([{"id": "a", "type": "clock", "w": 4}], columns=3))
        self.assertEqual(out["dashboards"]["default"]["pages"][0]["tiles"][0]["w"], 3)

    def test_button_needs_service_with_domain(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "b", "type": "button", "service": "nodomain"}]))
        out = lm.normalize_data(_data([{"id": "b", "type": "button", "service": "script.gute_nacht", "data": {"x": 1}}]))
        self.assertEqual(out["dashboards"]["default"]["pages"][0]["tiles"][0]["service"], "script.gute_nacht")

    def test_web_tile_requires_http_url(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "w", "type": "web", "url": "javascript:alert(1)"}]))
        out = lm.normalize_data(_data([{"id": "w", "type": "web", "url": "https://example.org/"}]))
        self.assertEqual(out["dashboards"]["default"]["pages"][0]["tiles"][0]["url"], "https://example.org/")

    def test_bad_entity_format_rejected(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "s", "type": "sensor", "entity": "Light Wohnzimmer"}]))

    def test_bad_icon_rejected(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "s", "type": "clock", "icon": "<img onerror=x>"}]))

    def test_text_length_limit(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "t", "type": "text", "text": "x" * 2001}]))

    def test_too_many_tiles(self):
        tiles = [{"id": f"t{i}", "type": "clock"} for i in range(lm.MAX_TILES_PER_PAGE + 1)]
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data(tiles))

    def test_unknown_keys_are_dropped(self):
        out = lm.normalize_data(_data([{"id": "c", "type": "clock", "evil": "<script>"}]))
        self.assertNotIn("evil", out["dashboards"]["default"]["pages"][0]["tiles"][0])


class DashboardTests(unittest.TestCase):
    def test_empty_dashboards_rejected(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data({"dashboards": {}})

    def test_dashboard_needs_page(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data({"dashboards": {"d": {"title": "x", "pages": []}}})

    def test_bad_dashboard_id_rejected(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data({"dashboards": {"../etc": lm.default_dashboard()}})

    def test_columns_out_of_range(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([], columns=7))

    def test_not_a_dict(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(["nope"])

    def test_bool_is_not_int(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "a", "type": "clock", "w": True}]))


class ImageTileTests(unittest.TestCase):
    def test_image_tile_with_overlays(self):
        out = lm.normalize_data(_data([{
            "id": "bild", "type": "image", "src": "/tessella_static/img/energie.png", "w": 3, "h": 4,
            "overlays": [
                {"kind": "value", "entity": "sensor.helios_pv_gesamt_leistung", "x": 50, "y": 20, "unit": "W"},
                {"kind": "mask", "x": 40, "y": 15, "w": 10, "h": 5, "color": "#1c1c1c"},
                {"kind": "text", "x": 10, "y": 90, "text": "Hallo"},
            ],
        }]))
        tile = out["dashboards"]["default"]["pages"][0]["tiles"][0]
        self.assertEqual(len(tile["overlays"]), 3)

    def test_image_src_must_be_local_or_https(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "b", "type": "image", "src": "javascript:alert(1)"}]))

    def test_overlay_position_range(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "b", "type": "image", "src": "/tessella_static/x.png",
                                      "overlays": [{"kind": "value", "entity": "sensor.a", "x": 120, "y": 1}]}]))

    def test_overlay_color_checked(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "b", "type": "image", "src": "/tessella_static/x.png",
                                      "overlays": [{"kind": "mask", "x": 1, "y": 1, "w": 2, "h": 2, "color": "red;x"}]}]))

    def test_value_overlay_needs_entity(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "b", "type": "image", "src": "/tessella_static/x.png",
                                      "overlays": [{"kind": "value", "x": 1, "y": 1}]}]))


class LightGroupTests(unittest.TestCase):
    def test_light_group_kept(self):
        out = lm.normalize_data(_data([{"id": "l", "type": "light", "entity": "light.a_b", "group": ["light.a_b", "light.c_d"]}]))
        self.assertEqual(out["dashboards"]["default"]["pages"][0]["tiles"][0]["group"], ["light.a_b", "light.c_d"])

    def test_group_must_be_lights(self):
        with self.assertRaises(lm.LayoutError):
            lm.normalize_data(_data([{"id": "l", "type": "light", "entity": "light.a_b", "group": ["switch.x"]}]))


if __name__ == "__main__":
    unittest.main()
