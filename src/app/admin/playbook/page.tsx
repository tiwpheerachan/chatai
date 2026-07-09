import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PlaybookClient } from './playbook.client';

export const dynamic = 'force-dynamic';

export default async function PlaybookPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  const canEdit = ctx.role === 'owner' || ctx.role === 'admin' || ctx.role === 'supervisor';
  return <PlaybookClient canEdit={canEdit} />;
}
