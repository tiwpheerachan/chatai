import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { getUnreadCount, ChatSourceError } from '@/lib/chat-source/client';

export const dynamic = 'force-dynamic';

// Shopee-only: total unread conversation count for a shop.
export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;

  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get('shop_id');
  if (!shopId) return NextResponse.json({ error: 'shop_id required' }, { status: 400 });

  try {
    const data = await getUnreadCount(shopId);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as ChatSourceError;
    return NextResponse.json({ error: err.message, upstreamStatus: err.status }, { status: 502 });
  }
}
