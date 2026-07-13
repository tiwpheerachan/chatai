import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { commentsConfigured } from '@/lib/comments/db';
import { InsightsClient } from './insights.client';

export const dynamic = 'force-dynamic';

export default async function InsightsPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  if (!ctx.can('chat.read')) redirect('/admin/dashboard');

  let bq = createAdminClient().from('brands').select('name,slug').order('name');
  if (ctx.scope.brands) bq = bq.in('id', ctx.scope.brands.length ? ctx.scope.brands : ['00000000-0000-0000-0000-000000000000']);
  const { data: brandRows } = await bq;
  const brands = ((brandRows as any[]) || []).filter(b => b.slug).map(b => ({ slug: b.slug as string, name: b.name as string }));

  return <InsightsClient configured={commentsConfigured()} brands={brands} />;
}
