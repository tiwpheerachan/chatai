import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { getStock, warehouseConfigured } from '@/lib/warehouse';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * #6 Warehouse stock lookup from the chat. Query by:
 *   ?q=<sku/name/item_id>       — free search (สต็อกคลัง tab)
 *   ?item_ids=1,2,3             — for the customer's ordered items (badges)
 *   ?skus=A,B                   — by SKU
 * Returns back-of-house (JST) stock with per-warehouse breakdown + refreshed_at.
 */
export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!warehouseConfigured()) return NextResponse.json({ configured: false, products: [] });

  const sp = new URL(req.url).searchParams;
  const q = sp.get('q') || undefined;
  const itemIds = (sp.get('item_ids') || '').split(',').map(s => s.trim()).filter(Boolean);
  const skus = (sp.get('skus') || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!q && !itemIds.length && !skus.length) return NextResponse.json({ configured: true, products: [] });

  try {
    const products = await getStock({ q, itemIds, skus, limit: 40 });
    return NextResponse.json({ configured: true, products });
  } catch (e) {
    const msg = (e as Error).message || '';
    // Distinguish the platform-grant issue from a transient error so the UI can
    // show the right note (this needs the platform team, not a retry).
    const accessDenied = /access denied|permission|does not have/i.test(msg);
    return NextResponse.json({
      configured: true, products: [],
      error: accessDenied ? 'access_denied' : 'query_error',
      detail: msg.slice(0, 200),
    });
  }
}
