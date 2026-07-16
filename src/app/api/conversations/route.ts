import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { clampInt, safeUuid } from '@/lib/validation';
import { detectRisk } from '@/lib/risk';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { searchParams } = new URL(req.url);

  const limit = clampInt(searchParams.get('limit'), 200, 1, 500);
  const status = searchParams.get('status');
  const channel = searchParams.get('channel');
  const assigned = safeUuid(searchParams.get('assigned_to'));
  const sel = '*, customer:customers(display_name,avatar,email,phone,ltv,order_count), brand:brands(name,slug,color), assignee:profiles!conversations_assigned_to_fkey(id,name)';

  // Use the ADMIN (service-role) client and apply the user's brand scope IN CODE.
  // Why: the conversations RLS policy calls current_user_role()/current_user_brand()
  // per row, so sorting the (now 100k+ row) table under RLS times out → intermittent
  // 500s and an empty inbox. The admin client skips RLS (query ~0.3s); we replicate
  // the exact scoping here: owner/all-brands see everything, otherwise filter to the
  // user's allowed brand ids. (Reads only; same visibility the RLS granted.)
  const sb = createAdminClient();
  const build = (withPin: boolean) => {
    let q = sb.from('conversations').select(sel);
    if (withPin) q = q.order('pinned', { ascending: false });
    q = q.order('last_message_at', { ascending: false }).limit(limit);
    if (status) q = q.eq('status', status);
    if (channel) q = q.eq('channel', channel);
    if (assigned) q = q.eq('assigned_to', assigned);
    // scope.brands === null → all brands (owner / unrestricted role).
    if (ctx.scope.brands) q = q.in('brand_id', ctx.scope.brands.length ? ctx.scope.brands : ['00000000-0000-0000-0000-000000000000']);
    return q;
  };

  let { data, error } = await build(true);
  if (error) ({ data, error } = await build(false)); // pinned column not there yet → fall back
  if (error) return NextResponse.json({ error: 'Query failed' }, { status: 500 });

  // Personal stars for THIS user among the rows we're returning (#4).
  const ids = (data || []).map((c: any) => c.id);
  let starred = new Set<string>();
  if (ids.length) {
    const { data: st } = await sb.from('conversation_stars').select('conversation_id').eq('user_id', ctx.userId).in('conversation_id', ids);
    starred = new Set(((st as any[]) || []).map(s => s.conversation_id));
  }

  // flatten customer + brand for the inbox list. `risk` is a team-wide at-a-glance
  // flag from the latest-message preview (full-thread scan happens on open).
  const flat = (data || []).map((c: any) => {
    const rk = detectRisk(c.last_snippet);
    return {
      ...c,
      starred: starred.has(c.id),
      customer_name: c.customer?.display_name,
      customer_avatar: c.customer?.avatar,
      brand_name: c.brand?.name ?? null,
      brand_slug: c.brand?.slug ?? null,
      brand_color: c.brand?.color ?? null,
      assignee_name: c.assignee?.name ?? null,
      risk: rk ? { severity: rk.severity, terms: rk.terms } : null,
    };
  });
  return NextResponse.json(flat);
}
