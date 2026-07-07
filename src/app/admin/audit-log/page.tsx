import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { formatRelativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const ACTION_TONE: Record<string, 'brand' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate'> = {
  'chat.reply': 'brand', 'chat.transfer': 'amber', 'chat.close': 'emerald', 'ai.send': 'violet',
  'user.update': 'rose', 'role.update': 'rose', 'profile.update': 'slate',
};

const ACTION_LABEL: Record<string, string> = {
  'chat.reply': 'ตอบแชท', 'chat.transfer': 'โอนแชท', 'chat.close': 'ปิดเคส', 'ai.send': 'AI ตอบ',
  'user.update': 'แก้ไขผู้ใช้', 'role.update': 'แก้สิทธิ์ Role', 'profile.update': 'แก้โปรไฟล์',
};

export default async function AuditLogPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');

  const { data: logs } = await ctx.sb
    .from('audit_log')
    .select('id,user_id,action,target_type,target_id,details,ip,created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const ids = [...new Set((logs || []).map(l => l.user_id).filter(Boolean))];
  const { data: profiles } = ids.length
    ? await ctx.sb.from('profiles').select('id,name,avatar').in('id', ids as string[])
    : { data: [] };
  const namemap = new Map((profiles || []).map(p => [p.id, p]));

  return (
    <>
      <Topbar title="Audit Log" subtitle={`บันทึกกิจกรรมล่าสุด ${logs?.length || 0} รายการ`} />
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-5 py-3 font-medium">ผู้ใช้</th>
                <th className="text-left px-4 py-3 font-medium">การกระทำ</th>
                <th className="text-left px-4 py-3 font-medium">เป้าหมาย</th>
                <th className="text-left px-4 py-3 font-medium">รายละเอียด</th>
                <th className="text-left px-4 py-3 font-medium">เวลา</th>
                <th className="text-left px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {(logs || []).map((l: any) => {
                const prof = l.user_id ? namemap.get(l.user_id) : null;
                return (
                  <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={prof?.name || 'System'} src={prof?.avatar} size="xs" />
                        <span className="text-slate-700">{prof?.name || 'System'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={ACTION_TONE[l.action] || 'slate'}>{ACTION_LABEL[l.action] || l.action}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{l.target_type || '-'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[260px] truncate">
                      {l.details && Object.keys(l.details).length ? JSON.stringify(l.details) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400" title={new Date(l.created_at).toLocaleString('th-TH')}>
                      {formatRelativeTime(l.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{l.ip || '-'}</td>
                  </tr>
                );
              })}
              {!logs?.length && <tr><td colSpan={6} className="py-10 text-center text-slate-400">ยังไม่มี audit log</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
