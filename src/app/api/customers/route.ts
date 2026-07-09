import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { clampInt, safeUuid } from '@/lib/validation';
import { adminSb, withBrandScope } from '@/lib/analytics-scope';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { searchParams } = new URL(req.url);

  // Admin client + code-side brand scope (customers RLS is per-row → slow at scale).
  let q = withBrandScope(
    adminSb()
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(clampInt(searchParams.get('limit'), 100, 1, 200)),
    ctx.scope,
  );

  const brand = safeUuid(searchParams.get('brand_id'));
  if (brand) q = q.eq('brand_id', brand);

  // Strip PostgREST `.or()` control chars so search can't inject extra filters.
  const search = (searchParams.get('search') || '').replace(/[,()*]/g, '').trim();
  if (search) {
    q = q.or(`display_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data } = await q;
  return NextResponse.json(data || []);
}
