/**
 * src/sync/servers.js
 * Syncs active server counts per site from Jira Assets schema 127 (snipe-it-infrastructure).
 * Uses objectId range chunking with rack location (attrId=2088) for site extraction.
 */

'use strict';

const https = require('https');
const db    = require('../db');

const HOST      = 'api.atlassian.com';
const CLOUD_ID  = process.env.JIRA_CLOUD_ID   || '0b202827-7a05-4ef3-94f5-056caea69699';
const WS        = process.env.ASSETS_WORKSPACE || '546fdb12-9ec4-464d-833f-61a727f3a5fb';
const BASE      = `/ex/jira/${CLOUD_ID}/jsm/assets/workspace/${WS}/v1`;

const CLIENT_ID     = process.env.ASSETS_CLIENT_ID;
const CLIENT_SECRET = process.env.ASSETS_CLIENT_SECRET;

// Schema 127 config
const RANGE_START = 589372;
const RANGE_END   = 1100000;  // extended: 589372 + 323861 objects + buffer
const CHUNK       = 25;       // larger chunks = fewer API calls
const CONCURRENCY = 8;

// Asset attribute IDs (schema 127)
const ATTR_RACK   = '2088';  // rack location e.g. "US-WCI01.COL1.R4B19.RU14C"
const ATTR_ACTIVE = '2092';  // "true" / "false"
const ATTR_TYPE   = '2101';  // "server" / "network-device" / etc.

// Region code → site code overrides for legacy region labels
const RACK_OVERRIDES = {
  LAS1: 'US-LAS', RNO1: 'US-SPK', RNO2: 'US-SPK',
  PDX1: 'US-HIO', PDX2: 'US-HIO', PDX3: 'US-HIO', PDX5: 'US-HIO',
  ORD1: 'US-VO2', ORD3: 'US-WCI', ATL1: 'US-SVG',
  ATL2: 'US-DGV', ATL4: 'US-AAI', AUS1: 'US-AUS',
  DFW1: 'US-PLZ', SBN1: 'US-HMN', LGA1: 'US-WJQ', CMH1: 'US-CMH',
  'US-EW':  'US-EWS',   // truncated typo in source data
  'UA-ARQ': 'US-ARQ',   // country-code typo in source data
};

// Non-DC locations to skip
const SKIP_PREFIXES = new Set(['3PL', 'DHD', 'DHF', 'SCH', 'NAP12']);

function siteFromRack(rack) {
  if (!rack) return null;
  if (/^\d+\.\d+/.test(rack)) return null;               // IP address
  if (/pallet|broken/i.test(rack)) return null;           // staging
  const prefix = rack.split('.')[0];
  if (RACK_OVERRIDES[prefix]) return RACK_OVERRIDES[prefix];
  if (SKIP_PREFIXES.has(prefix)) return null;
  const m = prefix.match(/^([A-Z]{2}-[A-Z0-9]{2,5})\d{2}(-.*)?$/);
  return m ? m[1] : null;
}

// ── OAuth token exchange ──────────────────────────────────────────────────────
function getAccessToken() {
  return new Promise((resolve, reject) => {
    const body  = 'grant_type=client_credentials';
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const req   = https.request({
      hostname: 'auth.atlassian.com', port: 443,
      path: '/oauth/token', method: 'POST',
      headers: {
        'Authorization':  `Basic ${basic}`,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Accept':         'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.access_token) resolve(j.access_token);
          else reject(new Error(`Token exchange: ${j.error_description || d.slice(0, 200)}`));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function aqlPost(auth, payload) {
  const body = JSON.stringify(payload);
  return new Promise(resolve => {
    const req = https.request({
      hostname: HOST, port: 443,
      path: `${BASE}/object/aql`, method: 'POST',
      headers: {
        'Accept': 'application/json', 'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth}`, 'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: { values: [] } }); }
      });
    });
    req.on('error', () => resolve({ status: 0, body: { values: [] } }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: { values: [] } }); });
    req.write(body);
    req.end();
  });
}

const upsertServerCount = db.prepare(`
  INSERT OR REPLACE INTO server_counts (site, count, synced_at)
  VALUES (@site, @count, @synced_at)
`);

const upsertMany = db.transaction(rows => {
  for (const row of rows) upsertServerCount.run(row);
});

// ── Main sync ─────────────────────────────────────────────────────────────────
async function syncServers(onProgress) {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('ASSETS_CLIENT_ID and ASSETS_CLIENT_SECRET are required');

  console.log('[sync:servers] Exchanging credentials...');
  const token   = await getAccessToken();
  const now     = new Date().toISOString();

  const logRow = db.prepare(`
    INSERT INTO sync_log (type, status, started_at) VALUES ('servers', 'running', ?)
  `).run(now);
  const logId = logRow.lastInsertRowid;

  const offsets = [];
  for (let i = RANGE_START; i < RANGE_END; i += CHUNK) offsets.push(i);

  const siteCounts = {};
  let chunksDone   = 0;
  let totalActive  = 0;
  const total      = offsets.length;

  try {
    for (let bi = 0; bi < offsets.length; bi += CONCURRENCY) {
      const batch = offsets.slice(bi, bi + CONCURRENCY);
      await Promise.all(batch.map(async lo => {
        const hi = lo + CHUNK - 1;
        const r  = await aqlPost(token, {
          qlQuery: `objectTypeId IN (344,343,345,346,347,348,349) AND objectId >= ${lo} AND objectId <= ${hi}`,
          maxResults: 25, startAt: 0, includeAttributes: true, objectSchemaId: '127',
        });
        if (r.status === 200 && r.body?.values) {
          for (const obj of r.body.values) {
            let rack = '', active = false, type = '';
            for (const a of (obj.attributes || [])) {
              const id  = String(a.objectTypeAttributeId);
              const val = (a.objectAttributeValues || [])[0];
              const v   = val ? (val.displayValue || val.value || '') : '';
              if (id === ATTR_RACK)   rack   = String(v);
              if (id === ATTR_ACTIVE) active = String(v).toLowerCase() === 'true';
              if (id === ATTR_TYPE)   type   = String(v).toLowerCase();
            }
            if (type !== 'server' || !active) continue;
            totalActive++;
            const site = siteFromRack(rack);
            if (site) siteCounts[site] = (siteCounts[site] || 0) + 1;
          }
        }
        chunksDone++;
      }));

      if (chunksDone % 50 === 0 || chunksDone === total) {
        onProgress?.({ done: chunksDone, total, servers: totalActive, status: 'Syncing servers...' });
        if (chunksDone % 500 === 0) console.log(`[sync:servers] ${chunksDone}/${total} chunks | ${totalActive.toLocaleString()} active servers found`);
      }
    }

    const rows = Object.entries(siteCounts).map(([site, count]) => ({
      site, count, synced_at: now,
    }));
    upsertMany(rows);

    db.prepare(`
      UPDATE sync_log SET status = 'success', completed_at = ?, records_synced = ?
      WHERE id = ?
    `).run(new Date().toISOString(), totalActive, logId);

    console.log(`[sync:servers] ✓ ${totalActive.toLocaleString()} active servers across ${rows.length} sites`);
    return { totalActive, sitesCount: rows.length };

  } catch (err) {
    db.prepare(`
      UPDATE sync_log SET status = 'error', completed_at = ?, error = ?
      WHERE id = ?
    `).run(new Date().toISOString(), err.message, logId);
    console.error('[sync:servers] ✗ Error:', err.message);
    throw err;
  }
}

module.exports = { syncServers };
