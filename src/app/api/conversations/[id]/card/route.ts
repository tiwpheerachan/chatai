import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { addMessage } from '@/lib/conversations';
import { parseBody, safeUuid } from '@/lib/validation';
import { logAudit, reqIp } from '@/lib/audit';
import { sendCard, ChatSourceError } from '@/lib/chat-source/client';

export const dynamic = 'force-dynamic';

const cardSchema = z.object({
  type: z.enum(['item', 'order']),
  item_id: z.union([z.string(), z.number()]).optional(),
  order_sn: z.string().optional(),
});

// Send a product / order card (human-triggered). Shopee only.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data: body, res: badReq } = await parseBody(req, cardSchema);
  if (!body) return badReq;

  const { data: conv } = await ctx.sb
    .from('conversations')
    .select('channel, external_id, shop_id, buyer_id, customer:customers(channel_user_id)')
    .eq('id', params.id)
    .single();
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const channel = (conv as any).channel as string;
  if (channel !== 'shopee') return NextResponse.json({ error: 'รองรับส่งการ์ดเฉพาะ Shopee ในตอนนี้' }, { status: 400 });

  const shopId = (conv as any).shop_id;
  const extConvId = (conv as any).external_id;
  const toId = (conv as any).buyer_id || (conv as any).customer?.channel_user_id;
  if (!shopId || !extConvId || !toId) {
    return NextResponse.json({ error: 'บทสนทนา Shopee นี้ยังไม่มีข้อมูลครบ (ต้อง sync ก่อน)' }, { status: 400 });
  }

  let content: Record<string, unknown>;
  if (body.type === 'item') {
    if (body.item_id === undefined) return NextResponse.json({ error: 'item_id required' }, { status: 400 });
    content = { item_id: Number(body.item_id), shop_id: Number(shopId) };
  } else {
    if (!body.order_sn) return NextResponse.json({ error: 'order_sn required' }, { status: 400 });
    content = { order_sn: body.order_sn };
  }

  try {
    await sendCard('shopee', { shopId, conversationId: extConvId, toId, type: body.type, content });
  } catch (e) {
    const err = e as ChatSourceError;
    return NextResponse.json({ error: err.message, upstreamStatus: err.status }, { status: 502 });
  }

  const msg = await addMessage({
    conversation_id: params.id,
    sender_type: 'agent',
    sender_id: ctx.userId,
    text: null,
    message_type: body.type,
    attachments: [{ type: body.type, ...content }],
    metadata: { platform: 'shopee', via: 'inbox-card' },
  });

  await logAudit(ctx.sb, ctx.userId, 'chat.reply.card', {
    targetType: 'conversation', targetId: params.id,
    details: { channel, card: body.type }, ip: reqIp(req),
  });

  return NextResponse.json(msg);
}
