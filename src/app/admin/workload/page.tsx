import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { WorkloadClient } from './workload.client';

export const dynamic = 'force-dynamic';

export default async function WorkloadPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  if (!['owner', 'admin', 'supervisor'].includes(ctx.role)) redirect('/admin/dashboard');
  return <WorkloadClient canManage />;
}
