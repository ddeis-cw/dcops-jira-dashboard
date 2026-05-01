/**
 * src/server.js
 * DCOPS Jira Dashboard — Express API server.
 *
 * Serves:
 *   /api/*        REST API — ticket data, sync status, trigger syncs
 *   /*            Static React dashboard (built files in /public)
 *
 * No proxy needed — all Jira/Assets calls are made server-side.
 */

'use strict';

require('dotenv').config();

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const db      = require('./db');
const { runSync, startScheduler, syncTickets, syncEmployees, syncServers } = require('./sync/index');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static dashboard files
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API: Status ───────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  const ticketCount   = db.prepare('SELECT COUNT(*) as n FROM tickets').get().n;
  const employeeCount = db.prepare('SELECT COUNT(*) as n FROM employees').get().n;
  const serverTotal   = db.prepare('SELECT SUM(count) as n FROM server_counts').get().n || 0;
  const siteCount     = db.prepare('SELECT COUNT(DISTINCT location) as n FROM tickets WHERE location IS NOT NULL').get().n;

  const lastSync = type => db.prepare(`
    SELECT status, completed_at, records_synced, error FROM sync_log
    WHERE type = ? ORDER BY id DESC LIMIT 1
  `).get(type);

  const activeSyncs = db.prepare(`
    SELECT type FROM sync_log WHERE status = 'running' ORDER BY started_at DESC
  `).all().map(r => r.type);

  res.json({
    tickets:      { count: ticketCount,   lastSync: lastSync('tickets') },
    employees:    { count: employeeCount, lastSync: lastSync('employees') },
    servers:      { total: serverTotal,   lastSync: lastSync('servers') },
    sites:        { count: siteCount },
    activeSyncs,
  });
});

// ── API: Tickets ──────────────────────────────────────────────────────────────
// Paginated — use ?page=0&limit=1000 to walk through all tickets.
// The dashboard fetches all pages sequentially on load.
app.get('/api/tickets', (req, res) => {
  const { project, page = 0, limit = 2000, date_from, date_to, date_field = 'created_at' } = req.query;
  const offset = parseInt(page) * parseInt(limit);
  const col    = ['created_at','resolved_at','updated_at'].includes(date_field) ? date_field : 'created_at';

  let countSql = 'SELECT COUNT(*) as n FROM tickets WHERE 1=1';
  let dataSql  = 'SELECT key, project, summary, assignee, status, issue_type, priority, location, maintenance_type, sla_seconds, created_at, updated_at, resolved_at FROM tickets WHERE 1=1';
  const args   = [];

  if (project) {
    countSql += ' AND project = ?';
    dataSql  += ' AND project = ?';
    args.push(project);
  }
  if (date_from) {
    countSql += ` AND ${col} >= ?`;
    dataSql  += ` AND ${col} >= ?`;
    args.push(date_from);
  }
  if (date_to) {
    countSql += ` AND ${col} <= ?`;
    dataSql  += ` AND ${col} <= ?`;
    args.push(date_to + 'T23:59:59');
  }

  dataSql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  try {
    const total   = db.prepare(countSql).get(...args).n;
    const tickets = db.prepare(dataSql).all(...args, parseInt(limit), offset);
    const hasMore = offset + tickets.length < total;

    res.json({ tickets, total, page: parseInt(page), limit: parseInt(limit), hasMore });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Employees ────────────────────────────────────────────────────────────
app.get('/api/employees', (req, res) => {
  const employees = db.prepare('SELECT * FROM employees ORDER BY name').all();
  // Return as { "Name": "US-DTN" } map for dashboard compatibility
  const map = {};
  const dctSet = [];
  const dctBySite = {};
  for (const e of employees) {
    if (e.site) {
      map[e.name] = e.site;
      if (e.is_dct) {
        dctSet.push(e.name);
        dctBySite[e.site] = (dctBySite[e.site] || 0) + 1;
      }
    }
  }
  res.json({ employees: map, dctList: dctSet, dctBySite, total: employees.length });
});

// ── API: Servers ──────────────────────────────────────────────────────────────
app.get('/api/servers', (req, res) => {
  const counts = db.prepare('SELECT * FROM server_counts ORDER BY count DESC').all();
  // Return as { "US-DTN": 9543 } map for dashboard compatibility
  const map = {};
  for (const s of counts) map[s.site] = s.count;
  res.json({ servers: map, total: counts.reduce((a, s) => a + s.count, 0), sites: counts.length });
});

// ── API: Sites ────────────────────────────────────────────────────────────────
app.get('/api/sites', (req, res) => {
  const sites = db.prepare(`
    SELECT
      t.location                       AS site,
      COUNT(*)                         AS ticket_count,
      COUNT(DISTINCT t.assignee)       AS assignee_count,
      e.employee_count,
      e.dct_count,
      s.count                          AS server_count
    FROM tickets t
    LEFT JOIN (
      SELECT site, COUNT(*) AS employee_count, SUM(is_dct) AS dct_count
      FROM employees GROUP BY site
    ) e ON e.site = t.location
    LEFT JOIN server_counts s ON s.site = t.location
    WHERE t.location IS NOT NULL
    GROUP BY t.location
    ORDER BY ticket_count DESC
  `).all();
  res.json({ sites, total: sites.length });
});

// ── API: Tickets by site+project (uses employee site as fallback location) ───
app.get('/api/tickets/by-site-project', (req, res) => {
  const { date_from, date_to, date_field = 'created_at' } = req.query;
  const col = ['created_at','resolved_at'].includes(date_field) ? date_field : 'created_at';

  const args = [];
  let where = `WHERE t.status IN ('Closed','Done','Resolved','Completed')
    AND (t.location IS NOT NULL OR e.site IS NOT NULL)`;

  if (date_from) { where += ` AND t.${col} >= ?`; args.push(date_from); }
  if (date_to)   { where += ` AND t.${col} <= ?`; args.push(date_to + 'T23:59:59'); }

  try {
    const rows = db.prepare(`
      SELECT
        CASE
          WHEN COALESCE(CASE WHEN t.location IS NOT NULL AND t.location != '' THEN t.location END, e.site) GLOB '*[0-9][0-9]'
          THEN SUBSTR(COALESCE(CASE WHEN t.location IS NOT NULL AND t.location != '' THEN t.location END, e.site), 1, LENGTH(COALESCE(CASE WHEN t.location IS NOT NULL AND t.location != '' THEN t.location END, e.site))-2)
          ELSE COALESCE(CASE WHEN t.location IS NOT NULL AND t.location != '' THEN t.location END, e.site)
        END AS site,
        t.project,
        COUNT(*) AS n
      FROM tickets t
      LEFT JOIN employees e ON t.assignee = e.name
      ${where}
      GROUP BY site, t.project
      ORDER BY n DESC
    `).all(...args);

    // Pivot into { site: { project: count } } map
    const map = {};
    rows.forEach(r => {
      if (!r.site) return;
      const site = r.site;
      if (!map[site]) map[site] = {};
      map[site][r.project] = (map[site][r.project] || 0) + r.n;
    });

    res.json({ data: map, total: Object.keys(map).length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Trends — bucketed ticket counts by site+project+time ────────────────
// ── API: Open tickets — by site and by assignee ───────────────────────────────
// Returns open/on-hold/pending-verification tickets with age stats
app.get('/api/tickets/open', (req, res) => {
  const OPEN_STATUSES = `('Open','In Progress','On Hold','Waiting for Customer','Pending Verification',
    'Reopened','New','To Do','In Review','Waiting','Pending','Escalated')`;

  try {
    // By site
    const bySite = db.prepare(`
      SELECT
        CASE
          WHEN t.location GLOB '*[0-9][0-9]' THEN SUBSTR(t.location, 1, LENGTH(t.location)-2)
          ELSE COALESCE(t.location, e.site)
        END AS site,
        t.status,
        COUNT(*) AS n,
        AVG(CAST((julianday('now') - julianday(SUBSTR(t.created_at,1,10))) AS REAL)) AS avg_age_days,
        MAX(CAST((julianday('now') - julianday(SUBSTR(t.created_at,1,10))) AS REAL)) AS max_age_days
      FROM tickets t
      LEFT JOIN employees e ON t.assignee = e.name
      WHERE LOWER(t.status) NOT IN ('closed','done','resolved','completed','cancelled','canceled')
        AND t.status IS NOT NULL AND t.status != ''
      GROUP BY site, t.status
      ORDER BY site, n DESC
    `).all();

    // By assignee — closed count (last 30d) + open breakdown
    const byAssignee = db.prepare(`
      SELECT
        t.assignee,
        SUM(CASE WHEN LOWER(t.status) IN ('closed','done','resolved','completed')
              AND t.resolved_at >= date('now','-30 days') THEN 1 ELSE 0 END) AS closed_30d,
        SUM(CASE WHEN LOWER(t.status) NOT IN ('closed','done','resolved','completed','cancelled','canceled')
              AND t.status IS NOT NULL AND t.status != '' THEN 1 ELSE 0 END) AS open_total,
        SUM(CASE WHEN LOWER(t.status) IN ('on hold') THEN 1 ELSE 0 END) AS on_hold,
        SUM(CASE WHEN LOWER(t.status) IN ('waiting for customer','pending verification','waiting','pending')
              THEN 1 ELSE 0 END) AS pending_verification,
        SUM(CASE WHEN LOWER(t.status) IN ('in progress','in review') THEN 1 ELSE 0 END) AS in_progress,
        AVG(CASE WHEN LOWER(t.status) NOT IN ('closed','done','resolved','completed','cancelled','canceled')
              AND t.status IS NOT NULL AND t.status != ''
              THEN CAST((julianday('now') - julianday(SUBSTR(t.created_at,1,10))) AS REAL)
              ELSE NULL END) AS avg_open_age_days
      FROM tickets t
      WHERE t.assignee IS NOT NULL AND t.assignee != '' AND t.assignee != 'Unassigned'
      GROUP BY t.assignee
      HAVING open_total > 0 OR closed_30d > 0
      ORDER BY open_total DESC
    `).all();

    // Pivot bySite into map
    const siteMap = {};
    bySite.forEach(r => {
      if (!r.site) return;
      if (!siteMap[r.site]) siteMap[r.site] = { total: 0, avg_age: 0, statuses: {} };
      siteMap[r.site].statuses[r.status] = r.n;
      siteMap[r.site].total += r.n;
      siteMap[r.site].avg_age = Math.round(r.avg_age_days || 0);
      siteMap[r.site].max_age = Math.round(r.max_age_days || 0);
    });

    res.json({ bySite: siteMap, byAssignee });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/trends', (req, res) => {
  const { window: win = '30d' } = req.query;
  const windowMap = {
    '1d':   { days: 1,   bucket: '%Y-%m-%d %H:00' },
    '7d':   { days: 7,   bucket: '%Y-%m-%d'        },
    '30d':  { days: 30,  bucket: '%Y-%m-%d'        },
    '60d':  { days: 60,  bucket: '%Y-%m-%d'        },
    '90d':  { days: 90,  bucket: '%Y-%m-%W'        },
    '180d': { days: 180, bucket: '%Y-%m-%W'        },
    '365d': { days: 365, bucket: '%Y-%m'           },
  };
  const cfg   = windowMap[win] || windowMap['30d'];
  const since = new Date(Date.now() - cfg.days * 86400000).toISOString();
  try {
    const rows = db.prepare(`
      SELECT
        CASE
          WHEN COALESCE(CASE WHEN t.location IS NOT NULL AND t.location != '' THEN t.location END, e.site) GLOB '*[0-9][0-9]'
          THEN SUBSTR(COALESCE(CASE WHEN t.location IS NOT NULL AND t.location != '' THEN t.location END, e.site), 1, LENGTH(COALESCE(CASE WHEN t.location IS NOT NULL AND t.location != '' THEN t.location END, e.site))-2)
          ELSE COALESCE(CASE WHEN t.location IS NOT NULL AND t.location != '' THEN t.location END, e.site)
        END AS site,
        t.project,
        strftime(?, SUBSTR(t.created_at,1,19)) AS bucket,
        COUNT(*) AS n
      FROM tickets t
      LEFT JOIN employees e ON t.assignee = e.name
      WHERE t.created_at >= ?
        AND (t.location IS NOT NULL AND t.location != '' OR e.site IS NOT NULL)
      GROUP BY site, t.project, bucket
      HAVING bucket IS NOT NULL
      ORDER BY site, bucket
    `).all(cfg.bucket, since);

    const bucketSet = new Set(rows.map(r => r.bucket));
    const labels    = [...bucketSet].sort();
    const map = {};
    rows.forEach(r => {
      if (!r.site) return;
      if (!map[r.site]) map[r.site] = {};
      if (!map[r.site][r.project]) map[r.site][r.project] = {};
      map[r.site][r.project][r.bucket] = r.n;
    });
    const sites = {};
    Object.entries(map).forEach(([site, projects]) => {
      sites[site] = {};
      Object.entries(projects).forEach(([proj, buckets]) => {
        sites[site][proj] = labels.map(l => buckets[l] || 0);
      });
    });
    res.json({ sites, labels, window: win });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Sync triggers ────────────────────────────────────────────────────────
function triggerSync(type, fn) {
  return (req, res) => {
    // Check if already running
    const active = db.prepare(`
      SELECT id FROM sync_log WHERE type = ? AND status = 'running' LIMIT 1
    `).get(type);
    if (active) return res.status(409).json({ error: `${type} sync already in progress` });

    // Start async — respond immediately
    res.json({ message: `${type} sync started`, type });
    runSync(type, fn, d => {
      // Log every progress callback so docker compose logs shows real-time status
      if (d.status) console.log(`[sync:${type}] ${d.status}${d.servers ? ' | ' + d.servers.toLocaleString() + ' servers' : ''}${d.done && d.total ? ' (' + d.done + '/' + d.total + ' pages)' : ''}`);
    }).catch(e => console.error(`[sync:${type}] Error:`, e.message));
  };
}

app.post('/api/sync/tickets',   triggerSync('tickets',   syncTickets));
app.post('/api/sync/employees', triggerSync('employees', syncEmployees));
app.post('/api/sync/servers',   triggerSync('servers',   syncServers));

// Sync all three
app.post('/api/sync/all', async (req, res) => {
  res.json({ message: 'Full sync started (tickets → employees → servers)' });
  try {
    await runSync('tickets',   syncTickets);
    await runSync('employees', syncEmployees);
    await runSync('servers',   syncServers);
    console.log('[sync] Full sync complete');
  } catch(e) {
    console.error('[sync] Full sync error:', e.message);
  }
});

// ── API: Sync history ─────────────────────────────────────────────────────────
app.get('/api/sync/history', (req, res) => {
  const history = db.prepare(`
    SELECT * FROM sync_log ORDER BY id DESC LIMIT 50
  `).all();
  res.json({ history });
});

// ── Catch-all: serve React app ────────────────────────────────────────────────
// ── Jira API proxy for MBR dashboard ─────────────────────────────────────────
// MBRDashboard fetches Jira directly — proxy it server-side to avoid CORS
// and inject auth. Forwards /rest/api/* → Jira Cloud.
app.use('/rest', (req, res) => {
  const https    = require('https');
  const cloudId  = process.env.JIRA_CLOUD_ID;
  const auth     = 'Basic ' + Buffer.from(
    process.env.JIRA_EMAIL + ':' + process.env.JIRA_TOKEN
  ).toString('base64');
  const target   = `https://api.atlassian.com/ex/jira/${cloudId}${req.originalUrl}`;
  const opts     = require('url').parse(target);
  opts.method    = req.method;
  opts.headers   = { 'Authorization': auth, 'Accept': 'application/json', 'Content-Type': 'application/json' };
  const proxy    = https.request(opts, r => {
    res.status(r.statusCode);
    r.pipe(res, { end: true });
  });
  proxy.on('error', e => res.status(502).json({ error: e.message }));
  req.pipe(proxy, { end: true });
});

app.get('/mbr', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'mbr.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\nDCOPS Jira Dashboard`);
  console.log(`  Listening on  http://0.0.0.0:${PORT}`);
  console.log(`  Database      ${process.env.DB_PATH || 'data/dcops.db'}\n`);

  // Run VACUUM after migrations to reclaim space freed by dropping raw_json
  console.log('[server] Running VACUUM to reclaim disk space...');
  db.exec('VACUUM');
  console.log('[server] VACUUM complete');

  const ticketCount = db.prepare('SELECT COUNT(*) as n FROM tickets').get().n;

  if (ticketCount === 0) {
    console.log('[server] No tickets found — starting initial full sync...');
    console.log('[server] This will take 5-15 minutes on first run.\n');
    // Delay sync start by 2s to let the server fully initialize
    setTimeout(() => {
      runSync('tickets',   syncTickets).then(() =>
      runSync('employees', syncEmployees)).then(() =>
      runSync('servers',   syncServers)).catch(e =>
        console.error('[server] Initial sync error:', e.message)
      );
    }, 2000);
  } else {
    console.log(`[server] Database loaded — ${ticketCount.toLocaleString()} tickets ready`);
  }

  // Start scheduler with a 5-minute delay so startup completes first
  setTimeout(() => {
    startScheduler();
  }, 5 * 60 * 1000);

  console.log('[server] Ready — scheduler will start in 5 minutes\n');
});
