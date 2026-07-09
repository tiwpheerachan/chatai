import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { draftReply } from '@/lib/bot';
import { safeUuid } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * AI DRAFT — suggests a reply for the human admin to review, copy, or send.
 * Learns the team's own reply style (mimics tone from their past replies) so it
 * sounds natural. NEVER sends on its own; the admin decides. Also flags when a
 * real human should take over (needsHuman) because the info isn't available.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const limited = enforceRateLimit(`draft:${ctx.userId}`, 40, 60_000);
  if (limited) return limited;

  const sb = createAdminClient();
  const { data: c } = await sb.from('conversations').select('brand_id, channel, shop_id, customer:customers(display_name)').eq('id', params.id).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: msgs } = await sb
    .from('messages')
    .select('id, sender_type, text, message_type, created_at')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });

  const list = (msgs as any[]) || [];
  const lastCust = [...list].reverse().find(m => m.sender_type === 'customer');
  // Nothing to answer (last message was the shop's, or no customer message yet).
  if (!lastCust) {
    return NextResponse.json({ text: '', empty: true, forMessageId: null, handoff: false, needsHuman: false, confidence: 0 });
  }
  // Already answered? (a shop/agent message came after the last customer one)
  const lastIdx = list.map(m => m.id).lastIndexOf(lastCust.id);
  const answered = list.slice(lastIdx + 1).some(m => m.sender_type === 'agent');

  const d = await draftReply({
    userMessage: lastCust.text || '',
    brand_id: (c as any).brand_id,
    history: list as never,
    shopId: (c as any).shop_id,
    buyerUsername: (c as any).customer?.display_name || null,
  });
  return NextResponse.json({ ...d, forMessageId: lastCust.id, answered, question: lastCust.text || '' });
}
