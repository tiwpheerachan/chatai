import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { safeUuid } from '@/lib/validation';
import { getBuyerOrders, ChatSourceError } from '@/lib/chat-source/client';

export const dynamic = 'force-dynamic';

/**
 * The buyer's past orders for THIS shop — agent context in the customer panel.
 * Shopee only, matched by the conversation's `to_name` (= customer.display_name).
 * Read-only (chat.read). Kept OUT of the hot `[id]` GET so opening a thread stays
 * instant; the client fetches this lazily when a conversation opens.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data: conv } = await ctx.sb
    .from('conversations')
    .select('channel, shop_id, customer:customers(display_name)')
    .eq('id', params.id)
    .single();
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const channel = (conv as any).channel as string;
  const shopId = (conv as any).shop_id as string | null;
  const username = (conv as any).customer?.display_name as string | null;

  // Non-Shopee, missing shop, or the placeholder name (never matches) → no lookup.
  if (channel !== 'shopee' || !shopId || !username || username === 'Shopee Buyer') {
    return NextResponse.json({ orders: [], matched: false });
  }

  try {
    // Just the order list — ONE upstream call. We used to also fire ~5 product-
    // search calls per open to attach product images, but that hammered the
    // 120/min Shopee rate limit on every chat open (competing with the cron) and
    // made the whole inbox stall. Order text (name/model/qty) is enough here;
    // full product cards with images live in the สินค้า tab on demand.
    const orders = await getBuyerOrders(shopId, username, { limit: 20 });
    return NextResponse.json({ orders, matched: orders.length > 0, username });
  } catch (e) {
    const err = e as ChatSourceError;
    // A lookup failure must never break the panel — return empty with the reason.
    return NextResponse.json({ orders: [], matched: false, error: err.message }, { status: 200 });
  }
}
