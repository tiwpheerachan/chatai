import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { sendTo } from '@/lib/channels';
import { addMessage } from '@/lib/conversations';
import { parseBody, sendMessageSchema, safeUuid } from '@/lib/validation';
import { logAudit, reqIp } from '@/lib/audit';
import { sendText, ChatSourceError } from '@/lib/chat-source/client';
import { learnFromAdminReply } from '@/lib/learn';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data: body, res: badReq } = await parseBody(req, sendMessageSchema);
  if (!body) return badReq;

  // Read via the authenticated client so RLS enforces brand access.
  const { data: conv } = await ctx.sb
    .from('conversations')
    .select('channel, external_id, shop_id, buyer_id, brand_id, customer:customers(channel_user_id)')
    .eq('id', params.id)
    .single();

  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const cust = (conv as any).customer;
  const channel = (conv as any).channel as string;

  // Internal note: private to the team — stored, never sent to the buyer.
  if (body.note) {
    const noteMsg = await addMessage({
      conversation_id: params.id,
      sender_type: 'note',
      sender_id: ctx.userId,
      text: body.text,
    });
    await logAudit(ctx.sb, ctx.userId, 'chat.note', {
      targetType: 'conversation', targetId: params.id, details: { channel }, ip: reqIp(req),
    });
    return NextResponse.json(noteMsg);
  }

  // Shopee: deliver through the live chat-source (human-triggered) BEFORE persisting,
  // so the inbox only shows messages that were actually sent.
  if (channel === 'shopee') {
    const shopId = (conv as any).shop_id;
    const extConvId = (conv as any).external_id;
    const toId = (conv as any).buyer_id || cust?.channel_user_id;
    if (!shopId || !extConvId || !toId) {
      return NextResponse.json({ error: 'บทสนทนา Shopee นี้ยังไม่มี shop_id / conversation_id / to_id (ต้อง sync ก่อน)' }, { status: 400 });
    }
    try {
      await sendText('shopee', { shopId, conversationId: extConvId, toId, text: body.text });
    } catch (e) {
      const err = e as ChatSourceError;
      return NextResponse.json({ error: err.message, upstreamStatus: err.status }, { status: 502 });
    }
  }

  const msg = await addMessage({
    conversation_id: params.id,
    sender_type: 'agent',
    sender_id: ctx.userId,
    text: body.text,
  });

  // Non-Shopee channels keep the existing outbound adapter.
  if (channel !== 'shopee' && cust?.channel_user_id) {
    await sendTo(conv.channel, cust.channel_user_id, body.text);
  }

  await logAudit(ctx.sb, ctx.userId, 'chat.reply', {
    targetType: 'conversation', targetId: params.id,
    details: { channel, chars: body.text.length }, ip: reqIp(req),
  });

  // SELF-LEARN: if this reply answered a question the KB didn't cover, remember it
  // (correct info straight from the admin). Fire-and-forget — never blocks the send.
  learnFromAdminReply(params.id, (conv as any).brand_id, body.text).catch(() => {});

  return NextResponse.json(msg);
}
