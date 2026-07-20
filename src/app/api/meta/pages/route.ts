import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPages, metaConfigured, suggestBrand } from '@/lib/meta';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** List the business's Facebook pages with a suggested brand + current connection. */
export async function GET() {
  const { ctx, res } = await authorize('channel.read');
  if (!ctx) return res;
  if (!metaConfigured()) return NextResponse.json({ configured: false, pages: [] });

  const admin = createAdminClient();
  const [pages, brandsRes, channelsRes] = await Promise.all([
    getPages().catch(() => []),
    admin.from('brands').select('id,name,slug').order('name'),
    admin.from('channels').select('brand_id,credentials,status').eq('type', 'facebook'),
  ]);
  const brands = (brandsRes.data as any[]) || [];
  const connectedByPage = new Map<string, { brand_id: string; status: string }>();
  for (const c of (channelsRes.data as any[]) || []) {
    const pid = c.credentials?.page_id;
    if (pid) connectedByPage.set(String(pid), { brand_id: c.brand_id, status: c.status });
  }

  const out = pages.map(p => {
    const conn = connectedByPage.get(p.id);
    return {
      id: p.id, name: p.name, category: p.category || null,
      suggested_brand_id: conn?.brand_id || suggestBrand(p.name, brands),
      connected: !!conn, connected_brand_id: conn?.brand_id || null, status: conn?.status || null,
    };
  });
  return NextResponse.json({ configured: true, pages: out, brands });
}
