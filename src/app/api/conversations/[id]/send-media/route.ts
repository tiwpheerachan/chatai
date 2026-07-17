import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { addMessage } from '@/lib/conversations';
import { safeUuid } from '@/lib/validation';
import { logAudit, reqIp } from '@/lib/audit';
import { sendImage, ChatSourceError } from '@/lib/chat-source/client';
import { isOwnedMediaUrl } from '@/lib/product-media';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Send a product-media image (a spec sheet / how-to the AI suggested) to the
 * customer. Human-triggered. The image is fetched server-side from our own public
 * bucket and uploaded to Shopee. Only URLs we host are allowed (no SSRF).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const url = typeof body?.url === 'string' ? body.url : '';
  if (!url || !isOwnedMediaUrl(url)) return NextResponse.json({ error: 'unknown media' }, { status: 400 });

  const { data: conv } = await ctx.sb
    .from('conversations')
    .select('channel, external_id, shop_id, buyer_id, customer:customers(channel_user_id)')
    .eq('id', params.id)
    .single();
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  if ((conv as any).channel !== 'shopee') return NextResponse.json({ error: 'รองรับส่งรูปเฉพาะ Shopee ในตอนนี้' }, { status: 400 });

  const shopId = (conv as any).shop_id;
  const extConvId = (conv as any).external_id;
  const toId = (conv as any).buyer_id || (conv as any).customer?.channel_user_id;
  if (!shopId || !extConvId || !toId) return NextResponse.json({ error: 'บทสนทนา Shopee นี้ยังไม่มีข้อมูลครบ (ต้อง sync ก่อน)' }, { status: 400 });

  // Fetch the image bytes from our own bucket.
  let file: Blob; let filename: string;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const type = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 10 * 1024 * 1024) return NextResponse.json({ error: 'รูปเกิน 10MB' }, { status: 400 });
    file = new Blob([buf], { type });
    filename = (url.split('/').pop() || 'image.jpg').split('?')[0];
  } catch (e) {
    return NextResponse.json({ error: 'โหลดรูปไม่สำเร็จ: ' + (e as Error).message }, { status: 502 });
  }

  let result: any;
  try {
    result = await sendImage('shopee', { shopId, conversationId: extConvId, toId, file, filename });
  } catch (e) {
    const err = e as ChatSourceError;
    return NextResponse.json({ error: err.message, upstreamStatus: err.status }, { status: 502 });
  }

  const sentUrl = result?.content?.url || result?.result?.content?.url || result?.url || url;
  const msg = await addMessage({
    conversation_id: params.id,
    sender_type: 'agent',
    sender_id: ctx.userId,
    text: null,
    message_type: 'image',
    attachments: [{ type: 'image', url: sentUrl }],
  });
  await logAudit(ctx.sb, ctx.userId, 'chat.media', { targetType: 'conversation', targetId: params.id, details: { url }, ip: reqIp(req) });
  return NextResponse.json(msg);
}
