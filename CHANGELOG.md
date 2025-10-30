# Changelog
Alle Änderungen an diesem Projekt werden in diesem Dokument festgehalten.  
Das Format folgt **Keep a Changelog** und **SemVer**.

## [1.0.5] - 2025-10-30
### Changed
- `package.json`: Mindestversionen ergänzt
    - Node-RED: `"node-red.version": ">=3.0.0"`
    - Node.js/NPM: `"engines": { "node": ">=18.0.0", "npm": ">=9.0.0" }`
- Beispiele ergänzt: `examples/weatherwarnings-basic.json` (für Scorecard „Examples“)
- Metadata/Files: `files`-Feld enthält jetzt `examples/` und `CHANGELOG.md`

### Security / Maintenance
- Abhängigkeiten auf aktuelle Ranges geprüft (Scorecard-Hinweis)

[1.0.5]: https://github.com/GerdRuetten/node-red-contrib-dwd-weatherwarnings/releases/tag/v1.0.5

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
