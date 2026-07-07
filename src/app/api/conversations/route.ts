import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { clampInt, safeUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { searchParams } = new URL(req.url);

  let q = ctx.sb
    .from('conversations')
    .select('*, customer:customers(display_name,avatar,email,phone,ltv,order_count), brand:brands(name,slug,color)')
    .order('last_message_at', { ascending: false })
    .limit(clampInt(searchParams.get('limit'), 200, 1, 500));

  const status = searchParams.get('status');
  const channel = searchParams.get('channel');
  const assigned = safeUuid(searchParams.get('assigned_to'));
  if (status) q = q.eq('status', status);
  if (channel) q = q.eq('channel', channel);
  if (assigned) q = q.eq('assigned_to', assigned);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'Query failed' }, { status: 500 });

  // flatten customer + brand for the inbox list
  const flat = (data || []).map((c: any) => ({
    ...c,
    customer_name: c.customer?.display_name,
    customer_avatar: c.customer?.avatar,
    brand_name: c.brand?.name ?? null,
    brand_slug: c.brand?.slug ?? null,
    brand_color: c.brand?.color ?? null,
  }));
  return NextResponse.json(flat);
}
