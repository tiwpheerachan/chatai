import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// Smart chat distribution — spreads the "waiting" chat queue across each
// brand's eligible agents, weighted by how fast each agent responds, and can
// rebalance still-waiting chats from slow/overloaded agents to faster ones.
//
// Scope-aware: an agent only receives chats for brands they're allowed to see
// (profiles.allowed_brand_ids; null = all, per the role default). Owner/viewer/ai
// are never queue workers. Everything runs via the admin client at scale.
// NO customer-facing automation — this only routes work between humans.
// ============================================================

export type Strategy = 'performance' | 'balanced' | 'round_robin';
const QUEUE_ROLES = new Set(['agent', 'supervisor', 'admin']);

export interface AssignmentSettings {
  enabled: boolean; strategy: Strategy; sla_first_sec: number; queue_days: number;
}
const DEFAULT_SETTINGS: AssignmentSettings = { enabled: true, strategy: 'performance', sla_first_sec: 300, queue_days: 14 };

export interface AgentProfile {
  id: string; name: string; role: string; status: string; online: boolean;
  allowed_brand_ids: string[] | null; auto_assign: boolean; max_open_chats: number | null;
}
export interface AgentPerf {
  replies: number; conversations: number;
  first_response_sec: number | null; response_sec: number | null;
  resolved: number; last_active: string | null;
}

function sb(): SupabaseClient { return createAdminClient(); }

export async function getSettings(): Promise<AssignmentSettings> {
  const { data } = await sb().from('assignment_settings').select('*').eq('id', 1).maybeSingle();
  if (!data) return { ...DEFAULT_SETTINGS };
  return {
    enabled: data.enabled ?? true,
    strategy: (data.strategy as Strategy) || 'performance',
    sla_first_sec: data.sla_first_sec ?? 300,
    queue_days: data.queue_days ?? 14,
  };
}

export async function updateSettings(patch: Partial<AssignmentSettings>): Promise<AssignmentSettings> {
  const clean: Record<string, unknown> = {};
  if (patch.enabled != null) clean.enabled = !!patch.enabled;
  if (patch.strategy && ['performance', 'balanced', 'round_robin'].includes(patch.strategy)) clean.strategy = patch.strategy;
  if (patch.sla_first_sec != null) clean.sla_first_sec = Math.max(30, Math.min(86400, Math.round(patch.sla_first_sec)));
  if (patch.queue_days != null) clean.queue_days = Math.max(1, Math.min(90, Math.round(patch.queue_days)));
  clean.updated_at = new Date().toISOString();
  await sb().from('assignment_settings').upsert({ id: 1, ...clean });
  return getSettings();
}

/** All profiles that can work the queue (role + not disabled). */
export async function queueAgents(): Promise<AgentProfile[]> {
  // last_seen is from sql/018 — select it, but fall back if not migrated yet.
  let data: any[] | null = null;
  const full = await sb().from('profiles').select('id,name,role,status,allowed_brand_ids,auto_assign,max_open_chats,last_seen').neq('status', 'disabled');
  if (full.error) {
    const basic = await sb().from('profiles').select('id,name,role,status,allowed_brand_ids,auto_assign,max_open_chats').neq('status', 'disabled');
    data = basic.data as any[];
  } else data = full.data as any[];
  const fresh = Date.now() - 5 * 60_000;
  return (data || [])
    .filter(p => QUEUE_ROLES.has(p.role))
    .map(p => ({
      id: p.id, name: p.name, role: p.role, status: p.status || 'offline',
      allowed_brand_ids: p.allowed_brand_ids ?? null,
      auto_assign: p.auto_assign ?? true,
      max_open_chats: p.max_open_chats ?? null,
      // Treat a recent heartbeat as online even if the status column lagged.
      online: p.status === 'online' || (p.last_seen ? new Date(p.last_seen).getTime() > fresh : false),
    }));
}

/** Per-agent performance over `sinceDays` (via RPC; empty map if not migrated). */
export async function agentPerf(sinceDays = 7): Promise<Map<string, AgentPerf>> {
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
  const out = new Map<string, AgentPerf>();
  const { data, error } = await sb().rpc('agent_performance_v2', { since });
  if (error || !data) return out;
  for (const r of data as any[]) {
    out.set(r.user_id, {
      replies: Number(r.replies) || 0,
      conversations: Number(r.conversations) || 0,
      first_response_sec: r.first_response_sec != null ? Number(r.first_response_sec) : null,
      response_sec: r.response_sec != null ? Number(r.response_sec) : null,
      resolved: Number(r.resolved) || 0,
      last_active: r.last_active ?? null,
    });
  }
  return out;
}

/** Current open (waiting) chats already assigned to each agent. */
export async function openLoads(agentIds: string[]): Promise<Map<string, number>> {
  const loads = new Map<string, number>();
  if (!agentIds.length) return loads;
  // count per agent via head:true (cheap, indexed on assigned_to,status)
  await Promise.all(agentIds.map(async id => {
    const { count } = await sb().from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', id).eq('status', 'open');
    loads.set(id, count || 0);
  }));
  return loads;
}

const agentAllowsBrand = (a: AgentProfile, brandId: string | null): boolean => {
  if (a.allowed_brand_ids == null) return true;          // inherit role default = all brands
  if (brandId == null) return true;
  return a.allowed_brand_ids.includes(brandId);
};

/** Speed weight: faster first-response ⇒ larger share. Neutral (1) when no data. */
function speedWeight(perf: AgentPerf | undefined, baselineSec: number): number {
  const s = perf?.first_response_sec ?? perf?.response_sec ?? null;
  if (s == null || s <= 0) return 1;
  const w = baselineSec / s;                              // faster than baseline ⇒ >1
  return Math.max(0.5, Math.min(2.5, w));
}

interface Candidate { a: AgentProfile; load: number; weight: number }

/** Pick the best agent for a brand under the strategy. Returns null if none free. */
function pick(cands: Candidate[], strategy: Strategy): Candidate | null {
  const free = cands.filter(c => c.a.max_open_chats == null || c.load < c.a.max_open_chats);
  if (!free.length) return null;
  const eff = (c: Candidate) =>
    strategy === 'performance' ? c.load / c.weight
    : c.load;                                             // balanced & round_robin ⇒ least-loaded
  return free.reduce((best, c) => (eff(c) < eff(best) ? c : best));
}

export interface AssignResult { assigned: number; skippedNoAgent: number; perAgent: Record<string, number> }

/**
 * Assign the unassigned WAITING queue (customer waiting = unread>0, recent) to
 * eligible online agents, spreading by strategy. Bounded by `limit`.
 */
export async function autoAssignQueue(opts: { brandsIn?: string[] | null; limit?: number; strategy?: Strategy } = {}): Promise<AssignResult> {
  const settings = await getSettings();
  const limit = opts.limit ?? 300;
  const strategy = opts.strategy ?? settings.strategy;
  const since = new Date(Date.now() - settings.queue_days * 86400_000).toISOString();

  let q = sb().from('conversations')
    .select('id,brand_id,last_message_at')
    .is('assigned_to', null).eq('status', 'open').gt('unread', 0)
    .gte('last_message_at', since)
    .order('last_message_at', { ascending: false }).limit(limit);
  if (opts.brandsIn && opts.brandsIn.length) q = q.in('brand_id', opts.brandsIn);
  const { data: convs } = await q;
  const queue = ((convs as any[]) || []);
  const result: AssignResult = { assigned: 0, skippedNoAgent: 0, perAgent: {} };
  if (!queue.length) return result;

  const agents = (await queueAgents()).filter(a => a.auto_assign && a.online);
  if (!agents.length) { result.skippedNoAgent = queue.length; return result; }
  const perf = await agentPerf(7);
  const loads = await openLoads(agents.map(a => a.id));

  // batch the picks in memory, then one UPDATE per agent
  const assignTo = new Map<string, string[]>();          // agentId -> convIds
  const now = new Date().toISOString();
  for (const c of queue) {
    const cands: Candidate[] = agents
      .filter(a => agentAllowsBrand(a, c.brand_id))
      .map(a => ({ a, load: loads.get(a.id) || 0, weight: speedWeight(perf.get(a.id), settings.sla_first_sec) }));
    const chosen = pick(cands, strategy);
    if (!chosen) { result.skippedNoAgent++; continue; }
    loads.set(chosen.a.id, (loads.get(chosen.a.id) || 0) + 1);
    (assignTo.get(chosen.a.id) || assignTo.set(chosen.a.id, []).get(chosen.a.id)!).push(c.id);
  }

  await Promise.all([...assignTo.entries()].map(async ([agentId, ids]) => {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await sb().from('conversations')
        .update({ assigned_to: agentId, assigned_at: now, assignment_reason: 'auto' })
        .in('id', chunk);
      if (!error) { result.assigned += chunk.length; result.perAgent[agentId] = (result.perAgent[agentId] || 0) + chunk.length; }
    }
  }));
  return result;
}

export interface RebalanceResult { moved: number; perAgent: Record<string, number> }

/**
 * Move still-WAITING chats (unread>0) away from agents who are offline / over
 * capacity / slower-than-peers, onto eligible faster agents with headroom.
 * Only touches waiting chats (safe — never yanks an active conversation).
 */
export async function rebalanceWaiting(opts: { brandsIn?: string[] | null; strategy?: Strategy } = {}): Promise<RebalanceResult> {
  const settings = await getSettings();
  const strategy = opts.strategy ?? settings.strategy;
  const since = new Date(Date.now() - settings.queue_days * 86400_000).toISOString();
  const result: RebalanceResult = { moved: 0, perAgent: {} };

  const agents = await queueAgents();
  const online = agents.filter(a => a.auto_assign && a.online);
  if (!online.length) return result;
  const perf = await agentPerf(7);
  const loads = await openLoads(agents.map(a => a.id));
  const availIds = new Set(online.map(a => a.id));

  // waiting chats that are assigned to someone
  let q = sb().from('conversations')
    .select('id,brand_id,assigned_to,last_message_at')
    .not('assigned_to', 'is', null).eq('status', 'open').gt('unread', 0)
    .gte('last_message_at', since)
    .order('last_message_at', { ascending: true }).limit(1000);
  if (opts.brandsIn && opts.brandsIn.length) q = q.in('brand_id', opts.brandsIn);
  const { data } = await q;
  const waiting = ((data as any[]) || []);
  if (!waiting.length) return result;

  const avgLoad = [...loads.values()].reduce((s, n) => s + n, 0) / Math.max(1, loads.size);
  const now = new Date().toISOString();

  for (const c of waiting) {
    const holder = c.assigned_to as string;
    const holderLoad = loads.get(holder) || 0;
    const holderOffline = !availIds.has(holder);
    const holderOverloaded = holderLoad > Math.max(3, avgLoad * 1.5);
    if (!holderOffline && !holderOverloaded) continue;   // holder is fine → leave it

    const cands: Candidate[] = online
      .filter(a => a.id !== holder && agentAllowsBrand(a, c.brand_id))
      .map(a => ({ a, load: loads.get(a.id) || 0, weight: speedWeight(perf.get(a.id), settings.sla_first_sec) }));
    const chosen = pick(cands, strategy);
    if (!chosen) continue;
    // only move if the target is genuinely lighter (avoid churn)
    if ((loads.get(chosen.a.id) || 0) >= holderLoad && !holderOffline) continue;

    const { error } = await sb().from('conversations')
      .update({ assigned_to: chosen.a.id, assigned_at: now, assignment_reason: 'rebalance' })
      .eq('id', c.id);
    if (!error) {
      loads.set(holder, Math.max(0, holderLoad - 1));
      loads.set(chosen.a.id, (loads.get(chosen.a.id) || 0) + 1);
      result.moved++; result.perAgent[chosen.a.id] = (result.perAgent[chosen.a.id] || 0) + 1;
    }
  }
  return result;
}
