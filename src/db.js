/**
 * src/db.js
 * Initializes the SQLite database and runs any pending migrations.
 */

'use strict';

const Database = require('better-sqlite3');
const fs       = require('fs');
const path     = require('path');

const DB_PATH         = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'dcops.db');
const MIGRATIONS_DIR  = path.join(__dirname, '..', 'migrations');

// Ensure the data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// Limit SQLite page cache to 16MB — prevents unbounded memory growth
db.pragma('cache_size = -16000');
// Keep temp tables in memory up to 32MB then spill to disk
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 0');
db.pragma('cache_size = -32768');  // 32MB cache max
db.pragma('mmap_size = 0');        // disable memory-mapped I/O

// ── Migration runner ──────────────────────────────────────────────────────────
function migrate() {
  // Track which migrations have run
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename  TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db.prepare('SELECT filename FROM _migrations').all().map(r => r.filename)
  );

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    console.log(`[db] Applying migration: ${file}`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    console.log(`[db] ✓ ${file}`);
  }
}

migrate();

module.exports = db;
