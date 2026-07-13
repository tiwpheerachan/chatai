import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSettings, queueAgents, agentPerf, openLoads } from '@/lib/assignment';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SUP = new Set(['owner', 'admin', 'supervisor']);

/** Per-agent workload + performance, queue depth, and per-brand distribution. */
export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!SUP.has(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const days = Math.max(1, Math.min(90, Number(sp.get('days')) || 7));
  const sbA = createAdminClient();

  const settings = await getSettings();
  const scoped = ctx.scope.brands;                         // null = all
  const { data: brandRows } = await sbA.from('brands').select('id,name,slug,color').order('name');
  let brands = ((brandRows as any[]) || []);
  if (scoped) brands = brands.filter(b => scoped.includes(b.id));
  const brandName = new Map(brands.map(b => [b.id, b.name]));

  const agents = await queueAgents();
  const [perf, loads] = await Promise.all([agentPerf(days), openLoads(agents.map(a => a.id))]);

  const agentOut = agents.map(a => {
    const p = perf.get(a.id);
    const coversAll = a.allowed_brand_ids == null;
    const coverIds = coversAll ? brands.map(b => b.id) : a.allowed_brand_ids!.filter(id => brandName.has(id));
    return {
      id: a.id, name: a.name, role: a.role, online: a.status === 'online',
      autoAssign: a.auto_assign, maxOpen: a.max_open_chats,
      load: loads.get(a.id) || 0,
      replies: p?.replies || 0, conversations: p?.conversations || 0,
      firstResponseSec: p?.first_response_sec ?? null,
      responseSec: p?.response_sec ?? null,
      resolved: p?.resolved || 0,
      lastActive: p?.last_active ?? null,
      coversAll, brands: coverIds.map(id => brandName.get(id)).filter(Boolean),
    };
  }).sort((x, y) => y.replies - x.replies);

  // Queue depth = unassigned waiting (unread>0) open convs within the window.
  const since = new Date(Date.now() - settings.queue_days * 86400_000).toISOString();
  const brandIds = brands.map(b => b.id);
  const queueCount = async (bid?: string) => {
    let q = sbA.from('conversations').select('id', { count: 'exact', head: true })
      .is('assigned_to', null).eq('status', 'open').gt('unread', 0).gte('last_message_at', since);
    if (bid) q = q.eq('brand_id', bid);
    else if (scoped) q = q.in('brand_id', brandIds.length ? brandIds : ['00000000-0000-0000-0000-000000000000']);
    const { count } = await q;
    return count || 0;
  };
  const totalQueue = await queueCount();

  const byBrand = await Promise.all(brands.map(async b => {
    const covering = agentOut.filter(a => a.coversAll || (a.brands || []).includes(b.name));
    return {
      id: b.id, name: b.name, color: b.color,
      queue: await queueCount(b.id),
      agents: covering.map(a => ({ id: a.id, name: a.name, online: a.online, load: a.load })),
    };
  }));

  return NextResponse.json({
    settings, days, agents: agentOut,
    queue: { unassigned: totalQueue },
    byBrand: byBrand.sort((a, b) => b.queue - a.queue),
    // A hint the UI can show: is there any performance data through Nexus yet?
    hasPerfData: agentOut.some(a => a.replies > 0),
  });
}
