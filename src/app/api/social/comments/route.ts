import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandComments, replyToComment } from '@/lib/meta';
import { logAudit, reqIp } from '@/lib/audit';
import { safeUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/** Connected FB/IG brands the user may see (respecting brand scope). */
async function connectedBrands(scope: string[] | null) {
  const { data } = await createAdminClient()
    .from('channels').select('brand_id, brand:brands(id,name,color)').eq('type', 'facebook').eq('status', 'connected');
  const seen = new Set<string>();
  const out: { id: string; name: string; color?: string }[] = [];
  for (const c of (data as any[]) || []) {
    const b = c.brand; if (!b || seen.has(b.id)) continue;
    if (scope && !scope.includes(b.id)) continue;
    seen.add(b.id); out.push({ id: b.id, name: b.name, color: b.color });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  const brand = new URL(req.url).searchParams.get('brand');
  const brands = await connectedBrands(ctx.scope.brands);
  if (!brand) return NextResponse.json({ brands, comments: [] });
  if (!safeUuid(brand) || !brands.some(b => b.id === brand)) return NextResponse.json({ brands, comments: [], error: 'brand ไม่ถูกต้อง' });
  const comments = await getBrandComments(brand, { posts: 10 }).catch(() => []);
  return NextResponse.json({ brands, comments });
}

export async function POST(req: Request) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  const b = await req.json().catch(() => ({}));
  const brand = b?.brand, commentId = b?.comment_id, platform = b?.platform, message = (b?.message || '').toString().trim();
  if (!safeUuid(brand) || !commentId || !message || !['facebook', 'instagram'].includes(platform)) return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 });
  if (ctx.scope.brands && !ctx.scope.brands.includes(brand)) return NextResponse.json({ error: 'ไม่มีสิทธิ์แบรนด์นี้' }, { status: 403 });
  const r = await replyToComment(brand, commentId, platform, message);
  if (!r.ok) return NextResponse.json({ error: 'ตอบคอมเมนต์ไม่สำเร็จ: ' + (r.error || '') }, { status: 502 });
  await logAudit(ctx.sb, ctx.userId, 'social.comment.reply', { targetType: 'comment', targetId: commentId, details: { brand, platform }, ip: reqIp(req) });
  return NextResponse.json({ ok: true });
}
