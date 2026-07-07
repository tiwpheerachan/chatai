import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { parseBody } from '@/lib/validation';
import { logAudit, reqIp } from '@/lib/audit';
import { syncShops, syncShop, syncAllShops } from '@/lib/chat-source/sync';
import { ChatSourceError } from '@/lib/chat-source/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  scope: z.enum(['shops', 'shop', 'all']).default('all'),
  shop_id: z.string().optional(),
  max_pages: z.number().int().min(1).max(50).optional(),
  since_days: z.number().int().min(1).max(365).optional(),
});

// Trigger a Shopee → Supabase sync. Admin-gated. NEVER sends anything (read-only ingest).
export async function POST(req: Request) {
  const { ctx, res } = await authorize('channel.write');
  if (!ctx) return res;

  const { data: body, res: badReq } = await parseBody(req, bodySchema);
  if (!body) return badReq;

  try {
    let result: unknown;
    if (body.scope === 'shops') {
      result = await syncShops();
    } else if (body.scope === 'shop') {
      if (!body.shop_id) return NextResponse.json({ error: 'shop_id required for scope=shop' }, { status: 400 });
      result = await syncShop(body.shop_id, { maxPages: body.max_pages ?? 5, sinceDays: body.since_days ?? 7 });
    } else {
      result = await syncAllShops({ maxPagesPerShop: body.max_pages ?? 2, sinceDays: body.since_days ?? 7 });
    }

    await logAudit(ctx.sb, ctx.userId, 'chat.sync', {
      targetType: 'chat_shops', targetId: body.shop_id ?? body.scope,
      details: { scope: body.scope }, ip: reqIp(req),
    });

    return NextResponse.json({ ok: true, scope: body.scope, result });
  } catch (e) {
    const err = e as ChatSourceError;
    return NextResponse.json({ error: err.message || 'Sync failed', upstreamStatus: err.status }, { status: 502 });
  }
}
