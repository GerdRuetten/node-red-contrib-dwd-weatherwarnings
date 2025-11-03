# node-red-contrib-dwd-weatherwarnings

DWD-Warnungen (CAP) als Node-RED-Node. Lädt die aktuellen Unwetter-/Gefahrenmeldungen des Deutschen Wetterdienstes,
filtert sie optional nach Warnzellen (Warncell-IDs) **und/oder** Gebietsnamen und gibt strukturierte Objekte aus.

> **Getestet mit Dataset:** `COMMUNEUNION_CELLS_STAT`  
> **Beispiel-Filter:** Warncell-IDs `105315000, 105111000` • Extra Gebietsnamen `Köln, Düsseldorf, Deutz`

---

## Installation

```bash
cd ~/.node-red
npm install node-red-contrib-dwd-weatherwarnings
# Node-RED neu starten
```

---

## Konfiguration

Im Node-Editor stehen diese Felder zur Verfügung:

### 1) Dataset
- **Feld:** `Dataset`
- **Optionen:** `DISTRICT_CELLS_STAT`, `COUNTY_MOWAS`, `COMMUNEUNION_CELLS_STAT`
- **Empfehlung:** `COMMUNEUNION_CELLS_STAT` (feinere Auflösung, Kommunalverbünde)
- **Hinweis:** Ältere, nicht mehr erreichbare Feeds (z. B. cap_de.atom) sind ersetzt worden.

### 2) Warncell-IDs
- **Feld:** `Warncell-IDs` (kommagetrennt)
- **Beispiel:** `105315000, 105111000`
- **Wirkung:** Es werden nur Meldungen ausgegeben, deren `info.area.desc` bzw. CAP-Area‐Eintrag die entsprechende Warnzelle enthält.

### 3) Gebiets-Namensabgleich erlauben (areaDesc)
- **Feld:** Checkbox `Gebiets-Namensabgleich erlauben (areaDesc)`
- **Wirkung:** Zusätzlich zum Warncell-Filter wird auch auf den Gebietsnamen (`areaDesc`) gematcht.
  Praktisch, wenn Meldungen für angrenzende Gebiete relevant sind oder Warncell-IDs nicht bekannt sind.

### 4) Zusätzliche Gebiets­namen
- **Feld:** `Zusätzliche Gebiets­namen` (kommagetrennt)
- **Beispiel:** `Köln, Düsseldorf, Deutz`
- **Wirkung:** Erweiterung der Namens-Suche. Sinnvoll in Kombination mit der Checkbox aus (3).

### 5) Nur aktive und zukünftige Meldungen
- **Feld:** Checkbox `Nur aktive und zukünftige Meldungen`
- **Wirkung:** Filtert abgelaufene Meldungen (nach `onset`, `effective`, `expires`) automatisch heraus.

### 6) Stale erlauben
- **Feld:** Checkbox `Stale erlauben`
- **Wirkung:** Falls der DWD vorübergehend nichts Neues liefert („Lücken“), wird der zuletzt erfolgreiche Stand akzeptiert.
  `_meta.stale = true` markiert den Zustand.

### 7) Auto-Refresh (Sekunden)
- **Feld:** `Auto-Refresh (Sekunden)`
- **Beispiel:** `300` (alle 5 Minuten)
- **Hinweis:** `0` deaktiviert.

### 8) Beim Deploy abrufen
- **Feld:** Checkbox `Beim Deploy abrufen`
- **Wirkung:** Holt einmalig Daten direkt nach dem Node-RED-Deploy.

### 9) Diagnose-Logs
- **Feld:** Checkbox `Diagnose-Logs`
- **Wirkung:** Ausführlichere Logausgaben im Node-RED-Log (z. B. gewähltes Dataset, Trefferanzahl, Filterpfade).

---

## Output

Der Node sendet **ein Array von Alerts** in `msg.payload`. Beispiel (gekürzt):

```json
[
  {
    "identifier": "2.49.0.0.276.0.DE.105111000.2025-11-03T05:40:00+01:00",
    "sent": "2025-11-03T04:40:00Z",
    "status": "Actual",
    "msgType": "Alert",
    "scope": "Public",
    "info": {
      "event": "HEAVY_RAIN",
      "urgency": "Immediate",
      "severity": "Severe",
      "certainty": "Observed",
      "effective": "2025-11-03T04:50:00Z",
      "expires": "2025-11-03T08:00:00Z",
      "area": {
        "areaDesc": "Köln, Düsseldorf, Deutz …",
        "geocodes": [
          {"valueName": "WARNCELLID", "value": "105111000"}
        ]
      }
    }
  }
]
```

Zusätzlich enthält `msg._meta` nützliche Metadaten zur Abfrage:

```json
{
  "dataset": "COMMUNEUNION_CELLS_STAT",
  "sourceUrl": "https://opendata.dwd.de/weather/alerts/cap/COMMUNEUNION_CELLS_STAT/Z_CAP_C_EDZW_LATEST_PVW_STATUS_PREMIUMCELLS_COMMUNEUNION_DE.zip",
  "stale": false,
  "total": 3,
  "filterWarncells": ["105315000","105111000"],
  "areaNameMatch": true,
  "extraAreaNames": ["Köln","Düsseldorf","Deutz"],
  "onlyActive": true
}
```

---

## Tipps & Fehlersuche

- **404 / Feed nicht erreichbar:** Prüfe Dataset-Wahl.  
  Die neuen ZIP-Feeds liegen unter  
  `opendata.dwd.de/weather/alerts/cap/<DATASET>/Z_CAP_..._LATEST_...zip`.

- **Keine Treffer:**
    - Stimmt die **Warncell-ID** (Format, führende Nullen)?
    - Testweise **Nur aktive** deaktivieren (evtl. schon abgelaufen).
    - **Namensabgleich** aktivieren und `Zusätzliche Gebietsnamen` ergänzen.

- **Stale = true:**  
  DWD liefert kurzfristig keine Aktualisierung → letzter Stand wird verwendet.

- **Rate-Limit/Intervall:**  
  Auto-Refresh nicht zu klein wählen (z. B. ≥ 300s).

---

## Beispiel-Flow

Ein einfacher Flow mit Debug-Ausgabe:

```json
[
  {
    "id": "dwd-warnings",
    "type": "dwd-weatherwarnings",
    "z": "flow1",
    "name": "DWD Warnings Köln/Düsseldorf",
    "dataset": "COMMUNEUNION_CELLS_STAT",
    "warncells": "105315000, 105111000",
    "areaNameMatch": true,
    "extraAreaNames": "Köln, Düsseldorf, Deutz",
    "activeOnly": true,
    "staleAllow": true,
    "autoRefresh": 300,
    "fetchOnDeploy": true,
    "diag": true,
    "x": 300,
    "y": 200,
    "wires": [["debug-node"]]
  },
  {
    "id": "debug-node",
    "type": "debug",
    "name": "Output",
    "active": true,
    "tosidebar": true,
    "console": false,
    "complete": "payload",
    "x": 600,
    "y": 200,
    "z": "flow1"
  }
]
```

---

## Lizenz

Dieses Projekt steht unter der **MIT License**.  
© 2025 [Gerd Rütten](https://github.com/GerdRuetten)

---

## Changelog (Auszug)

### v1.1.2 – 2025-11-03
- **Behoben:** nicht verwendete Meta-Felder `nameFallback` und `usedAreaNameMatch` entfernt
- **Neu:** saubere `_meta`-Struktur im Output (nach Node-RED-Best Practices)
- **Pflege:** README aktualisiert, Parameterbeschreibungen überarbeitet
- **Stabilität:** interne Referenzen und HTML-Bindings geprüft

---## Beispiel-Flow

Ein einfacher Flow mit Debug-Ausgabe:

```json
[
  {
    "id": "dwd-warnings",
    "type": "dwd-weatherwarnings",
    "z": "flow1",
    "name": "DWD Warnings Köln/Düsseldorf",
    "dataset": "COMMUNEUNION_CELLS_STAT",
    "warncells": "105315000, 105111000",
    "areaNameMatch": true,
    "extraAreaNames": "Köln, Düsseldorf, Deutz",
    "activeOnly": true,
    "staleAllow": true,
    "autoRefresh": 300,
    "fetchOnDeploy": true,
    "diag": true,
    "x": 300,
    "y": 200,
    "wires": [["debug-node"]]
  },
  {
    "id": "debug-node",
    "type": "debug",
    "name": "Output",
    "active": true,
    "tosidebar": true,
    "console": false,
    "complete": "payload",
    "x": 600,
    "y": 200,
    "z": "flow1"
  }
]
```

---

## Lizenz

Dieses Projekt steht unter der **MIT License**.  
© 2025 [Gerd Rütten](https://github.com/GerdRuetten)

---

## Changelog (Auszug)
siehe CHANGELOG.md

---