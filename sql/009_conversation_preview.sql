-- =============================================================
-- 009 — Conversation list preview (fast inbox rendering)
-- Denormalize the latest message onto the conversation so the inbox list
-- can show a snippet + type without joining messages per row.
-- Safe to re-run (idempotent).
-- =============================================================

alter table conversations add column if not exists last_snippet text;
alter table conversations add column if not exists last_message_type text;

-- Backfill from the newest message of each conversation.
update conversations c set
  last_snippet = m.text,
  last_message_type = m.message_type
from (
  select distinct on (conversation_id) conversation_id, text, message_type
  from messages
  order by conversation_id, created_at desc
) m
where m.conversation_id = c.id
  and (c.last_snippet is null and c.last_message_type is null);
