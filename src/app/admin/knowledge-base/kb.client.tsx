'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Fi } from '@/components/ui/fi';
import { cn, brandIcon } from '@/lib/utils';

type Doc = { id: string; title: string; content: string; tags: string[] | null; source: string | null; brand_id: string | null; brand?: { name: string; color: string | null } | null };
const CARD = 'bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_-6px_rgba(15,23,42,0.15)]';
const SRC_LABEL: Record<string, string> = { 'dreame-bible-csv': 'จากชีท', 'admin-learned': 'AI เรียนรู้เอง' };

export function KbClient({ docs: initial, canEdit }: { docs: Doc[]; canEdit: boolean }) {
  const [docs, setDocs] = useState<Doc[]>(initial);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [limitMap, setLimitMap] = useState<Record<string, number>>({});

  const query = q.trim().toLowerCase();
  const filtered = useMemo(() =>
    !query ? docs : docs.filter(d => (d.title + ' ' + d.content).toLowerCase().includes(query)), [docs, query]);

  // Group by brand.
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null; docs: Doc[] }>();
    for (const d of filtered) {
      const key = d.brand_id || 'global';
      const name = d.brand?.name || 'ทั่วไป (ทุกแบรนด์)';
      if (!m.has(key)) m.set(key, { name, color: d.brand?.color ?? null, docs: [] });
      m.get(key)!.docs.push(d);
    }
    return [...m.entries()].sort((a, b) => b[1].docs.length - a[1].docs.length);
  }, [filtered]);

  const del = async (id: string) => {
    if (!confirm('ลบเอกสารนี้?')) return;
    setDocs(ds => ds.filter(d => d.id !== id));
    await fetch(`/api/kb/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  return (
    <div className="flex-1 overflow-y-auto scroll-thin bg-[#eef0f4] p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 flex items-center gap-2"><Fi name="book-alt" className="text-indigo-500" /> คลังความรู้ (Knowledge Base)</h1>
          <p className="text-sm text-slate-500 mt-0.5">ข้อมูลที่ AI ใช้ตอบ — แยกตามแบรนด์ · {docs.length} เอกสาร</p>
        </div>
        {canEdit && <Link href="/admin/knowledge-base/new" className="rounded-full bg-indigo-600 text-white text-xs px-4 py-2 font-semibold flex items-center gap-1.5"><Fi name="plus" className="text-sm" /> เพิ่มเอกสาร</Link>}
      </div>

      <div className={`${CARD} p-2 flex items-center gap-2`}>
        <Fi name="search" className="text-slate-400 text-base ml-1" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาในคลังความรู้ทุกแบรนด์…" className="flex-1 bg-transparent text-sm outline-none py-1.5" />
        {q && <button onClick={() => setQ('')} className="text-slate-400 hover:text-slate-600"><Fi name="cross-small" className="text-sm" /></button>}
      </div>

      {!groups.length && <div className={`${CARD} p-8 text-center text-sm text-slate-400`}>{query ? 'ไม่พบเอกสารตามคำค้น' : 'ยังไม่มีเอกสาร'}</div>}

      {groups.map(([key, g]) => {
        const isOpen = open[key] ?? !!query;   // auto-expand while searching
        const limit = limitMap[key] ?? 60;
        return (
          <div key={key} className={CARD}>
            <button onClick={() => setOpen(o => ({ ...o, [key]: !isOpen }))}
              className="w-full flex items-center gap-2.5 p-4 text-left">
              {key === 'global'
                ? <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center"><Fi name="apps" className="text-slate-500 text-sm" /></span>
                /* eslint-disable-next-line @next/next/no-img-element */
                : <img src={brandIcon(g.name)} alt="" className="w-7 h-7 rounded-lg object-cover" />}
              <span className="font-semibold text-slate-900">{g.name}</span>
              <span className="text-xs text-slate-400">{g.docs.length} เอกสาร</span>
              <Fi name="angle-small-down" className={cn('ml-auto text-slate-400 transition-transform', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {g.docs.slice(0, limit).map(d => (
                  <div key={d.id} className="p-3.5 hover:bg-slate-50/60 flex items-start gap-3 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 text-sm">{d.title}</span>
                        {d.source && SRC_LABEL[d.source] && (
                          <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium', d.source === 'admin-learned' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700')}>{SRC_LABEL[d.source]}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap line-clamp-3">{d.content}</div>
                    </div>
                    {canEdit && <button onClick={() => del(d.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-500 shrink-0"><Fi name="trash" className="text-sm" /></button>}
                  </div>
                ))}
                {g.docs.length > limit && (
                  <button onClick={() => setLimitMap(m => ({ ...m, [key]: limit + 100 }))} className="w-full py-2.5 text-xs text-indigo-600 hover:bg-slate-50">แสดงเพิ่ม ({g.docs.length - limit} เอกสาร)</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
