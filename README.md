# node-red-contrib-dwd-weatherwarnings

A Node-RED node providing access to the **official DWD Weather Warnings** (Deutscher Wetterdienst · WARN_L).  
The node downloads the latest XML feeds, parses all relevant warning information and exposes a structured JSON
payload that is easy to consume in dashboards, notifications and automations.

---

## ✨ Features

- Uses official **DWD WARN_L** weather warning data
- Supports multiple DWD datasets (e.g. commune union, district cells)
- Filtering by **warncell ID** (single region/cell)
- Optionally returns **all active warnings for Germany**
- Optional **stale mode** to keep last valid data on errors
- Auto-refresh support (periodic updates)
- Fetch-on-deploy option for initial data
- Fully **i18n-enabled** (English / German, including help text and status messages)
- Designed to work together with other DWD nodes (pollen, forecast, rain radar)

---

## 📦 Install

From your Node-RED user directory (typically `~/.node-red`):

```bash
npm install node-red-contrib-dwd-weatherwarnings
```

Or via the Node-RED Palette Manager:

1. Open the Node-RED editor
2. Menu → **Manage palette**
3. Tab **Install**
4. Search for **`node-red-contrib-dwd-weatherwarnings`**
5. Click **Install**

---

## 🔧 Configuration

The main configuration options:

### Name
Optional display name for the node.  
If left empty, a default label is used.

### Warncell ID
Optional cell identifier to restrict warnings to a single region.  
If left empty, the node can be configured to return all warnings for the selected dataset.

### Only active warnings
When enabled, the node filters out expired warnings and only returns those that are currently active.

### Allow stale data
When enabled, the node can return the last successfully fetched warning set if the latest fetch fails
(for example due to network issues or a temporary DWD outage). A metadata flag indicates that the data is stale.

### Fetch on deploy
If enabled, the node performs an initial fetch shortly after the flow is deployed.

### Auto-refresh (sec)
Interval in seconds for automatic refresh:

- `0` → disabled (warnings are only updated on incoming messages)
- `> 0` → warnings are refreshed periodically

### Diagnostics
When enabled, the node writes additional diagnostic messages into the Node-RED log, which helps with debugging and understanding the behaviour.

---

## 🔌 Inputs

Any incoming message triggers a refresh of the warning data based on the current configuration, unless the node is already updating due to auto-refresh.

The contents of the input message are not evaluated; the input acts as a simple trigger.

---

## 📤 Outputs

The node outputs a message where `msg.payload` contains warning information.  
A typical structure can look like:

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
      "headline": "Wind warning",
      "description": "There is a risk of gusty winds.",
      "instruction": "Secure loose objects outdoors.",
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

The exact output format may differ slightly depending on the implementation,
but always follows the idea of a top-level object with:

- the selected dataset and (optional) warncell ID,
- an `alerts` array with warning objects,
- and a `_meta` section with technical details.

---

## 🔎 Status text

The node uses its status indicator in the Node-RED editor to reflect its current state:

- **loading…** – currently fetching warnings
- **ready** – idle, waiting for triggers
- **ok** – warnings successfully updated (may display number of alerts)
- **error** – an error occurred while fetching or parsing data
- **stale** – serving cached warnings due to a recent fetch error

All status texts are fully localised.

---

## 🌍 Internationalisation (i18n)

All editor labels, help content and runtime status messages are localised via the Node-RED i18n mechanism.

Translator files:

- English:
    - `nodes/locales/en-US/dwd-weatherwarnings.json`
    - `nodes/locales/en-US/dwd-weatherwarnings.html`
- German:
    - `nodes/locales/de/dwd-weatherwarnings.json`
    - `nodes/locales/de/dwd-weatherwarnings.html`

The Node-RED editor language (or browser language, depending on configuration) controls which texts are displayed.

---

## 🧪 Example flow

A basic example flow is included in:

```text
examples/weatherwarnings-basic.json
```

It demonstrates:

- manual trigger via an **Inject** node,
- configuration of the dataset and warncell ID,
- and inspection of the resulting warnings via a **Debug** node.

Import steps:

1. In Node-RED, open the menu → **Import**
2. Choose **Clipboard**
3. Paste the contents of `weatherwarnings-basic.json`
4. Click **Import**

---

## 🗺️ Roadmap

Planned additions:

- Additional filtering options (e.g. by severity)
- Dashboard-ready example flows
- Combined views with forecast and rain radar
- Optional metrics/telemetry for monitoring

---

## ⚖️ License

MIT © 2025 Gerd Rütten

---

## 🧰 Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for the full history of changes.

---

> ⚠️ **node-red-contrib-dwd-weatherwarnings** — bringing official DWD Weather Warnings directly into your Node-RED flows.
