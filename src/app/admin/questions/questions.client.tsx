'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Fi } from '@/components/ui/fi';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Cat { key: string; label: string; count: number; pct: number }
interface Theme { label: string; approx: number }
interface Data { days: number; total: number; categorized: number; categories: Cat[]; themes: Theme[] }

const BAR = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-blue-500', 'bg-violet-500', 'bg-teal-500', 'bg-slate-400'];

export function QuestionsClient() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/insights/questions?days=${days}`).then(r => r.ok ? r.json() : null).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [days]);

  const max = Math.max(1, ...(data?.categories || []).map(c => c.count));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', days === d ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            {d} วัน
          </button>
        ))}
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>

      {!loading && data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4"><div className="text-2xl font-bold text-slate-900">{data.total.toLocaleString()}</div><div className="text-xs text-slate-500">ข้อความลูกค้าที่วิเคราะห์</div></Card>
            <Card className="p-4"><div className="text-2xl font-bold text-indigo-600">{data.categories[0]?.pct ?? 0}%</div><div className="text-xs text-slate-500">หมวดที่ถามบ่อยสุด: {data.categories[0]?.label ?? '-'}</div></Card>
            <Card className="p-4"><div className="text-2xl font-bold text-emerald-600">{data.categories.length}</div><div className="text-xs text-slate-500">หมวดคำถาม</div></Card>
          </div>

          <Card className="p-5">
            <div className="text-sm font-bold text-slate-800 mb-3">หมวดคำถามที่พบบ่อย ({data.days} วันล่าสุด)</div>
            <div className="space-y-2.5">
              {data.categories.map((c, i) => (
                <div key={c.key} className="flex items-center gap-3">
                  <div className="w-40 text-xs text-slate-600 shrink-0">{c.label}</div>
                  <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                    <div className={cn('h-full rounded-full', BAR[i % BAR.length])} style={{ width: `${Math.max(4, (c.count / max) * 100)}%` }} />
                  </div>
                  <div className="w-20 text-right text-xs font-semibold text-slate-700 shrink-0">{c.count.toLocaleString()} <span className="text-slate-400">({c.pct}%)</span></div>
                </div>
              ))}
              {!data.categories.length && <div className="text-sm text-slate-400">ยังไม่มีข้อมูลคำถามในช่วงนี้</div>}
            </div>
          </Card>

          {data.themes.length > 0 && (
            <Card className="p-5">
              <div className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-1.5"><Fi name="sparkles" className="text-brand-500" /> คำถามเฉพาะที่ AI สรุปว่าถูกถามบ่อย</div>
              <div className="text-[11px] text-slate-400 mb-3">AI อ่านตัวอย่างข้อความจริงแล้วจับกลุ่ม — ใช้เตรียมสคริปต์ตอบ/Macro ได้</div>
              <ol className="space-y-1.5">
                {data.themes.map((t, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-700 text-xs font-bold grid place-items-center shrink-0">{i + 1}</span>
                    <span className="flex-1 text-slate-700">{t.label}</span>
                    {t.approx > 0 && <span className="text-xs text-slate-400">~{t.approx} ครั้ง</span>}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
