import { Topbar } from '@/components/layout/topbar';
import { Card, CardHeader } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getCurrentContext } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { ROLE_LABELS } from '@/lib/rbac';
import { formatRelativeTime } from '@/lib/utils';
import { ChatsCircle, ChatTeardropText, FolderOpen, Pulse } from '@phosphor-icons/react/dist/ssr';

export const dynamic = 'force-dynamic';

const ACTION_LABEL: Record<string, string> = {
  'chat.reply': 'ตอบแชท', 'chat.transfer': 'โอนแชท', 'chat.close': 'ปิดเคส',
  'user.update': 'แก้ไขผู้ใช้', 'role.update': 'แก้สิทธิ์', 'profile.update': 'แก้โปรไฟล์', 'profile.avatar': 'เปลี่ยนรูป',
};

async function countReplies(sb: any, userId: string, sinceDays: number) {
  const since = new Date(Date.now() - sinceDays * 86400 * 1000).toISOString();
  const { count } = await sb.from('messages').select('id', { count: 'exact', head: true })
    .eq('sender_type', 'agent').eq('sender_id', userId).gte('created_at', since);
  return count || 0;
}

export default async function AgentDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  if (!ctx.can('team.read')) redirect('/admin/dashboard');

  const { data: profile } = await ctx.sb.from('profiles').select('*').eq('id', params.id).maybeSingle();
  if (!profile) notFound();

  const [today, week, month, { count: openConvs }, { data: activity }] = await Promise.all([
    countReplies(ctx.sb, params.id, 1),
    countReplies(ctx.sb, params.id, 7),
    countReplies(ctx.sb, params.id, 30),
    ctx.sb.from('conversations').select('id', { count: 'exact', head: true }).eq('assigned_to', params.id).in('status', ['open', 'pending']),
    ctx.sb.from('audit_log').select('id,action,target_type,details,created_at').eq('user_id', params.id).order('created_at', { ascending: false }).limit(20),
  ]);

  return (
    <>
      <Topbar title="สถิติพนักงาน" subtitle="ประสิทธิภาพ + กิจกรรมล่าสุด" />
      <div className="p-6 space-y-6 overflow-y-auto scroll-thin flex-1">
        <Card className="p-5 flex items-center gap-4">
          <Avatar name={profile.name} src={profile.avatar} size="xl" />
          <div>
            <div className="text-xl font-bold text-slate-900">{profile.name}</div>
            <div className="text-sm text-slate-500">{profile.email}</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone="purple">{ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS]}</Badge>
              <span className="text-xs text-slate-400 capitalize">{profile.status}</span>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-4 gap-4">
          <Stat label="ตอบวันนี้" value={today} icon={ChatTeardropText} tone="indigo" />
          <Stat label="ตอบ 7 วัน" value={week} icon={ChatsCircle} tone="emerald" />
          <Stat label="ตอบ 30 วัน" value={month} icon={Pulse} tone="amber" />
          <Stat label="เคสที่ดูแลอยู่" value={openConvs || 0} icon={FolderOpen} tone="rose" />
        </div>

        <Card>
          <CardHeader title="กิจกรรมล่าสุด" subtitle="20 รายการล่าสุด" />
          <div className="divide-y divide-slate-50">
            {(activity || []).map((a: any) => (
              <div key={a.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <Badge tone="brand">{ACTION_LABEL[a.action] || a.action}</Badge>
                <span className="text-xs text-slate-400">{a.target_type}</span>
                <span className="flex-1" />
                <span className="text-xs text-slate-400">{formatRelativeTime(a.created_at)}</span>
              </div>
            ))}
            {!activity?.length && <div className="py-10 text-center text-sm text-slate-400">ยังไม่มีกิจกรรมบันทึกไว้</div>}
          </div>
        </Card>
      </div>
    </>
  );
}
