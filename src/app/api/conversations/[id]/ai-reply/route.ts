import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { generateReply } from '@/lib/bot';
import { safeUuid } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const limited = enforceRateLimit(`ai-reply:${ctx.userId}`, 30, 60_000);
  if (limited) return limited;
  const { sb } = ctx;

  const { data: c } = await sb.from('conversations').select('brand_id').eq('id', params.id).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: msgs } = await sb
    .from('messages')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });

  const lastCust = [...(msgs || [])].reverse().find(m => m.sender_type === 'customer');
  if (!lastCust) return NextResponse.json({ text: '', confidence: 0, sources: [], intent: 'none', handoff: false });

  const reply = await generateReply({
    userMessage: lastCust.text || '',
    brand_id: c.brand_id,
    history: (msgs as never) || [],
  });
  return NextResponse.json(reply);
}
