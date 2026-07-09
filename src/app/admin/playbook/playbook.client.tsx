'use client';

import { useEffect, useState } from 'react';
import { Fi } from '@/components/ui/fi';
import { cn } from '@/lib/utils';

const CONDITIONS = [
  { v: '', label: 'ทุกสถานะ' },
  { v: 'no_order', label: 'ยังไม่มีคำสั่งซื้อ' },
  { v: 'to_ship', label: 'รอจัดส่ง' },
  { v: 'shipped', label: 'จัดส่งแล้ว' },
  { v: 'to_receive', label: 'รอรับสินค้า' },
  { v: 'over_15d', label: 'สั่งเกิน 15 วัน' },
  { v: 'preorder', label: 'พรีออเดอร์' },
];
const CARD = 'bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_-6px_rgba(15,23,42,0.15)]';

type Strategy = { id: string; label: string | null; response: string | null; order_condition: string | null; action: 'reply' | 'handoff'; enabled: boolean };
type Scenario = { id: string; title: string; examples: string[]; enabled: boolean; strategies: Strategy[] };

export function PlaybookClient({ canEdit }: { canEdit: boolean }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newExample, setNewExample] = useState<Record<string, string>>({});

  const load = () => {
    setLoading(true);
    fetch('/api/playbook').then(r => r.json())
      .then(d => setScenarios(Array.isArray(d?.scenarios) ? d.scenarios : []))
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const patchScenario = async (id: string, patch: any) => {
    setScenarios(s => s.map(x => x.id === id ? { ...x, ...patch } : x));
    await fetch(`/api/playbook/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => {});
  };
  const addScenario = async () => {
    const title = newTitle.trim(); if (!title) return;
    setNewTitle('');
    const r = await fetch('/api/playbook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    if (r.ok) { const d = await r.json(); setScenarios(s => [{ ...d, strategies: d.strategies || [] }, ...s]); }
  };
  const delScenario = async (id: string) => {
    if (!confirm('ลบฉากนี้และกลยุทธ์ทั้งหมด?')) return;
    setScenarios(s => s.filter(x => x.id !== id));
    await fetch(`/api/playbook/${id}`, { method: 'DELETE' }).catch(() => {});
  };
  const addExample = (sc: Scenario) => {
    const ex = (newExample[sc.id] || '').trim(); if (!ex) return;
    setNewExample(m => ({ ...m, [sc.id]: '' }));
    patchScenario(sc.id, { examples: [...sc.examples, ex] });
  };
  const rmExample = (sc: Scenario, i: number) => patchScenario(sc.id, { examples: sc.examples.filter((_, x) => x !== i) });

  const addStrategy = async (scId: string) => {
    const r = await fetch(`/api/playbook/${scId}/strategies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: '', action: 'reply' }) });
    if (r.ok) { const d = await r.json(); setScenarios(s => s.map(x => x.id === scId ? { ...x, strategies: [...x.strategies, d] } : x)); }
  };
  const patchStrategy = (scId: string, sid: string, patch: any) => {
    setScenarios(s => s.map(x => x.id === scId ? { ...x, strategies: x.strategies.map(st => st.id === sid ? { ...st, ...patch } : st) } : x));
    fetch(`/api/playbook/strategies/${sid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => {});
  };
  const delStrategy = (scId: string, sid: string) => {
    setScenarios(s => s.map(x => x.id === scId ? { ...x, strategies: x.strategies.filter(st => st.id !== sid) } : x));
    fetch(`/api/playbook/strategies/${sid}`, { method: 'DELETE' }).catch(() => {});
  };

  return (
    <div className="flex-1 overflow-y-auto scroll-thin bg-[#eef0f4] p-6 space-y-5">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-slate-900 flex items-center gap-2"><Fi name="sparkles" className="text-amber-400" /> ฉากสถานการณ์ & กลยุทธ์การตอบกลับ</h1>
        <p className="text-sm text-slate-500 mt-0.5">ตั้งค่าคำถามที่พบบ่อย + คำตอบมาตรฐาน ให้ผู้ช่วย “ช่วยตอบ” ใช้ร่างคำตอบตามที่ร้านกำหนด{canEdit ? '' : ' (ดูอย่างเดียว — ต้องเป็นหัวหน้าทีมขึ้นไปจึงจะแก้ได้)'}</p>
      </div>

      {canEdit && (
        <div className={`${CARD} p-3 flex items-center gap-2`}>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addScenario(); }}
            placeholder="เพิ่มฉากสถานการณ์ใหม่ เช่น “ผู้ซื้อถามว่ามีของพร้อมส่งไหม”" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={addScenario} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium flex items-center gap-1.5"><Fi name="plus" className="text-sm" /> เพิ่มฉาก</button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-400">กำลังโหลด…</div>
      ) : !scenarios.length ? (
        <div className={`${CARD} p-8 text-center text-sm text-slate-400`}>ยังไม่มีฉากสถานการณ์ — เพิ่มฉากแรกด้านบน แล้วใส่ตัวอย่างคำถามลูกค้า + คำตอบมาตรฐาน</div>
      ) : scenarios.map(sc => (
        <div key={sc.id} className={`${CARD} p-4 space-y-3`}>
          <div className="flex items-start justify-between gap-3">
            <input defaultValue={sc.title} disabled={!canEdit} onBlur={e => { const v = e.target.value.trim(); if (v && v !== sc.title) patchScenario(sc.id, { title: v }); }}
              className="flex-1 font-semibold text-slate-900 text-[15px] bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-400 outline-none py-0.5" />
            {canEdit && (
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => patchScenario(sc.id, { enabled: !sc.enabled })} title={sc.enabled ? 'เปิดใช้อยู่' : 'ปิดอยู่'}
                  className={cn('relative w-9 h-5 rounded-full transition-colors', sc.enabled ? 'bg-emerald-500' : 'bg-slate-300')}>
                  <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', sc.enabled ? 'left-4' : 'left-0.5')} />
                </button>
                <button onClick={() => delScenario(sc.id)} className="text-slate-300 hover:text-rose-500"><Fi name="trash" className="text-sm" /></button>
              </div>
            )}
          </div>

          {/* Example buyer questions */}
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1.5">ตัวอย่างคำถามของผู้ซื้อ</div>
            <div className="flex flex-wrap gap-1.5">
              {sc.examples.map((ex, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 text-xs">
                  {ex}{canEdit && <button onClick={() => rmExample(sc, i)} className="text-emerald-400 hover:text-rose-500"><Fi name="cross-small" className="text-[11px]" /></button>}
                </span>
              ))}
              {canEdit && (
                <span className="inline-flex items-center gap-1">
                  <input value={newExample[sc.id] || ''} onChange={e => setNewExample(m => ({ ...m, [sc.id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addExample(sc); }}
                    placeholder="+ เพิ่มตัวอย่างคำถาม" className="border border-slate-200 rounded-full px-2.5 py-1 text-xs w-48" />
                </span>
              )}
            </div>
          </div>

          {/* Strategies */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">กลยุทธ์การตอบกลับ ({sc.strategies.length})</div>
            {sc.strategies.map(st => (
              <div key={st.id} className="rounded-xl border border-slate-200 p-2.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={st.action} disabled={!canEdit} onChange={e => patchStrategy(sc.id, st.id, { action: e.target.value })}
                    className="text-xs border border-slate-200 rounded-md px-1.5 py-1">
                    <option value="reply">ตอบข้อความ</option>
                    <option value="handoff">โอนไปยังพนักงาน</option>
                  </select>
                  <select value={st.order_condition || ''} disabled={!canEdit} onChange={e => patchStrategy(sc.id, st.id, { order_condition: e.target.value || null })}
                    className="text-xs border border-slate-200 rounded-md px-1.5 py-1">
                    {CONDITIONS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
                  </select>
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => canEdit && patchStrategy(sc.id, st.id, { enabled: !st.enabled })} disabled={!canEdit}
                      className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5', st.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                      {st.enabled ? 'เปิดกลยุทธ์แล้ว' : 'ยังไม่ได้เปิด'}
                    </button>
                    {canEdit && <button onClick={() => delStrategy(sc.id, st.id)} className="text-slate-300 hover:text-rose-500"><Fi name="trash" className="text-xs" /></button>}
                  </div>
                </div>
                {st.action === 'reply' ? (
                  <textarea defaultValue={st.response || ''} disabled={!canEdit} rows={2}
                    onBlur={e => { if (e.target.value !== (st.response || '')) patchStrategy(sc.id, st.id, { response: e.target.value }); }}
                    placeholder="ข้อความตอบกลับมาตรฐานสำหรับสถานการณ์นี้…"
                    className="w-full text-[13px] border border-slate-200 rounded-lg px-2.5 py-2 resize-y" />
                ) : (
                  <div className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">↪ ให้พนักงานจริงมาตอบเคสนี้ (AI จะแจ้งเตือน “ควรให้แอดมินตอบเอง”)</div>
                )}
              </div>
            ))}
            {canEdit && (
              <button onClick={() => addStrategy(sc.id)} className="text-xs text-indigo-600 hover:underline flex items-center gap-1"><Fi name="plus" className="text-[11px]" /> เพิ่มกลยุทธ์ในการตอบกลับ</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
