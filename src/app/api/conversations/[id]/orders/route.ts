import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { safeUuid } from '@/lib/validation';
import { getBuyerOrders, searchProducts, ChatSourceError } from '@/lib/chat-source/client';

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
    const orders = await getBuyerOrders(shopId, username, { limit: 20 });

    // Enrich each order item with a catalog image + item_id so the panel can show
    // WHICH product the buyer bought (and let the agent re-send it as a card).
    // buyer-orders returns no image/item_id, so we match by name against the
    // catalog. Bounded to a few lookups to stay well under the read cap; a miss
    // just leaves the item image-less (still shows name/qty).
    const names = new Set<string>();
    for (const o of orders) for (const it of o.items || []) if (it.item_name) names.add(it.item_name);
    const lookup = new Map<string, { image_url?: string; item_id?: number; price?: number }>();
    for (const name of [...names].slice(0, 8)) {
      try {
        const q = name.replace(/^\[[^\]]*\]\s*/, '').slice(0, 40); // drop "[NEW]" tag, keep it short
        const hits = await searchProducts(shopId, { q, limit: 1 });
        if (hits[0]) lookup.set(name, { image_url: hits[0].image_url, item_id: hits[0].item_id, price: hits[0].price });
      } catch { /* skip this item's image */ }
    }
    const enriched = orders.map((o) => ({
      ...o,
      items: (o.items || []).map((it) => ({ ...it, ...(lookup.get(it.item_name) || {}) })),
    }));
    return NextResponse.json({ orders: enriched, matched: enriched.length > 0, username });
  } catch (e) {
    const err = e as ChatSourceError;
    // A lookup failure must never break the panel — return empty with the reason.
    return NextResponse.json({ orders: [], matched: false, error: err.message }, { status: 200 });
  }
}
