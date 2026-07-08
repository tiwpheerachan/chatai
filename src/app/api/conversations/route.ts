import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { clampInt, safeUuid } from '@/lib/validation';

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

  // Build the query, applying the shared filters. `withPin` toggles the pinned-first
  // ordering — if migration 012 (the `pinned` column) hasn't been applied yet, that
  // order clause errors, so we retry WITHOUT it rather than breaking the whole inbox.
  const build = (withPin: boolean) => {
    let q = ctx.sb.from('conversations').select(sel);
    if (withPin) q = q.order('pinned', { ascending: false });
    q = q.order('last_message_at', { ascending: false }).limit(limit);
    if (status) q = q.eq('status', status);
    if (channel) q = q.eq('channel', channel);
    if (assigned) q = q.eq('assigned_to', assigned);
    return q;
  };

  let { data, error } = await build(true);
  if (error) ({ data, error } = await build(false)); // pinned column not there yet → fall back
  if (error) return NextResponse.json({ error: 'Query failed' }, { status: 500 });

  // flatten customer + brand for the inbox list
  const flat = (data || []).map((c: any) => ({
    ...c,
    customer_name: c.customer?.display_name,
    customer_avatar: c.customer?.avatar,
    brand_name: c.brand?.name ?? null,
    brand_slug: c.brand?.slug ?? null,
    brand_color: c.brand?.color ?? null,
    assignee_name: c.assignee?.name ?? null,
  }));
  return NextResponse.json(flat);
}
