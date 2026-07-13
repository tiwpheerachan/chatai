'use client';

import { useCallback, useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { Avatar } from '@/components/ui/avatar';
import { StatusDot } from '@/components/ui/badge';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';

type Strategy = 'performance' | 'balanced' | 'round_robin';
interface Settings { enabled: boolean; strategy: Strategy; sla_first_sec: number; queue_days: number }
interface AgentRow {
  id: string; name: string; role: string; online: boolean; autoAssign: boolean; maxOpen: number | null;
  load: number; replies: number; conversations: number;
  firstResponseSec: number | null; responseSec: number | null; resolved: number;
  lastActive: string | null; coversAll: boolean; brands: string[];
}
interface Data {
  settings: Settings; days: number; agents: AgentRow[];
  queue: { unassigned: number };
  byBrand: { id: string; name: string; color: string | null; queue: number; agents: { id: string; name: string; online: boolean; load: number }[] }[];
  hasPerfData: boolean;
}

const STRAT_TH: Record<Strategy, string> = { performance: 'ถ่วงน้ำหนักด้วยความเร็ว', balanced: 'เกลี่ยตามจำนวน', round_robin: 'วนตามคิว' };
const ROLE_TH: Record<string, string> = { owner: 'เจ้าของ', admin: 'แอดมิน', supervisor: 'หัวหน้า', agent: 'เอเจนต์', viewer: 'ดูอย่างเดียว', ai: 'AI' };

function dur(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `${Math.round(sec)} วิ`;
  if (sec < 3600) return `${Math.round(sec / 60)} นาที`;
  return `${Math.round((sec / 3600) * 10) / 10} ชม.`;
}
const BAR = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6'];

export function WorkloadClient({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/assignment/workload?days=${days}`).then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const patchConfig = async (patch: Partial<Settings>) => {
    if (!data) return;
    setData({ ...data, settings: { ...data.settings, ...patch } });
    await fetch('/api/assignment/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => {});
  };
  const run = async (mode: 'assign' | 'rebalance') => {
    setBusy(mode); setMsg('');
    try {
      const r = await fetch('/api/assignment/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      const j = await r.json();
      setMsg(mode === 'assign' ? `จ่ายแชทแล้ว ${j.assigned || 0} รายการ` : `เกลี่ยงานใหม่ ${j.moved || 0} รายการ`);
      load();
    } catch { setMsg('ทำรายการไม่สำเร็จ'); }
    finally { setBusy(''); }
  };

  const s = data?.settings;
  const agents = data?.agents || [];
  const loadChart = agents.filter(a => a.online || a.load > 0).map(a => ({ name: a.name, load: a.load }));
  const speedChart = agents.filter(a => a.firstResponseSec != null).map(a => ({ name: a.name, sec: Math.round(a.firstResponseSec!) }));

  return (
    <>
      <Topbar title="แบ่งงาน & ประสิทธิภาพ" subtitle="กระจายแชทให้ทีมอย่างชาญฉลาด + วัดผลรายคน" />
      <div className="p-6 space-y-5 overflow-y-auto scroll-thin flex-1">

        {/* controls */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={!!s?.enabled} disabled={!canManage} onChange={e => patchConfig({ enabled: e.target.checked })} />
            แบ่งงานอัตโนมัติ
          </label>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-500">เกณฑ์:</span>
            <select value={s?.strategy || 'performance'} disabled={!canManage} onChange={e => patchConfig({ strategy: e.target.value as Strategy })}
              className="rounded-lg border border-slate-200 px-2 py-1.5">
              {(['performance', 'balanced', 'round_robin'] as Strategy[]).map(k => <option key={k} value={k}>{STRAT_TH[k]}</option>)}
            </select>
          </div>
          <div className="flex-1" />
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="text-sm rounded-lg border border-slate-200 px-2 py-1.5">
            {[7, 14, 30].map(d => <option key={d} value={d}>ประสิทธิภาพ {d} วัน</option>)}
          </select>
          {canManage && <>
            <button onClick={() => run('assign')} disabled={!!busy}
              className="text-sm rounded-lg bg-indigo-500 text-white px-3 py-1.5 font-medium hover:bg-indigo-600 disabled:opacity-50">
              {busy === 'assign' ? 'กำลังจ่าย…' : 'แบ่งงานตอนนี้'}
            </button>
            <button onClick={() => run('rebalance')} disabled={!!busy}
              className="text-sm rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {busy === 'rebalance' ? 'กำลังเกลี่ย…' : 'เกลี่ยงานใหม่'}
            </button>
          </>}
        </div>
        {msg && <div className="text-sm text-emerald-600">{msg}</div>}

        {/* queue + no-data note */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="text-xs text-slate-500">แชทรอจ่ายงาน (ลูกค้ารอตอบ)</div>
            <div className="text-2xl font-bold mt-1 text-indigo-600">{data?.queue.unassigned ?? 0}</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="text-xs text-slate-500">พนักงานออนไลน์</div>
            <div className="text-2xl font-bold mt-1 text-emerald-600">{agents.filter(a => a.online).length}<span className="text-sm text-slate-400 font-normal"> / {agents.length}</span></div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="text-xs text-slate-500">แชทค้างในมือทีม (รวม)</div>
            <div className="text-2xl font-bold mt-1 text-slate-800">{agents.reduce((n, a) => n + a.load, 0)}</div>
          </div>
        </div>

        {data && !data.hasPerfData && (
          <div className="bg-sky-50 border border-sky-200 text-sky-800 rounded-2xl p-4 text-sm">
            ยังไม่มีข้อมูลประสิทธิภาพ — ตัวเลขความเร็ว/จำนวนจะเริ่มนับเมื่อแอดมิน <b>ตอบและปิดแชทผ่าน Nexus</b> (ข้อความที่ตอบจากในระบบนี้เท่านั้นที่วัดได้ ไม่นับที่ตอบจาก Seller Center)
          </div>
        )}

        {/* charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <h3 className="font-semibold text-slate-800 mb-3">แชทค้างในมือแต่ละคน</h3>
            {loadChart.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={loadChart} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip /><Bar dataKey="load" name="แชทค้าง" radius={[0, 4, 4, 0]}>
                    {loadChart.map((_, i) => <Cell key={i} fill={BAR[i % BAR.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-[240px] grid place-items-center text-slate-400 text-sm">ยังไม่มีแชทค้าง</div>}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <h3 className="font-semibold text-slate-800 mb-3">เวลาตอบครั้งแรกเฉลี่ย (ยิ่งต่ำยิ่งเร็ว)</h3>
            {speedChart.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={speedChart} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 60)}น`} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => dur(Number(v))} /><Bar dataKey="sec" name="เวลาตอบครั้งแรก" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-[240px] grid place-items-center text-slate-400 text-sm">ยังไม่มีข้อมูลความเร็ว</div>}
          </div>
        </div>

        {/* agent performance table */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-3">ประสิทธิภาพรายคน ({days} วัน) {loading && <span className="text-xs text-indigo-500 animate-pulse">โหลด…</span>}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-2 pr-3 font-medium">พนักงาน</th>
                <th className="py-2 px-3 font-medium text-center">รับงานอัตโนมัติ</th>
                <th className="py-2 px-3 font-medium text-right">แชทค้าง</th>
                <th className="py-2 px-3 font-medium text-right">ตอบไป</th>
                <th className="py-2 px-3 font-medium text-right">เคส</th>
                <th className="py-2 px-3 font-medium text-right">ตอบครั้งแรก</th>
                <th className="py-2 px-3 font-medium text-right">ตอบเฉลี่ย</th>
                <th className="py-2 px-3 font-medium text-right">ปิดเคส</th>
                <th className="py-2 pl-3 font-medium">แบรนด์</th>
              </tr></thead>
              <tbody>
                {agents.map(a => (
                  <tr key={a.id} className="border-b border-slate-50">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={a.name} size="sm" />
                        <div>
                          <div className="font-medium text-slate-800 flex items-center gap-1.5">{a.name} <StatusDot online={a.online} /></div>
                          <div className="text-[11px] text-slate-400">{ROLE_TH[a.role] || a.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {a.autoAssign ? <span className="text-emerald-600 text-xs font-medium">เปิด</span> : <span className="text-slate-300 text-xs">ปิด</span>}
                      {a.maxOpen != null && <span className="text-[10px] text-slate-400 block">สูงสุด {a.maxOpen}</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-800">{a.load}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{a.replies}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{a.conversations}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-600">{dur(a.firstResponseSec)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{dur(a.responseSec)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{a.resolved}</td>
                    <td className="py-2.5 pl-3 text-xs text-slate-500 max-w-[220px] truncate">{a.coversAll ? 'ทุกแบรนด์' : (a.brands.join(', ') || '—')}</td>
                  </tr>
                ))}
                {!agents.length && <tr><td colSpan={9} className="py-8 text-center text-slate-400">ยังไม่มีพนักงานที่รับงานแชท (role เอเจนต์/หัวหน้า/แอดมิน)</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* per-brand distribution */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-3">การกระจายงานตามแบรนด์</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(data?.byBrand || []).map(b => (
              <div key={b.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-800 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color || '#94a3b8' }} />{b.name}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${b.queue > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>รอ {b.queue}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {b.agents.length ? b.agents.map(ag => (
                    <span key={ag.id} className={`text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${ag.online ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>
                      {ag.name} · {ag.load}
                    </span>
                  )) : <span className="text-xs text-rose-400">ไม่มีแอดมินดูแลแบรนด์นี้</span>}
                </div>
              </div>
            ))}
            {!data?.byBrand?.length && <div className="text-sm text-slate-400">—</div>}
          </div>
        </div>
      </div>
    </>
  );
}
