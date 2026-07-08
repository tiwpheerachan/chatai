import { Avatar } from '@/components/ui/avatar';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Fi } from '@/components/ui/fi';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { CHANNEL_META, formatRelativeTime, brandIcon } from '@/lib/utils';
import { DashboardCharts } from './charts.client';

export const dynamic = 'force-dynamic';

// glassy, rounded surface — the "Finexy" look: soft white card, big radius, gentle shadow
const CARD = 'bg-white rounded-[26px] border border-slate-100 shadow-[0_2px_14px_-6px_rgba(15,23,42,0.12)]';

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
  const teamRate = msgs7d ? Math.round(((msgs7d - (customerMsgs || 0)) / msgs7d) * 100) : 0;

  const stats = [
    { label: 'แชททั้งหมด', value: total || 0, icon: 'comment-dots', highlight: false },
    { label: 'ยังไม่อ่าน', value: unreadConvos || 0, icon: 'envelope', highlight: true },
    { label: 'เปิดอยู่', value: openConvos || 0, icon: 'inbox', highlight: false },
    { label: 'แบรนด์ที่มีแชท', value: brandsActive, icon: 'shop', highlight: false },
  ];

  return (
    <div className="flex-1 overflow-y-auto scroll-thin bg-[#eef0f4] p-6 space-y-5">
      {/* Greeting */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-slate-900">สวัสดี, {ctx.name.split(' ')[0]} 👋</h1>
          <p className="text-sm text-slate-500 mt-0.5">ภาพรวมแชททุกแบรนด์ + การวิเคราะห์แบบเรียลไทม์</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-100 shadow-sm px-3 py-1.5 text-xs font-medium text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label}
            className={s.highlight
              ? 'rounded-[26px] p-5 text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.6)] bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500'
              : `${CARD} p-5`}>
            <div className="flex items-start justify-between">
              <span className={s.highlight ? 'text-white/80 text-sm' : 'text-slate-500 text-sm'}>{s.label}</span>
              <span className={s.highlight
                ? 'w-9 h-9 rounded-full bg-white/20 flex items-center justify-center'
                : 'w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500'}>
                <Fi name={s.icon} className="text-base" />
              </span>
            </div>
            <div className={s.highlight ? 'text-3xl font-bold mt-3' : 'text-3xl font-bold mt-3 text-slate-900'}>{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className={`${CARD} p-5`}>
        <DashboardCharts />
      </div>

      {/* By brand + by channel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${CARD} lg:col-span-2 p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">แชทตามแบรนด์</h3>
            <span className="text-xs text-slate-400">{brandArr.length} แบรนด์ · เรียงตามจำนวนแชท</span>
          </div>
          <div className="space-y-3.5">
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
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(v.count / brandMax) * 100}%`, background: v.color || '#6366f1' }} />
                  </div>
                </div>
              </div>
            ))}
            {!brandArr.length && <div className="text-sm text-slate-400">ยังไม่มีข้อมูล — กด “ซิงค์ Shopee” ในหน้าแชท</div>}
          </div>
        </div>

        <div className={`${CARD} p-5`}>
          <h3 className="font-semibold text-slate-900 mb-4">ตามช่องทาง</h3>
          <div className="space-y-3.5">
            {channelArr.map(([ch, v]) => (
              <div key={ch} className="flex items-center gap-3">
                <ChannelIcon channel={ch} size="sm" />
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">{CHANNEL_META[ch]?.name || ch}</span>
                    <span className="font-semibold text-slate-900">{v}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(v / channelMax) * 100}%`, background: CHANNEL_META[ch]?.color || '#6366f1' }} />
                  </div>
                </div>
              </div>
            ))}
            {!channelArr.length && <div className="text-sm text-slate-400">รอข้อมูล...</div>}
          </div>
        </div>
      </div>

      {/* Recent + 7-day summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${CARD} lg:col-span-2 overflow-hidden`}>
          <div className="flex items-center justify-between p-5 pb-3">
            <h3 className="font-semibold text-slate-900">แชทล่าสุด</h3>
            <span className="text-xs text-slate-400">7 รายการล่าสุด</span>
          </div>
          <div>
            {(recent || []).map((c: any) => (
              <div key={c.id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-slate-50/70 transition-colors">
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
                  <span className={`text-[10px] rounded-full px-2 py-0.5 font-semibold ${c.priority === 'urgent' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{c.priority}</span>
                )}
                <ChannelIcon channel={c.channel} size="sm" />
              </div>
            ))}
            {!recent?.length && <div className="py-10 text-center text-sm text-slate-400">ยังไม่มีแชท</div>}
          </div>
        </div>

        <div className={`${CARD} p-5`}>
          <h3 className="font-semibold text-slate-900 mb-4">สรุป 7 วัน</h3>
          <div className="space-y-3.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">ข้อความทั้งหมด</span><span className="font-semibold text-slate-900">{(msgs7d || 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">จากลูกค้า</span><span className="font-semibold text-slate-900">{(customerMsgs || 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">จากร้าน/ทีม</span><span className="font-semibold text-slate-900">{Math.max(0, (msgs7d || 0) - (customerMsgs || 0)).toLocaleString()}</span></div>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500 mb-1">อัตราการตอบของทีม</div>
            <div className="flex items-end gap-2">
              <div className="text-3xl font-bold text-slate-900">{teamRate}%</div>
            </div>
            <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${teamRate}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
