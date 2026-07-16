import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { detectRisk } from '@/lib/risk';

export const dynamic = 'force-dynamic';

// #4 The acting user's personally-starred conversations — brand-scoped, and
// resolved from the DB so stars on OLD chats (beyond the inbox's loaded page)
// still show up in the "ดาวของฉัน" filter.
export async function GET(_req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;

  const sb = createAdminClient();
  const { data: st } = await sb.from('conversation_stars').select('conversation_id').eq('user_id', ctx.userId).order('created_at', { ascending: false }).limit(300);
  const ids = ((st as any[]) || []).map(s => s.conversation_id);
  if (!ids.length) return NextResponse.json([]);

  const sel = '*, customer:customers(display_name,avatar,email,phone,ltv,order_count), brand:brands(name,slug,color), assignee:profiles!conversations_assigned_to_fkey(id,name)';
  let q = sb.from('conversations').select(sel).in('id', ids).order('last_message_at', { ascending: false });
  if (ctx.scope.brands) q = q.in('brand_id', ctx.scope.brands.length ? ctx.scope.brands : ['00000000-0000-0000-0000-000000000000']);
  const { data } = await q;

  const flat = ((data as any[]) || []).map((c: any) => {
    const rk = detectRisk(c.last_snippet);
    return {
      ...c,
      customer_name: c.customer?.display_name,
      customer_avatar: c.customer?.avatar,
      brand_name: c.brand?.name ?? null,
      brand_slug: c.brand?.slug ?? null,
      brand_color: c.brand?.color ?? null,
      assignee_name: c.assignee?.name ?? null,
      risk: rk ? { severity: rk.severity, terms: rk.terms } : null,
      starred: true,
    };
  });
  return NextResponse.json(flat);
}
