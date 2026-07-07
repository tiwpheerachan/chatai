import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { clampInt } from '@/lib/validation';

export const dynamic = 'force-dynamic';

interface AgentStat { user_id: string; replies: number; conversations: number; last_active: string | null }

export async function GET(req: Request) {
  const { ctx, res } = await authorize('team.read');
  if (!ctx) return res;
  const { sb } = ctx;

  const days = clampInt(new URL(req.url).searchParams.get('days'), 7, 1, 90);
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

  // Prefer the aggregation RPC; fall back to client-side rollup if not migrated.
  let stats: AgentStat[] = [];
  const { data: rpc, error } = await sb.rpc('agent_performance', { since });
  if (!error && rpc) {
    stats = rpc as AgentStat[];
  } else {
    const { data: rows } = await sb
      .from('messages')
      .select('sender_id, conversation_id, created_at')
      .eq('sender_type', 'agent')
      .gte('created_at', since)
      .not('sender_id', 'is', null)
      .limit(10000);
    const map = new Map<string, { replies: number; convs: Set<string>; last: string }>();
    for (const m of (rows as any[]) || []) {
      const e = map.get(m.sender_id) || { replies: 0, convs: new Set<string>(), last: m.created_at };
      e.replies += 1;
      e.convs.add(m.conversation_id);
      if (m.created_at > e.last) e.last = m.created_at;
      map.set(m.sender_id, e);
    }
    stats = [...map.entries()].map(([user_id, e]) => ({ user_id, replies: e.replies, conversations: e.convs.size, last_active: e.last }));
  }

  // Join names/avatars. Include every team member, even with zero replies.
  const { data: profiles } = await sb.from('profiles').select('id,name,avatar,role,status');
  const statByUser = new Map(stats.map(s => [s.user_id, s]));

  const rows = (profiles || [])
    .filter(p => p.role !== 'ai')
    .map(p => {
      const s = statByUser.get(p.id);
      return {
        id: p.id, name: p.name, avatar: p.avatar, role: p.role, status: p.status,
        replies: s?.replies ?? 0,
        conversations: s?.conversations ?? 0,
        last_active: s?.last_active ?? null,
      };
    })
    .sort((a, b) => b.replies - a.replies);

  return NextResponse.json({ days, agents: rows });
}
