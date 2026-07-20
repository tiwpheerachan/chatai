'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Fi } from '@/components/ui/fi';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Pending { id: string; name: string; avatar: string | null; brand: string | null; snippet: string; unread: number; at: string; priority: string; risk: 'high' | 'medium' | null }
interface Data { hours: number; agent: string; replies: number; touched: number; closed: number; pendingCount: number; riskCount: number; pending: Pending[] }

export function ShiftClient() {
  const router = useRouter();
  const [hours, setHours] = useState(9);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/shift-summary?hours=${hours}`).then(r => r.ok ? r.json() : null).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [hours]);

  const handoffText = () => {
    if (!data) return '';
    const d = new Date();
    const lines = [
      `📋 สรุปปิดกะ — ${data.agent} (${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')})`,
      `• ตอบไป ${data.replies} ข้อความ · ${data.touched} เคส · ปิด ${data.closed} เคส`,
      `• ค้างต้องส่งต่อ ${data.pendingCount} เคส${data.riskCount ? ` (เสี่ยง ${data.riskCount})` : ''}`,
    ];
    if (data.pending.length) {
      lines.push('เคสค้าง (ลูกค้ารอตอบ):');
      data.pending.forEach((p, i) => lines.push(`  ${i + 1}. ${p.name}${p.brand ? ` [${p.brand}]` : ''}${p.risk ? ' ⚠️เสี่ยง' : ''} — ${(p.snippet || '').slice(0, 50)}`));
    }
    return lines.join('\n');
  };
  const copy = () => { navigator.clipboard?.writeText(handoffText()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        {[8, 9, 12, 24].map(h => (
          <button key={h} onClick={() => setHours(h)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', hours === h ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            {h} ชม.
          </button>
        ))}
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        {data && <Button className="ml-auto" onClick={copy} icon={undefined}><Fi name={copied ? 'check' : 'copy'} className="text-sm mr-1" /> {copied ? 'คัดลอกแล้ว' : 'คัดลอกสรุปส่งต่อกะ'}</Button>}
      </div>

      {!loading && data && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Card className="p-4"><div className="text-2xl font-bold text-slate-900">{data.replies}</div><div className="text-xs text-slate-500">ตอบข้อความ</div></Card>
            <Card className="p-4"><div className="text-2xl font-bold text-indigo-600">{data.touched}</div><div className="text-xs text-slate-500">เคสที่คุย</div></Card>
            <Card className="p-4"><div className="text-2xl font-bold text-emerald-600">{data.closed}</div><div className="text-xs text-slate-500">ปิดเคส (รวม)</div></Card>
            <Card className="p-4"><div className={cn('text-2xl font-bold', data.pendingCount ? 'text-amber-600' : 'text-slate-900')}>{data.pendingCount}</div><div className="text-xs text-slate-500">ค้างส่งต่อ{data.riskCount ? ` · เสี่ยง ${data.riskCount}` : ''}</div></Card>
          </div>

          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-bold text-slate-800">เคสค้างที่ต้องส่งต่อ (ลูกค้ายังรอตอบ)</div>
            {data.pending.length ? data.pending.map(p => (
              <button key={p.id} onClick={() => router.push(`/admin/inbox?c=${p.id}`)} className="w-full text-left px-4 py-2.5 border-t border-slate-50 hover:bg-slate-50 flex items-center gap-3">
                <Avatar name={p.name} src={p.avatar} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-800 truncate">{p.name}</span>
                    {p.brand && <span className="text-[10px] text-slate-400">{p.brand}</span>}
                    {p.risk && <span className="text-[9px] px-1 rounded bg-rose-600 text-white font-bold">เสี่ยง</span>}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{p.snippet || '—'}</div>
                </div>
                <span className="bg-indigo-600 text-white text-[10px] rounded-full min-w-[18px] h-[18px] px-1 grid place-items-center font-bold shrink-0">{p.unread}</span>
              </button>
            )) : <div className="px-4 py-8 text-center text-sm text-slate-400">ไม่มีเคสค้าง 🎉 ปิดกะได้เลย</div>}
          </Card>
        </>
      )}
    </div>
  );
}
