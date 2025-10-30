/**
 * DWD Weather Warnings (CAP) for Node-RED
 * - Uses official DWD CAP Atom: last 90 minutes
 * - Region-Filter: Warncell-ID (exact) + optional Name-Fallback (areaDesc contains…)
 * - UI options:
 *   - allowNameFallback: boolean
 *   - extraAreaNames: string (comma-separated)
 *   - onlyActiveFuture: boolean (drop items with past=true)
 *   - allowStale: boolean (deliver last good result if feed is temporarily malformed)
 *   - immediateFetch: boolean (request once on deploy)
 *   - autoRefreshSec: number (polling interval in seconds; 0/empty = off)
 */

module.exports = function (RED) {
    const axios = require("axios");
    const xml2js = require("xml2js");
    const FEED_URL = "https://www.dwd.de/DWD/warnungen/cap/last90minutes/cap_de.atom";

    function DwdWeatherWarningsNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // UI config
        node.regionId = (config.regionId || "").trim(); // e.g. "805362004"
        node.allowNameFallback = !!config.allowNameFallback;
        node.extraAreaNames = (config.extraAreaNames || "").split(",").map(s => s.trim()).filter(Boolean);
        node.onlyActiveFuture = !!config.onlyActiveFuture;
        node.allowStale = !!config.allowStale;

        node.immediateFetch = !!config.immediateFetch;
        node.autoRefreshSec = Number(config.autoRefreshSec || 0);

        node.timeoutMs = Number(config.timeoutMs || 15000);

        // state for stale mode
        let lastGoodMsg = null;
        let pollTimer = null;

        function setStatusOK(text) {
            node.status({ fill: "green", shape: "dot", text });
        }
        function setStatusWarn(text) {
            node.status({ fill: "yellow", shape: "ring", text });
        }
        function setStatusErr(text) {
            node.status({ fill: "red", shape: "dot", text });
        }

        async function fetchText(url, timeoutMs) {
            const res = await axios.get(url, {
                timeout: timeoutMs || 15000,
                responseType: "text",
                transitional: { forcedJSONParsing: false }
            });
            if (res.status < 200 || res.status >= 300) {
                throw new Error(`HTTP ${res.status} for ${url}`);
            }
            return res.data;
        }

        function normalizeCapItem(entry) {
            // Each entry corresponds to a CAP alert. We expect CAP fields inside.
            // xml2js with explicitArray:false is used below, so properties are objects/strings.
            // Minimal extraction: identifier, area(s), event, headline, onset, expires, past flag, severity, urgency, certainty.

            const cap = entry || {};
            const id = cap.id || cap.identifier || "";
            const updated = cap.updated || cap.published || null;
            // CAP payload is usually in "content" or directly nested. Many feeds embed <cap:alert> etc.
            const content = cap.content || cap["cap:alert"] || cap.alert || cap;
            const info = content.info || content["cap:info"] || content;

            // Event title/headline
            const headline =
                info.headline || info["cap:headline"] || cap.title || "";

            // Event type
            const event =
                info.event || info["cap:event"] || "";

            const severity = info.severity || info["cap:severity"] || "";
            const urgency = info.urgency || info["cap:urgency"] || "";
            const certainty = info.certainty || info["cap:certainty"] || "";

            // Times
            const onset = info.onset || info["cap:onset"] || null;
            const expires = info.expires || info["cap:expires"] || null;

            // Areas (can be array)
            // Different CAP encoders represent area as info.area or info["cap:area"]; each area has areaDesc + geocodes
            let areas = [];
            const rawAreas = info.area || info["cap:area"] || [];
            if (Array.isArray(rawAreas)) {
                areas = rawAreas;
            } else if (rawAreas && typeof rawAreas === "object") {
                areas = [rawAreas];
            }

            const normalizedAreas = areas.map(a => {
                const desc = a.areaDesc || a["cap:areaDesc"] || "";
                // GEOCODES include warncell IDs. Identify something like:
                // a.geocode -> array/object; values as { valueName: 'warncellid', value: '805362004' }
                const geoc = a.geocode || a["cap:geocode"] || [];
                const geos = Array.isArray(geoc) ? geoc : [geoc];
                const geoObj = {};
                geos.forEach(g => {
                    const name = (g.valueName || g["cap:valueName"] || "").toLowerCase();
                    const val = g.value || g["cap:value"] || "";
                    if (name) {
                        if (!geoObj[name]) geoObj[name] = [];
                        geoObj[name].push(val);
                    }
                });
                return {
                    areaDesc: desc,
                    geocode: geoObj
                };
            });

            // Some feeds flag 'past' alerts in info or parameters. If absent, we compute later.
            const past =
                info.past === true ||
                info["cap:past"] === true ||
                false;

            return {
                id,
                updated,
                event,
                headline,
                onset,
                expires,
                severity,
                urgency,
                certainty,
                areas: normalizedAreas,
                past
            };
        }

        function matchesRegion(item) {
            // 1) ID match via warncell id in geocode
            if (node.regionId) {
                const id = String(node.regionId);
                const hitById = (item.areas || []).some(a => {
                    const cells = (a.geocode && (a.geocode.warncellid || a.geocode["warncellid"])) || [];
                    return cells.some(v => String(v) === id);
                });
                if (hitById) return true;
            }

            // 2) Name fallback
            if (node.allowNameFallback) {
                const namesToCheck = [];
                if (node.extraAreaNames && node.extraAreaNames.length > 0) {
                    namesToCheck.push(...node.extraAreaNames);
                }
                // Also try some variants of regionId as text if it looks like "123 Name" - but typically regionId is pure numeric
                // We rely primarily on extraAreaNames plus whatever user types as region-like names.

                const hitByName = (item.areas || []).some(a => {
                    const desc = (a.areaDesc || "").toLowerCase();
                    return namesToCheck.some(n => desc.includes(n.toLowerCase()));
                });
                if (hitByName) return true;
            }

            return false;
        }

        function isActiveOrFuture(item) {
            if (!node.onlyActiveFuture) return true;
            // A "past" item should be excluded, else check expires > now or onset >= now or not marked past
            if (item.past === true) return false;

            const now = Date.now();
            const on = item.onset ? Date.parse(item.onset) : null;
            const ex = item.expires ? Date.parse(item.expires) : null;

            // Conditions: if it hasn't started yet (onset in future) or is ongoing (expires in the future)
            if (on && on > now) return true;
            if (ex && ex > now) return true;

            // If both timestamps missing, keep it (cannot prove it is past)
            if (!on && !ex) return true;

            return false;
        }

        async function handleFetch(msg, fromTimer = false) {
            try {
                node.status({}); // clear
                const xml = await fetchText(FEED_URL, node.timeoutMs);

                const cap = await xml2js.parseStringPromise(xml, {
                    explicitArray: false,
                    mergeAttrs: true,
                    normalizeTags: false,
                    normalize: false,
                    trim: true
                });

                const feed = cap.feed || cap;
                let entries = feed.entry || [];
                if (!Array.isArray(entries)) entries = [entries];

                // Normalize each entry
                const items = entries
                    .filter(Boolean)
                    .map(normalizeCapItem)
                    .filter(matchesRegion)
                    .filter(isActiveOrFuture);

                const count = items.length;
                const events = items.map(i => i.event).filter(Boolean).join(", ");
                const out = {
                    payload: count,
                    count,
                    events,
                    warnings: items,
                    _meta: {
                        url: FEED_URL,
                        regionId: node.regionId || null,
                        allowNameFallback: node.allowNameFallback,
                        extraAreaNames: node.extraAreaNames,
                        onlyActiveFuture: node.onlyActiveFuture,
                        fetchedAt: new Date().toISOString(),
                        fromTimer
                    }
                };

                lastGoodMsg = out;
                node.send(out);
                setStatusOK(`${count} warn.`);

            } catch (err) {
                const msgText = (err && err.message) ? err.message : String(err);
                setStatusWarn(`CAP Fehler: ${msgText}`);

                if (node.allowStale && lastGoodMsg) {
                    const stale = Object.assign({}, lastGoodMsg, {
                        _meta: { ...(lastGoodMsg._meta || {}), stale: true, error: msgText, deliveredAt: new Date().toISOString() }
                    });
                    node.send(stale);
                } else {
                    // also emit empty structure to keep flows predictable
                    node.send({
                        payload: 0,
                        count: 0,
                        events: "",
                        warnings: [],
                        _meta: {
                            url: FEED_URL,
                            error: msgText,
                            stale: false,
                            fetchedAt: new Date().toISOString()
                        }
                    });
                }
            }
        }

        function schedule() {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
            const sec = Number(node.autoRefreshSec || 0);
            if (sec > 0) {
                pollTimer = setInterval(() => handleFetch({}, true), sec * 1000);
            }
        }

        node.on("input", function (msg) {
            handleFetch(msg, false);
        });

        node.on("close", function () {
            if (pollTimer) clearInterval(pollTimer);
        });

        // init
        schedule();
        if (node.immediateFetch) {
            // small delay so status heartbeat appears after deploy
            setTimeout(() => handleFetch({}, false), 200);
        } else {
            setStatusOK("bereit");
        }
    }

    RED.nodes.registerType("dwd-weatherwarnings", DwdWeatherWarningsNode);
};