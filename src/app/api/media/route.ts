import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { searchProductMedia } from '@/lib/product-media';

export const dynamic = 'force-dynamic';

/**
 * Search the product-media library (spec sheets / how-to images) so an admin can
 * find and send any image at any time — not only the ones the AI auto-suggests.
 * ?q=<คำค้น> &brand=<slug>. Matches across title/category/AI summary/spec text/models.
 */
export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  const sp = new URL(req.url).searchParams;
  const q = sp.get('q') || '';
  const brand = sp.get('brand') || undefined;
  const items = searchProductMedia(q, brand, 24);
  return NextResponse.json({ items });
}
