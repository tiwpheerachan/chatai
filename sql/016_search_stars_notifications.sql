-- ================================================================
-- 016 — Team-wide search (#4) + personal stars (#4) + notifications (#7)
-- Safe to run more than once.
-- ================================================================

-- ---- Personal stars: each teammate can star ANY conversation for themselves.
-- Distinct from the shared `conversations.pinned` (team-wide pin). Lets a member
-- keep their own follow-up list even on chats they never replied to.
create table if not exists conversation_stars (
  user_id         uuid not null references profiles(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  created_at      timestamptz default now(),
  primary key (user_id, conversation_id)
);
create index if not exists idx_conv_stars_user on conversation_stars(user_id, created_at desc);

-- ---- Fast name/phone search across ALL customers (so search finds any chat,
-- even one you never handled). Trigram index makes ILIKE '%q%' fast at scale.
-- If the pg_trgm extension can't be created (permissions), the ILIKE still works,
-- just without the index — the app query is identical either way.
do $$
begin
  create extension if not exists pg_trgm;
exception when others then
  raise notice 'pg_trgm not available; name search will seq-scan';
end $$;

create index if not exists idx_customers_name_trgm on customers using gin (display_name gin_trgm_ops);
create index if not exists idx_customers_phone_trgm on customers using gin (phone gin_trgm_ops);

-- Note: VIP is derived in code from order_count/ltv (no schema change needed).
-- Notifications + search work on the BASE schema; only stars need this migration.
