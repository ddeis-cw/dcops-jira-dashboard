-- migrations/001_initial_schema.sql
-- DCOPS Jira Dashboard — Initial Schema

-- ── Tickets ───────────────────────────────────────────────────────────────────
-- Stores every Jira ticket from all monitored projects.
-- raw_json preserves the full payload so new fields can be extracted later
-- without a full re-sync.
CREATE TABLE IF NOT EXISTS tickets (
  key              TEXT PRIMARY KEY,   -- e.g. "DCT-1234"
  project          TEXT NOT NULL,      -- e.g. "dct-ops"
  summary          TEXT,
  assignee         TEXT,               -- display name
  assignee_email   TEXT,
  reporter         TEXT,
  status           TEXT,               -- "In Progress", "Done", etc.
  issue_type       TEXT,
  priority         TEXT,
  location         TEXT,               -- normalized site code e.g. "US-DTN"
  maintenance_type TEXT,               -- customfield_10016
  sla_seconds      INTEGER,            -- customfield_10020 wall-clock seconds
  created_at       TEXT NOT NULL,      -- ISO 8601
  updated_at       TEXT NOT NULL,      -- ISO 8601 — used as sync cursor
  resolved_at      TEXT,               -- ISO 8601, null if unresolved
  raw_json         TEXT                -- full Jira issue payload (JSON string)
);

CREATE INDEX IF NOT EXISTS idx_tickets_project    ON tickets(project);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee   ON tickets(assignee);
CREATE INDEX IF NOT EXISTS idx_tickets_location   ON tickets(location);
CREATE INDEX IF NOT EXISTS idx_tickets_status     ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);

-- ── Employees ─────────────────────────────────────────────────────────────────
-- Employee → site mapping sourced from Jira Assets (People schema 128).
CREATE TABLE IF NOT EXISTS employees (
  name        TEXT PRIMARY KEY,  -- display name matching Jira assignee field
  site        TEXT,              -- site code e.g. "US-DTN"
  is_dct      INTEGER DEFAULT 0, -- 1 if member of DCT_LIST
  is_active   INTEGER DEFAULT 1, -- 0 if inactive in Assets
  synced_at   TEXT NOT NULL      -- ISO 8601
);

CREATE INDEX IF NOT EXISTS idx_employees_site   ON employees(site);
CREATE INDEX IF NOT EXISTS idx_employees_is_dct ON employees(is_dct);

-- ── Server Counts ─────────────────────────────────────────────────────────────
-- Active server count per site, sourced from Jira Assets schema 127.
CREATE TABLE IF NOT EXISTS server_counts (
  site        TEXT PRIMARY KEY,  -- site code e.g. "US-DTN"
  count       INTEGER NOT NULL,
  synced_at   TEXT NOT NULL      -- ISO 8601
);

-- ── Sites ─────────────────────────────────────────────────────────────────────
-- Reference data for all known CoreWeave data center sites.
CREATE TABLE IF NOT EXISTS sites (
  code    TEXT PRIMARY KEY,  -- e.g. "US-DTN"
  label   TEXT NOT NULL,     -- e.g. "Denton, TX"
  region  TEXT,              -- e.g. "R1", "EU"
  country TEXT               -- e.g. "US", "GB"
);

-- ── Sync Log ──────────────────────────────────────────────────────────────────
-- Tracks every sync run. The latest successful tickets sync stores the
-- updated_at cursor used for incremental fetching.
CREATE TABLE IF NOT EXISTS sync_log (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  type                 TEXT NOT NULL,     -- "tickets" | "employees" | "servers"
  status               TEXT NOT NULL,     -- "running" | "success" | "error"
  started_at           TEXT NOT NULL,     -- ISO 8601
  completed_at         TEXT,              -- ISO 8601
  records_synced       INTEGER DEFAULT 0,
  last_updated_cursor  TEXT,             -- ISO 8601 — tickets only
  error                TEXT              -- error message if status = "error"
);

CREATE INDEX IF NOT EXISTS idx_sync_log_type   ON sync_log(type);
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status);
