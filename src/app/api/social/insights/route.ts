import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandInsights } from '@/lib/meta';
import { safeUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

async function connectedBrands(scope: string[] | null) {
  const { data } = await createAdminClient().from('channels').select('brand:brands(id,name,color)').eq('type', 'facebook').eq('status', 'connected');
  const seen = new Set<string>(); const out: { id: string; name: string; color?: string }[] = [];
  for (const c of (data as any[]) || []) { const b = c.brand; if (!b || seen.has(b.id)) continue; if (scope && !scope.includes(b.id)) continue; seen.add(b.id); out.push({ id: b.id, name: b.name, color: b.color }); }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  const brand = new URL(req.url).searchParams.get('brand');
  const brands = await connectedBrands(ctx.scope.brands);
  if (!brand) return NextResponse.json({ brands, insights: null });
  if (!safeUuid(brand) || !brands.some(b => b.id === brand)) return NextResponse.json({ brands, insights: null, error: 'brand ไม่ถูกต้อง' });
  const insights = await getBrandInsights(brand).catch(() => null);
  return NextResponse.json({ brands, insights });
}
