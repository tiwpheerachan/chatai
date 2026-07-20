import { Topbar } from '@/components/layout/topbar';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { adminSb, withBrandScope } from '@/lib/analytics-scope';
import { CustomersTable } from './customers.client';
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
      <Topbar title="Customers" subtitle={`CRM 360° — ลูกค้าทั้งหมด ${(total || 0).toLocaleString()} ราย`} />
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <CustomersTable initial={(customers as Customer[]) || []} />
      </div>
    </>
  );
}
