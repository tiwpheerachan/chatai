import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Per-shop sync progress (cursor position, caught-up flag, counts).
export async function GET() {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;

  const { data: shops } = await ctx.sb
    .from('chat_shops')
    .select('shop_id, brand_slug, shop_name, caught_up, last_synced_at, conversations_synced')
    .order('brand_slug', { ascending: true });

  return NextResponse.json({ shops: shops || [] });
}
