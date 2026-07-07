-- =============================================================
-- OmniChat AI — Database Schema
-- Supabase Postgres
-- =============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector"; -- for RAG embeddings

-- ----------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------
do $$ begin
  create type user_role as enum ('owner','admin','supervisor','agent','viewer','ai');
exception when duplicate_object then null; end $$;

do $$ begin
  create type channel_type as enum ('line','facebook','instagram','shopee','tiktok','lazada','whatsapp','web','email','sms');
exception when duplicate_object then null; end $$;

do $$ begin
  create type conversation_status as enum ('open','pending','solved','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type conversation_priority as enum ('low','normal','high','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sender_type as enum ('customer','agent','ai','system','note');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------
-- BRANDS (multi-brand tenant)
-- ----------------------------------------------------------------
create table if not exists brands (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique,
  color text default '#6366f1',
  logo_url text,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- USERS (extends Supabase auth.users)
-- ----------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  avatar text,
  role user_role not null default 'agent',
  brand_id uuid references brands(id) on delete set null,
  status text default 'offline',
  created_at timestamptz default now()
);

create index if not exists idx_profiles_brand on profiles(brand_id);
create index if not exists idx_profiles_role on profiles(role);

-- ----------------------------------------------------------------
-- CUSTOMERS
-- ----------------------------------------------------------------
create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete set null,
  display_name text,
  channel channel_type,
  channel_user_id text,
  email text,
  phone text,
  avatar text default '👤',
  ltv numeric default 0,
  order_count int default 0,
  sentiment text default 'neutral',
  tags text[] default '{}',
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  unique (channel, channel_user_id)
);

create index if not exists idx_customers_brand on customers(brand_id);

-- ----------------------------------------------------------------
-- CONVERSATIONS
-- ----------------------------------------------------------------
create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references customers(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  channel channel_type not null,
  status conversation_status default 'open',
  priority conversation_priority default 'normal',
  assigned_to uuid references profiles(id) on delete set null,
  ai_handling boolean default true,
  unread int default 0,
  tags text[] default '{}',
  sla_due_at timestamptz,
  last_message_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_conv_status on conversations(status, last_message_at desc);
create index if not exists idx_conv_assigned on conversations(assigned_to);
create index if not exists idx_conv_brand on conversations(brand_id);
create index if not exists idx_conv_customer on conversations(customer_id);

-- ----------------------------------------------------------------
-- MESSAGES
-- ----------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type sender_type not null,
  sender_id uuid,
  text text,
  attachments jsonb default '[]',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_msg_conv on messages(conversation_id, created_at);

-- ----------------------------------------------------------------
-- KNOWLEDGE BASE (RAG)
-- ----------------------------------------------------------------
create table if not exists knowledge_base (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete cascade,
  title text not null,
  content text not null,
  tags text[] default '{}',
  embedding vector(1536),                  -- OpenAI text-embedding-3-small
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_kb_brand on knowledge_base(brand_id);
create index if not exists idx_kb_embedding on knowledge_base using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ----------------------------------------------------------------
-- MACROS / QUICK REPLIES
-- ----------------------------------------------------------------
create table if not exists macros (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete cascade,
  title text not null,
  shortcut text,
  text text not null,
  uses int default 0,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- BOT RULES (regex pattern → action)
-- ----------------------------------------------------------------
create table if not exists bot_rules (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete cascade,
  pattern text not null,
  intent text,
  response_template text,
  action text default 'reply',           -- reply | handoff | tag | escalate
  priority int default 0,
  enabled boolean default true,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- CHANNELS (connected integrations)
-- ----------------------------------------------------------------
create table if not exists channels (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete cascade,
  type channel_type not null,
  name text,
  status text default 'pending',
  credentials jsonb default '{}',
  webhook_url text,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- AUDIT LOG
-- ----------------------------------------------------------------
create table if not exists audit_log (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb,
  ip text,
  created_at timestamptz default now()
);

create index if not exists idx_audit_user on audit_log(user_id, created_at desc);
create index if not exists idx_audit_target on audit_log(target_type, target_id);

-- ----------------------------------------------------------------
-- ANALYTICS EVENTS
-- ----------------------------------------------------------------
create table if not exists analytics_events (
  id bigserial primary key,
  event text not null,
  brand_id uuid references brands(id) on delete cascade,
  channel channel_type,
  conversation_id uuid references conversations(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  value numeric,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_analytics_event on analytics_events(event, created_at);
create index if not exists idx_analytics_brand on analytics_events(brand_id, created_at);

-- ----------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------
create or replace function update_last_message_at()
returns trigger as $$
begin
  update conversations
    set last_message_at = now(),
        unread = case when NEW.sender_type = 'customer' then unread + 1 else unread end
    where id = NEW.conversation_id;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_messages_updated on messages;
create trigger trg_messages_updated
  after insert on messages
  for each row execute function update_last_message_at();

-- Auto-create profile when auth user is created.
-- New self-service signups default to least-privilege 'viewer'; an admin
-- promotes them afterwards. Avoids self-registration granting write access.
--
-- IMPORTANT: `set search_path = public` is required. The trigger runs inside
-- GoTrue's signup transaction where search_path is not guaranteed to include
-- `public`; without it the unqualified `profiles` reference fails and surfaces
-- as "Database error saving new user". The table is also schema-qualified.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------
-- RPC: similarity search for RAG
-- ----------------------------------------------------------------
create or replace function match_kb(
  query_embedding vector(1536),
  match_count int default 3,
  filter_brand_id uuid default null
)
returns table (
  id uuid,
  title text,
  content text,
  tags text[],
  similarity float
)
language sql stable
as $$
  select
    kb.id, kb.title, kb.content, kb.tags,
    1 - (kb.embedding <=> query_embedding) as similarity
  from knowledge_base kb
  where kb.embedding is not null
    and (filter_brand_id is null or kb.brand_id = filter_brand_id or kb.brand_id is null)
  order by kb.embedding <=> query_embedding
  limit match_count;
$$;
