import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { generateReply } from '@/lib/bot';
import { addMessage } from '@/lib/conversations';
import { sendTo } from '@/lib/channels';
import { safeUuid } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Kill-switch: AI must never send to a real customer without human review while
  // AI_AUTOREPLY_ENABLED !== "true". Use /ai-reply (fills the composer) instead.
  if (process.env.AI_AUTOREPLY_ENABLED !== 'true') {
    return NextResponse.json({ error: 'AI auto-send is disabled — use AI Suggest and send manually.' }, { status: 403 });
  }

  const limited = enforceRateLimit(`send-ai:${ctx.userId}`, 30, 60_000);
  if (limited) return limited;
  const { sb } = ctx;

  const { data: c } = await sb
    .from('conversations')
    .select('brand_id, channel, customer:customers(channel_user_id, display_name)')
    .eq('id', params.id)
    .maybeSingle();
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: msgs } = await sb
    .from('messages')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });

  const lastCust = [...(msgs || [])].reverse().find(m => m.sender_type === 'customer');
  if (!lastCust) return NextResponse.json({ error: 'No customer message' }, { status: 400 });

  const cust = (c as any).customer;
  const reply = await generateReply({
    userMessage: lastCust.text || '',
    brand_id: c.brand_id,
    history: (msgs as never) || [],
    customerName: cust?.display_name,
  });

  await addMessage({
    conversation_id: params.id,
    sender_type: 'ai',
    text: reply.text,
    metadata: { confidence: reply.confidence, sources: reply.sources, intent: reply.intent },
  });

  if (reply.handoff || reply.confidence < 0.5) {
    await sb.from('conversations').update({ ai_handling: false, priority: 'high' }).eq('id', params.id);
  }
  if (cust?.channel_user_id) {
    await sendTo(c.channel, cust.channel_user_id, reply.text);
  }

  return NextResponse.json(reply);
}
