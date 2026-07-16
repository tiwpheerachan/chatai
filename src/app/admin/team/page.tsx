import { Topbar } from '@/components/layout/topbar';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { TeamClient } from './team.client';
import type { Profile, Brand } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');

  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const [{ data: users }, { data: brands }, { data: perf }] = await Promise.all([
    ctx.sb.from('profiles').select('*').order('created_at', { ascending: false }),
    ctx.sb.from('brands').select('id,name,color').order('name'),
    ctx.sb.rpc('agent_performance', { since }),
  ]);

  const stats: Record<string, { replies: number; conversations: number; last_active: string | null }> = {};
  for (const s of (perf as any[]) || []) stats[s.user_id] = { replies: Number(s.replies), conversations: Number(s.conversations), last_active: s.last_active };

  // Fallback: if the agent_performance RPC (migration 006) isn't present, roll the
  // numbers up straight from messages so the page never shows a false "0 for everyone".
  if (!perf) {
    const { data: rows } = await ctx.sb
      .from('messages')
      .select('sender_id, conversation_id, created_at')
      .not('sender_id', 'is', null)
      .gte('created_at', since)
      .limit(20000);
    const convByUser: Record<string, Set<string>> = {};
    for (const m of (rows as any[]) || []) {
      const u = m.sender_id as string;
      const s = (stats[u] ||= { replies: 0, conversations: 0, last_active: null });
      s.replies += 1;
      (convByUser[u] ||= new Set()).add(m.conversation_id);
      if (!s.last_active || m.created_at > s.last_active) s.last_active = m.created_at;
    }
    for (const u of Object.keys(convByUser)) stats[u].conversations = convByUser[u].size;
  }

  return (
    <>
      <Topbar title="ทีม & สิทธิ์" subtitle={`พนักงาน ${users?.length || 0} คน · ตอบแชทรวม ${Object.values(stats).reduce((a, s) => a + s.replies, 0)} ครั้ง (7 วัน)`} />
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <TeamClient
          initialUsers={(users as Profile[]) || []}
          brands={(brands as Pick<Brand, 'id' | 'name' | 'color'>[]) || []}
          stats={stats}
          canManage={ctx.can('team.write')}
          isOwner={ctx.role === 'owner'}
        />
      </div>
    </>
  );
}
