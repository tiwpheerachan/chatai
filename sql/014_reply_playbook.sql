-- =============================================================
-- 014 — Reply playbook: scenarios + strategies (Chat++/Shopee "ฉากสถานการณ์")
-- Admin defines a SCENARIO (a situation + example buyer questions) and one or
-- more STRATEGIES (a canned response, optionally conditioned on order status, or
-- an action to hand off to a human). The AI draft ("ช่วยตอบ") matches the buyer's
-- question to a scenario and follows the enabled strategies. Safe to re-run.
-- =============================================================

create table if not exists reply_scenarios (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete cascade,   -- null = applies to all brands
  title text not null,                                     -- ชื่อฉาก e.g. "ผู้ซื้อเร่งให้จัดส่งสินค้า"
  examples text[] not null default '{}',                   -- ตัวอย่างคำถามของผู้ซื้อ
  category text,                                            -- optional grouping tag
  enabled boolean not null default true,
  sort int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_scenarios_brand on reply_scenarios(brand_id, enabled, sort);

create table if not exists reply_strategies (
  id uuid primary key default uuid_generate_v4(),
  scenario_id uuid not null references reply_scenarios(id) on delete cascade,
  label text,                                              -- ชื่อกลยุทธ์/สถานการณ์ย่อย
  response text,                                           -- ข้อความตอบกลับ (null when action=handoff)
  order_condition text,                                    -- null=any | 'no_order' | 'to_ship' | 'shipped' | 'to_receive' | 'over_15d' | 'preorder'
  action text not null default 'reply',                   -- 'reply' | 'handoff'
  enabled boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_strategies_scenario on reply_strategies(scenario_id, enabled, sort);

-- updated_at touch
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_scenarios_touch on reply_scenarios;
create trigger trg_scenarios_touch before update on reply_scenarios for each row execute function touch_updated_at();
drop trigger if exists trg_strategies_touch on reply_strategies;
create trigger trg_strategies_touch before update on reply_strategies for each row execute function touch_updated_at();

-- RLS: any authenticated staff can read; supervisor+ can write (like macros/KB).
alter table reply_scenarios enable row level security;
alter table reply_strategies enable row level security;

drop policy if exists scenarios_read on reply_scenarios;
create policy scenarios_read on reply_scenarios for select using (auth.uid() is not null);
drop policy if exists scenarios_write on reply_scenarios;
create policy scenarios_write on reply_scenarios for all using (is_supervisor_or_above());

drop policy if exists strategies_read on reply_strategies;
create policy strategies_read on reply_strategies for select using (auth.uid() is not null);
drop policy if exists strategies_write on reply_strategies;
create policy strategies_write on reply_strategies for all using (is_supervisor_or_above());
