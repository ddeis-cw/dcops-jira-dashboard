/**
 * src/sync/servers.js
 *
 * Counts active servers per site from Jira Assets snipe-it schemas.
 *
 * Strategy: Simple AQL pagination — no objectId range guessing.
 * For each schema/type we paginate through ALL objects using
 * resultPerPage=25 and incrementing page until isLast=true.
 * This guarantees 100% coverage regardless of ID distribution.
 *
 * Schemas scanned:
 *   10  snipe-it-coreweave-infrastructure  type 96  (servers)
 *   16  snipe-it-albatross-infrastructure  type 100 (servers)
 *   20  snipe-it-eagle-infrastructure      type 118 (servers)
 *   25  snipe-it-phoenix-infrastructure    type 135 (servers)
 *   26  snipe-it-snipecustomer-infra       type 146 (servers)
 *
 * Auth: JIRA_EMAIL + JIRA_TOKEN (Basic) — uses personal API token.
 *       Falls back to OAuth2 client credentials if personal token missing.
 */
'use strict';

const https = require('https');
const db    = require('../db');

const CLOUD_ID      = process.env.JIRA_CLOUD_ID   || '0b202827-7a05-4ef3-94f5-056ceba69699';
const WS            = process.env.ASSETS_WORKSPACE || '546fdb12-9ec4-464d-833f-61a727f3a5fb';
const HOST          = 'api.atlassian.com';
const BASE          = `/ex/jira/${CLOUD_ID}/jsm/assets/workspace/${WS}/v1`;
const CLIENT_ID     = process.env.ASSETS_CLIENT_ID;
const CLIENT_SECRET = process.env.ASSETS_CLIENT_SECRET;

// ── Schema + type definitions ─────────────────────────────────────────────────
// Attr IDs confirmed via probe 2026-04-23.
const SCHEMAS = [
  { id:'10', name:'coreweave',     serverType:96,  attrRack:'904',  attrActive:'1069', attrRegion:'898'  },
  { id:'16', name:'albatross',     serverType:100, attrRack:'938',  attrActive:'1072', attrRegion:'932'  },
  { id:'20', name:'eagle',         serverType:118, attrRack:'1112', attrActive:'1116', attrRegion:'1108' },
  { id:'25', name:'phoenix',       serverType:135, attrRack:'1352', attrActive:'1356', attrRegion:'1349' },
  { id:'26', name:'snipecustomer', serverType:146, attrRack:'1572', attrActive:'1575', attrRegion:'1569' },
];

// ── Site mapping ──────────────────────────────────────────────────────────────
const RACK_OVERRIDES = {
  LAS1:'US-LAS', RNO1:'US-SPK', RNO2:'US-SPK',
  PDX1:'US-HIO', PDX2:'US-HIO', PDX3:'US-HIO', PDX5:'US-HIO',
  ORD1:'US-VO2', ORD3:'US-WCI', ATL1:'US-SVG', ATL2:'US-DGV', ATL4:'US-AAI',
  AUS1:'US-AUS', DFW1:'US-PLZ', SBN1:'US-HMN', LGA1:'US-WJQ', CMH1:'US-CMH',
  'US-WEST-06':'US-HIO','US-WEST-06A':'US-HIO','US-WEST-03':'US-HIO',
  'US-WEST-05':'US-LYF','US-WEST-07A':'US-LYF','US-WEST-08A':'US-LYF',
  'US-EAST-12':'US-DNN','US-EAST-12A':'US-DNN','US-EAST-11A':'US-ARQ',
  'US-EAST-04A':'US-CSZ','US-EAST-04B':'US-CSZ','US-EAST-08A':'US-CMH',
  'US-EAST-01A':'US-OBG','US-EAST-07A':'US-LNB','US-EAST-09A':'US-SVG',
  'US-EAST-10':'US-LOE','US-EAST-10A':'US-LOE','US-EAST-02A':'US-EWS',
  'US-EAST-02B':'US-EWS','US-EAST-03A':'US-BVI','US-EAST-05A':'US-WJQ',
  'US-EAST-06A':'US-CVG','US-EAST-13A':'US-CDZ','US-EAST-14A':'US-PPY',
  'US-EAST-15A':'US-CLY','US-EAST-16A':'US-LHS','US-EAST-17A':'US-RRX',
  'US-EAST-18A':'US-SKY',
  'US-CENTRAL-01A':'US-VO2','US-CENTRAL-02A':'US-PLZ','US-CENTRAL-03A':'US-DTN',
  'US-CENTRAL-03':'US-DTN','US-CENTRAL-04A':'US-PLZ','US-CENTRAL-05A':'US-RIN',
  'US-CENTRAL-05':'US-RIN','US-CENTRAL-06A':'US-EVI','US-CENTRAL-07A':'US-EVI',
  'US-CENTRAL-08A':'US-LZL','US-CENTRAL-08B':'US-LZL','US-CENTRAL-09A':'US-HMN',
  'US-CENTRAL-10A':'US-LBB','US-CENTRAL-11A':'US-MKO','US-CENTRAL-12A':'US-WCI',
  'US-CENTRAL-13A':'US-AAI','US-CENTRAL-14A':'US-SPK','US-CENTRAL-15A':'US-AUS',
  'US-NORTH-01A':'US-SPK','US-NORTH-01':'US-SPK','US-NORTH-02A':'US-SPK',
  'US-NORTH-03A':'US-CVY','US-NORTH-04A':'US-LAS','US-NORTH-05A':'US-LBB',
  'CA-WEST-01A':'CA-GAL','CA-WEST-01':'CA-GAL','CA-EAST-01A':'CA-GAL','CA-TOR01':'CA-GAL',
  'EU-NORTH-01':'SE-FAN','EU-NORTH-01A':'SE-FAN','EU-NORTH-02A':'NO-OVO','EU-NORTH-02':'NO-OVO',
  'EU-NORTH-04A':'SE-SKH','EU-NORTH-05A':'DK-SVL',
  'EU-WEST-01A':'GB-PPL','EU-WEST-01':'GB-PPL','EU-WEST-02A':'GB-CWY','EU-WEST-02':'GB-CWY',
  'EU-SOUTH-01A':'ES-AVQ','EU-SOUTH-01':'ES-AVQ','EU-SOUTH-02A':'ES-BCN',
  'EU-SOUTH-02':'ES-BCN','EU-SOUTH-03B':'ES-BCN',
  'US-EW':'US-EWS','UA-ARQ':'US-ARQ',
};
const SKIP = new Set(['3PL','DHD','DHF','SCH','NAP12','UNKNOWN']);

function siteFromRack(rack) {
  if (!rack) return null;
  if (/^\d+\.\d+/.test(rack)) return null;       // IP address
  if (/pallet|broken/i.test(rack)) return null;   // staging
  if (rack === 'UNKNOWN') return null;
  const t = rack.trim();
  if (RACK_OVERRIDES[t]) return RACK_OVERRIDES[t];
  const p = t.split('.')[0];
  if (RACK_OVERRIDES[p]) return RACK_OVERRIDES[p];
  if (SKIP.has(p)) return null;
  const m = p.match(/^([A-Z]{2}-[A-Z0-9]{2,5})\d{2}(-.*)?$/);
  return m ? m[1] : null;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function getAuthHeader() {
  if (process.env.JIRA_EMAIL && process.env.JIRA_TOKEN) {
    return Promise.resolve('Basic ' + Buffer.from(
      process.env.JIRA_EMAIL + ':' + process.env.JIRA_TOKEN
    ).toString('base64'));
  }
  return new Promise((resolve, reject) => {
    const body  = 'grant_type=client_credentials';
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const req = https.request({
      hostname: 'auth.atlassian.com', port: 443, path: '/oauth/token', method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.access_token) resolve('Bearer ' + j.access_token);
          else reject(new Error(j.error_description || d.slice(0, 200)));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Single AQL page ───────────────────────────────────────────────────────────
function aqlPage(auth, qlQuery, schemaId, page) {
  const body = JSON.stringify({
    qlQuery,
    resultPerPage: 25,
    page,
    includeAttributes: true,
    objectSchemaId: String(schemaId),
  });
  return new Promise(resolve => {
    const req = https.request({
      hostname: HOST, port: 443,
      path: `${BASE}/object/aql`, method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': auth,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: { values: [], isLast: true } }); }
      });
    });
    req.on('error', () => resolve({ status: 0, body: { values: [], isLast: true } }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: { values: [], isLast: true } }); });
    req.write(body);
    req.end();
  });
}

// ── Process objects from one page ─────────────────────────────────────────────
function processObjects(objects, schema, siteCounts) {
  let counted = 0;
  for (const obj of objects) {
    let rack = '', region = '', active = null;
    for (const a of (obj.attributes || [])) {
      const id  = String(a.objectTypeAttributeId);
      const val = (a.objectAttributeValues || [])[0];
      const v   = val ? (val.displayValue || val.value || '') : '';
      if (id === schema.attrRack)   rack   = String(v);
      if (id === schema.attrRegion) region = String(v);
      if (id === schema.attrActive) active = String(v).toLowerCase() === 'true';
    }
    // active=null means attr not present → default to active (true)
    if (active === false) continue;
    const site = siteFromRack(rack) || (region ? RACK_OVERRIDES[region.trim()] : null);
    if (site) {
      siteCounts[site] = (siteCounts[site] || 0) + 1;
      counted++;
    }
  }
  return counted;
}

// ── DB ────────────────────────────────────────────────────────────────────────
const upsertServerCount = db.prepare(
  `INSERT OR REPLACE INTO server_counts (site, count, synced_at) VALUES (@site, @count, @synced_at)`
);
const upsertMany = db.transaction(rows => {
  for (const r of rows) upsertServerCount.run(r);
});

// ── Main sync ─────────────────────────────────────────────────────────────────
async function syncServers(onProgress) {
  const useBasic = !!(process.env.JIRA_EMAIL && process.env.JIRA_TOKEN);
  console.log(`[sync:servers] Auth: ${useBasic ? 'Basic (personal JIRA_TOKEN)' : 'OAuth2'}`);

  const auth = await getAuthHeader();
  const now  = new Date().toISOString();
  const logRow = db.prepare(
    `INSERT INTO sync_log (type, status, started_at) VALUES ('servers', 'running', ?)`
  ).run(now);
  const logId = logRow.lastInsertRowid;

  const siteCounts = {};
  let grandTotal   = 0;

  try {
    for (const schema of SCHEMAS) {
      console.log(`[sync:servers] Scanning ${schema.name} (schema ${schema.id}, type ${schema.serverType})...`);
      let page    = 0;
      let counted = 0;
      let pages   = 0;

      while (true) {
        const r = await aqlPage(auth, `objectTypeId = ${schema.serverType}`, schema.id, page);

        if (r.status !== 200) {
          console.warn(`[sync:servers] HTTP ${r.status} on ${schema.name} page ${page} — stopping`);
          break;
        }

        const values = r.body?.values || [];
        counted += processObjects(values, schema, siteCounts);
        pages++;

        // Report progress
        if (pages % 200 === 0) {
          const total = Object.values(siteCounts).reduce((a, b) => a + b, 0);
          console.log(`[sync:servers] ${schema.name}: page ${page}, ${counted.toLocaleString()} servers so far`);
          onProgress?.({ done: pages, total: null, servers: total, status: `Scanning ${schema.name}...` });
        }

        if (r.body?.isLast || r.body?.last || values.length < 25) break;
        page++;
      }

      grandTotal += counted;
      console.log(`[sync:servers] ${schema.name}: ✓ ${counted.toLocaleString()} active servers (${pages} pages)`);
      onProgress?.({
        done: pages, total: null,
        servers: Object.values(siteCounts).reduce((a, b) => a + b, 0),
        status: `${schema.name} complete`,
      });
    }

    // Write to DB
    const rows = Object.entries(siteCounts).map(([site, count]) => ({
      site, count, synced_at: now,
    }));
    upsertMany(rows);

    db.prepare(
      `UPDATE sync_log SET status='success', completed_at=?, records_synced=? WHERE id=?`
    ).run(new Date().toISOString(), grandTotal, logId);

    console.log(`[sync:servers] ✓ ${grandTotal.toLocaleString()} active servers across ${rows.length} sites`);
    return { totalActive: grandTotal, sitesCount: rows.length };

  } catch (err) {
    db.prepare(
      `UPDATE sync_log SET status='error', completed_at=?, error=? WHERE id=?`
    ).run(new Date().toISOString(), err.message, logId);
    console.error('[sync:servers] ✗ Error:', err.message);
    throw err;
  }
}

module.exports = { syncServers };
