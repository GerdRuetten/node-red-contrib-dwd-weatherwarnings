# Changelog

## [1.2.1] - 2025-11-15
### Fixed
- Release workflow corrected (previous v1.2.0 failed before publishing)

### Added
- Full internationalization (i18n) support for all UI elements.
    - Runtime messages localized via `RED._(...)`.
    - Editor UI now supports multi-language labels using `data-i18n`.
    - Help text moved to per-language files:
        - `nodes/locales/en-US/<node>.html`
        - `nodes/locales/de/<node>.html`
    - Automatic language switching based on Node-RED editor settings
      (“Browser”, “Deutsch”, “English”).

### Changed
- Updated internal structure to use the official Node-RED i18n layout:
    - `nodes/locales/<lang>/<node>.json`
    - `nodes/locales/<lang>/<node>.html`
    - Simplified template HTML by removing inline help text.

## [1.1.5] - 2025-11-06
### Docs
- Unified README style and structure with other DWD modules for consistent documentation.

## [1.1.4] – 2025-11-03
### Changed
- README.md adapted to current code base
- Placeholder values for warncells and extraAreaNames adjusted to plausible values

## [1.1.2] – 2025-11-03
### Fixed
- **Bugfix:** Variable `usedAreaNameMatch` was not defined and caused the error  
  *“DWD-Warnings error: usedAreaNameMatch is not defined”*.
- **Meta block revised:** Clean separation between `used` (effective runtime parameters)  
  and `configured` (Node-UI settings).
- **Removed:** `nameFallback` is no longer output in the `_meta` block.
- **Correct parameter evaluation:** All flags (`areaNameMatch`, `staleAllow`, `onlyActive` etc.)  
  are now reliably taken from `msg` or node configuration.
- **Improved diagnostics:** Log output now clearly shows all effectively used filter parameters.

## [1.1.1] - 2025-11-03
### Fixed
- `_meta` block revised: all fields now correctly reflect the node configuration  
  (`staleAllow`, `areaNameMatch`, `extraAreaNames`, `onlyActive`, …)
- Inconsistent field names between HTML UI and runtime object fixed  
  (e.g. `node.allowStale` → `node.staleAllow`)
- Output now contains a clean separation between runtime status (`stale`, `total`)  
  and configuration properties (`staleAllow`, `onlyActive`, `areaNameMatch`, …)

### Internal
- Code structure in output block unified and commented

## [1.1.0] – 2025-11-03

### Fixed
- **404 error when fetching DWD warnings fixed**
    - Old feed URLs (`cap_de.atom`, `COUNTY_MOWAS`, `DISTRICT_CELLS_STAT/LATEST`) replaced by new ZIP feeds:  
      `https://opendata.dwd.de/weather/alerts/cap/.../Z_CAP_C_EDZW_LATEST_PVW_STATUS_PREMIUMCELLS_*.zip`
    - Fallback implemented in case DWD data is temporarily unavailable (automatic selection of newest file in directory).

### Added
- **Extended diagnostic logs** via new checkbox *“Diagnostic logs”* in the Node-UI.
    - Shows detailed fetch and parse information in Node-RED log (status, records, filtering, source).

### Restored
- **Previous UI options** (*Allow stale*, *Only active & future*, *Area name matching*) restored.
    - These options correspond functionally to version ≤ 1.0.8 and were re-integrated without breaking existing flows.

## [1.0.8] - 2025-10-30
### Changed
- Release process improved:
    - New script `scripts/ensure-changelog.js` automatically checks during version bump whether `CHANGELOG.md` was changed and staged.
    - New `preversion`, `version` and `postversion` hooks in `package.json` for consistent commits and automatic push.
- `package.json` extended with release scripts and build process optimized.
- No functional changes to the node code itself.

## [1.0.7] - 2025-10-30
### Changed
- HTTP client: Migrated from `request` (deprecated) to `axios`
- More stable error and timeout handling for DWD fetches

## [1.0.6] - 2025-10-30
### Changed
- Dependencies updated: moment, moment-timezone, xml2js (Scorecard “latest deps”)
- Verification: `node-red.version` present on npm (Scorecard hint was cache)

## [1.0.5] - 2025-10-30
### Changed
- Release workflow (`.github/workflows/release.yml`) revised:
    - Automatic creation of GitHub releases with release notes
    - Maintenance of the `latest` tag for clear assignment of current version
    - Better security and consistency checks before npm publish
- `package.json`: Minimum versions added
  - Node-RED: `"node-red.version": ">=3.0.0"`
  - Node.js/NPM: `"engines": { "node": ">=18.0.0", "npm": ">=9.0.0" }`
- Examples added: `examples/weatherwarnings-basic.json` (for Scorecard “Examples”)
- Metadata/Files: `files` field now includes `examples/` and `CHANGELOG.md`

### Security / Maintenance
- Dependencies checked for current ranges (Scorecard hint)

## [1.0.4] - 2025-10-30
### Changed
- Metadata in `package.json` extended (`homepage`, `bugs`, `publishConfig`, `engines`)
- Presentation and linking on npm and flows.nodered.org improved

## [1.0.3] - 2025-10-30
### Added
- New `.gitignore` in repository root for Node.js, Node-RED, and WebStorm projects
- New `CHANGELOG.md` for separate maintenance of version changes

### Changed
- README.md adapted: Changelog section removed and link to `CHANGELOG.md` added
- Minor formatting and structural improvements in documentation

## [1.0.2] - 2025-10-30
### Fixed
- Workflow tag v1.0.1 did not contain `release.yml` → release not triggered
- New tag v1.0.2 now starts automatic npm release correctly

### Changed
- Repository synchronized with GitHub Actions `release.yml`
- NPM publication successfully tested

## [1.0.1] - 2025-10-30
### Added
- Initial release
- Full support for DWD CAP warning feed
- Added name fallback and alternate region names
- Added stale fallback and auto-refresh
- Added HTML summary output
- Added “only active/future” filter
- Added core-only output mode
