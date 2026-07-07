import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { addMessage } from '@/lib/conversations';
import { safeUuid } from '@/lib/validation';
import { logAudit, reqIp } from '@/lib/audit';
import { sendImage, ChatSourceError } from '@/lib/chat-source/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (Shopee cap)

// Upload + send an image reply (human-triggered). Shopee only.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 }); }
  const file = form.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'รูปเกิน 10MB' }, { status: 400 });

  const { data: conv } = await ctx.sb
    .from('conversations')
    .select('channel, external_id, shop_id, buyer_id, customer:customers(channel_user_id)')
    .eq('id', params.id)
    .single();
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const channel = (conv as any).channel as string;
  if (channel !== 'shopee') {
    return NextResponse.json({ error: 'รองรับส่งรูปเฉพาะ Shopee ในตอนนี้' }, { status: 400 });
  }
  const shopId = (conv as any).shop_id;
  const extConvId = (conv as any).external_id;
  const toId = (conv as any).buyer_id || (conv as any).customer?.channel_user_id;
  if (!shopId || !extConvId || !toId) {
    return NextResponse.json({ error: 'บทสนทนา Shopee นี้ยังไม่มีข้อมูลครบ (ต้อง sync ก่อน)' }, { status: 400 });
  }

  const filename = (file as File).name || 'image.jpg';
  let result: any;
  try {
    result = await sendImage('shopee', { shopId, conversationId: extConvId, toId, file, filename });
  } catch (e) {
    const err = e as ChatSourceError;
    return NextResponse.json({ error: err.message, upstreamStatus: err.status }, { status: 502 });
  }

  // Best-effort: surface any URL the platform echoed back so the bubble can render it.
  const url = result?.content?.url || result?.result?.content?.url || result?.url || null;

  const msg = await addMessage({
    conversation_id: params.id,
    sender_type: 'agent',
    sender_id: ctx.userId,
    text: null,
    message_type: 'image',
    attachments: [{ type: 'image', url }],
    metadata: { platform: 'shopee', via: 'inbox-image' },
  });

  await logAudit(ctx.sb, ctx.userId, 'chat.reply.image', {
    targetType: 'conversation', targetId: params.id,
    details: { channel, bytes: file.size }, ip: reqIp(req),
  });

  return NextResponse.json(msg);
}
