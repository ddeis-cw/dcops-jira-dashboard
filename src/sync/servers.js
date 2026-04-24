/**
 * src/sync/servers.js
 *
 * Counts active servers per site from Jira Assets snipe-it schemas.
 *
 * Uses a worker-queue approach:
 * 1. Fetch page 0 to get results + check isLast
 * 2. If multi-page: probe to estimate total pages, build page queue
 * 3. N workers pull from queue concurrently, retrying 429s
 * 4. Guaranteed complete coverage — no early exits
 *
 * Auth: OAuth2 client credentials (refreshed each run) — preferred for elevated access.
 *       Falls back to Basic (JIRA_TOKEN) if OAuth not configured.
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
const WORKERS       = 4;    // concurrent page fetchers
const PAGE_SIZE     = 25;   // Jira Assets AQL page size

// ── Schemas ───────────────────────────────────────────────────────────────────
const SCHEMAS = [
  { id:'10',  name:'coreweave',     serverType:96,  attrRack:'904',  attrActive:'1069', attrRegion:'898'  },
  { id:'16',  name:'albatross',     serverType:100, attrRack:'938',  attrActive:'1072', attrRegion:'932'  },
  { id:'20',  name:'eagle',         serverType:118, attrRack:'1112', attrActive:'1116', attrRegion:'1108' },
  { id:'25',  name:'phoenix',       serverType:135, attrRack:'1352', attrActive:'1356', attrRegion:'1349' },
  { id:'26',  name:'snipecustomer', serverType:146, attrRack:'1572', attrActive:'1575', attrRegion:'1569' },
  // Schema 127: consolidated (323k objects) — requires OAuth Bearer
  { id:'127', name:'consolidated',  serverType:344, attrRack:'2088', attrActive:'2092', attrRegion:'2084', oauthOnly: true },
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
function getAuthHeader() {
  if (CLIENT_ID && CLIENT_SECRET) {
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
            if (j.access_token) { console.log('[sync:servers] OAuth token refreshed'); resolve('Bearer ' + j.access_token); }
            else {
              console.warn('[sync:servers] OAuth failed:', j.error_description || j.error, '— falling back to Basic');
              resolve('Basic ' + Buffer.from(process.env.JIRA_EMAIL + ':' + process.env.JIRA_TOKEN).toString('base64'));
            }
          } catch(e) { reject(e); }
        });
      });
      req.on('error', reject); req.write(body); req.end();
    });
  }
  return Promise.resolve('Basic ' + Buffer.from(
    process.env.JIRA_EMAIL + ':' + process.env.JIRA_TOKEN
  ).toString('base64'));
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchPage(auth, schemaId, typeId, page) {
  const body = JSON.stringify({
    qlQuery: `objectTypeId = ${typeId}`,
    resultPerPage: PAGE_SIZE,
    page,
    includeAttributes: true,
    objectSchemaId: String(schemaId),
  });
  return new Promise(resolve => {
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
}

// Fetch a single page with automatic retry on 429
async function fetchPageRetry(auth, schemaId, typeId, page, maxRetries = 5) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await fetchPage(auth, schemaId, typeId, page);
    if (r.status !== 429) return r;
    const wait = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, 8s, 16s
    console.warn(`[sync:servers] 429 on page ${page}, retrying in ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
    await sleep(wait);
  }
  return { status: 429, data: { values: [] } };
}

// ── Object → site ─────────────────────────────────────────────────────────────
function objectSite(obj, schema) {
  let rack = '', region = '', active = null;
  for (const a of (obj.attributes || [])) {
    const id  = String(a.objectTypeAttributeId);
    const val = (a.objectAttributeValues || [])[0];
    const v   = val ? (val.displayValue || val.value || '') : '';
    if (id === schema.attrRack)   rack   = String(v);
    if (id === schema.attrRegion) region = String(v);
    if (id === schema.attrActive) active = String(v).toLowerCase() === 'true';
  }
  if (active === false) return null;
  return siteFromRack(rack) || (region ? RACK_OVERRIDES[region.trim()] : null);
}

// ── Worker queue ──────────────────────────────────────────────────────────────
// Fetch all pages of a schema using N concurrent workers.
// Workers pull page numbers from a shared queue, stopping when the queue is
// empty OR when a fetched page signals it is the last page.
async function fetchAllPages(auth, schema, siteCounts, onProgress) {
  // Fetch page 0 first to check if multi-page and get first results
  const first = await fetchPageRetry(auth, schema.id, schema.serverType, 0);
  if (first.status !== 200) {
    console.warn(`[sync:servers] ${schema.name}: HTTP ${first.status} on page 0 — skipping`);
    return 0;
  }

  let counted = 0;
  for (const obj of (first.data?.values || [])) {
    const site = objectSite(obj, schema);
    if (site) { siteCounts[site] = (siteCounts[site] || 0) + 1; counted++; }
  }

  const isLast = first.data?.isLast || first.data?.last || (first.data?.values || []).length < PAGE_SIZE;
  if (isLast) {
    console.log(`[sync:servers] ${schema.name}: ✓ ${counted} active servers (1 page)`);
    return counted;
  }

  // Probe to estimate page count for logging
  const probe = await fetchPageRetry(auth, schema.id, schema.serverType, 9999);
  const estimatedPages = (probe.status === 200 && (probe.data?.values || []).length > 0) ? '>250,000 objects' :
    ((await fetchPageRetry(auth, schema.id, schema.serverType, 999)).status === 200 &&
     ((await fetchPageRetry(auth, schema.id, schema.serverType, 999)).data?.values || []).length > 0
    ) ? '>25,000 objects' : '~thousands of objects';

  console.log(`[sync:servers] ${schema.name}: multi-page (${estimatedPages}), starting ${WORKERS} workers...`);

  // Queue of page numbers to fetch — dynamically extended as we discover more pages
  let nextPage     = 1;       // next page to enqueue
  let lastKnownPage = null;   // set when we find the last page
  let pagesDone    = 1;       // page 0 already done
  let done         = false;

  // Worker function
  async function worker() {
    while (true) {
      // Grab next page from queue
      if (done) return;
      if (lastKnownPage !== null && nextPage > lastKnownPage) return;
      const page = nextPage++;

      const r = await fetchPageRetry(auth, schema.id, schema.serverType, page);
      const values = (r.status === 200 && r.data?.values) ? r.data.values : [];

      for (const obj of values) {
        const site = objectSite(obj, schema);
        if (site) { siteCounts[site] = (siteCounts[site] || 0) + 1; counted++; }
      }
      pagesDone++;

      // Detect last page
      if (r.data?.isLast || r.data?.last || values.length < PAGE_SIZE || r.status !== 200) {
        // Only set lastKnownPage if this page is before what we thought was last
        if (lastKnownPage === null || page < lastKnownPage) {
          lastKnownPage = page;
        }
      }

      // Progress every 100 pages
      if (pagesDone % 100 === 0) {
        const total = Object.values(siteCounts).reduce((a, b) => a + b, 0);
        console.log(`[sync:servers] ${schema.name}: ${pagesDone} pages, ${counted.toLocaleString()} active servers so far (running total: ${total.toLocaleString()})`);
        onProgress?.({ done: pagesDone, total: lastKnownPage, servers: total, status: `Scanning ${schema.name}...` });
      }

      // Small delay to avoid rate limiting
      await sleep(50);
    }
  }

  // Run WORKERS workers concurrently until all pages are done
  await Promise.all(Array.from({ length: WORKERS }, () => worker()));

  console.log(`[sync:servers] ${schema.name}: ✓ ${counted.toLocaleString()} active servers (${pagesDone} pages)`);
  return counted;
}

// ── DB ────────────────────────────────────────────────────────────────────────
const upsertServerCount = db.prepare(
  `INSERT OR REPLACE INTO server_counts (site, count, synced_at) VALUES (@site, @count, @synced_at)`
);
const upsertMany = db.transaction(rows => { for (const r of rows) upsertServerCount.run(r); });

// ── Main sync ─────────────────────────────────────────────────────────────────
async function syncServers(onProgress) {
  const useOAuth = !!(CLIENT_ID && CLIENT_SECRET);
  console.log(`[sync:servers] Starting — Auth: ${useOAuth ? 'OAuth2 (client credentials)' : 'Basic (JIRA_TOKEN)'}`);
  const auth = await getAuthHeader();
  const now  = new Date().toISOString();

  const logRow = db.prepare(`INSERT INTO sync_log (type, status, started_at) VALUES ('servers', 'running', ?)`).run(now);
  const logId  = logRow.lastInsertRowid;

  const siteCounts = {};
  let grandTotal   = 0;

  try {
    for (const schema of SCHEMAS) {
      if (schema.oauthOnly && !useOAuth) {
        console.log(`[sync:servers] Skipping ${schema.name} — requires OAuth (set ASSETS_CLIENT_ID + ASSETS_CLIENT_SECRET)`);
        continue;
      }
      const count = await fetchAllPages(auth, schema, siteCounts, onProgress);
      grandTotal += count;
    }

    const rows = Object.entries(siteCounts).map(([site, count]) => ({ site, count, synced_at: now }));
    upsertMany(rows);

    db.prepare(`UPDATE sync_log SET status='success', completed_at=?, records_synced=? WHERE id=?`)
      .run(new Date().toISOString(), grandTotal, logId);

    console.log(`[sync:servers] ✓ COMPLETE: ${grandTotal.toLocaleString()} active servers across ${rows.length} sites`);
    rows.sort((a, b) => b.count - a.count).slice(0, 10).forEach(r =>
      console.log(`[sync:servers]   ${r.site}: ${r.count.toLocaleString()}`)
    );
    return { totalActive: grandTotal, sitesCount: rows.length };

  } catch (err) {
    db.prepare(`UPDATE sync_log SET status='error', completed_at=?, error=? WHERE id=?`)
      .run(new Date().toISOString(), err.message, logId);
    console.error('[sync:servers] ✗ Error:', err.message);
    throw err;
  }
}

module.exports = { syncServers };
