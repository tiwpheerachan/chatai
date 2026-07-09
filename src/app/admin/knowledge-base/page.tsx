import { getCurrentContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { KbClient } from './kb.client';

export const dynamic = 'force-dynamic';

export default async function KBPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  // Admin client: kb_read RLS is fine, but this avoids any per-row cost at scale.
  const { data: docs } = await createAdminClient()
    .from('knowledge_base')
    .select('id,title,content,tags,source,brand_id, brand:brands(name,color)')
    .order('updated_at', { ascending: false })
    .limit(5000);
  const canEdit = ctx.can('kb.write');
  return <KbClient docs={(docs as any) || []} canEdit={canEdit} />;
}
