import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeUuid } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';
import { analyzeConversation } from '@/lib/chat-insight';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** AI analysis of one conversation's behaviour: mood, urgency, buying intent,
 * journey stage, topics, pain-point summary, handling tip. Cached per new message. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const limited = enforceRateLimit(`insight:${ctx.userId}`, 60, 60_000);
  if (limited) return limited;

  const sb = createAdminClient();
  const { data: msgs } = await sb
    .from('messages')
    .select('id, sender_type, text, created_at')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true })
    .limit(120);

  const insight = await analyzeConversation(params.id, (msgs as never) || []);
  return NextResponse.json(insight);
}
