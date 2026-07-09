-- =============================================================
-- 013 — Index for the inbox list ordering (pinned-first, newest-first).
-- The conversations table has grown large (100k+ rows) from the sync/backfill,
-- so "ORDER BY pinned DESC, last_message_at DESC LIMIT 200" was doing a big sort
-- on every inbox load. This composite index lets Postgres return the top rows via
-- an index scan (near-instant). Safe to re-run.
-- =============================================================

create index if not exists idx_conv_pinned_recent
  on conversations (pinned desc, last_message_at desc);
