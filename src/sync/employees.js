/**
 * src/sync/employees.js
 *
 * Syncs employee → site mappings from Jira Assets (People schema 128, type 908).
 *
 * DCT identification: determined dynamically from job title (attr=3294).
 * No hardcoded names — zero PII in the codebase.
 *
 * DCT title keywords (case-insensitive):
 *   "Data Center Technician", "Data Center Engineer", "Data Center Lead",
 *   "Data Center Manager", "Data Center Specialist", "Data Center Operations",
 *   "DC Operations", "DCT", "Field Operations Technician",
 *   "Infrastructure Technician", "Data Center Field"
 *
 * Site extraction: attr=3304 (DC Location linked object, label = "US-DTN01")
 *   → strip trailing 2-digit suffix → "US-DTN"
 *
 * Uses objectId range chunking — AQL pagination is broken (always returns
 * same 25 objects regardless of page/startAt params).
 */

'use strict';

const https = require('https');
const db    = require('../db');

const CLOUD_ID  = process.env.JIRA_CLOUD_ID   || '0b202827-7a05-4ef3-94f5-056ceba69699';
const WS        = process.env.ASSETS_WORKSPACE || '546fdb12-9ec4-464d-833f-61a727f3a5fb';
const HOST      = 'api.atlassian.com';
const BASE      = `/ex/jira/${CLOUD_ID}/jsm/assets/workspace/${WS}/v1`;

const CLIENT_ID     = process.env.ASSETS_CLIENT_ID;
const CLIENT_SECRET = process.env.ASSETS_CLIENT_SECRET;

// ── People schema attribute IDs (schema 128, type 908) ────────────────────────
const ATTR_FIRST   = '3290';  // First name
const ATTR_LAST    = '3291';  // Last name
const ATTR_EMAIL   = '3292';  // Email
const ATTR_TITLE   = '3294';  // Job title → used for DCT detection
const ATTR_STATUS  = '3297';  // "Active" / "Inactive"
const ATTR_DC_LOC  = '3304';  // DC Location (linked object, label = "US-DTN01")

// objectId range — wider scan to catch all 3,887 people objects
const RANGE_START = 860000;
const RANGE_END   = 910000;
const CHUNK       = 15;
const CONCURRENCY = 4;

// ── DCT title detection ───────────────────────────────────────────────────────
const DCT_TITLE_KEYWORDS = [
  // American spelling
  'data center technician',
  'data center engineer',
  'data center lead',
  'data center manager',
  'data center specialist',
  'data center operations',
  'data center field',
  'data center site',
  // British/European spelling
  'data centre technician',
  'data centre engineer',
  'data centre lead',
  'data centre manager',
  'data centre specialist',
  'data centre operations',
  'data centre field',
  'data centre site',
  // Other DC ops titles
  'dc operations',
  'dct',
  'field operations technician',
  'infrastructure technician',
  'onsite build lead',
  'area data cent',  // catches both "area data center" and "area data centre"
];

function isDCTTitle(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  return DCT_TITLE_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function getAccessToken() {
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraToken = process.env.JIRA_TOKEN;
  if (jiraEmail && jiraToken) {
    return Promise.resolve('Basic ' + Buffer.from(jiraEmail + ':' + jiraToken).toString('base64'));
  }
  return new Promise((resolve, reject) => {
    const body  = 'grant_type=client_credentials';
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const req   = https.request({
      hostname: 'auth.atlassian.com', port: 443,
      path: '/oauth/token', method: 'POST',
      headers: {
        'Authorization':  `Basic ${basic}`,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.access_token) resolve('Bearer ' + j.access_token);
          else reject(new Error(`Token exchange failed: ${j.error_description || d.slice(0, 200)}`));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── AQL range query ───────────────────────────────────────────────────────────
function aqlQuery(auth, lo, hi) {
  const body = JSON.stringify({
    qlQuery:           `objectTypeId = 908 AND objectId >= ${lo} AND objectId <= ${hi}`,
    maxResults:        25,
    includeAttributes: true,
    objectSchemaId:    '128',
  });
  return new Promise(resolve => {
    const req = https.request({
      hostname: HOST, port: 443,
      path: `${BASE}/object/aql`, method: 'POST',
      headers: {
        'Accept': 'application/json', 'Content-Type': 'application/json',
        'Authorization': auth, 'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: { values: [] } }); }
      });
    });
    req.on('error',   () => resolve({ status: 0, body: { values: [] } }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: { values: [] } }); });
    req.write(body);
    req.end();
  });
}

// ── Site code extraction ──────────────────────────────────────────────────────
// "US-DTN01" → "US-DTN", "CA-GAL01" → "CA-GAL"
function canonSite(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Strip trailing 2-digit number: US-DTN01 → US-DTN
  const m = s.match(/^([A-Z]{2}-[A-Z0-9]{2,5})\d{2}(-.*)?$/);
  if (m) return m[1];
  // Already a bare site code: US-DTN
  const m2 = s.match(/^[A-Z]{2}-[A-Z0-9]{2,5}$/);
  return m2 ? s : null;
}

// ── DB ────────────────────────────────────────────────────────────────────────
const upsertEmployee = db.prepare(`
  INSERT OR REPLACE INTO employees (name, site, is_dct, is_active, title, synced_at)
  VALUES (@name, @site, @is_dct, @is_active, @title, @synced_at)
`);
const upsertMany = db.transaction(rows => {
  for (const row of rows) upsertEmployee.run(row);
});

// ── Main sync ─────────────────────────────────────────────────────────────────
async function syncEmployees(onProgress) {
  const useBasic = !!(process.env.JIRA_EMAIL && process.env.JIRA_TOKEN);
  console.log(`[sync:employees] Auth: ${useBasic ? 'Basic (JIRA_TOKEN)' : 'OAuth2'}`);
  console.log(`[sync:employees] DCT detection: title-based (no hardcoded names)`);

  const token   = await getAccessToken();
  const now     = new Date().toISOString();
  const logRow  = db.prepare(
    `INSERT INTO sync_log (type, status, started_at) VALUES ('employees', 'running', ?)`
  ).run(now);
  const logId   = logRow.lastInsertRowid;

  const offsets = [];
  for (let i = RANGE_START; i < RANGE_END; i += CHUNK) offsets.push(i);

  const results  = new Map(); // name → { site, title, email, is_dct }
  let chunksDone = 0;
  const total    = offsets.length;

  try {
    for (let bi = 0; bi < offsets.length; bi += CONCURRENCY) {
      const batch = offsets.slice(bi, bi + CONCURRENCY);
      await Promise.all(batch.map(async lo => {
        const hi = lo + CHUNK - 1;
        const r  = await aqlQuery(token, lo, hi);

        if (r.status === 200 && r.body?.values) {
          for (const emp of r.body.values) {
            let first = '', last = '', email = '', title = '', site = null, isActive = true;

            for (const a of (emp.attributes || [])) {
              const id  = String(a.objectTypeAttributeId);
              const val = (a.objectAttributeValues || [])[0];
              // For linked objects, try referencedObject.label first, then displayValue
              const v   = val
                ? (val.referencedObject?.label || val.displayValue || val.value || '')
                : '';

              if (id === ATTR_FIRST)  first    = String(v).trim();
              if (id === ATTR_LAST)   last     = String(v).trim();
              if (id === ATTR_EMAIL)  email    = String(v).trim();
              if (id === ATTR_TITLE)  title    = String(v).trim();
              if (id === ATTR_STATUS) isActive = String(v).toLowerCase() !== 'inactive';
              if (id === ATTR_DC_LOC) site     = canonSite(v);
            }

            const fullName = [first, last].filter(Boolean).join(' ');
            if (fullName && isActive && site) {
              results.set(fullName, { site, title, email, is_dct: isDCTTitle(title) });
            }          }
        }
        chunksDone++;
      }));

      if (chunksDone % 100 === 0 || chunksDone === total) {
        onProgress?.({ done: chunksDone, total, status: 'Syncing employees...' });
      }
    }

    const rows = Array.from(results.entries()).map(([name, d]) => ({
      name,
      site:      d.site,
      is_dct:    d.is_dct ? 1 : 0,
      is_active: 1,
      title:     d.title || null,
      synced_at: now,
    }));

    upsertMany(rows);

    // Summary
    const dctCount  = rows.filter(r => r.is_dct).length;
    const siteBreak = {};
    rows.forEach(r => { siteBreak[r.site] = (siteBreak[r.site] || 0) + 1; });

    console.log(`[sync:employees] ✓ ${rows.length} active employees with DC locations`);
    console.log(`[sync:employees]   DCT members detected: ${dctCount}`);
    console.log(`[sync:employees]   Sites: ${Object.keys(siteBreak).length}`);
    Object.entries(siteBreak).sort((a,b) => b[1]-a[1]).forEach(([site, count]) =>
      console.log(`[sync:employees]   ${site.padEnd(12)} ${count}`)
    );

    db.prepare(
      `UPDATE sync_log SET status='success', completed_at=?, records_synced=? WHERE id=?`
    ).run(new Date().toISOString(), rows.length, logId);

    return { totalSynced: rows.length, dctCount };

  } catch (err) {
    db.prepare(
      `UPDATE sync_log SET status='error', completed_at=?, error=? WHERE id=?`
    ).run(new Date().toISOString(), err.message, logId);
    console.error('[sync:employees] ✗ Error:', err.message);
    throw err;
  }
}

module.exports = { syncEmployees };
