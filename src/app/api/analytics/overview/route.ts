import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { adminSb, withBrandScope, scopedMessages } from '@/lib/analytics-scope';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { ctx, res } = await authorize('analytics.read');
  if (!ctx) return res;
  const sb = adminSb();
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const [{ count: total }, { count: solved }, { count: aiMsgs }, { count: humanMsgs }] = await Promise.all([
    withBrandScope(sb.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', since), ctx.scope),
    withBrandScope(sb.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'solved').gte('created_at', since), ctx.scope),
    scopedMessages(ctx.scope).eq('sender_type', 'ai').gte('created_at', since),
    scopedMessages(ctx.scope).eq('sender_type', 'agent').gte('created_at', since),
  ]);
  const totalMsgs = (aiMsgs || 0) + (humanMsgs || 0) || 1;
  return NextResponse.json({
    total_conversations: total || 0,
    solved: solved || 0,
    resolution_rate: total ? Math.round(((solved || 0) / total) * 100) : 0,
    ai_handle_rate: Math.round(((aiMsgs || 0) / totalMsgs) * 100),
    ai_messages: aiMsgs || 0,
    human_messages: humanMsgs || 0,
  });
}
