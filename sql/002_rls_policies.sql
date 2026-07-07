-- =============================================================
-- Row Level Security (RLS) — multi-tenant + role-based
-- =============================================================

-- Enable RLS on all tables
alter table brands             enable row level security;
alter table profiles           enable row level security;
alter table customers          enable row level security;
alter table conversations      enable row level security;
alter table messages           enable row level security;
alter table knowledge_base     enable row level security;
alter table macros             enable row level security;
alter table bot_rules          enable row level security;
alter table channels           enable row level security;
alter table audit_log          enable row level security;
alter table analytics_events   enable row level security;

-- ----------------------------------------------------------------
-- HELPER FUNCTIONS
-- ----------------------------------------------------------------
create or replace function current_user_role() returns user_role
language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function current_user_brand() returns uuid
language sql stable security definer as $$
  select brand_id from profiles where id = auth.uid()
$$;

create or replace function is_admin_or_above() returns boolean
language sql stable as $$
  select current_user_role() in ('owner','admin')
$$;

create or replace function is_supervisor_or_above() returns boolean
language sql stable as $$
  select current_user_role() in ('owner','admin','supervisor')
$$;

-- NOTE on the brand-scoping pattern below:
-- `current_user_brand() is null` lets an unassigned super-admin see ALL brands.
-- For an anonymous request auth.uid() is null too, so current_user_brand() is
-- also null — which would expose every row. Every policy therefore requires
-- `auth.uid() is not null` first so anonymous clients (anon key, no session)
-- can read nothing.

-- ----------------------------------------------------------------
-- PROFILES — logged-in team can read, only admins/self can write
-- ----------------------------------------------------------------
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select using (auth.uid() is not null);

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert with check (is_admin_or_above() or auth.uid() = id);

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update using (is_admin_or_above() or auth.uid() = id);

-- ----------------------------------------------------------------
-- BRANDS — everyone can read, admin write
-- ----------------------------------------------------------------
drop policy if exists brands_select on brands;
create policy brands_select on brands for select using (auth.uid() is not null);

drop policy if exists brands_modify on brands;
create policy brands_modify on brands for all using (is_admin_or_above());

-- ----------------------------------------------------------------
-- CUSTOMERS, CONVERSATIONS, MESSAGES — brand-scoped
-- ----------------------------------------------------------------
drop policy if exists customers_brand_read on customers;
create policy customers_brand_read on customers for select
  using (auth.uid() is not null and (current_user_brand() is null or brand_id = current_user_brand() or current_user_role() in ('owner','admin')));

drop policy if exists customers_write on customers;
create policy customers_write on customers for all
  using (current_user_role() in ('owner','admin','supervisor','agent','ai'));

drop policy if exists conv_brand_read on conversations;
create policy conv_brand_read on conversations for select
  using (auth.uid() is not null and (current_user_brand() is null or brand_id = current_user_brand() or current_user_role() in ('owner','admin')));

drop policy if exists conv_write on conversations;
create policy conv_write on conversations for all
  using (current_user_role() in ('owner','admin','supervisor','agent','ai'));

drop policy if exists msg_read on messages;
create policy msg_read on messages for select
  using (
    auth.uid() is not null and conversation_id in (
      select id from conversations
      where current_user_brand() is null
         or brand_id = current_user_brand()
         or current_user_role() in ('owner','admin')
    )
  );

drop policy if exists msg_write on messages;
create policy msg_write on messages for insert
  with check (current_user_role() in ('owner','admin','supervisor','agent','ai'));

-- ----------------------------------------------------------------
-- KNOWLEDGE BASE — read by all team, write by supervisor+
-- ----------------------------------------------------------------
drop policy if exists kb_read on knowledge_base;
create policy kb_read on knowledge_base for select using (auth.uid() is not null);

drop policy if exists kb_write on knowledge_base;
create policy kb_write on knowledge_base for all using (is_supervisor_or_above());

-- ----------------------------------------------------------------
-- MACROS — read all, write supervisor+
-- ----------------------------------------------------------------
drop policy if exists macros_read on macros;
create policy macros_read on macros for select using (auth.uid() is not null);

drop policy if exists macros_write on macros;
create policy macros_write on macros for all using (is_supervisor_or_above());

-- ----------------------------------------------------------------
-- BOT RULES — read all, write supervisor+
-- ----------------------------------------------------------------
drop policy if exists bot_rules_read on bot_rules;
create policy bot_rules_read on bot_rules for select using (auth.uid() is not null);

drop policy if exists bot_rules_write on bot_rules;
create policy bot_rules_write on bot_rules for all using (is_supervisor_or_above());

-- ----------------------------------------------------------------
-- CHANNELS — admin only
-- ----------------------------------------------------------------
drop policy if exists channels_read on channels;
create policy channels_read on channels for select using (auth.uid() is not null);

drop policy if exists channels_write on channels;
create policy channels_write on channels for all using (is_admin_or_above());

-- ----------------------------------------------------------------
-- AUDIT LOG — read admin, write all (system writes)
-- ----------------------------------------------------------------
drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log for select using (is_admin_or_above());

drop policy if exists audit_write on audit_log;
create policy audit_write on audit_log for insert with check (true);

-- ----------------------------------------------------------------
-- ANALYTICS — read all, write system
-- ----------------------------------------------------------------
drop policy if exists analytics_read on analytics_events;
create policy analytics_read on analytics_events for select using (auth.uid() is not null);

drop policy if exists analytics_write on analytics_events;
create policy analytics_write on analytics_events for insert with check (true);
