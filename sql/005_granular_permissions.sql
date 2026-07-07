-- =============================================================
-- Granular permissions: per-role defaults + per-user overrides
-- Brand-scope + channel-scope for data visibility. owner = sees all.
-- Safe to run multiple times.
-- =============================================================

-- ---- Per-user overrides on profiles ----
-- NULL  = inherit the role default scope
-- '{}'  = explicitly nothing
-- {...} = exactly these
alter table profiles add column if not exists allowed_brand_ids uuid[];
alter table profiles add column if not exists allowed_channels  channel_type[];
alter table profiles add column if not exists avatar_color text;

-- ---- Per-role configuration (editable in the UI) ----
create table if not exists role_permissions (
  role          user_role primary key,
  permissions   text[]        not null default '{}',  -- action keys; '*' = all
  brand_scope   uuid[],                                -- NULL = all brands
  channel_scope channel_type[],                        -- NULL = all channels
  updated_at    timestamptz   default now()
);

alter table role_permissions enable row level security;

-- Seed defaults (mirrors lib/rbac.ts). Only inserts missing rows.
insert into role_permissions (role, permissions) values
  ('owner',      array['*']),
  ('admin',      array['chat.*','macro.*','kb.*','team.*','channel.*','analytics.*','order.*']),
  ('supervisor', array['chat.*','macro.*','kb.*','analytics.*','order.*']),
  ('agent',      array['chat.read','chat.reply','chat.transfer','chat.tag','macro.read','analytics.own']),
  ('viewer',     array['chat.read','analytics.read']),
  ('ai',         array['chat.reply'])
on conflict (role) do nothing;

-- ----------------------------------------------------------------
-- Visibility helpers (security definer so they can read profiles/role_permissions)
-- ----------------------------------------------------------------
create or replace function public.can_see_brand(b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when b is null then true                                   -- global resources
    when (select role from profiles where id = auth.uid()) = 'owner' then true
    else coalesce((
      select case
        when p.allowed_brand_ids is not null then b = any(p.allowed_brand_ids)
        when rp.brand_scope      is not null then b = any(rp.brand_scope)
        else true                                              -- NULL scope = all brands
      end
      from profiles p
      left join role_permissions rp on rp.role = p.role
      where p.id = auth.uid()
    ), false)
  end
$$;

create or replace function public.can_see_channel(c channel_type)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when c is null then true
    when (select role from profiles where id = auth.uid()) = 'owner' then true
    else coalesce((
      select case
        when p.allowed_channels is not null then c = any(p.allowed_channels)
        when rp.channel_scope   is not null then c = any(rp.channel_scope)
        else true
      end
      from profiles p
      left join role_permissions rp on rp.role = p.role
      where p.id = auth.uid()
    ), false)
  end
$$;

-- ----------------------------------------------------------------
-- Re-scope read policies to brand + channel visibility
-- ----------------------------------------------------------------
drop policy if exists customers_brand_read on customers;
create policy customers_brand_read on customers for select
  using (can_see_brand(brand_id) and (channel is null or can_see_channel(channel)));

drop policy if exists conv_brand_read on conversations;
create policy conv_brand_read on conversations for select
  using (can_see_brand(brand_id) and can_see_channel(channel));

drop policy if exists msg_read on messages;
create policy msg_read on messages for select
  using (
    conversation_id in (
      select id from conversations
      where can_see_brand(brand_id) and can_see_channel(channel)
    )
  );

-- role_permissions: any logged-in user can read; only owner/admin can write
drop policy if exists role_perms_read on role_permissions;
create policy role_perms_read on role_permissions for select using (auth.uid() is not null);

drop policy if exists role_perms_write on role_permissions;
create policy role_perms_write on role_permissions for all using (is_admin_or_above());

create index if not exists idx_profiles_allowed_brands on profiles using gin (allowed_brand_ids);
