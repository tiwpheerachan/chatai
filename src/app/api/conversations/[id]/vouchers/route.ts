import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { addMessage } from '@/lib/conversations';
import { parseBody, safeUuid } from '@/lib/validation';
import { logAudit, reqIp } from '@/lib/audit';
import { listVouchers, sendVoucher, ChatSourceError } from '@/lib/chat-source/client';

export const dynamic = 'force-dynamic';

async function convShop(ctx: any, id: string) {
  const { data } = await ctx.sb
    .from('conversations')
    .select('channel, external_id, shop_id, buyer_id, customer:customers(channel_user_id)')
    .eq('id', id)
    .single();
  return data as any;
}

// GET — list the shop's vouchers for the coupon panel. Needs the shopee_voucher
// scope on the API key; returns a clear flag when it's missing (so the UI can
// explain it) instead of failing the panel.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const conv = await convShop(ctx, params.id);
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  if (conv.channel !== 'shopee' || !conv.shop_id) return NextResponse.json({ vouchers: [] });

  const status = (new URL(req.url).searchParams.get('status') || 'ongoing') as any;
  try {
    const vouchers = await listVouchers(conv.shop_id, ['ongoing', 'upcoming', 'expired', 'all'].includes(status) ? status : 'ongoing');
    return NextResponse.json({ vouchers });
  } catch (e) {
    const err = e as ChatSourceError;
    const noScope = err.status === 403 || /shopee_voucher/i.test(err.message || '');
    return NextResponse.json({ vouchers: [], scopeMissing: noScope, error: err.message }, { status: 200 });
  }
}

const sendSchema = z.object({
  voucher_id: z.union([z.string(), z.number()]),
  voucher_code: z.string().min(1).max(100),
});

// POST — send a voucher card into the conversation (human-triggered).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data: body, res: badReq } = await parseBody(req, sendSchema);
  if (!body) return badReq;

  const conv = await convShop(ctx, params.id);
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  const shopId = conv.shop_id;
  const extConvId = conv.external_id;
  const toId = conv.buyer_id || conv.customer?.channel_user_id;
  if (conv.channel !== 'shopee' || !shopId || !extConvId || !toId) {
    return NextResponse.json({ error: 'บทสนทนา Shopee นี้ยังไม่มีข้อมูลครบ' }, { status: 400 });
  }

  const voucherId = Number(body.voucher_id);
  try {
    await sendVoucher({ shopId, conversationId: extConvId, toId, voucherId, voucherCode: body.voucher_code });
  } catch (e) {
    const err = e as ChatSourceError;
    return NextResponse.json({ error: err.message, upstreamStatus: err.status }, { status: 502 });
  }

  const msg = await addMessage({
    conversation_id: params.id,
    sender_type: 'agent',
    sender_id: ctx.userId,
    text: null,
    message_type: 'voucher',
    attachments: [{ type: 'voucher', voucher_id: voucherId, voucher_code: body.voucher_code }],
    metadata: { platform: 'shopee', via: 'inbox-voucher' },
  });

  await logAudit(ctx.sb, ctx.userId, 'chat.reply.voucher', {
    targetType: 'conversation', targetId: params.id,
    details: { voucher_code: body.voucher_code }, ip: reqIp(req),
  });

  return NextResponse.json(msg);
}
