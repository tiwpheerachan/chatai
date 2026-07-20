import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { detectRisk } from '@/lib/risk';

export const dynamic = 'force-dynamic';

// #10 Shift-end summary — the acting agent's work this shift + what's still open
// to hand off to the next shift.
export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;

  const hours = Math.min(24, Math.max(1, parseInt(new URL(req.url).searchParams.get('hours') || '9', 10) || 9));
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const sb = createAdminClient();
  const uid = ctx.userId;

  const [repliesRes, closedRes, pendingRes] = await Promise.all([
    // Replies sent this shift (+ which conversations touched).
    sb.from('messages').select('conversation_id', { count: 'exact' }).eq('sender_id', uid).gte('created_at', since).limit(5000),
    // Cases the agent closed (status) — assigned to them.
    sb.from('conversations').select('id', { count: 'exact', head: true }).eq('assigned_to', uid).eq('status', 'closed'),
    // Still-open cases assigned to them where the customer is waiting (unread>0).
    sb.from('conversations')
      .select('id, unread, last_snippet, last_message_at, priority, customer:customers(display_name,avatar), brand:brands(name,color)')
      .eq('assigned_to', uid).eq('status', 'open').gt('unread', 0)
      .order('last_message_at', { ascending: true }).limit(50),
  ]);

  const replies = repliesRes.count || (repliesRes.data as any[])?.length || 0;
  const touched = new Set(((repliesRes.data as any[]) || []).map(m => m.conversation_id)).size;

  const pending = ((pendingRes.data as any[]) || []).map(c => {
    const rk = detectRisk(c.last_snippet);
    return {
      id: c.id, name: c.customer?.display_name || '-', avatar: c.customer?.avatar || null,
      brand: c.brand?.name || null, snippet: c.last_snippet || '', unread: c.unread || 0,
      at: c.last_message_at, priority: c.priority, risk: rk ? rk.severity : null,
    };
  });
  const riskCount = pending.filter(p => p.risk).length;

  return NextResponse.json({
    hours, since,
    agent: ctx.name || ctx.email,
    replies, touched,
    closed: closedRes.count || 0,
    pendingCount: pending.length, riskCount, pending,
  });
}
