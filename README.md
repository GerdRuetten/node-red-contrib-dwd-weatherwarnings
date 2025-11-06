# node-red-contrib-dwd-weatherwarnings

A Node-RED node that retrieves **official weather warnings** from the  
**Deutscher Wetterdienst (DWD)** WARN_L open data API.

It downloads the latest **XML** weather warning feeds for Germany,  
parses and extracts structured warning data, and outputs a JSON array with  
key warning parameters such as warning type, severity, affected areas, start/end times, and descriptions.

---

## ⚠️ Features

- Uses official **DWD WARN_L** weather warning data (latest updates)
- Supports filtering by **WarnCell ID(s)** or by **area description**
- Handles multiple simultaneous warnings and overlapping areas
- Supports **auto-refresh** (periodic updates without inject nodes)
- Optionally triggers a fetch **on deploy**
- Allows **stale fallback** (keeps last valid data if DWD feed fails)
- Provides detailed warning metadata including event type, severity, certainty, urgency, and instructions
- Outputs warnings with precise **start and end timestamps**
- Supports outputting raw XML for advanced processing
- Includes **human-readable text fields** for warnings and instructions
- Compatible with Node-RED flows for alerting, dashboards, or logging

---

## 🧩 Installation

### Using the Node-RED Palette Manager

1. Open Node-RED in your browser  
2. Go to **Menu → Manage palette → Install**
3. Search for **`node-red-contrib-dwd-weatherwarnings`**
4. Click **Install**

### Using command line (for Docker or local installations)

```bash
cd /data
npm install --no-fund --no-audit GerdRuetten/node-red-contrib-dwd-weatherwarnings
```

or (if published on npm):

```bash
npm install node-red-contrib-dwd-weatherwarnings
```

If Node-RED runs inside Docker, execute from the container shell:

```bash
docker exec -u node-red -it node-red bash -lc 'cd /data && npm install --no-fund --no-audit GerdRuetten/node-red-contrib-dwd-weatherwarnings#master'
```

Then restart Node-RED.

---

## ⚙️ Configuration

| Setting | Type | Description |
|----------|------|-------------|
| **WarnCell ID(s)** | string | Comma-separated list of DWD WarnCell IDs to filter warnings (e.g. `0591,0592`) |
| **Area Description Filter** | string | Optional text filter for area descriptions (case-insensitive substring match) |
| **Source URL** | string | Default: <br>`https://opendata.dwd.de/weather/warnings/warnings_dwd_de.xml` |
| **Run on deploy** | checkbox | Immediately fetch data after deploy |
| **Auto refresh (seconds)** | number | Optional interval to automatically update warnings |
| **Allow stale fallback** | checkbox | Keep last valid data if DWD feed fails |
| **Output raw XML** | checkbox | Outputs the raw XML feed as a string in addition to parsed JSON |
| **Include instructions** | checkbox | Include detailed warning instructions text |
| **Only active warnings** | checkbox | Skip warnings that have expired (end time in the past) |

---

## 🧾 Example Output

```json
{
  "payload": [
    {
      "id": "DEBWZ-20240601-001",
      "event": "Severe Thunderstorm",
      "severity": "Severe",
      "certainty": "Likely",
      "urgency": "Immediate",
      "areas": ["Baden-Württemberg", "Stuttgart"],
      "warnCellIds": ["0591", "0592"],
      "start": 1719993600000,
      "end": 1720000800000,
      "headline": "Severe Thunderstorm Warning",
      "description": "Heavy thunderstorms with hail and strong winds expected.",
      "instruction": "Seek shelter indoors and avoid open areas.",
      "rawXml": "<warning>...</warning>"
    }
  ],
  "_meta": {
    "url": "https://opendata.dwd.de/weather/warnings/warnings_dwd_de.xml",
    "count": 1,
    "stale": false
  }
}
```

---

## 💡 Tips

- Use the [official DWD WarnCell list](https://opendata.dwd.de/weather/warnings/warncell_list.csv) to find WarnCell IDs.
- The node caches the last valid warning feed internally to prevent empty data during outages.
- For automatic updates, set *auto refresh* (e.g. `300` s = 5 min).
- Combine this node with dashboard, notification, or database nodes for live alerting.
- Use the area description filter to focus on specific regions or cities.
- Enable raw XML output for custom XML parsing or archival.

---

## 🧠 Data Source

All warning data comes from  
**Deutscher Wetterdienst (DWD)**  
via the [Open Data Server](https://opendata.dwd.de/weather/warnings/).

This node uses **WARN_L (Warning Information – Latest)** datasets.  
WARN_L provides up-to-date official weather warnings for all German regions.

---

## ⚖️ License

MIT © 2025 [Gerd Rütten](https://github.com/GerdRuetten)

---

## 🧰 Changelog
See [CHANGELOG.md](./CHANGELOG.md) for details.

---

## 🧪 Example Flow

```json
[
  {
    "id": "dwd_warnings",
    "type": "dwd-warnings",
    "name": "DWD Weather Warnings",
    "warnCellIds": "0591,0592",
    "areaDescFilter": "",
    "runOnDeploy": true,
    "autoRefreshSeconds": 300,
    "allowStale": true,
    "outputRawXml": false,
    "includeInstructions": true,
    "onlyActive": true
  }
]
```

---

> ⚠️ **node-red-contrib-dwd-weatherwarnings** — bringing official DWD weather warnings directly into your Node-RED flows.
</file>
