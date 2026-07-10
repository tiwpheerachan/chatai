import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { commentsConfigured } from '@/lib/comments/db';
import { replyConfigured } from '@/lib/comments/shopee-reply';
import { CommentsClient } from './comments.client';

export const dynamic = 'force-dynamic';

export default async function CommentsPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  if (!ctx.can('chat.read')) redirect('/admin/dashboard');

  // Brand options for the filter — from the Nexus brands table (slug matches the
  // comments dataset's `brand`), scoped to what the user is allowed to see.
  let bq = createAdminClient().from('brands').select('name,slug').order('name');
  if (ctx.scope.brands) bq = bq.in('id', ctx.scope.brands.length ? ctx.scope.brands : ['00000000-0000-0000-0000-000000000000']);
  const { data: brandRows } = await bq;
  const brands = ((brandRows as any[]) || []).filter(b => b.slug).map(b => ({ slug: b.slug as string, name: b.name as string }));

  return (
    <CommentsClient
      configured={commentsConfigured()}
      canSend={ctx.can('chat.reply') && replyConfigured()}
      replyLive={replyConfigured()}
      brands={brands}
    />
  );
}
