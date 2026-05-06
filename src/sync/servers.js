/**
 * src/sync/servers.js — DEFINITIVE VERSION
 *
 * CONFIRMED API BEHAVIOR (2026-04-24):
 *   POST /object/aql ignores ALL pagination params (page, startAt, resultPerPage).
 *   Always returns the same first 25 objects regardless.
 *   ONLY working approach: objectId range queries — splits results by ID range,
 *   each range small enough to fit in 25 results.
 *
 * SOURCES:
 *   Schema 127 (OAuth) — filter attrType=2101="server" in code:
 *     Type 344 = CoreWeave  (SNIPE objects, IDs start at ~589372)
 *     Type 347 = Osprey     (SNIPE objects, same ID space)
 *     Type 349 = Snipe/Heron (SNIPE objects, same ID space)
 *
 *   Individual schemas (Basic auth) — no servers in schema 127:
 *     Schema 16 type 100 = Albatross  (ALB objects)
 *     Schema 20 type 118 = Eagle      (EAG objects)
 *     Schema 25 type 135 = Phoenix    (PHX objects)
 *
 * CHUNK SIZING:
 *   Schema 127: 323,714 objects across IDs ~589372-913086. Density ~1 per ID.
 *     Types 344+347+349 together = majority. Use chunk=20 → max ~20 hits/query.
 *   Schema 16: 44,077 objects. ALB IDs start low. chunk=25.
 *   Schema 20: 8,916 objects. EAG IDs. chunk=25.
 *   Schema 25: 75,075 objects. PHX IDs up to ~1.2M. chunk=25.
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
const CONCURRENCY   = 2;    // keep low to avoid 429 rate limiting
const INTER_DELAY   = 300;  // ms between batches — prevents rate limit bursts

// ── Source definitions ────────────────────────────────────────────────────────
const SOURCES = [
  // Schema 127 — OAuth. All three types share same ID space (589372–913086).
  // Query all three types together per chunk to minimize API calls.
  // Filter to attrType=2101="server" in code.
  {
    schema:     '127',
    name:       'schema127-servers',
    typeIds:    [344, 347, 349],       // CoreWeave + Osprey + Snipe/Heron
    rangeStart: 589372,
    rangeEnd:   950000,                // 589372 + 323714 + buffer
    chunk:      20,                    // ~20 objects max per query at density ~1/ID
    attrRack:   '2088',
    attrActive: '2092',
    attrRegion: '2084',
    attrType:   '2101',               // filter to "server" only
    auth:       'oauth',
  },
  // Individual schemas — Basic auth
  {
    schema:     '16',
    name:       'Albatross',
    typeIds:    [100],
    rangeStart: 1,
    rangeEnd:   500000,
    chunk:      25,
    attrRack:   '938',
    attrActive: '1072',
    attrRegion: '932',
    attrType:   null,
    auth:       'basic',
  },
  {
    schema:     '20',
    name:       'Eagle',
    typeIds:    [118],
    rangeStart: 1,
    rangeEnd:   250000,
    chunk:      25,
    attrRack:   '1112',
    attrActive: '1116',
    attrRegion: '1108',
    attrType:   null,
    auth:       'basic',
  },
  {
    schema:     '25',
    name:       'Phoenix',
    typeIds:    [135],
    rangeStart: 1,
    rangeEnd:   1500000,
    chunk:      25,
    attrRack:   '1352',
    attrActive: '1356',
    attrRegion: '1349',
    attrType:   null,
    auth:       'basic',
  },
];

// ── Site mapping ──────────────────────────────────────────────────────────────
const RACK_OVERRIDES = {
  LAS1:'US-LAS', RNO1:'US-SPK', RNO2:'US-SPK',
  PDX1:'US-HIO', PDX2:'US-HIO', PDX3:'US-HIO', PDX5:'US-HIO',
  ORD1:'US-VO2', ORD3:'US-WCI', ATL1:'US-SVG', ATL2:'US-DGV', ATL4:'US-AAI',
  AUS1:'US-AUS', DFW1:'US-PLZ', SBN1:'US-HMN', LGA1:'US-WJQ', CMH1:'US-CMH',
  'US-WEST-06':'US-HIO','US-WEST-06A':'US-HIO','US-WEST-03':'US-HIO',
  'US-WEST-05':'US-LYF','US-WEST-08A':'US-LYF',
  'US-WEST-07A':'US-DTN','US-WEST-07B':'US-DTN','US-WEST-07C':'US-DTN','US-WEST-07D':'US-DTN',
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
          else reject(new Error('OAuth failed: ' + (j.error_description || d.slice(0,100))));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

function getBasicToken() {
  return 'Basic ' + Buffer.from(process.env.JIRA_EMAIL + ':' + process.env.JIRA_TOKEN).toString('base64');
}

// ── objectId range query ──────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function queryRange(auth, source, lo, hi, retries = 4) {
  const typeFilter = source.typeIds.length === 1
    ? `objectTypeId = ${source.typeIds[0]}`
    : `objectTypeId IN (${source.typeIds.join(',')})`;

  const body = JSON.stringify({
    qlQuery:           `${typeFilter} AND objectId >= ${lo} AND objectId <= ${hi}`,
    maxResults:        25,
    includeAttributes: true,
    objectSchemaId:    source.schema,
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
      req.on('error',   () => resolve({ status: 0, data: { values: [] } }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: { values: [] } }); });
      req.write(body); req.end();
    });

    if (result.status === 429) {
      const wait = 1000 * Math.pow(2, attempt);
      console.warn(`[sync:servers] 429 on range ${lo}-${hi}, waiting ${wait}ms...`);
      await sleep(wait);
      continue;
    }
    return result;
  }
  return { status: 429, data: { values: [] } };
}

// ── Parse object → site ───────────────────────────────────────────────────────
function objectSite(obj, source) {
  let rack = '', region = '', active = null, assetType = '';
  for (const a of (obj.attributes || [])) {
    const id  = String(a.objectTypeAttributeId);
    const val = (a.objectAttributeValues || [])[0];
    const v   = val ? (val.displayValue || val.value || '') : '';
    if (id === source.attrRack)                    rack      = String(v);
    if (id === source.attrRegion)                  region    = String(v);
    if (id === source.attrActive)                  active    = String(v).toLowerCase() === 'true';
    if (source.attrType && id === source.attrType) assetType = String(v).toLowerCase();
  }
  if (source.attrType && assetType !== 'server') return null;
  if (active === false) return null;
  return siteFromRack(rack) || (region ? RACK_OVERRIDES[region.trim()] : null);
}

// ── Scan one source via objectId ranges ───────────────────────────────────────
async function scanSource(auth, source, siteCounts, onProgress) {
  const ranges = [];
  for (let lo = source.rangeStart; lo <= source.rangeEnd; lo += source.chunk) {
    ranges.push(lo);
  }

  const total   = ranges.length;
  let counted   = 0;
  let done      = 0;

  console.log(`[sync:servers] ${source.name}: scanning ${total.toLocaleString()} chunks (IDs ${source.rangeStart}-${source.rangeEnd}, chunk=${source.chunk})`);

  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async lo => {
      const hi = lo + source.chunk - 1;
      const r  = await queryRange(auth, source, lo, hi);
      if (r.status === 200) {
        for (const obj of (r.data.values || [])) {
          const site = objectSite(obj, source);
          if (site) { siteCounts[site] = (siteCounts[site] || 0) + 1; counted++; }
        }
      }
      done++;
    }));

    // Progress every 5%
    if (done % Math.max(1, Math.floor(total / 20)) === 0 || done === total) {
      const pct     = Math.round(done / total * 100);
      const running = Object.values(siteCounts).reduce((a, b) => a + b, 0);
      console.log(`[sync:servers] ${source.name}: ${pct}% (${done}/${total} chunks, ${counted.toLocaleString()} servers)`);
      onProgress?.({ done, total, servers: running, status: `Scanning ${source.name}...` });
    }

    await sleep(INTER_DELAY);
  }

  console.log(`[sync:servers] ${source.name}: ✓ ${counted.toLocaleString()} active servers`);
  return counted;
}

// ── DB ────────────────────────────────────────────────────────────────────────
const upsertServerCount = db.prepare(
  `INSERT OR REPLACE INTO server_counts (site, count, synced_at) VALUES (@site, @count, @synced_at)`
);
const upsertMany = db.transaction(rows => { for (const r of rows) upsertServerCount.run(r); });

// ── Main ──────────────────────────────────────────────────────────────────────
async function syncServers(onProgress) {
  console.log(`[sync:servers] ════════════════════════════════════════════`);
  console.log(`[sync:servers] Starting server sync — objectId range method`);
  console.log(`[sync:servers] POST /object/aql pagination confirmed broken — using range queries`);

  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('ASSETS_CLIENT_ID and ASSETS_CLIENT_SECRET required');

  const basicToken = getBasicToken();
  const now        = new Date().toISOString();
  const logRow     = db.prepare(`INSERT INTO sync_log (type, status, started_at) VALUES ('servers', 'running', ?)`).run(now);
  const logId      = logRow.lastInsertRowid;

  const siteCounts = {};
  let grandTotal   = 0;

  try {
    for (const source of SOURCES) {
      const auth = source.auth === 'oauth' ? await getOAuthToken() : basicToken;
      if (source.auth === 'oauth') console.log(`[sync:servers] OAuth token refreshed for ${source.name}`);
      const count = await scanSource(auth, source, siteCounts, onProgress);
      grandTotal += count;
    }

    const rows = Object.entries(siteCounts).map(([site, count]) => ({ site, count, synced_at: now }));
    upsertMany(rows);

    db.prepare(`UPDATE sync_log SET status='success', completed_at=?, records_synced=? WHERE id=?`)
      .run(new Date().toISOString(), grandTotal, logId);

    console.log(`[sync:servers] ════════════════════════════════════════════`);
    console.log(`[sync:servers] ✓ COMPLETE: ${grandTotal.toLocaleString()} active servers across ${rows.length} sites`);
    rows.sort((a, b) => b.count - a.count).slice(0, 15).forEach(r =>
      console.log(`[sync:servers]   ${r.site.padEnd(12)} ${r.count.toLocaleString()}`)
    );
    console.log(`[sync:servers] ════════════════════════════════════════════`);

    return { totalActive: grandTotal, sitesCount: rows.length };

  } catch (err) {
    db.prepare(`UPDATE sync_log SET status='error', completed_at=?, error=? WHERE id=?`)
      .run(new Date().toISOString(), err.message, logId);
    console.error('[sync:servers] ✗ Error:', err.message);
    throw err;
  }
}

module.exports = { syncServers };
