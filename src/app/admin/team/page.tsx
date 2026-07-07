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
