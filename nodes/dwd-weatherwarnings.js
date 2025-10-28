// dwd.js – CAP-Feed mit Link-Follow, Kreis-Fallback, optionalem areaDesc-Fallback
// + runOnDeploy, autoRefreshSeconds
// + robustes Parsing (Sanitizing + Retry) und Stale-Cache (allowStale)
// + onlyActiveFuture: past==true wird je nach UI-Option herausgefiltert
// Abhängigkeiten: request, moment-timezone, moment-range, xml2js

const request = require('request');
const { parseString } = require('xml2js');

const Moment = require('moment-timezone');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);
moment.locale('de');

// Standard-Feed (per msg.capUrl überschreibbar)
const DEFAULT_CAP_URL = 'https://www.dwd.de/DWD/warnungen/cap-feed/de/atom.xml';

// ---------- Mapping ----------
const dwd = {
    levelFromSeverity(sev) {
        if (!sev) return 0;
        const s = String(sev).toLowerCase();
        if (s.includes('extreme')) return 5;
        if (s.includes('severe'))  return 4;
        if (s.includes('moderate'))return 3;
        if (s.includes('minor'))   return 2;
        if (s.includes('unknown')) return 1;
        return 0;
    }
};

// ---------- Robust-Parsing Helpers ----------
function sanitizeXml(atomStr) {
    if (!atomStr) return atomStr;
    let s = atomStr;

    // 1) Nichtdruckbare Steuerzeichen entfernen (außer \n\r\t)
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 2) Am Ende evtl. unvollständigen Tag kappen (z.B. "<entry ...")
    s = s.replace(/<[^>]*$/, '');

    // 3) Falls </feed> fehlt, aber <feed ...> existiert: an letztes </entry> schneiden und </feed> ergänzen
    const hasFeedOpen  = /<feed[\s>]/.test(s);
    const hasFeedClose = /<\/feed>/.test(s);
    if (hasFeedOpen && !hasFeedClose) {
        const lastEntryClose = s.lastIndexOf('</entry>');
        if (lastEntryClose > -1) {
            s = s.slice(0, lastEntryClose + '</entry>'.length) + '</feed>';
        } else {
            s = s + '</feed>';
        }
    }

    return s;
}

function parseAtomWithRecovery(xmlStr, cb) {
    parseString(xmlStr, { explicitArray: true, trim: true }, (err, res) => {
        if (!err && res) return cb(null, res);

        const sanitized = sanitizeXml(xmlStr || '');
        if (sanitized && sanitized !== xmlStr) {
            parseString(sanitized, { explicitArray: true, trim: true }, (err2, res2) => {
                if (!err2 && res2) return cb(null, res2);
                return cb(err2 || err, null);
            });
        } else {
            return cb(err, null);
        }
    });
}

// ---------- Utils ----------
function asText(x) {
    if (Array.isArray(x)) return x[0] ?? '';
    if (x == null) return '';
    return String(x);
}
function getWarnCellIdsFromInfo(info) {
    const geocodes = []
        .concat(info?.geocode || [])
        .concat(info?.['cap:geocode'] || []);
    const ids = [];
    geocodes.forEach(gc => {
        const names  = [].concat(gc?.valueName || gc?.['cap:valueName'] || []);
        const values = [].concat(gc?.value     || gc?.['cap:value']     || []);
        for (let i = 0; i < Math.max(names.length, values.length); i++) {
            const n = (names[i]  || '').toString().toUpperCase();
            const v = (values[i] || '').toString().trim();
            if (n === 'WARNCELLID' && v) {
                v.split(/[,\s]+/).filter(Boolean).forEach(one => ids.push(one.trim()));
            }
        }
    });
    return Array.from(new Set(ids));
}
function getAreaDescsFromInfo(info) {
    const areas = []
        .concat(info?.area || [])
        .concat(info?.['cap:area'] || []);
    const names = [];
    areas.forEach(a => {
        const ad = [].concat(a?.areaDesc || a?.['cap:areaDesc'] || []);
        ad.forEach(v => { const t = asText(v).trim(); if (t) names.push(t); });
    });
    return Array.from(new Set(names));
}
function kreisFromGemeinde(gemeindeId) {
    if (!/^\d{9}$/.test(gemeindeId)) return null;
    return '1' + gemeindeId.slice(1, 6) + '000'; // 8 xxxxx xx x -> 1 xxxxx 000
}
function tokenizeName(s) {
    return String(s || '')
        .replace(/\b(stadt|gemeinde|kreis|landkreis|stadtgebiet|region)\b/gi, ' ')
        .replace(/[^\p{L}\p{N}\s\-]/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3)
        .map(w => w.toLowerCase());
}
function areaDescMatches(areaDescs, wantedTokens) {
    if (!areaDescs.length || !wantedTokens.length) return false;
    const hay = areaDescs.join(' | ').toLowerCase();
    return wantedTokens.some(tok => hay.includes(tok));
}

// ---------- Node ----------
module.exports = function (RED) {
    class DwdNode {
        constructor(config) {
            RED.nodes.createNode(this, config);

            const regionStr = (config.region || '').toString().trim();
            this.regionCode  = regionStr.split(' ')[0] || '';
            this.regionLabel = regionStr.slice(this.regionCode.length).trim();

            this.allowNameFallback   = !!config.allowNameFallback;
            this.extraAreas = (config.extraAreas || "")
                .split(/[;,]/).map(s => s.trim()).filter(Boolean);

            this.runOnDeploy        = !!config.runOnDeploy;
            this.autoRefreshSeconds = Math.max(0, Number(config.autoRefreshSeconds) || 0);
            this.allowStale         = !!config.allowStale;
            this.onlyActiveFuture   = !!config.onlyActiveFuture;

            this._interval = null;
            this._startupTimeout = null;
            this._busy = false; // Guard

            // Context-Cache für Stale
            this._ctx = this.context();
            this._lastGood = this._ctx.get('lastGood') || null;

            this.on('input', (msg, send, done) => this.fetchOnce(msg, send, done));

            // Auto-Start nach Deploy?
            if (this.runOnDeploy) {
                this._startupTimeout = setTimeout(() => {
                    this.fetchOnce({}, null, () => {});
                }, 500);
            }

            // Auto-Refresh?
            if (this.autoRefreshSeconds > 0) {
                this._interval = setInterval(() => {
                    if (!this._busy) this.fetchOnce({}, null, () => {});
                }, this.autoRefreshSeconds * 1000);
            }

            // Cleanup
            this.on('close', (removed, done) => {
                if (this._startupTimeout) { clearTimeout(this._startupTimeout); this._startupTimeout = null; }
                if (this._interval) { clearInterval(this._interval); this._interval = null; }
                done();
            });
        }

        fetchOnce(msg, send, done) {
            send = send || this.send.bind(this);
            done = done || ((err)=>{ if (err) this.error(err); });

            const capUrl = (msg && msg.capUrl) || DEFAULT_CAP_URL;

            if (!/^\d{9}$/.test(this.regionCode)) {
                this.warn(`Ungültige oder fehlende Region/WARNCELLID: "${this.regionCode}". Erwartet 9-stellige ID.`);
                send({ payload: 0, count: 0, events: '', warnings: [], html: '', _meta: { capUrl, regionCode: this.regionCode, onlyActiveFuture: this.onlyActiveFuture } });
                return done();
            }

            const gemeindeId = this.regionCode;
            const kreisId = /^8\d{8}$/.test(gemeindeId) ? kreisFromGemeinde(gemeindeId) : null;

            // Namen aus UI + optional msg.areaMatch
            const msgAreas = Array.isArray(msg?.areaMatch) ? msg.areaMatch.filter(Boolean) : [];
            const extraAreaNames = [...this.extraAreas, ...msgAreas];

            const wantedTokensPrimary = tokenizeName(this.regionLabel);
            const wantedTokensExtra   = tokenizeName(extraAreaNames.join(' '));

            // Busy-Guard
            if (this._busy) return done();
            this._busy = true;
            this.status({ fill:'blue', shape:'dot', text:'Abruf…' });

            request({ url: capUrl, timeout: 15000 }, (err, res, body) => {
                if (err) {
                    this._busy = false;
                    this.status({ fill:'red', shape:'ring', text:'CAP-Feed Fehler' });
                    this.error(`Fehler beim Laden des CAP-Feeds: ${err.message}`);
                    // Stale-Fallback?
                    if (this.allowStale && this._lastGood) {
                        const stale = JSON.parse(JSON.stringify(this._lastGood));
                        stale._meta = Object.assign({}, stale._meta, { capUrl, regionCode: gemeindeId, stale: true, error: 'fetch_error', onlyActiveFuture: this.onlyActiveFuture });
                        send(stale);
                        return done();
                    }
                    send({ payload: 0, count: 0, events: '', warnings: [], html: '', _meta: { capUrl, regionCode: gemeindeId, stale: false, error: 'fetch_error', onlyActiveFuture: this.onlyActiveFuture } });
                    return done(err);
                }
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    this._busy = false;
                    this.status({ fill:'red', shape:'ring', text:`HTTP ${res.statusCode}` });
                    this.error(`CAP-Feed HTTP ${res.statusCode}: ${capUrl}`);
                    if (this.allowStale && this._lastGood) {
                        const stale = JSON.parse(JSON.stringify(this._lastGood));
                        stale._meta = Object.assign({}, stale._meta, { capUrl, regionCode: gemeindeId, stale: true, error: `http_${res.statusCode}`, onlyActiveFuture: this.onlyActiveFuture });
                        send(stale);
                        return done();
                    }
                    send({ payload: 0, count: 0, events: '', warnings: [], html: '', _meta: { capUrl, regionCode: gemeindeId, stale: false, error: `http_${res.statusCode}`, onlyActiveFuture: this.onlyActiveFuture } });
                    return done();
                }

                const attemptParse = (rawXml, tryNo = 1) => {
                    parseAtomWithRecovery(rawXml, (perr, xml) => {
                        if (perr) {
                            if (tryNo === 1) {
                                // einmaliger Retry nach kurzem Delay
                                return setTimeout(() => attemptParse(rawXml, 2), 1200);
                            }

                            // Endgültiger Fehlschlag → Stale?
                            this._busy = false;
                            this.status({ fill: this.allowStale && this._lastGood ? 'yellow' : 'red', shape:'ring',
                                text: this.allowStale && this._lastGood ? 'stale: letzter Stand' : 'XML-Fehler' });
                            this.error(`XML-Parsing-Fehler (Atom): ${perr && perr.message ? perr.message : perr}`);

                            if (this.allowStale && this._lastGood) {
                                const stale = JSON.parse(JSON.stringify(this._lastGood));
                                stale._meta = Object.assign({}, stale._meta, {
                                    capUrl, regionCode: gemeindeId, stale: true,
                                    error: `parse_error`,
                                    onlyActiveFuture: this.onlyActiveFuture
                                });
                                send(stale);
                                return done();
                            }

                            send({ payload: 0, count: 0, events: '', warnings: [], html: '',
                                _meta: { capUrl, regionCode: gemeindeId, stale: false, error: 'parse_error', onlyActiveFuture: this.onlyActiveFuture } });
                            return done(perr);
                        }

                        // ===== ab hier: normale Verarbeitung =====
                        const feed = xml?.feed || {};
                        let entries = feed?.entry || [];
                        if (!Array.isArray(entries)) entries = [entries].filter(Boolean);

                        // Debug-Zähler
                        let atomEntryCount = 0;
                        let inlineCapCount = 0;
                        let linkFollowCount = 0;
                        let primaryHits = 0;  // Gemeinde
                        let kreisHits   = 0;  // Kreis
                        let nameHits    = 0;  // Name

                        const outPrimary = [];
                        const outKreis   = [];
                        const outName    = [];
                        let maxPrimaryLevel = 0;
                        let maxKreisLevel   = 0;
                        let maxNameLevel    = 0;
                        const now = Date.now();

                        const normalizeInfo = (info) => {
                            const event       = asText(info?.event || info?.['cap:event']);
                            const headline    = asText(info?.headline || info?.['cap:headline']) || event;
                            const description = asText(info?.description || info?.['cap:description']);
                            const instruction = asText(info?.instruction || info?.['cap:instruction']);
                            const severity    = asText(info?.severity || info?.['cap:severity']);
                            const onsetTxt    = asText(info?.onset || info?.['cap:onset']);
                            const expiresTxt  = asText(info?.expires || info?.['cap:expires']);

                            const startMs = onsetTxt   ? new Date(onsetTxt).getTime()   : undefined;
                            const endMs   = expiresTxt ? new Date(expiresTxt).getTime() : undefined;

                            const pre   = (startMs && now < startMs);
                            const past  = (endMs   && now > endMs);
                            const active = !(pre || past);

                            const level = dwd.levelFromSeverity(severity);

                            let timeText = '';
                            if (startMs) {
                                let t = moment.utc(startMs).tz('Europe/Berlin').format('ddd D. MMM H:mm');
                                if (endMs) {
                                    if (moment.utc(startMs).tz('Europe/Berlin').day() === moment.utc(endMs).tz('Europe/Berlin').day()) {
                                        t += ' - ' + moment.utc(endMs).tz('Europe/Berlin').format('H:mm');
                                    } else {
                                        t += ' - ' + moment.utc(endMs).tz('Europe/Berlin').format('ddd D. MMM H:mm');
                                    }
                                }
                                timeText = t;
                            }

                            return {
                                item: { event: headline || event, description, instruction, severity, level, start: startMs, end: endMs, pre, past, active, time: timeText },
                                level
                            };
                        };

                        const processCapAlertObject = (entry, capObj) => {
                            let infos = []
                                .concat(capObj?.alert?.info || [])
                                .concat(capObj?.['cap:alert']?.['cap:info'] || [])
                                .concat(entry?.info || [])
                                .concat(entry?.['cap:info'] || []);
                            if (!infos.length) return;

                            const pickInfo = () => {
                                const de = infos.find(i => (asText(i?.language || i?.['cap:language']) || '').toLowerCase().startsWith('de'));
                                return de || infos[0];
                            };
                            const info = pickInfo();

                            const ids   = getWarnCellIdsFromInfo(info);
                            const areas = getAreaDescsFromInfo(info);

                            const hitPrimary = ids.includes(gemeindeId);
                            const hitKreis   = kreisId ? ids.includes(kreisId) : false;

                            // Name-Fallback (nur wenn in UI aktiviert)
                            const allowName = this.allowNameFallback;
                            const nameHitPrimary = allowName && areas.length && wantedTokensPrimary.length && areaDescMatches(areas, wantedTokensPrimary);
                            const nameHitExtra   = allowName && areas.length && wantedTokensExtra.length   && areaDescMatches(areas, wantedTokensExtra);
                            const hitByName = (!hitPrimary && !hitKreis) && (nameHitPrimary || nameHitExtra);

                            if (!hitPrimary && !hitKreis && !hitByName) return;

                            const norm = normalizeInfo(info);

                            if (hitPrimary) {
                                primaryHits++;
                                outPrimary.push(norm.item);
                                if (norm.level > maxPrimaryLevel) maxPrimaryLevel = norm.level;
                                return;
                            }
                            if (hitKreis) {
                                kreisHits++;
                                outKreis.push(norm.item);
                                if (norm.level > maxKreisLevel) maxKreisLevel = norm.level;
                                return;
                            }
                            nameHits++;
                            outName.push(norm.item);
                            if (norm.level > maxNameLevel) maxNameLevel = norm.level;
                        };

                        const handleEntry = (entry, doneOne) => {
                            atomEntryCount++;

                            // 1) Inline-CAP vorhanden?
                            const capAlert = entry?.alert || entry?.['cap:alert'];
                            const capInfo  = entry?.info  || entry?.['cap:info'];
                            if (capAlert || capInfo) {
                                inlineCapCount++;
                                try { processCapAlertObject(entry, { alert: entry }); } catch(e){}
                                return doneOne();
                            }

                            // 2) Link auf Einzel-CAP nachladen
                            const links = [].concat(entry?.link || []);
                            const href = links.map(l => (l.$?.href || l.href || '')).find(Boolean);
                            if (!href) return doneOne();

                            linkFollowCount++;
                            request({ url: href, timeout: 15000 }, (e2, r2, body2) => {
                                if (e2 || r2.statusCode < 200 || r2.statusCode >= 300) return doneOne();
                                parseString(body2, { explicitArray: true, trim: true }, (e3, capObj) => {
                                    if (e3) return doneOne();
                                    try { processCapAlertObject(entry, capObj); } catch(e){}
                                    return doneOne();
                                });
                            });
                        };

                        const finish = () => {
                            // Priorität: Gemeinde > Kreis > Name
                            let chosen = outPrimary.length ? outPrimary : (outKreis.length ? outKreis : outName);
                            let maxLevel = outPrimary.length ? maxPrimaryLevel : (outKreis.length ? maxKreisLevel : maxNameLevel);
                            let matched =
                                outPrimary.length ? 'gemeinde' :
                                    (outKreis.length ? 'kreis' :
                                        (outName.length ? 'name' : 'none'));

                            // --- NEU: Filter „Nur aktive und zukünftige Meldungen“ ---
                            if (this.onlyActiveFuture) {
                                const beforeLen = chosen.length;
                                chosen = chosen.filter(w => !w.past);
                                if (chosen.length === 0) {
                                    // wenn alles rausgefiltert wurde, matched-Flag bleibt informativ,
                                    // maxLevel wird dadurch 0 (s.u.)
                                } else {
                                    // maxLevel ggf. neu bestimmen (nach Filter)
                                    maxLevel = chosen.reduce((m, w) => Math.max(m, Number.isFinite(w.level) ? w.level : 0), 0);
                                }
                            }

                            const html = chosen.map(w => `
<div class="dwd-warning-container">
  <div class="dwd-event">${w.event}</div>
  <div class="dwd-time">${w.time || ''}</div>
  <div class="dwd-severity">Stufe: ${w.severity || 'unbekannt'}</div>
  ${w.description ? `<div class="dwd-description">${w.description}</div>` : ''}
  ${w.instruction ? `<div class="dwd-instruction">${w.instruction}</div>` : ''}
</div>`.trim());

                            const events = chosen.filter(w => w.event).map(w => w.event);

                            const msgOut = {
                                payload: chosen.length ? (maxLevel || 0) : 0,
                                count: chosen.length,
                                events: events.join(', '),
                                warnings: chosen,
                                html: html.join('\n'),
                                _meta: {
                                    capUrl,
                                    regionCode: gemeindeId,
                                    matched,
                                    kreisId,
                                    regionLabel: this.regionLabel,
                                    allowNameFallback: this.allowNameFallback,
                                    extraAreas: extraAreaNames,
                                    runOnDeploy: this.runOnDeploy,
                                    autoRefreshSeconds: this.autoRefreshSeconds,
                                    allowStale: this.allowStale,
                                    onlyActiveFuture: this.onlyActiveFuture,
                                    stale: false
                                },
                                _debug: {
                                    atomEntryCount,
                                    inlineCapCount,
                                    linkFollowCount,
                                    primaryHits,
                                    kreisHits,
                                    nameHits
                                }
                            };

                            // Ergebnis senden
                            send(msgOut);

                            // Cache aktualisieren (für Stale-Fallback)
                            this._lastGood = msgOut;
                            this._ctx.set('lastGood', msgOut);

                            this._busy = false;
                            this.status({ fill: chosen.length ? 'green' : 'grey', shape:'dot',
                                text: chosen.length ? `Warnungen: ${chosen.length}` : 'keine Warnung' });
                            return done();
                        };

                        if (!entries.length) {
                            // kein Eintrag = legitimer „leer“-Zustand → Cache aktualisieren
                            const msgOut = {
                                payload: 0, count: 0, events: '', warnings: [], html: '',
                                _meta: {
                                    capUrl, regionCode: gemeindeId, matched: 'none',
                                    kreisId, regionLabel: this.regionLabel,
                                    allowNameFallback: this.allowNameFallback,
                                    extraAreas: extraAreaNames,
                                    runOnDeploy: this.runOnDeploy,
                                    autoRefreshSeconds: this.autoRefreshSeconds,
                                    allowStale: this.allowStale,
                                    onlyActiveFuture: this.onlyActiveFuture,
                                    stale: false
                                },
                                _debug: { atomEntryCount: 0, inlineCapCount: 0, linkFollowCount: 0, primaryHits: 0, kreisHits: 0, nameHits: 0 }
                            };
                            send(msgOut);
                            this._lastGood = msgOut;
                            this._ctx.set('lastGood', msgOut);
                            this._busy = false;
                            this.status({ fill:'grey', shape:'dot', text:'keine Einträge' });
                            return done();
                        }

                        let finished = 0;
                        entries.forEach(entry => handleEntry(entry, () => {
                            if (++finished === entries.length) finish();
                        }));
                    });
                };

                attemptParse(body, 1);
            });
        }
    }

    RED.nodes.registerType('dwd-weatherwarnings', DwdNode);
};