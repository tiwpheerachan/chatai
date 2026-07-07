import { Topbar } from '@/components/layout/topbar';
import { Card, CardHeader } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { Avatar } from '@/components/ui/avatar';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Badge } from '@/components/ui/badge';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { CHANNEL_META, formatRelativeTime, brandIcon } from '@/lib/utils';
import { ChatsCircle, EnvelopeSimple, Tray, Storefront } from '@phosphor-icons/react/dist/ssr';
import { DashboardCharts } from './charts.client';

export const dynamic = 'force-dynamic';

const PRIORITY_TONE = { urgent: 'rose', high: 'amber', normal: 'slate', low: 'slate' } as const;

export default async function DashboardPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  const sb = ctx.sb;
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  const [
    { count: total },
    { count: unreadConvos },
    { count: openConvos },
    { count: msgs7d },
    { count: customerMsgs },
    { data: recent },
    { data: channelRows },
    { data: brandRows },
  ] = await Promise.all([
    sb.from('conversations').select('id', { count: 'exact', head: true }),
    sb.from('conversations').select('id', { count: 'exact', head: true }).gt('unread', 0),
    sb.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    sb.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since),
    sb.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender_type', 'customer'),
    sb
      .from('conversations')
      .select('id,channel,status,priority,unread,last_message_at,customer:customers(display_name,avatar),brand:brands(name,color)')
      .order('last_message_at', { ascending: false })
      .limit(7),
    sb.from('conversations').select('channel'),
    sb.from('conversations').select('unread, brand:brands(name,color)'),
  ]);

  // ---- by channel ----
  const channelCounts: Record<string, number> = {};
  for (const r of (channelRows as { channel: string }[] | null) || []) channelCounts[r.channel] = (channelCounts[r.channel] || 0) + 1;
  const channelArr = Object.entries(channelCounts).sort((a, b) => b[1] - a[1]);
  const channelMax = Math.max(1, ...channelArr.map(([, v]) => v));

  // ---- by brand (the multi-brand insight) ----
  const brandMap: Record<string, { count: number; unread: number; color: string | null }> = {};
  for (const r of (brandRows as any[]) || []) {
    const name = r.brand?.name || 'ไม่ระบุแบรนด์';
    if (!brandMap[name]) brandMap[name] = { count: 0, unread: 0, color: r.brand?.color ?? null };
    brandMap[name].count++;
    brandMap[name].unread += r.unread || 0;
  }
  const brandArr = Object.entries(brandMap).sort((a, b) => b[1].count - a[1].count);
  const brandMax = Math.max(1, ...brandArr.map(([, v]) => v.count));
  const brandsActive = brandArr.filter(([n]) => n !== 'ไม่ระบุแบรนด์').length;

  return (
    <>
      <Topbar title={`สวัสดี, ${ctx.name.split(' ')[0]}`} subtitle="ภาพรวมแชททุกแบรนด์ + การวิเคราะห์">
        <Badge tone="emerald"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</Badge>
      </Topbar>

      <div className="p-6 space-y-6 overflow-y-auto scroll-thin flex-1">
        <div className="grid grid-cols-4 gap-4">
          <Stat label="แชททั้งหมด" value={total || 0} icon={ChatsCircle} tone="indigo" />
          <Stat label="ยังไม่อ่าน" value={unreadConvos || 0} icon={EnvelopeSimple} tone="rose" />
          <Stat label="เปิดอยู่" value={openConvos || 0} icon={Tray} tone="amber" />
          <Stat label="แบรนด์ที่มีแชท" value={brandsActive} icon={Storefront} tone="emerald" />
        </div>

        <DashboardCharts />

        {/* By brand + by channel */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="col-span-2">
            <CardHeader title="แชทตามแบรนด์" subtitle={`${brandArr.length} แบรนด์ · เรียงตามจำนวนแชท`} />
            <div className="p-5 space-y-3">
              {brandArr.slice(0, 10).map(([name, v]) => (
                <div key={name} className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={brandIcon(name)} alt="" className="w-6 h-6 rounded-lg object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-700 truncate">{name}</span>
                      <span className="shrink-0 flex items-center gap-2">
                        {v.unread > 0 && <span className="text-rose-600 font-semibold">{v.unread} ค้าง</span>}
                        <span className="font-semibold text-slate-900">{v.count}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(v.count / brandMax) * 100}%`, background: v.color || '#6366f1' }} />
                    </div>
                  </div>
                </div>
              ))}
              {!brandArr.length && <div className="text-sm text-slate-400">ยังไม่มีข้อมูล — กด “ซิงค์ Shopee” ในหน้าแชท</div>}
            </div>
          </Card>

          <Card>
            <CardHeader title="ตามช่องทาง" />
            <div className="p-5 space-y-3">
              {channelArr.map(([ch, v]) => (
                <div key={ch} className="flex items-center gap-3">
                  <ChannelIcon channel={ch} size="sm" />
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600">{CHANNEL_META[ch]?.name || ch}</span>
                      <span className="font-semibold text-slate-900">{v}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(v / channelMax) * 100}%`, background: CHANNEL_META[ch]?.color || '#6366f1' }} />
                    </div>
                  </div>
                </div>
              ))}
              {!channelArr.length && <div className="text-sm text-slate-400">รอข้อมูล...</div>}
            </div>
          </Card>
        </div>

        {/* Recent + quick insight */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="col-span-2">
            <CardHeader title="แชทล่าสุด" subtitle="7 รายการล่าสุด" />
            <div className="divide-y divide-slate-50">
              {(recent || []).map((c: any) => (
                <div key={c.id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                  <Avatar name={c.customer?.display_name} src={c.customer?.avatar} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{c.customer?.display_name || '-'}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-1.5 truncate">
                      {c.brand?.name && <span className="font-medium" style={{ color: c.brand.color || undefined }}>{c.brand.name}</span>}
                      <span>· {CHANNEL_META[c.channel]?.name} · {formatRelativeTime(c.last_message_at)}</span>
                    </div>
                  </div>
                  {c.unread > 0 && <span className="bg-indigo-600 text-white text-[10px] rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center font-bold">{c.unread}</span>}
                  {c.priority !== 'normal' && c.priority !== 'low' && (
                    <Badge tone={PRIORITY_TONE[c.priority as keyof typeof PRIORITY_TONE]}>{c.priority}</Badge>
                  )}
                  <ChannelIcon channel={c.channel} size="sm" />
                </div>
              ))}
              {!recent?.length && <div className="py-10 text-center text-sm text-slate-400">ยังไม่มีแชท</div>}
            </div>
          </Card>

          <Card>
            <CardHeader title="สรุป 7 วัน" />
            <div className="p-5 space-y-4 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">ข้อความทั้งหมด</span><span className="font-semibold text-slate-900">{msgs7d || 0}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">จากลูกค้า</span><span className="font-semibold text-slate-900">{customerMsgs || 0}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">จากร้าน/ทีม</span><span className="font-semibold text-slate-900">{Math.max(0, (msgs7d || 0) - (customerMsgs || 0))}</span></div>
              <div className="pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-500 mb-1">อัตราการตอบของทีม</div>
                <div className="text-2xl font-bold text-slate-900">
                  {msgs7d ? Math.round(((msgs7d - (customerMsgs || 0)) / msgs7d) * 100) : 0}%
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
