# Changelog

## [1.1.2] – 2025-11-03

### Fixed
- **Fehlerbehebung:** Variable `usedAreaNameMatch` war nicht definiert und verursachte den Fehler  
  *„DWD-Warnings Fehler: usedAreaNameMatch is not defined“*.
- **Meta-Block überarbeitet:** Saubere Trennung zwischen `used` (effektive Laufzeitparameter)  
  und `configured` (Node-UI-Einstellungen).
- **Entfernt:** `nameFallback` wird nicht mehr im `_meta`-Block ausgegeben.
- **Korrekte Parameterauswertung:** Alle Flags (`areaNameMatch`, `staleAllow`, `onlyActive` etc.)  
  werden jetzt zuverlässig aus `msg` oder Node-Konfiguration übernommen.
- **Verbesserte Diagnose:** Log-Ausgabe zeigt nun alle effektiv genutzten Filterparameter übersichtlich an.

## [1.1.1] - 2025-11-03
### Fixed
- `_meta`-Block überarbeitet: alle Felder spiegeln jetzt korrekt die Node-Konfiguration wider  
  (`staleAllow`, `areaNameMatch`, `extraAreaNames`, `onlyActive`, …)
- Inkonsistente Feldnamen zwischen HTML-UI und Laufzeit-Objekt behoben  
  (z. B. `node.allowStale` → `node.staleAllow`)
- Ausgabe enthält jetzt saubere Trennung zwischen Laufzeitstatus (`stale`, `total`)  
  und Konfigurationseigenschaften (`staleAllow`, `onlyActive`, `areaNameMatch`, …)

### Internal
- Code-Struktur im Output-Block vereinheitlicht und kommentiert

## [1.1.0] – 2025-11-03

### Fixed
- **404-Fehler beim Abruf der DWD-Warnungen behoben**
    - Alte Feed-URLs (`cap_de.atom`, `COUNTY_MOWAS`, `DISTRICT_CELLS_STAT/LATEST`) durch die neuen ZIP-Feeds ersetzt:  
      `https://opendata.dwd.de/weather/alerts/cap/.../Z_CAP_C_EDZW_LATEST_PVW_STATUS_PREMIUMCELLS_*.zip`
    - Fallback implementiert, falls DWD-Daten temporär nicht verfügbar ist (automatische Auswahl der neuesten Datei im Verzeichnis).

### Added
- **Erweiterte Diagnose-Logs** über neue Checkbox *„Diagnose-Logs“* in der Node-UI.
    - Zeigt detaillierte Fetch- und Parse-Informationen im Node-RED-Log (Status, Datensätze, Filterung, Quelle).

### Restored
- **Vorherige UI-Optionen** (*Stale erlauben*, *Nur aktive & zukünftige*, *Gebiets-Namensabgleich*) wiederhergestellt.
    - Diese Optionen entsprechen funktional der Version ≤ 1.0.8 und wurden neu integriert, ohne bestehende Flows zu brechen.

## [1.0.8] - 2025-10-30
### Changed
- Release-Prozess verbessert:
    - Neues Skript `scripts/ensure-changelog.js` prüft beim Versions-Bump automatisch, ob die `CHANGELOG.md` geändert und gestaged wurde.
    - Neue `preversion`, `version` und `postversion` Hooks in der `package.json` für konsistente Commits und automatischen Push.
- `package.json` um Release-Skripte erweitert und Build-Prozess optimiert.
- Keine funktionalen Änderungen am Node-Code selbst.

## [1.0.7] - 2025-10-30
### Changed
- HTTP-Client: Migration von `request` (deprecated) zu `axios`
- Stabileres Fehler- und Timeout-Handling bei DWD-Abrufen

## [1.0.6] - 2025-10-30
### Changed
- Dependencies aktualisiert: moment, moment-timezone, xml2js (Scorecard „latest deps“)
- Verifikation: `node-red.version` auf npm vorhanden (Scorecard-Hinweis war Cache)

## [1.0.5] - 2025-10-30
### Changed
- Release workflow (`.github/workflows/release.yml`) überarbeitet:
    - Automatische Erstellung von GitHub Releases mit Release Notes
    - Pflege des `latest`-Tags für klare Zuordnung aktueller Version
    - Bessere Sicherheits- und Konsistenzchecks vor npm-Publish
- `package.json`: Mindestversionen ergänzt
  - Node-RED: `"node-red.version": ">=3.0.0"`
  - Node.js/NPM: `"engines": { "node": ">=18.0.0", "npm": ">=9.0.0" }`
- Beispiele ergänzt: `examples/weatherwarnings-basic.json` (für Scorecard „Examples“)
- Metadata/Files: `files`-Feld enthält jetzt `examples/` und `CHANGELOG.md`

### Security / Maintenance
- Abhängigkeiten auf aktuelle Ranges geprüft (Scorecard-Hinweis)

## [1.0.4] - 2025-10-30
### Changed
- Metadaten in `package.json` erweitert (`homepage`, `bugs`, `publishConfig`, `engines`)
- Darstellung und Verlinkung auf npm und flows.nodered.org verbessert

## [1.0.3] - 2025-10-30
### Added
- Neue `.gitignore` im Repository-Root für Node.js-, Node-RED- und WebStorm-Projekte
- Neue `CHANGELOG.md` zur separaten Pflege von Versionsänderungen

### Changed
- README.md angepasst: Changelog-Abschnitt entfernt und Link zur `CHANGELOG.md` ergänzt
- Kleinere Formatierungen und Strukturverbesserungen in der Dokumentation

## [1.0.2] - 2025-10-30
### Fixed
- Workflow-Tag v1.0.1 enthielt keine `release.yml` → Release nicht getriggert
- Neuer Tag v1.0.2 startet nun den automatischen npm-Release korrekt

### Changed
- Repository mit GitHub Actions `release.yml` synchronisiert
- NPM-Veröffentlichung erfolgreich getestet

## [1.0.1] - 2025-10-30
### Added
- Initial release
- Full support for DWD CAP warning feed
- Added name fallback and alternate region names
- Added stale fallback and auto-refresh
- Added HTML summary output
- Added “only active/future” filter
- Added core-only output mode

