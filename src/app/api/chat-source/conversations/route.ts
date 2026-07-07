import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { listConversations, ChatSourceError, type Platform } from '@/lib/chat-source/client';
import { clampInt } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;

  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get('shop_id');
  if (!shopId) return NextResponse.json({ error: 'shop_id required' }, { status: 400 });
  const platform: Platform = searchParams.get('platform') === 'tiktok' ? 'tiktok' : 'shopee';

  try {
    const data = await listConversations(platform, shopId, {
      pageSize: clampInt(searchParams.get('page_size'), 20, 1, 50),
      pageToken: searchParams.get('page_token') || undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    const err = e as ChatSourceError;
    return NextResponse.json({ error: err.message, upstreamStatus: err.status }, { status: 502 });
  }
}
