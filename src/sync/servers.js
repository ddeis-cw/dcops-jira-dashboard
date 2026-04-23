/**
 * src/sync/servers.js
 * Counts active servers per site from individual snipe-it schemas.
 * Uses objectId range chunking with Basic auth (JIRA_TOKEN).
 * Schema 127 (consolidated) requires OAuth — not accessible with Basic auth.
 */
'use strict';

const https = require('https');
const db    = require('../db');

const CLOUD_ID = process.env.JIRA_CLOUD_ID   || '0b202827-7a05-4ef3-94f5-056caea69699';
const WS       = process.env.ASSETS_WORKSPACE || '546fdb12-9ec4-464d-833f-61a727f3a5fb';
const HOST     = 'api.atlassian.com';
const BASE     = `/ex/jira/${CLOUD_ID}/jsm/assets/workspace/${WS}/v1`;
const CLIENT_ID     = process.env.ASSETS_CLIENT_ID;
const CLIENT_SECRET = process.env.ASSETS_CLIENT_SECRET;
const CONCURRENCY = 8;

// Each schema has its own server typeId and attribute IDs.
// Attribute IDs were discovered via debug-assets.js diagnostics.
const SCHEMAS = [
  // chunk=2000 → 932 chunks for schema 10. AQL cap=25/query, avg density ~88/2000 IDs → safe.
  // chunk=250 keeps expected results ~22/query, safely under the 25 AQL cap
  { id:'10',  name:'coreweave',      serverType:96,  attrRack:'904',  attrActive:'1069', attrRegion:'898',  rangeStart:87000, rangeEnd:1950000, chunk:250 },
  { id:'16',  name:'albatross',      serverType:100, attrRack:'943',  attrActive:'953',  attrRegion:'955',  rangeStart:1000,  rangeEnd:350000,  chunk:100 },
  { id:'20',  name:'eagle',          serverType:118, attrRack:'1102', attrActive:'1112', attrRegion:'1114', rangeStart:1000,  rangeEnd:200000,  chunk:100 },
  { id:'25',  name:'phoenix',        serverType:135, attrRack:'1242', attrActive:'1252', attrRegion:'1254', rangeStart:1000,  rangeEnd:400000,  chunk:100 },
  { id:'26',  name:'snipecustomer',  serverType:146, attrRack:'1346', attrActive:'1356', attrRegion:'1358', rangeStart:1000,  rangeEnd:200000,  chunk:100 },
];

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
  if (/pallet|broken/i.test(rack)) return null;
  const t = rack.trim();
  if (RACK_OVERRIDES[t]) return RACK_OVERRIDES[t];
  const p = t.split('.')[0];
  if (RACK_OVERRIDES[p]) return RACK_OVERRIDES[p];
  if (SKIP.has(p)) return null;
  const m = p.match(/^([A-Z]{2}-[A-Z0-9]{2,5})\d{2}(-.*)?$/);
  return m ? m[1] : null;
}

function getAuthHeader() {
  if (process.env.JIRA_EMAIL && process.env.JIRA_TOKEN)
    return Promise.resolve('Basic ' + Buffer.from(process.env.JIRA_EMAIL + ':' + process.env.JIRA_TOKEN).toString('base64'));
  return new Promise((resolve, reject) => {
    const body = 'grant_type=client_credentials';
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const req = https.request({ hostname:'auth.atlassian.com', port:443, path:'/oauth/token', method:'POST',
      headers:{'Authorization':'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','Content-Length':Buffer.byteLength(body)}
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{ const j=JSON.parse(d); if(j.access_token) resolve('Bearer '+j.access_token); else reject(new Error(j.error_description||d)); }catch(e){reject(e);} }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

function aqlPost(auth, payload) {
  const body = JSON.stringify(payload);
  return new Promise(resolve => {
    const req = https.request({ hostname:HOST, port:443, path:`${BASE}/object/aql`, method:'POST',
      headers:{'Accept':'application/json','Content-Type':'application/json','Authorization':auth,'Content-Length':Buffer.byteLength(body)}, timeout:30000
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve({status:res.statusCode,body:JSON.parse(d)});}catch(e){resolve({status:res.statusCode,body:{values:[]}});} }); });
    req.on('error', ()=>resolve({status:0,body:{values:[]}}));
    req.on('timeout', ()=>{ req.destroy(); resolve({status:0,body:{values:[]}}); });
    req.write(body); req.end();
  });
}

const upsertServerCount = db.prepare(`INSERT OR REPLACE INTO server_counts (site, count, synced_at) VALUES (@site, @count, @synced_at)`);
const upsertMany = db.transaction(rows => { for (const r of rows) upsertServerCount.run(r); });

async function syncServers(onProgress) {
  const useBasic = !!(process.env.JIRA_EMAIL && process.env.JIRA_TOKEN);
  console.log(`[sync:servers] Auth: ${useBasic ? 'Basic (JIRA_TOKEN)' : 'OAuth2'}`);
  const auth = await getAuthHeader();
  const now  = new Date().toISOString();
  const logRow = db.prepare(`INSERT INTO sync_log (type, status, started_at) VALUES ('servers', 'running', ?)`).run(now);
  const logId  = logRow.lastInsertRowid;

  const siteCounts = {};
  const gDone = { n: 0 };
  const gTotal = SCHEMAS.reduce((t,s) => t + Math.ceil((s.rangeEnd - s.rangeStart) / s.chunk), 0);

  try {
    for (const schema of SCHEMAS) {
      console.log(`[sync:servers] Scanning ${schema.name} (schema ${schema.id})...`);
      const offsets = [];
      for (let i = schema.rangeStart; i < schema.rangeEnd; i += schema.chunk) offsets.push(i);
      let localServers = 0;

      for (let bi = 0; bi < offsets.length; bi += CONCURRENCY) {
        const batch = offsets.slice(bi, bi + CONCURRENCY);
        await Promise.all(batch.map(async lo => {
          const hi = lo + schema.chunk - 1;
          const r  = await aqlPost(auth, {
            qlQuery:`objectTypeId = ${schema.serverType} AND objectId >= ${lo} AND objectId <= ${hi}`,
            maxResults:25, startAt:0, includeAttributes:true, objectSchemaId:schema.id,
          });
          if (r.status === 200 && r.body?.values) {
            for (const obj of r.body.values) {
              let rack='', region='', active=false;
              for (const a of (obj.attributes||[])) {
                const id = String(a.objectTypeAttributeId);
                const val = (a.objectAttributeValues||[])[0];
                const v = val ? (val.displayValue||val.value||'') : '';
                if (id===schema.attrRack)   rack   = String(v);
                if (id===schema.attrRegion) region = String(v);
                if (id===schema.attrActive) active = String(v).toLowerCase()==='true';
              }
              if (!active) continue;
              const site = siteFromRack(rack) || (region ? RACK_OVERRIDES[region.trim()] : null);
              if (site) { siteCounts[site] = (siteCounts[site]||0)+1; localServers++; }
            }
          }
          gDone.n++;
        }));
        if (gDone.n % (CONCURRENCY * 50) === 0) {
          const total = Object.values(siteCounts).reduce((a,b)=>a+b,0);
          onProgress?.({done:gDone.n, total:gTotal, servers:total, status:`Scanning ${schema.name}...`});
          console.log(`[sync:servers] ${schema.name} ${Math.round(gDone.n/gTotal*100)}% | ${total.toLocaleString()} servers`);
        }
      }
      console.log(`[sync:servers] ${schema.name}: ${localServers.toLocaleString()} active servers`);
    }

    const rows = Object.entries(siteCounts).map(([site,count]) => ({site, count, synced_at:now}));
    upsertMany(rows);
    const grandTotal = rows.reduce((a,r)=>a+r.count,0);
    db.prepare(`UPDATE sync_log SET status='success', completed_at=?, records_synced=? WHERE id=?`)
      .run(new Date().toISOString(), grandTotal, logId);
    console.log(`[sync:servers] ✓ ${grandTotal.toLocaleString()} active servers across ${rows.length} sites`);
    return { totalActive: grandTotal, sitesCount: rows.length };
  } catch (err) {
    db.prepare(`UPDATE sync_log SET status='error', completed_at=?, error=? WHERE id=?`)
      .run(new Date().toISOString(), err.message, logId);
    console.error('[sync:servers] ✗ Error:', err.message);
    throw err;
  }
}

module.exports = { syncServers };
