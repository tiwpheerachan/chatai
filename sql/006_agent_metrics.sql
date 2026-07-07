-- =============================================================
-- Agent performance metrics + audit log support
-- Safe to run multiple times.
-- =============================================================

-- Per-agent reply stats over a time window (for the team performance view).
-- security definer so admins see aggregates across all brands; the API gates
-- access with the team.read permission.
create or replace function public.agent_performance(since timestamptz default now() - interval '7 days')
returns table (
  user_id uuid,
  replies bigint,
  conversations bigint,
  last_active timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    m.sender_id as user_id,
    count(*) as replies,
    count(distinct m.conversation_id) as conversations,
    max(m.created_at) as last_active
  from messages m
  where m.sender_type = 'agent'
    and m.sender_id is not null
    and m.created_at >= since
  group by m.sender_id
$$;

-- Helpful indexes for the metrics + audit queries.
create index if not exists idx_messages_sender on messages(sender_id, created_at desc) where sender_type = 'agent';
create index if not exists idx_audit_action on audit_log(action, created_at desc);

-- Storage: avatars bucket is created via the storage API (public read).
-- Uploads go through /api/profile/avatar using the service role, so no
-- storage.objects RLS policy is required.
