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
  try {
    // Apply dct_overrides — ensure people in override table are flagged as DCT
    try {
      db.prepare(`UPDATE employees SET is_dct = 1 WHERE name IN (SELECT name FROM dct_overrides) AND is_dct = 0`).run();
    } catch(e2) { /* table may not exist yet on old installs */ }

    const employees = db.prepare('SELECT * FROM employees ORDER BY name').all();
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
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
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
      LEFT JOIN (SELECT name, MIN(site) AS site FROM employees GROUP BY name) e ON t.assignee = e.name
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
      LEFT JOIN (SELECT name, MIN(site) AS site FROM employees GROUP BY name) e ON t.assignee = e.name
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
      LEFT JOIN (SELECT name, MIN(site) AS site FROM employees GROUP BY name) e ON t.assignee = e.name
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

// ── API: DCT Overrides — manual DCT designation regardless of title ───────────
app.get('/api/dct-overrides', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM dct_overrides ORDER BY name').all();
    res.json({ overrides: rows, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dct-overrides', (req, res) => {
  const { name, note, site } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    // Add to overrides table
    db.prepare(`INSERT OR REPLACE INTO dct_overrides (name, note) VALUES (?, ?)`).run(name, note || null);

    // Update existing employee record if present
    const updated = db.prepare(`UPDATE employees SET is_dct = 1 WHERE name = ?`).run(name);

    // If employee not in DB at all (not in Jira Assets), insert a manual record
    if (updated.changes === 0) {
      if (!site) return res.status(400).json({ error: `"${name}" not found in employees DB — provide site to create manually` });
      db.prepare(`
        INSERT OR IGNORE INTO employees (name, site, is_dct, is_active, title, synced_at)
        VALUES (?, ?, 1, 1, 'Manual Override (not in Jira Assets)', datetime('now'))
      `).run(name, site);
      console.log(`[dct-override] Inserted manual employee record: ${name} → ${site}`);
    }

    res.json({ ok: true, name, site: site || 'existing record updated' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/dct-overrides/:name', (req, res) => {
  try {
    db.prepare(`DELETE FROM dct_overrides WHERE name = ?`).run(req.params.name);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
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

// ── Helpers ───────────────────────────────────────────────────────────────────
// Normalize a raw location string to a 6-char site code
// Handles US-HIO01/02/03 → US-HIO, US-WEST-07A → skip, etc.
const CLOSED_STATUSES = `('Closed','Verification','Customer Verification','Done','Resolved','Completed','Cleaning Done','RMA')`;
const OPEN_STATUSES   = `('In Progress','Awaiting Support','On Hold','Waiting','Pending','Escalated','Reopened','New','To Do')`;

function normSite(raw) {
  if (!raw) return null;
  // Strip trailing 2-digit suffix: US-HIO01 → US-HIO, US-DTN01 → US-DTN
  const stripped = raw.replace(/\d{2}(-.*)?$/, '').trim();
  return stripped || null;
}

// ── API: MBR2 — summary KPIs ─────────────────────────────────────────────────
app.get('/api/mbr2/summary', (req, res) => {
  const { from, to, project = 'do' } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const isAll = project === 'all';
  const proj  = project.toLowerCase();
  const projClause = isAll ? '' : `AND project = '${proj}'`;
  try {
    const base = `FROM tickets WHERE SUBSTR(created_at,1,10) >= ? AND SUBSTR(created_at,1,10) <= ? ${projClause}`;
    const args = [from, to];

    const total   = db.prepare(`SELECT COUNT(*) n ${base}`).get(...args).n;
    const closed  = db.prepare(`SELECT COUNT(*) n ${base} AND status IN ${CLOSED_STATUSES}`).get(...args).n;
    const onHold  = db.prepare(`SELECT COUNT(*) n ${base} AND status = 'On Hold'`).get(...args).n;
    const inProg  = db.prepare(`SELECT COUNT(*) n ${base} AND status = 'In Progress'`).get(...args).n;
    const verif   = db.prepare(`SELECT COUNT(*) n ${base} AND status IN ('Verification','Customer Verification')`).get(...args).n;

    const mttr = db.prepare(`
      SELECT AVG(CAST((julianday(SUBSTR(resolved_at,1,19)) - julianday(SUBSTR(created_at,1,19))) * 24 AS REAL)) avg_hours
      FROM tickets
      WHERE SUBSTR(created_at,1,10) >= ? AND SUBSTR(created_at,1,10) <= ? ${projClause}
        AND resolved_at IS NOT NULL AND resolved_at != ''
        AND status IN ${CLOSED_STATUSES}
    `).get(...args);

    const avgOpen = db.prepare(`
      SELECT AVG(CAST((julianday('now') - julianday(SUBSTR(created_at,1,10))) AS REAL)) avg_days
      FROM tickets
      WHERE SUBSTR(created_at,1,10) >= ? AND SUBSTR(created_at,1,10) <= ? ${projClause}
        AND status NOT IN ${CLOSED_STATUSES}
    `).get(...args);

    res.json({
      total, closed, onHold, inProg, verif,
      closeRate: total > 0 ? Math.round(closed / total * 100) : 0,
      mttrHours: mttr?.avg_hours ? Math.round(mttr.avg_hours * 10) / 10 : null,
      avgOpenDays: avgOpen?.avg_days ? Math.round(avgOpen.avg_days * 10) / 10 : null,
      from, to, project: proj,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── API: MBR2 — site breakdown with MoM ──────────────────────────────────────
app.get('/api/mbr2/sites', (req, res) => {
  const { from, to, prev_from, prev_to, project = 'do' } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const isAll = project === 'all';
  const proj  = project.toLowerCase();
  const projClause = isAll ? '' : `AND t.project = '${proj}'`;
  // Build site query — bake all values into SQL to avoid parameterized binding issues
  const makeSiteSql = (f, t) => `
    SELECT
      CASE
        WHEN t.location GLOB '*[0-9][0-9]' THEN SUBSTR(t.location, 1, LENGTH(t.location)-2)
        ELSE COALESCE(t.location, e.site)
      END AS site,
      COUNT(*) AS total,
      SUM(CASE WHEN t.status IN ${CLOSED_STATUSES} THEN 1 ELSE 0 END) AS closed,
      SUM(CASE WHEN t.status = 'On Hold' THEN 1 ELSE 0 END) AS on_hold,
      SUM(CASE WHEN t.status NOT IN ${CLOSED_STATUSES} THEN 1 ELSE 0 END) AS open,
      AVG(CASE WHEN t.status IN ${CLOSED_STATUSES} AND t.resolved_at IS NOT NULL
        THEN CAST((julianday(SUBSTR(t.resolved_at,1,19)) - julianday(SUBSTR(t.created_at,1,19))) * 24 AS REAL)
        ELSE NULL END) AS avg_mttr_hours
    FROM tickets t
    LEFT JOIN (SELECT name, MIN(site) AS site FROM employees GROUP BY name) e ON t.assignee = e.name
    WHERE SUBSTR(t.created_at,1,10) >= '${f}'
      AND SUBSTR(t.created_at,1,10) <= '${t}'
      ` + projClause + `
      AND (t.location IS NOT NULL AND t.location != '' OR e.site IS NOT NULL)
    GROUP BY site
    HAVING site IS NOT NULL
    ORDER BY closed DESC`;

  const toMap = rows => {
    const map = {};
    rows.forEach(r => { if (r.site) map[r.site] = r; });
    return map;
  };

  try {
    const curr = toMap(db.prepare(makeSiteSql(from, to)).all());
    const prev = prev_from && prev_to ? toMap(db.prepare(makeSiteSql(prev_from, prev_to)).all()) : {};

    // Build combined list
    const allSites = [...new Set([...Object.keys(curr), ...Object.keys(prev)])];
    const sites = allSites.map(site => {
      const c = curr[site] || { total:0, closed:0, on_hold:0, open:0, avg_mttr_hours:null };
      const p = prev[site] || { total:0, closed:0 };
      const momPct = p.closed > 0 ? Math.round((c.closed - p.closed) / p.closed * 100) : null;
      return {
        site,
        curr: { total: c.total, closed: c.closed, on_hold: c.on_hold, open: c.open, mttr: c.avg_mttr_hours ? Math.round(c.avg_mttr_hours * 10)/10 : null },
        prev: { total: p.total, closed: p.closed },
        mom_pct: momPct,
        mom_delta: c.closed - p.closed,
      };
    }).sort((a,b) => b.curr.closed - a.curr.closed);

    res.json({ sites, total: sites.length, from, to });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── API: MBR2 — monthly trends (last N months) ───────────────────────────────
app.get('/api/mbr2/trends', (req, res) => {
  const { months = 6, project = 'do' } = req.query;
  const isAll = project === 'all';
  const proj  = project.toLowerCase();
  const n = Math.min(parseInt(months) || 6, 18);
  const projClause = isAll ? '' : "AND project = '" + proj + "'";
  try {
    const sql = `
      SELECT
        SUBSTR(created_at, 1, 7) AS month,
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ${CLOSED_STATUSES} THEN 1 ELSE 0 END) AS closed,
        SUM(CASE WHEN status = 'On Hold' THEN 1 ELSE 0 END) AS on_hold,
        SUM(CASE WHEN status NOT IN ${CLOSED_STATUSES} THEN 1 ELSE 0 END) AS open,
        AVG(CASE WHEN status IN ${CLOSED_STATUSES} AND resolved_at IS NOT NULL
          THEN CAST((julianday(SUBSTR(resolved_at,1,19)) - julianday(SUBSTR(created_at,1,19)))*24 AS REAL)
          ELSE NULL END) AS avg_mttr_hours
      FROM tickets
      WHERE SUBSTR(created_at,1,10) >= date('now', ?) ` + projClause + `
      GROUP BY month
      ORDER BY month ASC`;
    const rows = db.prepare(sql).all(`-${n} months`);
    res.json({ months: rows, project: proj });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── API: MBR2 — status time breakdown ────────────────────────────────────────
app.get('/api/mbr2/status-time', (req, res) => {
  const { from, to, project = 'do' } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const isAll = project === 'all';
  const proj  = project.toLowerCase();
  const projClause = isAll ? '' : `AND project = '${proj}'`;
  try {
    const statusSql = `
      SELECT status, COUNT(*) AS n,
        AVG(CASE
          WHEN sla_seconds IS NOT NULL THEN sla_seconds / 3600.0
          WHEN resolved_at IS NOT NULL THEN CAST((julianday(SUBSTR(resolved_at,1,19)) - julianday(SUBSTR(created_at,1,19)))*24 AS REAL)
          ELSE CAST((julianday('now') - julianday(SUBSTR(created_at,1,10)))*24 AS REAL)
        END) AS avg_hours
      FROM tickets
      WHERE SUBSTR(created_at,1,10) >= ? AND SUBSTR(created_at,1,10) <= ? ` + projClause + `
      GROUP BY status ORDER BY n DESC`;
  const rows = db.prepare(statusSql).all(from, to);
    res.json({ statuses: rows, from, to });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/mbr2', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'mbr2.html'));
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
