/**
 * src/sync/index.js
 * Orchestrates all sync jobs. Can be run standalone or imported by server.js.
 *
 * Schedules:
 *   Tickets   — every 30 minutes (incremental after first run)
 *   Employees — every Sunday at 2am (Assets data changes slowly)
 *   Servers   — every Sunday at 3am (takes ~15 min to run)
 */

'use strict';

const cron = require('node-cron');
const { syncTickets }   = require('./tickets');
const { syncEmployees } = require('./employees');
const { syncServers }   = require('./servers');

// Active sync state — prevents concurrent runs of the same type
const running = { tickets: false, employees: false, servers: false };

async function runSync(type, fn, onProgress) {
  if (running[type]) {
    console.log(`[sync] ${type} sync already in progress — skipping`);
    return null;
  }
  running[type] = true;
  try {
    const result = await fn(onProgress);
    return result;
  } finally {
    running[type] = false;
  }
}

function startScheduler() {
  // Tickets: every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    console.log('[sync] Scheduled ticket sync starting...');
    runSync('tickets', syncTickets).catch(e => console.error('[sync] Ticket sync failed:', e.message));
  });

  // Employees: every Sunday at 2am
  cron.schedule('0 2 * * 0', () => {
    console.log('[sync] Scheduled employee sync starting...');
    runSync('employees', syncEmployees).catch(e => console.error('[sync] Employee sync failed:', e.message));
  });

  // Servers: every Sunday at 3am
  cron.schedule('0 3 * * 0', () => {
    console.log('[sync] Scheduled server sync starting...');
    runSync('servers', syncServers).catch(e => console.error('[sync] Server sync failed:', e.message));
  });

  console.log('[sync] Scheduler started — tickets every 30min, employees/servers weekly');
}

module.exports = { runSync, startScheduler, syncTickets, syncEmployees, syncServers };

// Allow running directly: node src/sync/index.js [tickets|employees|servers|all]
if (require.main === module) {
  require('dotenv').config();
  const target = process.argv[2] || 'all';
  (async () => {
    const progress = d => process.stdout.write(`\r  ${d.status || ''} ${d.done || 0}${d.total ? '/' + d.total : ''}`);
    if (target === 'all' || target === 'tickets')   await runSync('tickets',   syncTickets,   progress);
    if (target === 'all' || target === 'employees') await runSync('employees', syncEmployees, progress);
    if (target === 'all' || target === 'servers')   await runSync('servers',   syncServers,   progress);
    console.log('\n[sync] Done.');
    process.exit(0);
  })().catch(e => { console.error(e.message); process.exit(1); });
}
