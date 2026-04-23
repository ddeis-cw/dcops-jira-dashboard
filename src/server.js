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
// Returns all tickets. Optional query params:
//   ?since=ISO_DATE  — only tickets updated after this date
//   ?project=X       — filter by project
app.get('/api/tickets', (req, res) => {
  const { since, project } = req.query;
  let sql    = 'SELECT * FROM tickets WHERE 1=1';
  const args = [];

  if (since) {
    sql += ' AND updated_at >= ?';
    args.push(since);
  }
  if (project) {
    sql += ' AND project = ?';
    args.push(project);
  }

  sql += ' ORDER BY created_at DESC';

  try {
    const tickets = db.prepare(sql).all(...args);
    // Parse raw_json back to object for each ticket (dashboard uses full fields)
    const parsed = tickets.map(t => {
      try { return { ...t, raw: JSON.parse(t.raw_json) }; }
      catch(e) { return t; }
    });
    res.json({ tickets: parsed, total: parsed.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Employees ────────────────────────────────────────────────────────────
app.get('/api/employees', (req, res) => {
  const employees = db.prepare('SELECT * FROM employees ORDER BY name').all();
  // Return as { "Name": "US-DTN" } map for dashboard compatibility
  const map = {};
  for (const e of employees) {
    if (e.site) map[e.name] = e.site;
  }
  res.json({ employees: map, total: employees.length });
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
      // Progress logged to server console only
      if (d.done % 500 === 0) console.log(`[sync:${type}] ${d.done}${d.total ? '/' + d.total : ''}`);
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
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\nDCOPS Jira Dashboard`);
  console.log(`  Listening on  http://0.0.0.0:${PORT}`);
  console.log(`  Database      ${process.env.DB_PATH || 'data/dcops.db'}\n`);

  // Start background sync scheduler
  startScheduler();

  // On first boot, run a full sync if no tickets exist yet
  const ticketCount = db.prepare('SELECT COUNT(*) as n FROM tickets').get().n;
  if (ticketCount === 0) {
    console.log('[server] No tickets found — starting initial full sync...');
    console.log('[server] This will take 5-15 minutes on first run.\n');
    runSync('tickets',   syncTickets).then(() =>
    runSync('employees', syncEmployees)).then(() =>
    runSync('servers',   syncServers)).catch(e =>
      console.error('[server] Initial sync error:', e.message)
    );
  } else {
    console.log(`[server] Database loaded — ${ticketCount.toLocaleString()} tickets ready`);
  }
});
