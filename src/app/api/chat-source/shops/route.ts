import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { listShops, ChatSourceError, type Platform } from '@/lib/chat-source/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;

  const { searchParams } = new URL(req.url);
  const p = searchParams.get('platform');
  // Default to Shopee — the only platform authorized/live today.
  const platform: Platform = p === 'tiktok' ? 'tiktok' : 'shopee';

  try {
    const shops = await listShops(platform);
    return NextResponse.json({ shops, platform });
  } catch (e) {
    const err = e as ChatSourceError;
    return NextResponse.json({ error: err.message, upstreamStatus: err.status }, { status: 502 });
  }
}
