import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { autoAssignQueue, rebalanceWaiting } from '@/lib/assignment';
import { logAudit, reqIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SUP = new Set(['owner', 'admin', 'supervisor']);

/** Map the caller's brand scope (UUIDs) — null = all. Restricts what a scoped
 * supervisor can redistribute to their own brands. */
async function scopeBrandIds(brandIds: string[] | null): Promise<string[] | null> {
  if (brandIds === null) return null;
  return brandIds.length ? brandIds : ['00000000-0000-0000-0000-000000000000'];
}

export async function POST(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!SUP.has(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === 'rebalance' ? 'rebalance' : 'assign';
  const brandsIn = await scopeBrandIds(ctx.scope.brands);
  // a single-brand narrow (must still be within the caller's scope)
  let effBrands = brandsIn;
  if (body?.brand) {
    const { data } = await createAdminClient().from('brands').select('id').eq('slug', body.brand).maybeSingle();
    const bid = (data as any)?.id;
    if (bid && (brandsIn === null || brandsIn.includes(bid))) effBrands = [bid];
  }

  const result = mode === 'rebalance'
    ? await rebalanceWaiting({ brandsIn: effBrands })
    : await autoAssignQueue({ brandsIn: effBrands });

  await logAudit(ctx.sb, ctx.userId, `assignment.${mode}`, {
    targetType: 'conversation', details: result as any, ip: reqIp(req),
  }).catch(() => {});

  return NextResponse.json({ ok: true, mode, ...result });
}
