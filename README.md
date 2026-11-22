# Tessella

Kachel-Dashboards für Smartphone und Tablet, direkt im Browser. Eine Abwandlung von
Tessera für ESP32-Displays: statt eines Bildschirms an der Wand
läuft Tessella im Browser, den jedes Handy und Tablet ohnehin hat.

Tessella ist eine Custom Integration. Sie legt einen Eintrag in der Seitenleiste von
Home Assistant an. Dashboards werden im Editor gebaut und auf dem Gerät angezeigt.

> **Status:** Version 0.1.0, Entwurf. Die Backend-Logik ist getestet, das Frontend im
> Browser mit einem Fake-`hass` geprüft. Noch nicht auf einer echten HA-Instanz getestet.

## Funktionen (v0.1)

| Kachel | Was sie tut |
|---|---|
| **Schalter** | Tippen schaltet um (`homeassistant.toggle`) |
| **Licht** | Tippen = an/aus, Ziehen nach oben/unten = dimmen (Helligkeitsbalken) |
| **Sensor** | Zustand mit Einheit |
| **Knopf** | Ruft einen Dienst auf, z. B. `script.gute_nacht`, optional mit JSON-Daten |
| **Thermostat** | Ist-Temperatur, Soll-Temperatur mit +/− (sendet verzögert) |
| **Rollo / Tor** | Auf, Stopp, Zu |
| **Kamera** | Bild, aktualisiert sich alle 15 s |
| **Verlauf** | Liniendiagramm der letzten 24 h mit Min/Max |
| **Uhr** | Uhrzeit und Datum in der Gerätesprache |
| **Text** | Freier Text (Notizen, Hinweise) |
| **Webseite** | Eingebettetes iframe (z. B. Wetter, Kamera-Weboberfläche) |

Weitere Eigenschaften:

- **Seiten** mit Wischen zwischen den Seiten, mehrere **Dashboards** (z. B. eins fürs Tablet, eins fürs Handy).
- **Spalten pro Seite** (2–6). Auf schmalen Bildschirmen werden höchstens 2 Spalten angezeigt.
- **Editor** im Bearbeiten-Modus: Kacheln hinzufügen, ändern, verschieben, löschen, Breite und Höhe wählen.
- **Export und Import** eines Dashboards als JSON.
- **Wach halten** (Bildschirm bleibt an) und **Vollbild**. Die Einstellung merkt sich das Gerät.
- Das Dashboard, das ein Gerät zeigt, merkt sich der Browser. Mit `?d=<id>` in der Adresse lässt sich
  ein Dashboard direkt aufrufen.
- Farben folgen dem Home-Assistant-Theme, auch im Dunkelmodus.

## Installation

1. HACS öffnen, **Benutzerdefinierte Repositories**, dann dieses Repository als Typ *Integration* hinzufügen.
   *(Das Repository ist noch nicht veröffentlicht.)*
2. Tessella installieren und Home Assistant neu starten.
3. **Einstellungen → Geräte & Dienste → Integration hinzufügen → Tessella.** Es gibt nichts einzustellen.
4. In der Seitenleiste erscheint **Tessella**.

Die Dashboards speichert Home Assistant in `.storage/tessella.dashboards`.

## Bedienung

- Tippe auf das **Zahnrad**, um Dashboards, Seiten, Spalten, Export/Import und Anzeige-Optionen zu öffnen.
- Mit **Stift** wechselst du in den Bearbeiten-Modus. Tippe danach auf eine Kachel, um sie zu ändern,
  oder auf **+**, um eine neue Kachel anzulegen.
- Änderungen werden automatisch gespeichert. Die Anzeige oben zeigt den Stand.
- Nur Administratoren können bearbeiten und speichern. Andere Benutzer sehen die Dashboards nur.

## Gut zu wissen

- **Wach halten** braucht eine sichere Verbindung (HTTPS). Über `http://` meldet der Browser einen Fehler.
- **Webseiten** erlauben manche Seiten nicht im iframe, weil sie das Einbetten verbieten (`X-Frame-Options`).
  Dann bleibt die Kachel leer.
- Zwei Geräte, die gleichzeitig bearbeiten, überschreiben sich gegenseitig (das zuletzt gespeicherte gewinnt).
- Ein Dashboard hat höchstens 30 Seiten mit je 120 Kacheln. Ungültige Daten lehnt der Server ab.

## Entwicklung

```bash
# Validierung testen (ohne Home Assistant)
python3 -m unittest discover -s tests -v

# Frontend im Browser prüfen: Fake-hass, Dateien über einen statischen Server ausliefern
python3 -m http.server 8765
# dann http://127.0.0.1:8765/tests/harness/index.html öffnen
```

Aufbau:

- `custom_components/tessella/__init__.py`: Einrichtung, Seitenleiste, Websocket-Befehle `tessella/get` und `tessella/save`
- `custom_components/tessella/layout_model.py`: Datenmodell und Validierung (ohne HA-Importe, testbar)
- `custom_components/tessella/frontend/tessella-panel.js`: gesamtes Frontend als eine Datei, ohne Build-Schritt

## Ideen für später

- Drag-and-drop-Raster statt Pfeiltasten zum Verschieben
- Mehrere Kacheln pro Szene oder Lautstärke-Kachel für Mediaplayer
- Benachrichtigungs-Kachel, die Persistent Notifications anzeigt
- Eigene Kachel-Typen über ein Plugin-Modell
