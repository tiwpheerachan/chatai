import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { adminSb, withBrandScope } from '@/lib/analytics-scope';
import { CHANNEL_META } from '@/lib/utils';
import Link from 'next/link';
import type { Customer } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  // Admin client + code-side brand scope — the customers table is large and its RLS
  // policy runs per-row, so an RLS-bound select times out / returns nothing at scale.
  const sb = adminSb();
  const [{ data: customers }, { count: total }] = await Promise.all([
    withBrandScope(sb.from('customers').select('*').order('created_at', { ascending: false }).limit(100), ctx.scope),
    withBrandScope(sb.from('customers').select('id', { count: 'exact', head: true }), ctx.scope),
  ]);

  return (
    <>
      <Topbar title="Customers" subtitle={`CRM 360° — ลูกค้าทั้งหมด ${(total || 0).toLocaleString()} ราย (แสดง 100 ล่าสุด)`} />
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <Card>
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <input placeholder="ค้นหาลูกค้า..." className="border border-slate-200 rounded px-3 py-1.5 text-sm w-64" />
            <button className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold">+ เพิ่มลูกค้า</button>
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
              {(customers as Customer[] || []).map(c => {
                const meta = c.channel ? CHANNEL_META[c.channel] : null;
                return (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/customers/${c.id}`} className="flex items-center gap-2">
                        <Avatar name={c.display_name} src={c.avatar} size="sm" />
                        <span className="font-semibold text-indigo-600 hover:underline">{c.display_name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {meta && <span className={`text-xs px-2 py-0.5 rounded ${meta.bg} ${meta.text}`}>{meta.name}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.email || '-'}</td>
                    <td className="px-4 py-3 text-right font-semibold">฿{c.ltv.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{c.order_count}</td>
                    <td className="px-4 py-3">
                      {(c.tags || []).slice(0, 2).map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 mr-1">#{t}</span>
                      ))}
                    </td>
                  </tr>
                );
              })}
              {!customers?.length && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400">ยังไม่มีลูกค้า</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
