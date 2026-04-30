/**
 * src/sync/tickets.js
 * Syncs Jira tickets into SQLite with incremental updates.
 *
 * On first run: fetches all tickets matching the JQL window (default 365d).
 * On subsequent runs: fetches only tickets updated since the last successful sync.
 * Uses nextPageToken cursor pagination — safe for 100k+ ticket volumes.
 */

'use strict';

const https  = require('https');
const db     = require('../db');

const CLOUD_ID   = process.env.JIRA_CLOUD_ID  || '0b202827-7a05-4ef3-94f5-056caea69699';
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_TOKEN;
const PAGE_SIZE  = 100;

// Fields to fetch from Jira
const FIELDS = [
  'summary', 'assignee', 'reporter', 'status', 'priority',
  'issuetype', 'created', 'resolutiondate', 'updated',
  'customfield_11810',  // Asset LOC (rack location string)
  'customfield_10194',  // Asset DC
  'customfield_10020',  // SLA / MTTR
  'customfield_10016',  // Maintenance Type
].join(',');

const PROJECTS = [
  'service-desk-albatross',
  'service-desk-eagle',
  'service-desk-heron',
  'service-desk-osprey',
  'service-desk-phoenix',
  'service-desk-snipecustomer',
  'dct-ops',
];

// ── HTTP helper ───────────────────────────────────────────────────────────────
function jiraGet(path) {
  const auth = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.atlassian.com',
      port: 443,
      path: `/ex/jira/${CLOUD_ID}/rest/api/3${path}`,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': auth },
      timeout: 30000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { reject(new Error(`JSON parse error: ${d.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

// ── Known site codes ─────────────────────────────────────────────────────────
const KNOWN_SITES = new Set([
  'US-DTN','US-LZL','US-CSZ','US-EVI','US-SPK','US-DNN','US-ARQ','US-LAS',
  'US-PLZ','US-HIO','US-CVY','US-CDZ','CA-GAL','US-OBG','US-BVI','US-EWS',
  'US-CMH','US-PHX','US-AUS','US-RIN','US-LBB','US-WJQ','US-SVG','US-MKO',
  'US-HMN','US-NNN','US-QNC','US-RRX','US-LOE','US-AAI','US-LNB','US-CVG',
  'US-MSC','US-LHS','US-PPY','US-SKY','US-NKQ','US-LYF','US-WCI','US-DGV',
  'US-CLY','US-KWO','US-ABD','US-VO2',
  'ES-BCN','ES-AVQ','GB-PPL','GB-CWY','NO-OVO','NO-POR','SE-FAN','SE-SKH','DK-SVL',
]);

// DC alias → site code (customfield_10194 values)
const DC_ALIAS = {
  'las1':'US-LAS','las2':'US-LAS','las3':'US-LAS','lv1':'US-LAS','lv2':'US-LAS',
  '3pl':'US-DTN','dtw1':'US-DTN','dtw2':'US-DTN','dtn1':'US-DTN','dtn2':'US-DTN',
  'phx1':'US-PHX','phx2':'US-PHX',
  'sea1':'US-SPK','sea2':'US-SPK',
  'lax1':'US-CSZ','lax2':'US-CSZ',
  'atl1':'US-EVI','atl2':'US-EVI',
  'iad1':'US-CMH','iad2':'US-CMH',
};

// ── Location extraction ───────────────────────────────────────────────────────
function extractLocation(issue) {
  const f = issue.fields;

  // customfield_11810: Asset LOC — only trust if it resolves to a known site
  const assetLoc = f.customfield_11810;
  if (assetLoc) {
    const raw = Array.isArray(assetLoc) ? assetLoc[0] : String(assetLoc);
    const m   = raw.match(/^([A-Z]{2}-[A-Z]{2,4})\d*/);
    if (m && KNOWN_SITES.has(m[1])) return m[1];
  }

  // customfield_10194: Asset DC — alias map then direct site code
  const assetDC = f.customfield_10194;
  if (assetDC) {
    const raw = (Array.isArray(assetDC) ? assetDC[0] : (
      typeof assetDC === 'object' ? (assetDC.value || assetDC.label || '') : String(assetDC)
    )).trim();
    const mapped = DC_ALIAS[raw.toLowerCase()];
    if (mapped) return mapped;
    const m = raw.match(/^([A-Z]{2}-[A-Z]{2,4})\d*/);
    if (m && KNOWN_SITES.has(m[1])) return m[1];
  }

  return null;
}

// ── SLA extraction ────────────────────────────────────────────────────────────
function extractSla(issue) {
  const sla = issue.fields.customfield_10020;
  if (!sla) return null;
  if (sla.completedCycles?.length > 0) {
    return sla.completedCycles[0].elapsedTime?.millis
      ? Math.round(sla.completedCycles[0].elapsedTime.millis / 1000)
      : null;
  }
  // Wall-clock fallback
  if (issue.fields.resolutiondate && issue.fields.created) {
    const ms = new Date(issue.fields.resolutiondate) - new Date(issue.fields.created);
    return ms > 0 ? Math.round(ms / 1000) : null;
  }
  return null;
}

// ── Upsert ticket ─────────────────────────────────────────────────────────────
const upsertTicket = db.prepare(`
  INSERT OR REPLACE INTO tickets (
    key, project, summary, assignee, assignee_email, reporter,
    status, issue_type, priority, location, maintenance_type,
    sla_seconds, created_at, updated_at, resolved_at
  ) VALUES (
    @key, @project, @summary, @assignee, @assignee_email, @reporter,
    @status, @issue_type, @priority, @location, @maintenance_type,
    @sla_seconds, @created_at, @updated_at, @resolved_at
  )
`);

function mapIssue(issue) {
  const f = issue.fields;
  return {
    key:              issue.key,
    project:          issue.key.split('-')[0].toLowerCase(),
    summary:          f.summary || '',
    assignee:         f.assignee?.displayName || null,
    assignee_email:   f.assignee?.emailAddress || null,
    reporter:         f.reporter?.displayName || null,
    status:           f.status?.name || null,
    issue_type:       f.issuetype?.name || null,
    priority:         f.priority?.name || null,
    location:         extractLocation(issue),
    maintenance_type: f.customfield_10016?.value || null,
    sla_seconds:      extractSla(issue),
    created_at:       f.created,
    updated_at:       f.updated,
    resolved_at:      f.resolutiondate || null,
    // raw_json removed — not needed, saves ~1GB of DB space
  };
}

const upsertMany = db.transaction(issues => {
  for (const issue of issues) upsertTicket.run(mapIssue(issue));
});

// ── Main sync ─────────────────────────────────────────────────────────────────
async function syncTickets(onProgress) {
  if (!JIRA_EMAIL || !JIRA_TOKEN) throw new Error('JIRA_EMAIL and JIRA_TOKEN are required');

  // Find last successful sync cursor
  const lastSync = db.prepare(`
    SELECT last_updated_cursor FROM sync_log
    WHERE type = 'tickets' AND status = 'success'
    ORDER BY id DESC LIMIT 1
  `).get();

  const isIncremental = !!lastSync?.last_updated_cursor;
  const cursor        = lastSync?.last_updated_cursor;

  // Build JQL
  let jql;
  if (isIncremental) {
    // Format cursor for Jira: "2026-04-21T08:00:00.000+0000" → "2026-04-21 08:00"
    const dt = new Date(cursor);
    const jiraDate = dt.toISOString().replace('T', ' ').slice(0, 16);
    jql = `project IN (${PROJECTS.join(',')}) AND updated >= "${jiraDate}" ORDER BY updated ASC`;    console.log(`[sync:tickets] Incremental sync from ${cursor}`);
  } else {
    jql = `project IN (${PROJECTS.join(',')}) AND updated >= -365d ORDER BY updated ASC`;
    console.log('[sync:tickets] Full sync (first run)');
  }

  // Log sync start
  const logRow = db.prepare(`
    INSERT INTO sync_log (type, status, started_at) VALUES ('tickets', 'running', ?)
  `).run(new Date().toISOString());
  const logId = logRow.lastInsertRowid;

  let totalSynced  = 0;
  let nextToken    = null;
  let latestUpdate = cursor || null;

  try {
    const encoded = encodeURIComponent(jql);

    // First page
    const first = await jiraGet(
      `/search/jql?jql=${encoded}&maxResults=${PAGE_SIZE}&fields=${FIELDS}`
    );
    if (first.status !== 200) throw new Error(`Jira returned HTTP ${first.status}`);

    const firstIssues = first.body.issues || first.body.values || [];
    if (firstIssues.length > 0) {
      upsertMany(firstIssues);
      totalSynced += firstIssues.length;
      latestUpdate = firstIssues[firstIssues.length - 1].fields.updated;
    }
    nextToken = first.body.nextPageToken || null;
    onProgress?.({ done: totalSynced, status: 'Syncing tickets...' });

    // Paginate
    while (nextToken) {
      const page = await jiraGet(
        `/search/jql?jql=${encoded}&maxResults=${PAGE_SIZE}&fields=${FIELDS}&nextPageToken=${encodeURIComponent(nextToken)}`
      );
      if (page.status === 429) {
        const wait = parseInt(page.body['retry-after'] || '10') * 1000;
        console.log(`[sync:tickets] Rate limited, waiting ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (page.status !== 200) throw new Error(`Jira returned HTTP ${page.status}`);

      const issues = page.body.issues || page.body.values || [];
      if (issues.length > 0) {
        upsertMany(issues);
        totalSynced += issues.length;
        latestUpdate = issues[issues.length - 1].fields.updated;
      }

      nextToken = (page.body.isLast || !page.body.nextPageToken) ? null : page.body.nextPageToken;
      onProgress?.({ done: totalSynced, status: 'Syncing tickets...' });
    }

    // Mark success
    db.prepare(`
      UPDATE sync_log SET status = 'success', completed_at = ?, records_synced = ?, last_updated_cursor = ?
      WHERE id = ?
    `).run(new Date().toISOString(), totalSynced, latestUpdate, logId);

    console.log(`[sync:tickets] ✓ ${isIncremental ? 'Incremental' : 'Full'} sync complete — ${totalSynced} tickets`);
    return { totalSynced, isIncremental };

  } catch (err) {
    db.prepare(`
      UPDATE sync_log SET status = 'error', completed_at = ?, error = ?
      WHERE id = ?
    `).run(new Date().toISOString(), err.message, logId);
    console.error('[sync:tickets] ✗ Error:', err.message);
    throw err;
  }
}

module.exports = { syncTickets };
