import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { commentsConfigured } from '@/lib/comments/db';
import {
  fetchComments, reviewAnalysis, shopPerformance, pendingOverview, attachProductMeta,
  type InsightView, type InsightFilters,
} from '@/lib/insights/reviews';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Map Nexus brand-scope (UUIDs) → comment-dataset brand SLUGS. null = unrestricted. */
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
  if (!commentsConfigured()) return NextResponse.json({ configured: false });

  const sp = new URL(req.url).searchParams;
  const view = (sp.get('view') || 'reviews') as InsightView;
  const filters: InsightFilters = {
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    brand: sp.get('brand') || undefined,
  };
  const allowed = await scopeSlugs(ctx.scope.brands);
  if (allowed) {
    if (filters.brand && !allowed.includes(filters.brand)) return NextResponse.json({ configured: true, empty: true });
    filters.brandsIn = allowed;
  }

  try {
    const rows = await fetchComments(filters);
    let data: Record<string, unknown>;
    if (view === 'performance') data = { perf: shopPerformance(rows) };
    else if (view === 'pending') data = pendingOverview(rows) as unknown as Record<string, unknown>;
    else {
      const ra = reviewAnalysis(rows);
      await attachProductMeta(ra.products).catch(() => {});   // fill name+image for the table
      data = ra as unknown as Record<string, unknown>;
    }
    return NextResponse.json({ configured: true, view, ...data });
  } catch (e) {
    return NextResponse.json({ configured: true, error: (e as Error).message }, { status: 200 });
  }
}
