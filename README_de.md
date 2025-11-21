# node-red-contrib-dwd-weatherwarnings

Ein Node-RED-Node für die **offiziellen DWD-Wetterwarnungen** (Deutscher Wetterdienst · WARN_L).  
Der Node lädt die aktuellen XML-Feeds, wertet die relevanten Informationen aus und stellt eine strukturierte
JSON-Ausgabe bereit – ideal für Dashboards, Benachrichtigungen und Automatisierungen.

---

## ✨ Features

- Nutzung der offiziellen **DWD WARN_L** Wetterwarnungsdaten
- Unterstützung mehrerer WARN_L-Datasets (z. B. Communeunion- oder Kreis-Zellen)
- Filterung nach **Warncell-ID** (einzelne Region/Zelle)
- Optional: **alle aktiven Warnungen für Deutschland**
- Optionaler **Stale-Modus** (letzte gültige Daten bei Fehlern)
- Unterstützung für automatische Aktualisierung (Auto-Refresh)
- Option **„Beim Deploy abrufen“**
- Vollständige Unterstützung für **i18n** (Deutsch / Englisch, inkl. Hilfe & Status)
- Passt in das gemeinsame Konzept der DWD-Nodes (Pollen, Vorhersage, Regenradar)

---

## 📦 Installation

Im Node-RED Benutzerverzeichnis (typisch `~/.node-red`):

```bash
npm install node-red-contrib-dwd-weatherwarnings
```

Oder über den Node-RED Paletten-Manager:

1. Node-RED Editor öffnen
2. Menü → **Palette verwalten**
3. Tab **Installieren**
4. Nach **`node-red-contrib-dwd-weatherwarnings`** suchen
5. **Installieren** klicken

---

## 🔧 Konfiguration

### Name
Optionaler Anzeigename für den Node.

### Warncell-ID
Optionale ID der Warnzelle, um die Ausgabe auf eine Region zu begrenzen.  
Wenn leer und entsprechend konfiguriert, kann der Node alle Warnungen eines Datasets liefern.

### Nur aktive Warnungen
Filtert abgelaufene Warnungen heraus und liefert nur Warnungen, die aktuell gültig sind.

### Stale-Daten erlauben
Wenn aktiviert, kann der Node beim Auftreten eines Fehlers (z. B. Netzwerkproblem, DWD nicht erreichbar)
die zuletzt erfolgreich abgerufenen Warnungen zurückgeben.  
Ein Metadatenfeld kennzeichnet die Daten dann als „stale“.

### Beim Deploy abrufen
Führt kurz nach dem Deploy einen initialen Abruf durch.

### Auto-Aktualisierung (Sek.)
- `0` → deaktiviert (Abruf nur bei eingehenden Nachrichten)
- `> 0` → periodische Aktualisierung

### Diagnose
Aktiviert erweiterte Logausgaben im Node-RED-Log – hilfreich bei der Inbetriebnahme und Fehlersuche.

---

## 🔌 Eingänge

Jede eingehende Nachricht löst, abhängig von der Konfiguration, einen Aktualisierungsversuch der Warnungen aus,
sofern nicht gerade eine Auto-Aktualisierung läuft.

Der Inhalt der Eingangs-Nachricht wird nicht ausgewertet; sie dient ausschließlich als Trigger.

---

## 📤 Ausgänge

Der Node stellt die Daten in `msg.payload` bereit.  
Eine typische Struktur kann so aussehen:

```json
{
  "dataset": "COMMUNEUNION_CELLS_STAT",
  "warncellId": "105340000",
  "alerts": [
    {
      "identifier": "2.49.0.0.276.0.DWD.PVW.18594476",
      "onset": "2025-10-28T10:00:00Z",
      "expires": "2025-10-28T18:00:00Z",
      "severity": "moderate",
      "event": "Wind",
      "headline": "Windwarnung",
      "description": "Es besteht Gefahr durch kräftige Böen.",
      "instruction": "Lose Gegenstände im Freien sichern.",
      "area": {
        "name": "Rhein-Erft-Kreis",
        "code": "105340000"
      }
    }
  ],
  "_meta": {
    "url": "https://opendata.dwd.de/weather/alerts/...xml",
    "count": 1,
    "stale": false,
    "fetchedAt": "2025-10-28T09:45:00Z"
  }
}
```

Die exakte Struktur kann je nach Implementierung leicht abweichen, folgt aber immer dem Muster:

- gewähltes Dataset und ggf. Warncell-ID
- ein `alerts`-Array mit den Warnobjekten
- ein `_meta`-Block mit technischen Details

---

## 🔎 Statusanzeigen

Der Node nutzt den Statusindikator im Node-RED Editor:

- **lade…** – Abruf läuft
- **bereit** – wartend / Leerlauf
- **ok** – Warnungen erfolgreich aktualisiert
- **Fehler** – Fehler beim Abrufen oder Verarbeiten
- **stale** – es werden zwischengespeicherte (stale) Warnungen ausgegeben

Alle Texte sind lokalisiert.

---

## 🌍 Internationalisierung (i18n)

Die Übersetzungen werden über die Node-RED i18n-Struktur bereitgestellt:

- Englisch:
    - `nodes/locales/en-US/dwd-weatherwarnings.json`
    - `nodes/locales/en-US/dwd-weatherwarnings.html`
- Deutsch:
    - `nodes/locales/de/dwd-weatherwarnings.json`
    - `nodes/locales/de/dwd-weatherwarnings.html`

Die Sprache des Editors bzw. die Browsersprache steuert, welche Inhalte angezeigt werden.

---

## 🧪 Beispiel-Flow

Beispiel-Flow:

```text
examples/weatherwarnings-basic.json
```

Import:

1. Node-RED Menü → **Importieren**
2. **Zwischenablage** auswählen
3. JSON einfügen
4. **Importieren** klicken

Der Flow zeigt:

- manuellen Trigger per Inject-Node
- Konfiguration von Dataset und Warncell-ID
- Ausgabe der Warnungen über einen Debug-Node

---

## 🗺️ Roadmap

Geplante Erweiterungen:

- Zusätzliche Filter (z. B. nach Schweregrad)
- Beispiel-Dashboards
- Kombination mit Vorhersage- und Regenradar-Daten
- Optionales Monitoring / Metriken

---

## ⚖️ Lizenz

MIT © 2025 Gerd Rütten

---

> ⚠️ **node-red-contrib-dwd-weatherwarnings** — bringt die offiziellen DWD-Wetterwarnungen direkt in deine Node-RED-Flows.
