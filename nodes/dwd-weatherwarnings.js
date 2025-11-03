module.exports = function (RED) {
  "use strict";
  const axios = require("axios");
  const AdmZip = require("adm-zip");
  const { parseStringPromise } = require("xml2js");

  // --- DATASET Mapping ---
  const DATASETS = {
    COMMUNEUNION_CELLS_STAT: "COMMUNEUNION",
    DISTRICT_CELLS_STAT: "DISTRICT",
  };

  const BASE_DIR = "https://opendata.dwd.de/weather/alerts/cap";

  function buildLatestZipUrl(datasetKey) {
    const dir = datasetKey;
    const kind = DATASETS[datasetKey];
    if (!dir || !kind) throw new Error(`Ungültiger Dataset-Key: ${datasetKey}`);
    return `${BASE_DIR}/${dir}/Z_CAP_C_EDZW_LATEST_PVW_STATUS_PREMIUMCELLS_${kind}_DE.zip`;
  }

  async function findNewestZipUrl(datasetKey, logFn) {
    const dir = datasetKey;
    const kind = DATASETS[datasetKey];
    const indexUrl = `${BASE_DIR}/${dir}/`;
    const res = await axios.get(indexUrl, { responseType: "text", validateStatus: () => true });
    if (res.status !== 200) throw new Error(`Index HTTP ${res.status}`);

    const re = new RegExp(
      `Z_CAP_C_EDZW_([0-9]{14})_PVW_STATUS_PREMIUMCELLS_${kind}_DE\\.zip`,
      "g"
    );

    const matches = [];
    let m;
    while ((m = re.exec(res.data))) matches.push({ name: m[0], ts: m[1] });
    if (!matches.length) return buildLatestZipUrl(datasetKey);

    matches.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    const newest = matches[0].name;
    return `${BASE_DIR}/${dir}/${newest}`;
  }

  async function downloadZipBuffer(url, logFn) {
    const res = await axios.get(url, { responseType: "arraybuffer", validateStatus: () => true });
    if (logFn) logFn(`[DWD-Warnings] GET ${url} → ${res.status}`);
    if (res.status !== 200) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.data;
  }

  async function fetchZipWithFallback(datasetKey, logFn) {
    const latestUrl = buildLatestZipUrl(datasetKey);
    try {
      return { buffer: await downloadZipBuffer(latestUrl, logFn), sourceUrl: latestUrl, stale: false };
    } catch (e) {
      if (e && e.status === 404) {
        if (logFn) logFn(`[DWD-Warnings] LATEST 404 – Fallback auf Directory-Listing…`);
        const newestUrl = await findNewestZipUrl(datasetKey, logFn);
        const buf = await downloadZipBuffer(newestUrl, logFn);
        return { buffer: buf, sourceUrl: newestUrl, stale: true };
      }
      throw e;
    }
  }

  // --- Helpers ---
  const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const textOf = (node) =>
    typeof node === "string" ? node : node && typeof node._ === "string" ? node._ : null;

  // CAP → Normalisierte Warnung
  function normalizeAlert(cap, srcName) {
    const a = cap.alert || cap["cap:alert"] || cap;
    if (!a) return null;

    const id = asArray(a.identifier).map(textOf)[0] || null;
    const sender = asArray(a.sender).map(textOf)[0] || null;
    const sent = asArray(a.sent).map(textOf)[0] || null;
    const status = asArray(a.status).map(textOf)[0] || null;
    const msgType = asArray(a.msgType).map(textOf)[0] || null;
    const scope = asArray(a.scope).map(textOf)[0] || null;

    const info = asArray(a.info).map((i) => {
      const lang = asArray(i.language).map(textOf)[0] || null;
      const category = asArray(i.category).map(textOf)[0] || null;
      const event = asArray(i.event).map(textOf)[0] || null;
      const urgency = asArray(i.urgency).map(textOf)[0] || null;
      const severity = asArray(i.severity).map(textOf)[0] || null;
      const certainty = asArray(i.certainty).map(textOf)[0] || null;
      const headline = asArray(i.headline).map(textOf)[0] || null;
      const description = asArray(i.description).map(textOf)[0] || null;
      const instruction = asArray(i.instruction).map(textOf)[0] || null;
      const onset = asArray(i.onset).map(textOf)[0] || null;
      const expires = asArray(i.expires).map(textOf)[0] || null;
      const senderName = asArray(i.senderName).map(textOf)[0] || null;

      // area + geocode → WARNCELLID + areaDesc
      const warncells = [];
      const areaDescs = [];
      for (const area of asArray(i.area)) {
        const desc = asArray(area.areaDesc).map(textOf)[0];
        if (desc) areaDescs.push(desc);
        for (const g of asArray(area.geocode)) {
          const vn = asArray(g.valueName).map(textOf)[0];
          const vv = asArray(g.value).map(textOf)[0];
          if (vn && vv && vn.toUpperCase() === "WARNCELLID") warncells.push(vv);
        }
      }

      return {
        lang, category, event, urgency, severity, certainty,
        headline, description, instruction, onset, expires, senderName,
        areaDesc: areaDescs.join("; "),
        warncellIds: Array.from(new Set(warncells)),
      };
    });

    const references = asArray(a.references).map(textOf)[0] || null;

    return { id, sender, sent, status, msgType, scope, info, references, source: srcName || null };
  }

  async function extractAlertsFromZipBuffer(buffer, logFn) {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    const xmlEntries = entries.filter((e) => e.entryName.toLowerCase().match(/\.(xml|cap)$/));
    if (logFn) logFn(`[DWD-Warnings] ZIP enthält ${xmlEntries.length} CAP/XML-Datei(en)`);

    const out = [];
    for (const ent of xmlEntries) {
      try {
        const xml = ent.getData().toString("utf8");
        const obj = await parseStringPromise(xml, {
          explicitArray: true,
          mergeAttrs: true,
          preserveChildrenOrder: false,
        });

        // <alert>…</alert> ODER Atom-Feed mit <entry><content><alert>
        let capAlerts = [];
        if (obj.alert || obj["cap:alert"]) {
          capAlerts = [obj];
        } else if (obj.feed || obj["atom:feed"]) {
          const feed = obj.feed || obj["atom:feed"];
          const entries = asArray(feed.entry || feed["atom:entry"]);
          for (const entry of entries) {
            const content = asArray(entry.content || entry["atom:content"])[0] || {};
            const alert = content.alert || content["cap:alert"];
            if (alert) capAlerts.push({ alert });
          }
        }

        for (const cap of capAlerts) {
          const norm = normalizeAlert(cap, ent.entryName);
          if (norm) out.push(norm);
        }
      } catch (e) {
        if (logFn) logFn(`[DWD-Warnings] Parse-Fehler in ${ent.entryName}: ${e.message}`);
      }
    }
    return out;
  }

  // ---- Filter: Warncells & Area-Names (Union/ODER) ----
  function parseWarncellFilter(input) {
    if (!input) return null;
    const list = String(input)
      .split(/[,\s;]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length ? new Set(list) : null;
  }

  function parseAreaNames(input) {
    if (!input) return null;
    const list = String(input)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    return list.length ? new Set(list) : null;
  }

  function alertMatchesWarncell(alert, warncellSet) {
    if (!warncellSet) return false;
    for (const inf of asArray(alert.info)) {
      for (const id of asArray(inf.warncellIds)) {
        if (warncellSet.has(id)) return true;
      }
    }
    return false;
  }

  function alertMatchesArea(alert, areaNameSet) {
    if (!areaNameSet) return false;
    for (const inf of asArray(alert.info)) {
      const desc = (inf.areaDesc || "").toLowerCase();
      if (!desc) continue;
      for (const name of areaNameSet) {
        if (desc.includes(name)) return true;
      }
    }
    return false;
  }

  function filterUnion(alerts, warncellSet, areaNameSet) {
    if (!warncellSet && !areaNameSet) return alerts; // kein Filter aktiv
    const out = [];
    for (const a of alerts) {
      if (alertMatchesWarncell(a, warncellSet) || alertMatchesArea(a, areaNameSet)) {
        out.push(a);
      }
    }
    return out;
  }

  // Nur aktive & zukünftige Meldungen
  function filterActiveFuture(alerts, nowTs) {
    const out = [];
    for (const a of alerts) {
      if (a.msgType && String(a.msgType).toLowerCase() === "cancel") continue;
      let alive = false;
      for (const inf of asArray(a.info)) {
        const exp = inf.expires ? Date.parse(inf.expires) : NaN;
        if (!Number.isFinite(exp) || exp >= nowTs) { alive = true; break; }
      }
      if (alive) out.push(a);
    }
    return out;
  }

  // Optional: Name-Fallback
  function applyNameFallback(alerts) {
    for (const a of alerts) {
      for (const inf of asArray(a.info)) {
        if (!("name" in inf) || !inf.name) {
          inf.name = inf.headline || inf.event || inf.category || inf.senderName || "Warnung";
        }
      }
    }
    return alerts;
  }

  function WarningsNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Defaults aus HTML
    node.dataset       = config.dataset || "COMMUNEUNION_CELLS_STAT";
    node.warncells     = config.warncells || ""; // CSV/Whitespace

    node.areaNameMatch   = !!config.areaNameMatch;            // Checkbox
    node.extraAreaNames  = config.extraAreaNames || "";       // CSV
    node.activeOnly      = !!config.activeOnly;               // Checkbox
    node.staleAllow      = !!config.staleAllow;               // Checkbox
    node.nameFallback    = !!config.nameFallback;             // (Kompatibilität)

    node.fetchOnDeploy = !!config.fetchOnDeploy;
    node.autoRefresh   = Number(config.autoRefresh || 0);
    node.diag          = !!config.diag;

    let refreshTimer = null;
    const setStatus = (text, shape = "dot", color = "blue") =>
      node.status({ fill: color, shape, text });

    async function runFetch(msg) {
      // ---- Effektive (benutzte) Werte bestimmen (msg > node > Default) ----
      const usedDataset = String(msg?.dataset ?? node.dataset ?? "COMMUNEUNION_CELLS_STAT").trim();

      const usedWarncellsStr = String(
        msg?.warncells ?? msg?.warncellIds ?? node.warncells ?? ""
      );
      const usedWarncellSet = parseWarncellFilter(usedWarncellsStr);

      const usedAreaNameMatch = Boolean(msg?.areaNameMatch ?? node.areaNameMatch);
      const usedExtraAreaNamesStr = String(msg?.extraAreaNames ?? node.extraAreaNames ?? "");
      const areaNameSet = usedAreaNameMatch ? parseAreaNames(usedExtraAreaNamesStr) : null;

      const usedActiveOnly = Boolean(msg?.activeOnly ?? node.activeOnly);
      const usedStaleAllow = Boolean(msg?.staleAllow ?? node.staleAllow);

      if (node.diag) {
        node.log(
          `[DWD-Warnings] eff: dataset=${usedDataset}` +
          ` | warncells=${Array.from(usedWarncellSet ?? []).join(",") || "-"}` +
          ` | areaNameMatch=${usedAreaNameMatch}` +
          ` | extraAreaNames=${Array.from(areaNameSet ?? []).join("|") || "-"}` +
          ` | activeOnly=${usedActiveOnly}` +
          ` | staleAllow=${usedStaleAllow}`
        );
      }

      setStatus("lade…", "dot", "blue");

      try {
        // ---- Laden (mit Fallback) ----
        const { buffer, sourceUrl, stale } = await fetchZipWithFallback(
          usedDataset,
          node.diag ? node.log.bind(node) : null
        );

        if (stale && !usedStaleAllow) {
          throw new Error("Stale-Daten sind nicht erlaubt (LATEST 404 → Verzeichnis-Fallback)");
        }

        // ---- Parsen ----
        let alerts = await extractAlertsFromZipBuffer(
          buffer,
          node.diag ? node.log.bind(node) : null
        );

        // ---- Filtern (Union + ActiveOnly + Name-Fallback) ----
        const nowTs = Date.now();

        // 1) Union: Warncell ODER (areaDesc-Match, wenn aktiviert & Namen vorhanden)
        alerts = filterUnion(alerts, usedWarncellSet, areaNameSet);

        // 2) Nur aktive/ zukünftige
        if (usedActiveOnly) alerts = filterActiveFuture(alerts, nowTs);

        // 3) Optional: Namens-Fallback (kosmetisch)
        if (node.nameFallback) applyNameFallback(alerts);

        if (node.diag) node.log(`[DWD-Warnings] Alerts nach Filtern: ${alerts.length}`);

        // ---- Sortierung (neueste zuerst) ----
        alerts.sort((a, b) => {
          const ta = a.sent ? Date.parse(a.sent) || 0 : 0;
          const tb = b.sent ? Date.parse(b.sent) || 0 : 0;
          return tb - ta;
        });

        // ---- Ausgabe inkl. sauberem Meta-Block ----
        const out = {
          payload: alerts,
          _meta: {
            // Quelle
            dataset: usedDataset,
            sourceUrl,

            // Laufzeitstatus
            stale: !!stale,            // true = Directory-Fallback
            total: alerts.length,

            // Effektiv genutzte Filter/Flags
            used: {
              warncells: Array.from(usedWarncellSet ?? []),
              areaNameMatch: usedAreaNameMatch,
              extraAreaNames: Array.from(areaNameSet ?? []),
              onlyActive: usedActiveOnly,
              staleAllow: usedStaleAllow,
            },

            // Konfiguration (Node-UI) – zu Transparenzzwecken
            configured: {
              warncells: (node.warncells || "").split(/[,\s;]+/).map(s => s.trim()).filter(Boolean),
              areaNameMatch: !!node.areaNameMatch,
              extraAreaNames: (node.extraAreaNames || "").split(",").map(s => s.trim()).filter(Boolean),
              onlyActive: !!node.activeOnly,
              staleAllow: !!node.staleAllow,
            },
          },
        };

        setStatus(`${alerts.length} Meldungen`, "dot", stale ? "yellow" : "green");
        node.send(out);
      } catch (err) {
        node.error(`DWD-Warnings Fehler: ${err && err.message ? err.message : String(err)}`, err);
        setStatus("Fehler", "ring", "red");
      }
    }

    function scheduleRefresh() {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      const s = Number(node.autoRefresh || 0);
      if (s > 0) refreshTimer = setInterval(() => runFetch({}), s * 1000);
    }

    node.on("input", runFetch);
    node.on("close", () => {
      if (refreshTimer) clearInterval(refreshTimer);
      setStatus("");
    });

    scheduleRefresh();
    if (node.fetchOnDeploy) runFetch({}).catch(() => {});
    else setStatus("bereit");
  }

  RED.nodes.registerType("dwd-weatherwarnings", WarningsNode);
};