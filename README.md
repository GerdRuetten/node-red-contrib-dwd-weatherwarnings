# node-red-contrib-dwd-weatherwarnings

A Node-RED node that retrieves **official weather warnings** from the  
**Deutscher Wetterdienst (DWD)** (German Weather Service).

It downloads and parses the **DWD CAP warning feed** and provides  
a structured JSON output with all active or upcoming warnings for a  
specific region, city, or district (e.g. “805362004 Stadt Bedburg”).

---

## ⚠️ Features

- Uses **official DWD CAP warning feed** (`https://warnung.bund.de/bbk.mowas/gefahrendaten.xml`)
- Retrieves **current and upcoming** warnings for a given region or municipality
- Supports **region name fallback** (e.g. “Bedburg” → “Rhein-Erft-Kreis”)
- Optional filter for **only active warnings**
- Optional **auto refresh** without needing inject nodes
- **Run on deploy** support
- **Stale fallback** (keeps last valid warning data if DWD feed is temporarily unavailable)
- Provides **structured JSON** with severity, type, headline, description, and validity
- Outputs **HTML summary** for dashboards and notifications
- Fully localized for German warning categories and DWD structure

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

If Node-RED runs inside Docker, execute from the container shell:

```bash
docker exec -u node-red -it node-red bash -lc 'cd /data && npm install --no-fund --no-audit GerdRuetten/node-red-contrib-dwd-weatherwarnings#master'
```

Then restart Node-RED.

---

## ⚙️ Configuration

| Setting | Type | Description |
|----------|------|-------------|
| **Region Name / ID** | string | Name or CAP region ID (e.g. `805362004 Stadt Bedburg`) |
| **Run on deploy** | checkbox | Immediately fetch warnings after deploy |
| **Auto refresh (seconds)** | number | Interval for automatic CAP updates |
| **Allow stale fallback** | checkbox | Keep last valid data if DWD feed fails |
| **Only active and future warnings** | checkbox | Skip expired CAP messages |
| **Allow name fallback** | checkbox | If the region is missing, use the district (e.g. Kreis) |
| **Extra region names** | string | Comma-separated list of alternate names for lookup |
| **Core data only** | checkbox | Output compact payload with essential fields |

---

## 🧾 Example Output

```json
{
  "payload": [
    {
      "id": "2.49.0.0.276.0.DE.805362004.2025-10-27T17:00:00+01:00",
      "sender": "DWD",
      "identifier": "DWD-CAP-20251027T170000Z-805362004",
      "sent": "2025-10-27T16:59:00Z",
      "onset": "2025-10-27T18:00:00Z",
      "expires": "2025-10-27T20:00:00Z",
      "headline": "Amtliche WARNUNG vor WINDBÖEN",
      "description": "Es treten Windböen mit Geschwindigkeiten bis 60 km/h anfangs aus südwestlicher Richtung auf.",
      "severity": "minor",
      "urgency": "expected",
      "event": "Windböen",
      "area": "Stadt Bedburg",
      "instruction": "Achten Sie auf herabfallende Gegenstände.",
      "web": "https://www.dwd.de/DE/wetter/warnungen/warnWetter_node.html",
      "level": 2
    }
  ],
  "_meta": {
    "region": "805362004 Stadt Bedburg",
    "count": 1,
    "stale": false
  }
}
```

---

## 💡 Tips

- To find your **region ID**, use the DWD warning map and inspect a warning’s CAP feed URL.  
  Example:  
  `https://warnung.bund.de/bbk.mowas/gefahrendaten.xml` → contains `<areaDesc>` like `805362004 Stadt Bedburg`
- The node automatically matches local and district names (if fallback is enabled).
- For regular updates, set *auto refresh* (e.g. every 300 seconds).
- Combine this node with dashboard or persistent notification nodes to stay informed about weather alerts.

---

## 🧠 Data Source

All warning data comes from  
**Deutscher Wetterdienst (DWD)** via the official **CAP feed** on  
the [DWD Open Data Server](https://www.dwd.de/DE/leistungen/opendata/opendata.html).

Feed format: **Common Alerting Protocol (CAP 1.2)**, XML-based, updated every few minutes.

---

## ⚖️ License

MIT © 2025 [Marvin Rütten](https://github.com/GerdRuetten)

---

## 🧰 Changelog

### v1.0.0
- Initial release
- Full support for DWD CAP warning feed
- Added name fallback and alternate region names
- Added stale fallback and auto-refresh
- Added HTML summary output
- Added “only active/future” filter
- Added core-only output mode

---

## 🧪 Example Flow

```json
[
  {
    "id": "dwd_warnings",
    "type": "dwd-weatherwarnings",
    "name": "DWD Weather Warnings Bedburg",
    "region": "805362004 Stadt Bedburg",
    "runOnDeploy": true,
    "autoRefreshSeconds": 600,
    "allowStale": true,
    "onlyFuture": true,
    "allowNameFallback": true,
    "extraRegionNames": "Rhein-Erft-Kreis, NRW",
    "coreOnly": false
  }
]
```

---

> 🧩 **node-red-contrib-dwd-weatherwarnings** — bringing official DWD weather alerts directly into your Node-RED flows.
