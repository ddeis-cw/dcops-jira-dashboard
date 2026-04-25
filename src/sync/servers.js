/**
 * src/sync/servers.js
 *
 * Counts ACTIVE SERVERS per site from Jira Assets.
 *
 * Architecture (confirmed 2026-04-24):
 *
 * Schema 127 (consolidated, OAuth required) — filter attrId=2101 = "server":
 *   Type 344 = CoreWeave internal servers        (100% server in schema 127)
 *   Type 347 = Osprey customer servers           (mixed, filter to server only)
 *   Type 349 = Snipe/Heron customer servers      (mixed, filter to server only)
 *
 * Individual schemas (Basic auth) — no servers in schema 127 for these:
 *   Schema 16 type 100 = Albatross servers       (100% network-device in 127)
 *   Schema 20 type 118 = Eagle servers           (100% network-device in 127)
 *   Schema 25 type 135 = Phoenix servers         (100% CDU in 127)
 *
 * Zero double-counting — each server exists in exactly one source above.
 * Filter: attrId=2101 = "server" enforced on all types.
 * Active: attrId=active defaults to true if attr missing (some objects lack it).
 *
 * Auth: OAuth2 client credentials (refreshed each run) for schema 127.
 *       Basic (JIRA_TOKEN) for individual schemas 16/20/25.
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
const WORKERS       = 4;    // concurrent page fetchers per schema
const PAGE_SIZE     = 25;   // Jira Assets AQL page size

// ── Source definitions ────────────────────────────────────────────────────────
const SOURCES_OAUTH = [
  // Schema 127 — consolidated. Requires OAuth Bearer.
  // attrRack=2088, attrActive=2092, attrRegion=2084, attrType=2101
  { schema:'127', name:'CoreWeave (127)',      typeId:344, attrRack:'2088', attrActive:'2092', attrRegion:'2084', attrType:'2101' },
  { schema:'127', name:'Osprey (127)',         typeId:347, attrRack:'2088', attrActive:'2092', attrRegion:'2084', attrType:'2101' },
  { schema:'127', name:'Snipe/Heron (127)',    typeId:349, attrRack:'2088', attrActive:'2092', attrRegion:'2084', attrType:'2101' },
];

const SOURCES_BASIC = [
  // Individual schemas — Basic auth. Servers NOT present in schema 127.
  // Schema 16 Albatross: attrRack=938, attrActive=1072, attrRegion=932, attrType — probe showed no type attr, filter by type 100 = servers only
  { schema:'16',  name:'Albatross (16)',       typeId:100, attrRack:'938',  attrActive:'1072', attrRegion:'932',  attrType:null },
  // Schema 20 Eagle: attrRack=1112, attrActive=1116, attrRegion=1108
  { schema:'20',  name:'Eagle (20)',           typeId:118, attrRack:'1112', attrActive:'1116', attrRegion:'1108', attrType:null },
  // Schema 25 Phoenix: attrRack=1352, attrActive=1356, attrRegion=1349
  { schema:'25',  name:'Phoenix (25)',         typeId:135, attrRack:'1352', attrActive:'1356', attrRegion:'1349', attrType:null },
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
const SKIP = new Set(['3PL','DHD','DHF','SCH','NAP12']);

function siteFromRack(rack) {
  if (!rack) return null;
  if (/^\d+\.\d+/.test(rack)) return null;
  if (/pallet|broken|UNKNOWN/i.test(rack)) return null;
  const t = rack.trim();
  if (RACK_OVERRIDES[t]) return RACK_OVERRIDES[t];
  const p = t.split('.')[0];
  if (RACK_OVERRIDES[p]) return RACK_OVERRIDES[p];
  if (SKIP.has(p)) return null;
  const m = p.match(/^([A-Z]{2}-[A-Z0-9]{2,5})\d{2}(-.*)?$/);
  return m ? m[1] : null;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function getOAuthToken() {
  return new Promise((resolve, reject) => {
    const body  = 'grant_type=client_credentials';
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const req   = https.request({
      hostname: 'auth.atlassian.com', port: 443, path: '/oauth/token', method: 'POST',
      headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.access_token) resolve('Bearer ' + j.access_token);
          else reject(new Error('OAuth failed: ' + (j.error_description || j.error || d.slice(0,100))));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

function getBasicToken() {
  return 'Basic ' + Buffer.from(process.env.JIRA_EMAIL + ':' + process.env.JIRA_TOKEN).toString('base64');
}

// ── HTTP page fetch ───────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(auth, schemaId, typeId, page, retries = 5) {
  const body = JSON.stringify({
    qlQuery:      `objectTypeId = ${typeId}`,
    resultPerPage: PAGE_SIZE,
    page,
    includeAttributes: true,
    objectSchemaId: String(schemaId),
  });
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await new Promise(resolve => {
      const req = https.request({
        hostname: HOST, port: 443, path: `${BASE}/object/aql`, method: 'POST',
        headers: { 'Accept':'application/json','Content-Type':'application/json','Authorization':auth,'Content-Length':Buffer.byteLength(body) },
        timeout: 30000,
      }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
          catch(e) { resolve({ status: res.statusCode, data: { values: [] } }); }
        });
      });
      req.on('error',   () => resolve({ status: 0,   data: { values: [] } }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: { values: [] } }); });
      req.write(body); req.end();
    });

    if (result.status === 429) {
      const wait = 1000 * Math.pow(2, attempt);
      console.warn(`[sync:servers] 429 rate limit on page ${page}, waiting ${wait}ms...`);
      await sleep(wait);
      continue;
    }
    return result;
  }
  return { status: 429, data: { values: [], isLast: true } };
}

// ── Parse object → site ───────────────────────────────────────────────────────
function objectSite(obj, source) {
  let rack = '', region = '', active = null, assetType = '';

  for (const a of (obj.attributes || [])) {
    const id  = String(a.objectTypeAttributeId);
    const val = (a.objectAttributeValues || [])[0];
    const v   = val ? (val.displayValue || val.value || '') : '';
    if (id === source.attrRack)   rack      = String(v);
    if (id === source.attrRegion) region    = String(v);
    if (id === source.attrActive) active    = String(v).toLowerCase() === 'true';
    if (source.attrType && id === source.attrType) assetType = String(v).toLowerCase();
  }

  // For schema 127 sources: only count if asset type is "server"
  if (source.attrType && assetType !== 'server') return null;

  // Skip if explicitly inactive
  if (active === false) return null;

  return siteFromRack(rack) || (region ? RACK_OVERRIDES[region.trim()] : null);
}

// ── Fetch all pages for one source using worker queue ────────────────────────
async function fetchAllPages(auth, source, siteCounts, onProgress) {
  // Get page 0 first
  const first = await fetchPage(auth, source.schema, source.typeId, 0);
  if (first.status !== 200) {
    console.warn(`[sync:servers] ${source.name}: HTTP ${first.status} on page 0 — skipping`);
    return 0;
  }

  let counted = 0;
  for (const obj of (first.data?.values || [])) {
    const site = objectSite(obj, source);
    if (site) { siteCounts[site] = (siteCounts[site] || 0) + 1; counted++; }
  }

  const isLast = first.data?.isLast || first.data?.last || (first.data?.values || []).length < PAGE_SIZE;
  if (isLast) {
    console.log(`[sync:servers] ${source.name}: ✓ ${counted} active servers (1 page)`);
    return counted;
  }

  // Multi-page: use worker queue
  let nextPage       = 1;
  let lastPage       = null;
  let pagesDone      = 1;
  let finished       = false;

  async function worker() {
    while (true) {
      if (finished) return;
      if (lastPage !== null && nextPage > lastPage) return;
      const page = nextPage++;

      const r      = await fetchPage(auth, source.schema, source.typeId, page);
      const values = (r.status === 200 && r.data?.values) ? r.data.values : [];

      for (const obj of values) {
        const site = objectSite(obj, source);
        if (site) { siteCounts[site] = (siteCounts[site] || 0) + 1; counted++; }
      }
      pagesDone++;

      // Detect end of results
      if (values.length < PAGE_SIZE || r.data?.isLast || r.data?.last || r.status !== 200) {
        if (lastPage === null || page < lastPage) lastPage = page;
        finished = true;
        return;
      }

      if (pagesDone % 100 === 0) {
        const total = Object.values(siteCounts).reduce((a, b) => a + b, 0);
        console.log(`[sync:servers] ${source.name}: ${pagesDone} pages done, ${counted.toLocaleString()} servers (running total: ${total.toLocaleString()})`);
        onProgress?.({ done: pagesDone, total: null, servers: total, status: `Scanning ${source.name}...` });
      }

      await sleep(50); // gentle rate limit
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, () => worker()));

  console.log(`[sync:servers] ${source.name}: ✓ ${counted.toLocaleString()} active servers (${pagesDone} pages)`);
  return counted;
}

// ── DB ────────────────────────────────────────────────────────────────────────
const upsertServerCount = db.prepare(
  `INSERT OR REPLACE INTO server_counts (site, count, synced_at) VALUES (@site, @count, @synced_at)`
);
const upsertMany = db.transaction(rows => { for (const r of rows) upsertServerCount.run(r); });

// ── Main sync ─────────────────────────────────────────────────────────────────
async function syncServers(onProgress) {
  const hasOAuth = !!(CLIENT_ID && CLIENT_SECRET);
  console.log(`[sync:servers] ─────────────────────────────────────────`);
  console.log(`[sync:servers] Starting server sync`);
  console.log(`[sync:servers] OAuth available: ${hasOAuth}`);

  if (!hasOAuth) {
    console.error('[sync:servers] ERROR: ASSETS_CLIENT_ID and ASSETS_CLIENT_SECRET required');
    throw new Error('OAuth credentials required for server sync');
  }

  console.log(`[sync:servers] Sources:`);
  console.log(`[sync:servers]   Schema 127 (OAuth): CoreWeave(344) + Osprey(347) + Snipe/Heron(349) — filtered to servers only`);
  console.log(`[sync:servers]   Schema 16  (Basic): Albatross(100) — no servers in schema 127`);
  console.log(`[sync:servers]   Schema 20  (Basic): Eagle(118) — no servers in schema 127`);
  console.log(`[sync:servers]   Schema 25  (Basic): Phoenix(135) — no servers in schema 127`);
  console.log(`[sync:servers] ─────────────────────────────────────────`);

  const oauthToken = await getOAuthToken();
  console.log(`[sync:servers] OAuth token refreshed`);
  const basicToken = getBasicToken();

  const now     = new Date().toISOString();
  const logRow  = db.prepare(`INSERT INTO sync_log (type, status, started_at) VALUES ('servers', 'running', ?)`).run(now);
  const logId   = logRow.lastInsertRowid;

  const siteCounts = {};
  let grandTotal   = 0;

  try {
    // Schema 127 sources via OAuth
    for (const source of SOURCES_OAUTH) {
      const count = await fetchAllPages(oauthToken, source, siteCounts, onProgress);
      grandTotal += count;
    }

    // Individual schema sources via Basic auth
    for (const source of SOURCES_BASIC) {
      const count = await fetchAllPages(basicToken, source, siteCounts, onProgress);
      grandTotal += count;
    }

    const rows = Object.entries(siteCounts).map(([site, count]) => ({ site, count, synced_at: now }));
    upsertMany(rows);

    db.prepare(`UPDATE sync_log SET status='success', completed_at=?, records_synced=? WHERE id=?`)
      .run(new Date().toISOString(), grandTotal, logId);

    console.log(`[sync:servers] ─────────────────────────────────────────`);
    console.log(`[sync:servers] ✓ COMPLETE: ${grandTotal.toLocaleString()} active servers across ${rows.length} sites`);
    console.log(`[sync:servers] Top 10 sites by server count:`);
    rows.sort((a, b) => b.count - a.count).slice(0, 10).forEach(r =>
      console.log(`[sync:servers]   ${r.site.padEnd(12)} ${r.count.toLocaleString()}`)
    );
    console.log(`[sync:servers] ─────────────────────────────────────────`);

    return { totalActive: grandTotal, sitesCount: rows.length };

  } catch (err) {
    db.prepare(`UPDATE sync_log SET status='error', completed_at=?, error=? WHERE id=?`)
      .run(new Date().toISOString(), err.message, logId);
    console.error('[sync:servers] ✗ Error:', err.message);
    throw err;
  }
}

module.exports = { syncServers };
