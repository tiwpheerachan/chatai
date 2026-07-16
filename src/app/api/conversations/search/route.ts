import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { detectRisk } from '@/lib/risk';

export const dynamic = 'force-dynamic';

// ============================================================
// #4 Team-wide search. Unlike the inbox's client-side filter (which only sees
// the ~200 loaded rows), this searches ALL conversations by customer name /
// phone / email / message snippet — brand-scoped — so any teammate can find a
// chat even if they never replied to it. Admin client + code-side scope (same
// pattern as the list route: RLS per-row is too slow on the 100k+ table).
// ============================================================
export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;

  const raw = (new URL(req.url).searchParams.get('q') || '').trim();
  // Sanitize: strip characters that would break PostgREST's or()/ilike syntax.
  const q = raw.replace(/[,%_()*.\\:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 2) return NextResponse.json([]);

  const sb = createAdminClient();
  const brands = ctx.scope.brands; // null = all
  const like = `%${q}%`;

  // 1) Customers matching name / phone / email (brand-scoped).
  let custQ = sb.from('customers').select('id').or(`display_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`).limit(400);
  if (brands) custQ = custQ.in('brand_id', brands.length ? brands : ['00000000-0000-0000-0000-000000000000']);
  const { data: custs } = await custQ;
  const custIds = ((custs as any[]) || []).map(c => c.id);

  const sel = '*, customer:customers(display_name,avatar,email,phone,ltv,order_count), brand:brands(name,slug,color), assignee:profiles!conversations_assigned_to_fkey(id,name)';
  const scopeIn = (query: any) => brands ? query.in('brand_id', brands.length ? brands : ['00000000-0000-0000-0000-000000000000']) : query;

  // 2) Conversations for those customers, PLUS conversations whose snippet matches.
  const [byCust, bySnippet] = await Promise.all([
    custIds.length
      ? scopeIn(sb.from('conversations').select(sel).in('customer_id', custIds)).order('last_message_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [] as any[] }),
    scopeIn(sb.from('conversations').select(sel).ilike('last_snippet', like)).order('last_message_at', { ascending: false }).limit(50),
  ]);

  // Merge + de-dup by conversation id.
  const seen = new Set<string>();
  const merged: any[] = [];
  for (const c of [...((byCust as any).data || []), ...((bySnippet as any).data || [])]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    merged.push(c);
  }

  // Which of these has THIS user starred?
  const { data: stars } = await sb.from('conversation_stars').select('conversation_id').eq('user_id', ctx.userId).in('conversation_id', merged.map(c => c.id).slice(0, 300));
  const starred = new Set(((stars as any[]) || []).map(s => s.conversation_id));

  const flat = merged.map((c: any) => {
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
      starred: starred.has(c.id),
    };
  });

  return NextResponse.json(flat);
}
