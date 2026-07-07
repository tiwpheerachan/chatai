import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { parseBody } from '@/lib/validation';
import { logAudit, reqIp } from '@/lib/audit';
import { sendText, ChatSourceError, type Platform } from '@/lib/chat-source/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Send a plain-text reply to a buyer. HUMAN-TRIGGERED ONLY.
 *
 * Gated on the `chat.reply` permission and an authenticated agent session, so
 * every send is attributable to a person and recorded in audit_log. This route
 * deliberately implements no AI/bot auto-reply and no broadcast — Shopee is
 * human-agent only and revokes access for automated behaviour.
 */
const sendSchema = z.object({
  platform: z.enum(['shopee', 'tiktok']).default('shopee'),
  shop_id: z.string().min(1),
  conversation_id: z.string().min(1),
  to_id: z.string().min(1).optional(), // required by Shopee (buyer user_id)
  text: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;

  const { data, res: badReq } = await parseBody(req, sendSchema);
  if (!data) return badReq;

  const platform = data.platform as Platform;
  if (platform === 'shopee' && !data.to_id) {
    return NextResponse.json({ error: 'to_id required สำหรับ Shopee (buyer user_id จากบทสนทนา)' }, { status: 400 });
  }

  try {
    const result = await sendText(platform, {
      shopId: data.shop_id,
      conversationId: data.conversation_id,
      toId: data.to_id,
      text: data.text,
    });

    await logAudit(ctx.sb, ctx.userId, 'chat.reply.sent', {
      targetType: 'chat_conversation',
      targetId: data.conversation_id,
      details: { platform, shop_id: data.shop_id, to_id: data.to_id ?? null, length: data.text.length },
      ip: reqIp(req),
    });

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const err = e as ChatSourceError;
    return NextResponse.json({ error: err.message, upstreamStatus: err.status }, { status: 502 });
  }
}
