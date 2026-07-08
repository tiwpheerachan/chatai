-- =============================================================
-- 012 — Pin conversations + work-order tasks (Chat++ parity)
-- Safe to re-run.
-- =============================================================

-- Pin a conversation to the top of the inbox list.
alter table conversations add column if not exists pinned boolean not null default false;
create index if not exists idx_conv_pinned on conversations(pinned) where pinned = true;

-- "ใบสั่งงาน" — internal follow-up tasks attached to a conversation so an agent
-- can hand work off or remember what still needs doing on this chat. Internal
-- only (never sent to the buyer, no AI).
create table if not exists conversation_tasks (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  assigned_to uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists idx_tasks_conv on conversation_tasks(conversation_id, done, created_at desc);
create index if not exists idx_tasks_assignee on conversation_tasks(assigned_to) where assigned_to is not null;

-- RLS: mirror the app convention (macros/messages) — any authenticated staff can
-- read; staff roles can write. Service role bypasses RLS for the server anyway.
alter table conversation_tasks enable row level security;

drop policy if exists conversation_tasks_read on conversation_tasks;
create policy conversation_tasks_read on conversation_tasks for select
  using (auth.uid() is not null);

drop policy if exists conversation_tasks_write on conversation_tasks;
create policy conversation_tasks_write on conversation_tasks for all
  using (current_user_role() in ('owner','admin','supervisor','agent','ai'));
