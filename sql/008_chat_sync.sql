-- =============================================================
-- 008 — Chat-source sync (Shopee → Supabase) + realtime
-- Persists external chat conversations/messages into the unified inbox
-- so the app doesn't re-pull the live API every time, and enables
-- Supabase Realtime on the inbox tables.
-- Safe to re-run (idempotent).
-- =============================================================

-- ---- conversations: link to the external platform conversation ----
alter table conversations add column if not exists external_id text; -- platform conversation_id (Shopee SellerChat id)
alter table conversations add column if not exists shop_id text;     -- platform shop id the conversation belongs to
alter table conversations add column if not exists buyer_id text;     -- platform buyer user id (Shopee to_id) — needed to reply

-- One row per (channel, external conversation). Partial: only rows that carry an external id.
create unique index if not exists uq_conv_channel_external
  on conversations(channel, external_id) where external_id is not null;
create index if not exists idx_conv_shop on conversations(shop_id);

-- ---- messages: external id (dedup) + concrete type ----
alter table messages add column if not exists external_id text;                 -- platform message_id
alter table messages add column if not exists message_type text default 'text'; -- text|image|video|sticker|item|order

create unique index if not exists uq_msg_external
  on messages(external_id) where external_id is not null;

-- ---- chat_shops: sync bookkeeping per platform shop ----
create table if not exists chat_shops (
  shop_id text primary key,
  platform text not null default 'shopee',
  brand_slug text,                                  -- upstream brand slug e.g. 'dreame','xiaomi_ha'
  brand_id uuid references brands(id) on delete set null,
  shop_name text,
  sync_cursor text,                                 -- Shopee next_message_time_nano to resume forward paging (also holds the go-live baseline on first sync)
  caught_up boolean default false,                  -- true once the forward cursor reached the newest page
  last_synced_at timestamptz,
  conversations_synced int default 0,
  created_at timestamptz default now()
);

alter table chat_shops enable row level security;

do $$ begin
  create policy chat_shops_read on chat_shops
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- Writes happen via the service-role client (bypasses RLS); no write policy needed.

-- ---- brands: ensure a stable upstream-slug link ----
-- brands.slug already exists (unique) — we store the upstream brand slug there.
alter table brands add column if not exists platform text;  -- optional hint; nullable

-- ---- Realtime: publish inbox tables so the client subscription actually fires ----
-- (No SQL added these before; the inbox realtime subscription was inert.)
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;   -- already in publication
  when undefined_object then null;   -- publication missing (non-Supabase env)
end $$;

do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- Full row payloads on realtime updates (so the client sees changed columns).
alter table messages replica identity full;
alter table conversations replica identity full;
