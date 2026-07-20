'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Fi } from '@/components/ui/fi';
import { Loader2 } from 'lucide-react';
import { CHANNEL_META } from '@/lib/utils';
import type { Customer } from '@/types/database';

export function CustomersTable({ initial }: { initial: Customer[] }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Customer[]>(initial);
  const [loading, setLoading] = useState(false);
  const primed = useRef(false);

  useEffect(() => {
    if (!primed.current) { primed.current = true; return; }
    const s = q.trim();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/customers?limit=100${s ? `&search=${encodeURIComponent(s)}` : ''}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => setRows(Array.isArray(d) ? d : (d?.data || d?.customers || [])))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <Card>
      <div className="p-4 border-b border-slate-200 flex items-center gap-2">
        <div className="relative w-72">
          <Fi name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อ / อีเมล / เบอร์โทร…" autoComplete="off"
            className="w-full border border-slate-200 rounded-lg pl-9 pr-8 py-1.5 text-sm focus:ring-2 focus:ring-brand-400" />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />}
        </div>
        <span className="text-xs text-slate-400">{rows.length} ราย</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-3">ลูกค้า</th>
            <th className="text-left px-4 py-3">ช่องทาง</th>
            <th className="text-left px-4 py-3">อีเมล</th>
            <th className="text-right px-4 py-3">LTV</th>
            <th className="text-right px-4 py-3">ออเดอร์</th>
            <th className="text-left px-4 py-3">แท็ก</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => {
            const meta = c.channel ? CHANNEL_META[c.channel] : null;
            return (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/customers/${c.id}`} className="flex items-center gap-2">
                    <Avatar name={c.display_name} src={c.avatar} size="sm" />
                    <span className="font-semibold text-indigo-600 hover:underline">{c.display_name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">{meta && <span className={`text-xs px-2 py-0.5 rounded ${meta.bg} ${meta.text}`}>{meta.name}</span>}</td>
                <td className="px-4 py-3 text-slate-600">{c.email || '-'}</td>
                <td className="px-4 py-3 text-right font-semibold">฿{(c.ltv || 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{c.order_count || 0}</td>
                <td className="px-4 py-3">
                  {(c.tags || []).slice(0, 2).map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 mr-1">#{t}</span>)}
                </td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={6} className="py-8 text-center text-slate-400">{loading ? 'กำลังค้นหา…' : 'ไม่พบลูกค้า'}</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}
