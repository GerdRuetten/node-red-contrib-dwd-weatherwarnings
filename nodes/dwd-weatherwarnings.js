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
        const res = await axios.get(indexUrl, {
            responseType: "text",
            validateStatus: () => true,
        });
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
        const res = await axios.get(url, {
            responseType: "arraybuffer",
            validateStatus: () => true,
        });
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
            return {
                buffer: await downloadZipBuffer(latestUrl, logFn),
                sourceUrl: latestUrl,
                stale: false,
            };
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

    // --- MULTI DATASET FETCH WRAPPER ---
    // Holt COMMUNEUNION + DISTRICT, parsed beide und merged Alerts.
    async function fetchAllDatasets(logFn, parseCapFilesFn) {
        const DATASET_KEYS = ["COMMUNEUNION_CELLS_STAT", "DISTRICT_CELLS_STAT"];
        let mergedAlerts = [];

        for (const ds of DATASET_KEYS) {
            try {
                if (logFn) logFn(`[DWD-Warnings] Lade Dataset: ${ds}`);

                // ZIP holen (mit Fallback-Mechanismus)
                const { buffer, sourceUrl, stale } = await fetchZipWithFallback(ds, logFn);

                if (logFn) {
                    logFn(`[DWD-Warnings] ZIP geladen aus ${sourceUrl} (stale=${stale})`);
                }

                // ZIP entpacken → xmlFiles
                const xmlFiles = await unzipCapFiles(buffer);
                if (logFn) {
                    logFn(`[DWD-Warnings] ZIP enthält ${xmlFiles.length} CAP/XML-Datei(en)`);
                }

                // Alerts aus XML parsen
                const alerts = await parseCapFilesFn(xmlFiles, ds);
                mergedAlerts.push(...alerts);
            } catch (err) {
                if (logFn) logFn(`[DWD-Warnings] FEHLER im Dataset ${ds}: ${err.message}`);
            }
        }

        // --- Duplikate beseitigen (normal bei DWD!) ---
        const seen = new Set();
        mergedAlerts = mergedAlerts.filter((a) => {
            const id = a.identifier || a.id || JSON.stringify(a).slice(0, 150);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });

        return mergedAlerts;
    }

    // --- Helpers ---
    const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
    const textOf = (node) =>
        typeof node === "string"
            ? node
            : node && typeof node._ === "string"
                ? node._
                : null;

    // CAP → Normalisierte Warnung
    function normalizeAlert(cap, srcName) {
        const a = cap.alert || cap["cap:alert"] || cap;
        if (!a) return null;

        const identifier = asArray(a.identifier).map(textOf)[0] || null;
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

            // --- eventCode (z.B. DWD Typnummern) ---
            const eventCodes = asArray(i.eventCode).map((ec) => ({
                valueName: asArray(ec.valueName).map(textOf)[0] || null,
                value: asArray(ec.value).map(textOf)[0] || null,
            })).filter(x => x.valueName || x.value);

            // --- parameter (für "minimum temperature" etc.) ---
            const parameters = asArray(i.parameter).map((p) => ({
                valueName: asArray(p.valueName).map(textOf)[0] || null,
                value: asArray(p.value).map(textOf)[0] || null,
                unit: asArray(p.unit).map(textOf)[0] || null,
            })).filter(x => x.valueName || x.value);

            // --- areas / warncells sammeln (WICHTIG für Region-Name) ---
            const areas = asArray(i.area).map((ar) => {
                const areaDesc = asArray(ar.areaDesc).map(textOf)[0] || null;

                const warncells = asArray(ar.geocode)
                    .flatMap((gc) =>
                        asArray(gc.valueName).map(textOf).map((n, idx) => ({
                            name: n,
                            value: asArray(gc.value).map(textOf)[idx] || null,
                        }))
                    )
                    .filter((p) => (p.name || "").toUpperCase() === "WARNCELLID")
                    .map((p) => p.value)
                    .filter(Boolean);

                return { areaDesc, warncells };
            });

            const areaDescs = areas.map((x) => x.areaDesc).filter(Boolean);
            const warncells = areas.flatMap((x) => x.warncells || []).filter(Boolean);

            return {
                lang,
                category,
                event,
                urgency,
                severity,
                certainty,
                headline,
                description,
                instruction,
                onset,
                expires,
                senderName,
                areaDesc: areaDescs.join("; "),
                warncellIds: Array.from(new Set(warncells)),
                areas,          // <<< neu
                eventCodes,     // <<< neu
                parameters,     // <<< neu
            };
        });

        const references = asArray(a.references).map(textOf)[0] || null;

        return {
            identifier,
            sender,
            sent,
            status,
            msgType,
            scope,
            info,
            references,
            source: srcName || null,
        };
    }

    // ZIP -> XML strings
    async function unzipCapFiles(buffer) {
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();
        const xmlEntries = entries.filter((e) =>
            e.entryName.toLowerCase().match(/\.(xml|cap)$/)
        );

        const xmlFiles = [];
        for (const ent of xmlEntries) {
            xmlFiles.push({
                name: ent.entryName,
                xml: ent.getData().toString("utf8"),
            });
        }
        return xmlFiles;
    }

    // Parse XML files -> normalized alerts (one per CAP alert)
    async function parseCapFiles(xmlFiles, datasetKey, logFn) {
        const out = [];
        for (const f of xmlFiles) {
            try {
                const obj = await parseStringPromise(f.xml, {
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
                    const norm = normalizeAlert(cap, `${datasetKey}:${f.name}`);
                    if (norm) out.push(norm);
                }
            } catch (e) {
                if (logFn) logFn(`[DWD-Warnings] Parse-Fehler in ${f.name}: ${e.message}`);
            }
        }
        return out;
    }

    // We only support ONE warncell id. If multiple are provided, we take the first.
    function parseSingleWarncell(input) {
        if (!input) return null;
        const first = String(input)
            .split(/[,\s;]+/g)
            .map((s) => s.trim())
            .filter(Boolean)[0];
        return first || null;
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

    function alertMatchesWarncell(alert, warncellId) {
        if (!warncellId) return false;
        for (const inf of asArray(alert.info)) {
            for (const id of asArray(inf.warncellIds)) {
                if (id === warncellId) return true;
            }
        }
        return false;
    }

    function alertMatchesAreaName(alert, areaNameSet) {
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

    function isAlertActive(alert, now) {
        const n = now || Date.now();
        for (const inf of asArray(alert.info)) {
            const expires = inf.expires ? Date.parse(inf.expires) : null;
            if (expires == null) return true;
            if (expires >= n) return true;
        }
        return false;
    }

    function severityToLevel(sev) {
        switch ((sev || "").toLowerCase()) {
            case "minor": return 1;
            case "moderate": return 2;
            case "severe": return 3;
            case "extreme": return 4;
            default: return null;
        }
    }

    function levelToColor(level) {
        switch (level) {
            case 1: return "#ffeb3b"; // gelb
            case 2: return "#ff9800"; // orange
            case 3: return "#f44336"; // rot
            case 4: return "#9c27b0"; // violett
            default: return null;
        }
    }

    function pickInfo(alert, preferLangPrefix = "de") {
        const infos = asArray(alert.info);
        if (!infos.length) return null;
        // bevorzugt de-DE / en-GB ...
        const hit = infos.find(i => (i.lang || "").toLowerCase().startsWith(preferLangPrefix));
        return hit || infos[0];
    }

    function buildPrettyOutput(alerts, warncellId, preferLangPrefix = "de") {
        const list = asArray(alerts);

        // Region-Name aus passender Area ziehen
        let regionName = null;
        for (const a of list) {
            const inf = pickInfo(a, preferLangPrefix);
            if (!inf) continue;
            const area = asArray(inf.areas).find(ar => asArray(ar.warncells).includes(warncellId));
            if (area && area.areaDesc) { regionName = area.areaDesc; break; }
        }

        // letzter Zeitstempel
        const lastSent = list
            .map(a => Date.parse(a.sent))
            .filter(x => !Number.isNaN(x))
            .sort((a,b)=>b-a)[0];
        const lastUpdateIso = lastSent ? new Date(lastSent).toISOString() : null;

        const warnings = list.map((a, idx) => {
            const inf = pickInfo(a, preferLangPrefix) || {};
            const level = severityToLevel(inf.severity);
            const color = levelToColor(level);

            // DWD Typcode heuristisch aus eventCodes holen
            // häufig ist valueName "II" oder "EVENTTYPE"
            const typeCode =
                asArray(inf.eventCodes).find(ec => (ec.valueName || "").toUpperCase() === "II")?.value
                || asArray(inf.eventCodes)[0]?.value
                || null;

            // Parameters hübsch mappen
            const params = {};
            for (const p of asArray(inf.parameters)) {
                if (!p.valueName) continue;
                const key = p.valueName;
                params[key] = p.unit ? `${p.value} [${p.unit}]` : p.value;
            }

            return {
                warningNumber: idx + 1,
                name: inf.event || null,
                type: typeCode,
                level,
                headline: inf.headline || null,
                description: inf.description || null,
                instruction: inf.instruction || null,
                start: inf.onset || null,
                end: inf.expires || null,
                parameters: params,
                color,
                identifier: a.identifier || null,
                dataset: (a.source || "").split(":")[0] || null,
                filterWarncellId: warncellId,
            };
        });

        return {
            region: {
                name: regionName || null,
                id: warncellId || null,
                lastUpdate: lastUpdateIso,
                warningCount: warnings.length,
            },
            warnings,
        };
    }

    // ---- Node-RED Runtime ----
    function WarningsNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.name = config.name;
        node.warncells = config.warncells || "";
        node.areaNameMatch = !!config.areaNameMatch;
        node.extraAreaNames = config.extraAreaNames || "";
        node.activeOnly = config.activeOnly !== false;
        node.staleAllow = config.staleAllow !== false;
        node.autoRefresh = Number(config.autoRefresh || 0);
        node.fetchOnDeploy = config.fetchOnDeploy !== false;
        node.diag = !!config.diag;

        let refreshTimer = null;
        let lastGoodPayload = null;

        const logFn = node.diag ? (m) => node.log(m) : null;

        // i18n helper (runtime namespace) with safe fallback
        const tr = (nsKey, params) => {
            const res = RED._(nsKey, params);
            // If key is missing, Node-RED returns the key itself -> treat as "not found"
            return res === nsKey ? null : res;
        };

        const t = (key, params) =>
            tr(`node-red-contrib-dwd-weatherwarnings/dwd-weatherwarnings:${key}`, params)
            || tr(`dwd-weatherwarnings:${key}`, params)
            || tr(key, params)
            || key;

        function setStatus(text, shape = "dot", color = "green") {
            if (!text) return node.status({});
            node.status({ fill: color, shape, text });
        }

        async function runFetch(msg, send, done) {
            send = send || node.send.bind(node);
            done = done || ((err) => err && node.error(err, msg));

            try {
                setStatus(t("runtime.statusLoading"), "ring", "blue");

                // Filters aus msg überschreiben -> sonst node-config
                const usedWarncellId = parseSingleWarncell(
                    msg.warncell != null
                        ? msg.warncell
                        : (msg.warncells != null ? msg.warncells : node.warncells)
                );
                const usedAreaNameMatch =
                    msg.areaNameMatch != null ? !!msg.areaNameMatch : node.areaNameMatch;
                const areaNameSet = parseAreaNames(
                    msg.extraAreaNames != null ? msg.extraAreaNames : node.extraAreaNames
                );

                const usedActiveOnly =
                    msg.activeOnly != null ? !!msg.activeOnly : node.activeOnly;
                const usedStaleAllow =
                    msg.staleAllow != null ? !!msg.staleAllow : node.staleAllow;

                // --- immer beide Datasets holen ---
                let alerts = await fetchAllDatasets(logFn, (xmlFiles, ds) =>
                    parseCapFiles(xmlFiles, ds, logFn)
                );

                // Filter anwenden (Warncell ODER areaDesc, je nach Flags)
                if (usedWarncellId || (usedAreaNameMatch && areaNameSet)) {
                    alerts = alerts.filter((a) => {
                        const byWarncell = usedWarncellId
                            ? alertMatchesWarncell(a, usedWarncellId)
                            : false;
                        const byAreaName =
                            usedAreaNameMatch && areaNameSet
                                ? alertMatchesAreaName(a, areaNameSet)
                                : false;
                        return byWarncell || byAreaName;
                    });
                }

                // activeOnly
                if (usedActiveOnly) {
                    const now = Date.now();
                    alerts = alerts.filter((a) => isAlertActive(a, now));
                }

                // >>> NEU: Warncell-ID, nach der gefiltert wurde, pro Alert mitsenden
                if (usedWarncellId) {
                    alerts = alerts.map((a) => ({
                        ...a,
                        filterWarncellId: usedWarncellId,
                    }));
                }

                if (logFn) logFn(`[DWD-Warnings] Alerts nach Filtern: ${alerts.length}`);

// Fallback auf last good, falls leer & staleAllow
                let usedStaleFallback = false;
                if (!alerts.length && usedStaleAllow && lastGoodPayload) {
                    if (logFn) logFn(`[DWD-Warnings] Keine Alerts → verwende stale fallback`);
                    alerts = lastGoodPayload.alerts || lastGoodPayload.payload || [];
                    usedStaleFallback = true;
                }

                const editorLang = (RED.settings?.lang || "en-US").toLowerCase();
                const preferLangPrefix =
                    (msg.lang || editorLang).toLowerCase().startsWith("en") ? "en" : "de";

                const pretty = buildPrettyOutput(alerts, usedWarncellId, preferLangPrefix);
// --- Empty state UX ---
                const noWarnings = alerts.length === 0;
                if (noWarnings) {
                    pretty.noWarnings = true;
                    pretty.message = t("runtime.messageNoWarnings");
                }

                const out = {
                    payload: pretty,
                    alerts: alerts,           // <<< neu
                    _meta: {
                        source: "DWD WARN_L CAP ZIP",
                        fetchedAt: new Date().toISOString(),

                        // Laufzeitstatus
                        stale: usedStaleFallback,
                        total: alerts.length,

                        // Effektiv genutzte Filter/Flags
                        used: {
                            warncellId: usedWarncellId,
                            areaNameMatch: usedAreaNameMatch,
                            extraAreaNames: Array.from(areaNameSet ?? []),
                            onlyActive: usedActiveOnly,
                            staleAllow: usedStaleAllow,
                            datasets: ["COMMUNEUNION_CELLS_STAT", "DISTRICT_CELLS_STAT"],
                        },

                        // Konfiguration (Node-UI) – zu Transparenzzwecken
                        configured: {
                            warncellId: parseSingleWarncell(node.warncells),
                            areaNameMatch: !!node.areaNameMatch,
                            extraAreaNames: (node.extraAreaNames || "")
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            onlyActive: !!node.activeOnly,
                            staleAllow: !!node.staleAllow,
                        },
                    },
                };

                lastGoodPayload = JSON.parse(JSON.stringify(out));

                if (alerts.length === 0) {
                    setStatus(t("runtime.statusNone"), "dot", "green");
                } else {
                    setStatus(t("runtime.statusCount", { count: alerts.length }), "dot", "green");
                }

                send(out);
                done();
            } catch (err) {
                node.error(
                    `DWD-Warnings Fehler: ${err && err.message ? err.message : String(err)}`,
                    err
                );
                setStatus(t("runtime.statusError"), "ring", "red");
                done(err);
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
        else setStatus(t("runtime.statusReady"));
    }

    RED.nodes.registerType("dwd-weatherwarnings", WarningsNode);
};