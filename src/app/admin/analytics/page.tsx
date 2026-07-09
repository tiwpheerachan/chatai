import { Topbar } from '@/components/layout/topbar';
import { Stat } from '@/components/ui/stat';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { adminSb, withBrandScope, scopedMessages } from '@/lib/analytics-scope';
import { Inbox, CheckCheck, Bot, Users } from 'lucide-react';
import { AnalyticsCharts } from './charts.client';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  const sb = adminSb();
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const [{ count: total }, { count: solved }, { count: aiMsgs }, { count: humanMsgs }] = await Promise.all([
    withBrandScope(sb.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', since), ctx.scope),
    withBrandScope(sb.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'solved').gte('created_at', since), ctx.scope),
    scopedMessages(ctx.scope).eq('sender_type', 'ai').gte('created_at', since),
    scopedMessages(ctx.scope).eq('sender_type', 'agent').gte('created_at', since),
  ]);

  return (
    <>
      <Topbar title="Analytics" subtitle="รายงานและข้อมูลเชิงลึก (7 วัน)" />
      <div className="p-6 space-y-6 overflow-y-auto scroll-thin flex-1">
        <div className="grid grid-cols-4 gap-4">
          <Stat label="Conversations" value={total || 0} icon={Inbox} tone="indigo" />
          <Stat label="Resolved" value={solved || 0} icon={CheckCheck} tone="emerald" />
          <Stat label="AI Messages" value={aiMsgs || 0} icon={Bot} tone="amber" />
          <Stat label="Agent Messages" value={humanMsgs || 0} icon={Users} tone="rose" />
        </div>
        <AnalyticsCharts />
      </div>
    </>
  );
}
