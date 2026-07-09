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
export async function GET(req: Request, { params }: { params: { id: string } }) {
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
    .select('id, sender_type, text, message_type, attachments, created_at')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });

  const list = (msgs as any[]) || [];
  // `sel` = comma-separated customer message ids the admin picked; default = the
  // latest customer message. Combine the selected questions + collect any images.
  const sel = (new URL(req.url).searchParams.get('sel') || '').split(',').map(s => s.trim()).filter(Boolean);
  let targets = sel.length ? list.filter(m => sel.includes(m.id) && m.sender_type === 'customer') : [];
  if (!targets.length) {
    const lastCust = [...list].reverse().find(m => m.sender_type === 'customer');
    if (lastCust) targets = [lastCust];
  }
  if (!targets.length) {
    return NextResponse.json({ text: '', empty: true, forMessageId: null, handoff: false, needsHuman: false, confidence: 0 });
  }

  const imageUrls: string[] = [];
  const parts: string[] = [];
  for (const m of targets) {
    if ((m.text || '').trim()) parts.push(m.text.trim());
    for (const a of (m.attachments || [])) { if ((a?.type === 'image' || a?.type === 'sticker') && a?.url) imageUrls.push(a.url); }
  }
  const userMessage = parts.length > 1 ? parts.map((p, i) => `${i + 1}) ${p}`).join('\n') : (parts[0] || '');

  const forMessageId = targets[targets.length - 1].id;
  const lastIdx = list.map(m => m.id).lastIndexOf(forMessageId);
  const answered = list.slice(lastIdx + 1).some(m => m.sender_type === 'agent');

  const d = await draftReply({
    userMessage,
    brand_id: (c as any).brand_id,
    history: list as never,
    shopId: (c as any).shop_id,
    buyerUsername: (c as any).customer?.display_name || null,
    images: imageUrls.slice(0, 3),
  });
  return NextResponse.json({ ...d, forMessageId, answered, question: parts.join(' · ').slice(0, 300), selectedCount: targets.length });
}
