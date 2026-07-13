'use client';

import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Fi } from '@/components/ui/fi';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts';

type Tab = 'reviews' | 'performance' | 'pending';
type Brand = { slug: string; name: string };

const GROUPS = [
  { key: 'product', label: 'เกี่ยวกับสินค้า', color: '#6366f1' },
  { key: 'shipping', label: 'การจัดส่ง', color: '#10b981' },
  { key: 'service', label: 'ประสบการณ์บริการ', color: '#475569' },
  { key: 'promotion', label: 'ราคา/โปรโมชั่น', color: '#f59e0b' },
  { key: 'other', label: 'อื่น ๆ', color: '#cbd5e1' },
] as const;

const PRESETS = [
  { label: '7 วัน', days: 7 },
  { label: '15 วัน', days: 15 },
  { label: '30 วัน', days: 30 },
  { label: '90 วัน', days: 90 },
];

function fmtHrs(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} นาที`;
  if (h < 24) return `${h} ชม.`;
  return `${Math.round((h / 24) * 10) / 10} วัน`;
}

/* ---------- shared bits ---------- */
function Kpi({ label, value, tone = 'slate', sub }: { label: string; value: string | number; tone?: string; sub?: string }) {
  const tones: Record<string, string> = {
    slate: 'text-slate-800', rose: 'text-rose-600', amber: 'text-amber-600',
    emerald: 'text-emerald-600', indigo: 'text-indigo-600', sky: 'text-sky-600',
  };
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tones[tone] || tones.slate}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
function CardBox({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}
const GroupTrend = ({ data }: { data: any[] }) => (
  <ResponsiveContainer width="100%" height={280}>
    <AreaChart data={data}>
      <defs>
        {GROUPS.map(g => (
          <linearGradient key={g.key} id={`g-${g.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={g.color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={g.color} stopOpacity={0.04} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
      <XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
      <Tooltip /><Legend />
      {GROUPS.map(g => (
        <Area key={g.key} type="monotone" dataKey={g.key} name={g.label} stackId="1"
          stroke={g.color} fill={`url(#g-${g.key})`} />
      ))}
    </AreaChart>
  </ResponsiveContainer>
);
const GroupDonut = ({ totals }: { totals: Record<string, number> }) => {
  const data = GROUPS.map(g => ({ name: g.label, value: totals[g.key] || 0, color: g.color })).filter(d => d.value > 0);
  if (!data.length) return <div className="h-[280px] grid place-items-center text-slate-400 text-sm">ไม่มีข้อมูล</div>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={65} outerRadius={100} paddingAngle={2}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip /><Legend />
      </PieChart>
    </ResponsiveContainer>
  );
};

/* ================= main ================= */
export function InsightsClient({ configured, brands }: { configured: boolean; brands: Brand[] }) {
  const [tab, setTab] = useState<Tab>('reviews');
  const [brand, setBrand] = useState('');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400_000);
    return { from: from.toISOString(), to: to.toISOString(), fromLabel: from.toISOString().slice(0, 10), toLabel: to.toISOString().slice(0, 10) };
  }, [days]);

  useEffect(() => {
    if (!configured) return;
    setLoading(true); setData(null);
    const qs = new URLSearchParams({ view: tab, from: range.from, to: range.to });
    if (brand) qs.set('brand', brand);
    fetch(`/api/insights?${qs}`).then(r => r.json()).then(setData).catch(() => setData({ error: 'โหลดข้อมูลไม่สำเร็จ' })).finally(() => setLoading(false));
  }, [tab, brand, range.from, range.to, configured]);

  const tabs: { key: Tab; label: string; desc: string; icon: string; tint: string; ring: string; chip: string }[] = [
    { key: 'reviews', label: 'การวิเคราะห์รีวิว', desc: 'ปัญหา/ความเห็นเชิงลบรายสินค้า', icon: 'comment-alt', tint: 'text-indigo-600', ring: 'border-indigo-300 ring-indigo-100 bg-indigo-50/60', chip: 'bg-indigo-100 text-indigo-600' },
    { key: 'performance', label: 'ผลการดำเนินงานร้านค้า', desc: 'CSAT · อัตราตอบกลับ รายแบรนด์', icon: 'shop', tint: 'text-emerald-600', ring: 'border-emerald-300 ring-emerald-100 bg-emerald-50/60', chip: 'bg-emerald-100 text-emerald-600' },
    { key: 'pending', label: 'งานที่รอจัดการ', desc: 'SLA · เวลาแก้ไข · ตามหมวด', icon: 'time-check', tint: 'text-amber-600', ring: 'border-amber-300 ring-amber-100 bg-amber-50/60', chip: 'bg-amber-100 text-amber-600' },
  ];

  return (
    <>
      <Topbar title="วิเคราะห์เชิงลึก" subtitle="รีวิว · ผลการดำเนินงานร้านค้า · งานที่รอจัดการ" />
      <div className="p-6 space-y-5 overflow-y-auto scroll-thin flex-1">
        {/* category selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {tabs.map(t => {
            const on = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-3 text-left rounded-2xl border p-3.5 transition shadow-sm ${on ? `${t.ring} ring-2` : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${on ? t.chip : 'bg-slate-100 text-slate-400'}`}>
                  <Fi name={t.icon} className="text-lg" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${on ? t.tint : 'text-slate-700'}`}>{t.label}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{t.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={brand} onChange={e => setBrand(e.target.value)}
            className="text-sm rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700">
            <option value="">ทุกแบรนด์</option>
            {brands.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
          </select>
          <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden">
            {PRESETS.map(p => (
              <button key={p.days} onClick={() => setDays(p.days)}
                className={`px-3 py-2 text-sm ${days === p.days ? 'bg-indigo-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400 ml-1">{range.fromLabel} → {range.toLabel}</span>
          {loading && <span className="text-xs text-indigo-500 animate-pulse ml-2">กำลังโหลด…</span>}
        </div>

        {!configured && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-5 text-sm">
            ยังไม่ได้ตั้งค่าการเชื่อมต่อชุดข้อมูลรีวิว (COMMENTS_SUPABASE_URL / COMMENTS_SUPABASE_SERVICE_ROLE_KEY) บน production —
            ตั้งค่าใน Render dashboard เพื่อเปิดใช้งานหน้านี้
          </div>
        )}
        {data?.error && <div className="text-sm text-rose-600">เกิดข้อผิดพลาด: {data.error}</div>}

        {configured && !loading && data && !data.error && (
          <>
            {tab === 'reviews' && <ReviewsView d={data} />}
            {tab === 'performance' && <PerformanceView perf={data.perf || []} />}
            {tab === 'pending' && <PendingView d={data} />}
          </>
        )}
      </div>
    </>
  );
}

/* ---------- Review Analysis ---------- */
function ReviewsView({ d }: { d: any }) {
  const products = (d.products || []) as any[];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="จำนวนรีวิวเชิงลบ" value={d.totalNeg ?? 0} tone="rose" sub={`จาก ${d.windowTotal ?? 0} รีวิว`} />
        <Kpi label="อัตรารีวิวเชิงลบ" value={`${d.negRate ?? 0}%`} tone="amber" />
        <Kpi label="สินค้าที่เกี่ยวข้อง" value={d.relatedProducts ?? 0} tone="indigo" />
        <Kpi label="จำนวนปัญหาที่พบ" value={d.issuesFound ?? 0} tone="sky" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><CardBox title="แนวโน้มความคิดเห็นเชิงลบ (ตามหมวด)"><GroupTrend data={d.trend || []} /></CardBox></div>
        <CardBox title="สัดส่วนปัญหา"><GroupDonut totals={d.groupTotals || {}} /></CardBox>
      </div>
      <CardBox title={`ปัญหาหลักรายสินค้า (${products.length})`}>
        {!products.length ? <div className="text-sm text-slate-400 py-6 text-center">ไม่มีรีวิวเชิงลบในช่วงนี้ 🎉</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-2 pr-3 font-medium">สินค้า</th>
                <th className="py-2 px-3 font-medium">3 ปัญหาหลัก</th>
                <th className="py-2 px-3 font-medium text-right">รีวิวเชิงลบ</th>
                <th className="py-2 px-3 font-medium text-right">อัตราเชิงลบ</th>
                <th className="py-2 pl-3 font-medium text-right">จำนวนปัญหา</th>
              </tr></thead>
              <tbody>
                {products.slice(0, 50).map((p, i) => (
                  <tr key={i} className="border-b border-slate-50 align-top">
                    <td className="py-3 pr-3 max-w-[320px]">
                      <div className="flex items-start gap-3">
                        {p.image
                          ? <img src={p.image} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-100 shrink-0" loading="lazy" />
                          : <div className="w-12 h-12 rounded-lg bg-slate-100 grid place-items-center text-slate-300 shrink-0"><Fi name="picture" /></div>}
                        <div className="min-w-0">
                          <div className="font-medium text-slate-700 line-clamp-2">{p.displayName || p.product_name || p.product_id || '—'}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">#{p.product_id || p.product_name}</div>
                          {p.sample && <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">“{p.sample}”</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-1">
                        {p.problems.map((pr: any, j: number) => (
                          <span key={j} className="inline-flex items-center gap-1.5 text-xs">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: GROUPS.find(g => g.key === pr.group)?.color }} />
                            {pr.label} <span className="text-slate-400">({pr.count})</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-rose-600">{p.negatives}</td>
                    <td className="py-3 px-3 text-right text-slate-600">{p.negRate}%</td>
                    <td className="py-3 pl-3 text-right text-slate-600">{p.problems.reduce((s: number, x: any) => s + x.count, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBox>
    </div>
  );
}

/* ---------- Shop Performance ---------- */
function PerformanceView({ perf }: { perf: any[] }) {
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'reviews', dir: -1 });
  const rows = [...perf].sort((a, b) => (a[sort.k] > b[sort.k] ? 1 : -1) * sort.dir);
  const th = (k: string, label: string, align = 'right') => (
    <th className={`py-2 px-3 font-medium cursor-pointer select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => setSort(s => ({ k, dir: s.k === k && s.dir === -1 ? 1 : -1 }))}>
      {label}{sort.k === k ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
    </th>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardBox title="จำนวนรีวิวต่อแบรนด์">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rows.slice(0, 12)} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="brand" width={90} tick={{ fontSize: 11 }} />
              <Tooltip /><Bar dataKey="reviews" name="รีวิว" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardBox>
        <CardBox title="ความพึงพอใจ (CSAT %) vs อัตราเชิงลบ %">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rows.slice(0, 12)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="brand" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend />
              <Bar dataKey="csat" name="CSAT %" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="negRate" name="เชิงลบ %" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardBox>
      </div>
      <CardBox title={`ผลการดำเนินงานรายแบรนด์ (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 border-b border-slate-100">
              {th('brand', 'แบรนด์', 'left')}
              {th('reviews', 'รีวิว')}
              {th('avgRating', 'คะแนนเฉลี่ย')}
              {th('csat', 'CSAT %')}
              {th('negRate', 'เชิงลบ %')}
              {th('replyRate', 'อัตราตอบกลับ %')}
              {th('avgReplyHrs', 'เวลาตอบเฉลี่ย')}
              {th('urgent', 'ด่วน')}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-2.5 px-3 font-medium text-slate-700">{r.brand}</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">{r.reviews}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-amber-600">{r.avgRating || '—'}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-600">{r.csat}%</td>
                  <td className="py-2.5 px-3 text-right text-rose-600">{r.negRate}%</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">{r.replyRate}%</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">{fmtHrs(r.avgReplyHrs)}</td>
                  <td className="py-2.5 px-3 text-right">{r.urgent ? <span className="text-rose-600 font-medium">{r.urgent}</span> : <span className="text-slate-300">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBox>
    </div>
  );
}

/* ---------- Pending / Issues ---------- */
function PendingView({ d }: { d: any }) {
  const sla = d.sla || {};
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="งานที่เกิดขึ้น" value={d.created ?? 0} tone="indigo" sub="รีวิวเชิงลบ/ด่วน" />
        <Kpi label="จัดการแล้ว" value={d.resolved ?? 0} tone="emerald" />
        <Kpi label="กำลังดำเนินการ" value={d.inProgress ?? 0} tone="amber" />
        <Kpi label="ยังไม่ได้จัดการ" value={d.open ?? 0} tone="rose" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="อัตราจัดการสำเร็จ" value={`${d.resolveRate ?? 0}%`} tone="emerald" />
        <Kpi label="สำเร็จภายใน 1 ชม." value={`${sla.h1 ?? 0}%`} />
        <Kpi label="ภายใน 5 ชม." value={`${sla.h5 ?? 0}%`} />
        <Kpi label="ภายใน 12 ชม." value={`${sla.h12 ?? 0}%`} />
        <Kpi label="เวลาจัดการเฉลี่ย" value={fmtHrs(d.avgResolveHrs ?? null)} tone="sky" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CardBox title="งานที่รอจัดการรายวัน (ตามหมวดปัญหา)">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d.trend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip /><Legend />
                {GROUPS.map(g => <Bar key={g.key} dataKey={g.key} name={g.label} stackId="a" fill={g.color} />)}
              </BarChart>
            </ResponsiveContainer>
          </CardBox>
        </div>
        <CardBox title="สัดส่วนงานตามหมวด">
          <GroupDonut totals={(d.trend || []).reduce((acc: any, row: any) => {
            for (const g of GROUPS) acc[g.key] = (acc[g.key] || 0) + (row[g.key] || 0);
            return acc;
          }, {})} />
        </CardBox>
      </div>
      <CardBox title={`งานที่รอจัดการรายแบรนด์ (${(d.byBrand || []).length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="py-2 pr-3 font-medium">แบรนด์</th>
              <th className="py-2 px-3 font-medium text-right">เกิดขึ้น</th>
              <th className="py-2 px-3 font-medium text-right">จัดการแล้ว</th>
              <th className="py-2 px-3 font-medium text-right">คงค้าง</th>
              <th className="py-2 px-3 font-medium text-right">อัตราสำเร็จ</th>
              <th className="py-2 pl-3 font-medium text-right">เวลาเฉลี่ย</th>
            </tr></thead>
            <tbody>
              {(d.byBrand || []).map((b: any, i: number) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-2.5 pr-3 font-medium text-slate-700">{b.brand}</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">{b.created}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-600">{b.resolved}</td>
                  <td className="py-2.5 px-3 text-right text-rose-600">{b.open}</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">{b.resolveRate}%</td>
                  <td className="py-2.5 pl-3 text-right text-slate-600">{fmtHrs(b.avgResolveHrs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBox>
    </div>
  );
}
