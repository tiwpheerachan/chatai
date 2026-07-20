-- ================================================================
-- 018 — Presence (auto online/offline) + per-brand admin greeting name (#12)
-- Safe to run more than once.
-- ================================================================

-- ---- Presence: last_seen powers "who is really online" + auto-assignment.
alter table profiles add column if not exists last_seen timestamptz;
create index if not exists idx_profiles_last_seen on profiles(last_seen);

-- ---- #12: each admin can use a different display name per brand/shop, so the
-- greeting suggestion says the right name ("สวัสดีค่ะ แอดมินนุ่นยินดีให้บริการค่ะ").
create table if not exists admin_greetings (
  user_id     uuid not null references profiles(id) on delete cascade,
  brand_id    uuid not null references brands(id) on delete cascade,
  display_name text not null,
  updated_at  timestamptz default now(),
  primary key (user_id, brand_id)
);
