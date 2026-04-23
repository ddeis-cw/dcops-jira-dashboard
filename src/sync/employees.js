/**
 * src/sync/employees.js
 * Syncs employee → site mappings from Jira Assets (People schema 128).
 * Uses objectId range chunking to bypass the 25-result AQL cap.
 */

'use strict';

const https = require('https');
const db    = require('../db');

const HOST     = 'api.atlassian.com';
const CLOUD_ID = process.env.JIRA_CLOUD_ID   || '0b202827-7a05-4ef3-94f5-056caea69699';
const WS       = process.env.ASSETS_WORKSPACE || '546fdb12-9ec4-464d-833f-61a727f3a5fb';
const BASE     = `/ex/jira/${CLOUD_ID}/jsm/assets/workspace/${WS}/v1`;

const CLIENT_ID     = process.env.ASSETS_CLIENT_ID;
const CLIENT_SECRET = process.env.ASSETS_CLIENT_SECRET;

// DCT list — names that count toward DCT metrics
// Imported from the dashboard's DCT_LIST constant
const DCT_LIST = new Set(require('../dct-list'));

// Asset attribute IDs (People schema 128, Employee type 908)
const ATTR_STATUS = '3297';  // "Active" / "Inactive"

const RANGE_START = 870000;
const RANGE_END   = 882000;
const CHUNK       = 15;
const CONCURRENCY = 8;

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
          else reject(new Error(`Token exchange failed: ${j.error_description || d.slice(0, 200)}`));
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
  return new Promise((resolve) => {
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

// Strip trailing 2-digit suffix: "US-DTN01" → "US-DTN"
function canonSite(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^([A-Z]{2}-[A-Z0-9]{2,5})\d{2}$/);
  if (m) return m[1];
  const m2 = String(raw).match(/^[A-Z]{2}-[A-Z0-9]{2,5}$/);
  return m2 ? raw : null;
}

const upsertEmployee = db.prepare(`
  INSERT OR REPLACE INTO employees (name, site, is_dct, is_active, synced_at)
  VALUES (@name, @site, @is_dct, @is_active, @synced_at)
`);

const upsertMany = db.transaction(rows => {
  for (const row of rows) upsertEmployee.run(row);
});

// ── Main sync ─────────────────────────────────────────────────────────────────
async function syncEmployees(onProgress) {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('ASSETS_CLIENT_ID and ASSETS_CLIENT_SECRET are required');

  console.log('[sync:employees] Exchanging credentials...');
  const token     = await getAccessToken();
  const now       = new Date().toISOString();
  const syncedAt  = now;

  const logRow = db.prepare(`
    INSERT INTO sync_log (type, status, started_at) VALUES ('employees', 'running', ?)
  `).run(now);
  const logId = logRow.lastInsertRowid;

  const offsets = [];
  for (let i = RANGE_START; i < RANGE_END; i += CHUNK) offsets.push(i);

  const results    = new Map();  // name → site
  let chunksDone   = 0;
  const total      = offsets.length;

  try {
    // Process in batches of CONCURRENCY
    for (let bi = 0; bi < offsets.length; bi += CONCURRENCY) {
      const batch = offsets.slice(bi, bi + CONCURRENCY);
      await Promise.all(batch.map(async lo => {
        const hi = lo + CHUNK - 1;
        const r  = await aqlPost(token, {
          qlQuery: `objectTypeId = 908 AND objectId >= ${lo} AND objectId <= ${hi}`,
          maxResults: 25, startAt: 0, includeAttributes: true, objectSchemaId: '128',
        });
        if (r.status === 200 && r.body?.values) {
          for (const emp of r.body.values) {
            const fullName = (emp.label || '').replace(/\s*\(\d+\)\s*$/, '').trim();
            let site     = null;
            let isActive = true;
            for (const a of (emp.attributes || [])) {
              const attrId = String(a.objectTypeAttributeId);
              const val    = (a.objectAttributeValues || [])[0];
              const v      = val ? (val.displayValue || val.value || '') : '';
              if (attrId === '3304') site     = canonSite(v);
              if (attrId === ATTR_STATUS) isActive = String(v).toLowerCase() !== 'inactive';
            }
            if (fullName && isActive && site) results.set(fullName, site);
          }
        }
        chunksDone++;
      }));
      onProgress?.({ done: chunksDone, total, status: 'Syncing employees...' });
    }

    // Upsert all results
    const rows = Array.from(results.entries()).map(([name, site]) => ({
      name, site,
      is_dct:    DCT_LIST.has(name) ? 1 : 0,
      is_active: 1,
      synced_at: syncedAt,
    }));
    upsertMany(rows);

    db.prepare(`
      UPDATE sync_log SET status = 'success', completed_at = ?, records_synced = ?
      WHERE id = ?
    `).run(new Date().toISOString(), rows.length, logId);

    console.log(`[sync:employees] ✓ ${rows.length} employees synced`);
    return { totalSynced: rows.length };

  } catch (err) {
    db.prepare(`
      UPDATE sync_log SET status = 'error', completed_at = ?, error = ?
      WHERE id = ?
    `).run(new Date().toISOString(), err.message, logId);
    console.error('[sync:employees] ✗ Error:', err.message);
    throw err;
  }
}

module.exports = { syncEmployees };
