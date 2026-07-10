import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { listComments, commentsConfigured, type CommentFilters } from '@/lib/comments/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Map the user's Nexus brand-scope (UUIDs) to the brand SLUGS used in the
 * comments dataset. Owner / unrestricted (scope.brands === null) → no filter. */
async function scopeSlugs(brandIds: string[] | null): Promise<string[] | undefined> {
  if (brandIds === null) return undefined;
  if (!brandIds.length) return ['__none__'];
  const { data } = await createAdminClient().from('brands').select('slug').in('id', brandIds);
  const slugs = ((data as any[]) || []).map(b => b.slug).filter(Boolean);
  return slugs.length ? slugs : ['__none__'];
}

export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!commentsConfigured()) return NextResponse.json({ rows: [], total: 0, configured: false });

  const sp = new URL(req.url).searchParams;
  const num = (k: string) => (sp.get(k) != null ? Number(sp.get(k)) : undefined);
  const filters: CommentFilters = {
    brand: sp.get('brand') || undefined,
    sentiment: sp.get('sentiment') || undefined,
    category: sp.get('category') || undefined,
    status: sp.get('status') || undefined,
    urgentOnly: sp.get('urgent') === '1' || sp.get('urgent') === 'true',
    replied: sp.get('replied') === 'yes' ? 'yes' : sp.get('replied') === 'no' ? 'no' : undefined,
    q: sp.get('q') || undefined,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    sort: (sp.get('sort') as CommentFilters['sort']) || undefined,
    page: num('page'),
    pageSize: num('pageSize'),
  };
  const allowed = await scopeSlugs(ctx.scope.brands);
  if (allowed) {
    if (filters.brand && !allowed.includes(filters.brand)) return NextResponse.json({ rows: [], total: 0, configured: true });
    filters.brandsIn = allowed;
  }
  try {
    const result = await listComments(filters);
    return NextResponse.json({ ...result, configured: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, rows: [], total: 0, configured: true }, { status: 200 });
  }
}
