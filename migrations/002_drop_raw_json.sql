-- migrations/002_drop_raw_json.sql
-- raw_json (~3KB per ticket) causes OOM with 189k+ tickets.
-- All needed fields are already in dedicated columns.
-- SQLite pre-3.35 requires the rename-copy-drop approach.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS tickets_new (
  key              TEXT PRIMARY KEY,
  project          TEXT NOT NULL,
  summary          TEXT,
  assignee         TEXT,
  assignee_email   TEXT,
  reporter         TEXT,
  status           TEXT,
  issue_type       TEXT,
  priority         TEXT,
  location         TEXT,
  maintenance_type TEXT,
  sla_seconds      INTEGER,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  resolved_at      TEXT
);

INSERT INTO tickets_new
  SELECT key, project, summary, assignee, assignee_email, reporter,
         status, issue_type, priority, location, maintenance_type,
         sla_seconds, created_at, updated_at, resolved_at
  FROM tickets;

DROP TABLE tickets;
ALTER TABLE tickets_new RENAME TO tickets;

CREATE INDEX IF NOT EXISTS idx_tickets_project    ON tickets(project);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee   ON tickets(assignee);
CREATE INDEX IF NOT EXISTS idx_tickets_location   ON tickets(location);
CREATE INDEX IF NOT EXISTS idx_tickets_status     ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);

PRAGMA foreign_keys = ON;
