'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Fi } from '@/components/ui/fi';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface NotiItem {
  id: string; type: 'urgent' | 'vip' | 'new' | 'repeat';
  name: string; avatar: string | null; snippet: string; unread: number;
  at: string; brand_name: string | null; brand_color: string | null;
  vip: boolean; risk: 'high' | 'medium' | null;
}
interface NotiData { counts: { total: number; urgent: number; vip: number; new: number; repeat: number }; items: NotiItem[] }

const TYPE_META: Record<NotiItem['type'], { label: string; icon: string; cls: string }> = {
  urgent: { label: 'ด่วน / เสี่ยง', icon: 'triangle-warning', cls: 'text-rose-600 bg-rose-50' },
  vip:    { label: 'VIP',          icon: 'crown',            cls: 'text-amber-600 bg-amber-50' },
  new:    { label: 'แชทใหม่',      icon: 'comment-alt',      cls: 'text-indigo-600 bg-indigo-50' },
  repeat: { label: 'ลูกค้าเก่า',   icon: 'refresh',          cls: 'text-emerald-600 bg-emerald-50' },
};

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'เมื่อกี้';
  if (s < 3600) return `${Math.floor(s / 60)} น.`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.`;
  return `${Math.floor(s / 86400)} วัน`;
}

export function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState<NotiData | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | NotiItem['type']>('all');
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch('/api/notifications').then(r => r.ok ? r.json() : null).then(d => { if (d?.counts) setData(d); }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const total = data?.counts.total || 0;
  const items = (data?.items || []).filter(i => tab === 'all' || i.type === tab);

  const go = (id: string) => {
    setOpen(false);
    router.push(`/admin/inbox?c=${id}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen(o => !o); if (!open) load(); }} title="การแจ้งเตือน"
        className="relative p-1.5 text-slate-400 hover:text-brand-600">
        <Fi name="bell" className="text-lg" />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-10 left-0 z-50 w-[330px] max-h-[70vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">การแจ้งเตือน</span>
            <button onClick={load} className="text-[11px] text-slate-400 hover:text-brand-600 flex items-center gap-1">
              <Fi name="refresh" className="text-[11px]" /> รีเฟรช
            </button>
          </div>

          <div className="flex gap-1 px-2 py-1.5 border-b border-slate-100 flex-wrap">
            {([
              ['all', `ทั้งหมด ${data?.counts.total ?? 0}`],
              ['urgent', `ด่วน ${data?.counts.urgent ?? 0}`],
              ['vip', `VIP ${data?.counts.vip ?? 0}`],
              ['new', `ใหม่ ${data?.counts.new ?? 0}`],
              ['repeat', `เก่า ${data?.counts.repeat ?? 0}`],
            ] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k as any)}
                className={cn('px-2 py-0.5 rounded-md text-[11px] font-medium',
                  tab === k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto scroll-thin">
            {!items.length && <div className="px-4 py-8 text-center text-xs text-slate-400">ไม่มีรายการที่ต้องจัดการ 🎉</div>}
            {items.map(it => {
              const m = TYPE_META[it.type];
              return (
                <button key={it.id} onClick={() => go(it.id)}
                  className="w-full text-left px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 flex gap-2.5 items-start">
                  <Avatar name={it.name} src={it.avatar} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-800 truncate">{it.name}</span>
                      {it.vip && <Fi name="crown" className="text-[11px] text-amber-500 shrink-0" />}
                      <span className="ml-auto text-[10px] text-slate-400 shrink-0">{ago(it.at)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">{it.snippet || '—'}</div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={cn('inline-flex items-center gap-0.5 text-[9px] px-1 rounded font-semibold', m.cls)}>
                        <Fi name={m.icon} className="text-[9px]" /> {m.label}
                      </span>
                      {it.brand_name && <span className="text-[9px] text-slate-400 truncate">{it.brand_name}</span>}
                      {it.unread > 0 && <span className="ml-auto bg-indigo-600 text-white text-[9px] rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center font-bold shrink-0">{it.unread}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
