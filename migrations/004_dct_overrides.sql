-- Manual DCT overrides — names listed here are always treated as DCT
-- regardless of their Jira Assets job title
CREATE TABLE IF NOT EXISTS dct_overrides (
  name       TEXT PRIMARY KEY,
  added_at   TEXT NOT NULL DEFAULT (datetime('now')),
  note       TEXT  -- optional reason e.g. "Regional Director - auto-detect miss"
);
