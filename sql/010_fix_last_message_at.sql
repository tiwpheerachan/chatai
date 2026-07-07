-- =============================================================
-- 010 — Fix conversation ordering / timestamps
-- The message-insert trigger set last_message_at = now() on EVERY insert, so
-- hydrating/backfilling historical messages jumped old conversations to the top
-- with a wrong "now" time. Use the message's real created_at, and only ever move
-- last_message_at forward. Then backfill existing rows from real message times.
-- Safe to re-run (idempotent).
-- =============================================================

create or replace function update_last_message_at()
returns trigger as $$
begin
  update conversations
    set last_message_at = greatest(coalesce(last_message_at, to_timestamp(0)), coalesce(NEW.created_at, now())),
        unread = case when NEW.sender_type = 'customer' then unread + 1 else unread end
    where id = NEW.conversation_id;
  return NEW;
end;
$$ language plpgsql;

-- Backfill: set each conversation's last_message_at to its newest message's time.
update conversations c
  set last_message_at = m.mx
  from (select conversation_id, max(created_at) as mx from messages group by conversation_id) m
  where m.conversation_id = c.id
    and c.last_message_at is distinct from m.mx;
