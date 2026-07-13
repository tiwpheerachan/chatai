-- =============================================================
-- 015 — Smart chat assignment + agent performance
-- Adds per-agent auto-assign opt-in + capacity, assignment audit fields,
-- a single-row settings table, and a richer performance RPC.
-- Safe to run multiple times.
-- =============================================================

-- Per-agent distribution controls.
alter table profiles add column if not exists auto_assign   boolean default true;   -- opt-in to the queue
alter table profiles add column if not exists max_open_chats int;                    -- null = unlimited

-- Assignment audit on conversations (assigned_to already exists).
alter table conversations add column if not exists assigned_at       timestamptz;
alter table conversations add column if not exists assignment_reason text;            -- 'auto' | 'manual' | 'rebalance'

-- Single-row settings for the distribution engine.
create table if not exists assignment_settings (
  id            int primary key default 1,
  enabled       boolean default true,           -- master switch for auto-assign
  strategy      text    default 'performance',  -- 'performance' | 'balanced' | 'round_robin'
  sla_first_sec int     default 300,            -- target first-response (sec) for the SLA %
  queue_days    int     default 14,             -- only auto-assign chats active within N days
  updated_at    timestamptz default now(),
  constraint assignment_settings_singleton check (id = 1)
);
insert into assignment_settings (id) values (1) on conflict (id) do nothing;

alter table assignment_settings enable row level security;
do $$ begin
  create policy assignment_settings_read on assignment_settings for select to authenticated using (true);
exception when duplicate_object then null; end $$;
-- Writes go through the service-role client (API-gated), which bypasses RLS.

-- Helpful indexes for the queue scan + load counts.
create index if not exists idx_conv_assigned_status on conversations(assigned_to, status);
create index if not exists idx_conv_queue on conversations(status, last_message_at desc) where assigned_to is null;

-- ------------------------------------------------------------
-- Per-agent performance over a window. Only counts work done THROUGH Nexus
-- (messages carry sender_id only when a real admin sends via the app; synced
-- Shopee shop-side messages have sender_id = null and are ignored).
-- security definer so supervisors see cross-brand aggregates; API gates access.
-- ------------------------------------------------------------
create or replace function public.agent_performance_v2(since timestamptz default now() - interval '7 days')
returns table (
  user_id            uuid,
  replies            bigint,
  conversations      bigint,
  first_response_sec numeric,   -- avg time from the customer's first msg to the agent's first reply, per conv
  response_sec       numeric,   -- avg gap: agent reply following a customer msg
  resolved           bigint,    -- conversations assigned to the agent that are solved/closed
  last_active        timestamptz
)
language sql stable security definer set search_path = public as $$
  with win as (
    select m.id, m.conversation_id, m.sender_id, m.sender_type, m.created_at,
           lag(m.created_at)  over (partition by m.conversation_id order by m.created_at) as prev_at,
           lag(m.sender_type) over (partition by m.conversation_id order by m.created_at) as prev_type
    from messages m
    where m.created_at >= since
  ),
  base as (
    select sender_id as user_id,
           count(*)                             as replies,
           count(distinct conversation_id)      as conversations,
           max(created_at)                      as last_active
    from win
    where sender_type = 'agent' and sender_id is not null
    group by sender_id
  ),
  gaps as (  -- response speed: an agent reply directly after a customer msg
    select sender_id as user_id,
           avg(extract(epoch from (created_at - prev_at))) as response_sec
    from win
    where sender_type = 'agent' and sender_id is not null
      and prev_type = 'customer'
      and created_at - prev_at between interval '0 seconds' and interval '24 hours'
    group by sender_id
  ),
  first_resp as (  -- per conversation, first agent reply vs the conversation's first customer msg
    select fa.user_id, avg(extract(epoch from (fa.first_agent - fc.first_cust))) as first_response_sec
    from (
      select conversation_id, sender_id as user_id, min(created_at) as first_agent
      from win where sender_type = 'agent' and sender_id is not null
      group by conversation_id, sender_id
    ) fa
    join (
      select conversation_id, min(created_at) as first_cust
      from win where sender_type = 'customer'
      group by conversation_id
    ) fc on fc.conversation_id = fa.conversation_id
    where fa.first_agent > fc.first_cust
      and fa.first_agent - fc.first_cust < interval '48 hours'
    group by fa.user_id
  ),
  res as (
    select assigned_to as user_id, count(*) as resolved
    from conversations
    where assigned_to is not null and status in ('solved','closed')
    group by assigned_to
  )
  select b.user_id, b.replies, b.conversations,
         round(fr.first_response_sec)::numeric as first_response_sec,
         round(g.response_sec)::numeric        as response_sec,
         coalesce(r.resolved, 0)               as resolved,
         b.last_active
  from base b
  left join gaps g       on g.user_id = b.user_id
  left join first_resp fr on fr.user_id = b.user_id
  left join res r        on r.user_id = b.user_id
$$;
