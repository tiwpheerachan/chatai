import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { safeUuid } from '@/lib/validation';
import { searchProducts, ChatSourceError } from '@/lib/chat-source/client';

export const dynamic = 'force-dynamic';

/**
 * Search THIS conversation's shop catalog to build a product card. Read-only
 * (chat.read); the actual card send stays on the chat.reply `[id]/card` route.
 * Empty q → best-sellers. Shop is resolved from the conversation so an agent
 * can only search the shop they're chatting in.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data: conv } = await ctx.sb
    .from('conversations')
    .select('channel, shop_id')
    .eq('id', params.id)
    .single();
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  if ((conv as any).channel !== 'shopee' || !(conv as any).shop_id) {
    return NextResponse.json({ products: [] });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').slice(0, 100);
  const sortParam = url.searchParams.get('sort');
  const sort = (['sales', 'price_asc', 'price_desc'].includes(sortParam || '') ? sortParam : 'sales') as
    'sales' | 'price_asc' | 'price_desc';
  const inStock = url.searchParams.get('in_stock') === '1' ? true : undefined;

  try {
    const products = await searchProducts((conv as any).shop_id, { q, sort, inStock, limit: 24 });
    // Collapse to item grain (variants share item_id) — item cards are item-level,
    // and we show the cheapest in-stock variant's price as the "from" price.
    const byItem = new Map<number, any>();
    for (const p of products) {
      const cur = byItem.get(p.item_id);
      if (!cur) { byItem.set(p.item_id, { ...p, variants: 1 }); continue; }
      cur.variants += 1;
      cur.stock += p.stock || 0;
      if (p.in_stock) cur.in_stock = true;
      if ((p.price ?? Infinity) < (cur.price ?? Infinity)) { cur.price = p.price; cur.original_price = p.original_price; }
    }
    return NextResponse.json({ products: [...byItem.values()] });
  } catch (e) {
    const err = e as ChatSourceError;
    return NextResponse.json({ products: [], error: err.message }, { status: 200 });
  }
}
