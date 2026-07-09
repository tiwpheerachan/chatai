import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { adminSb, withBrandScope } from '@/lib/analytics-scope';

export const dynamic = 'force-dynamic';

const CHANNELS = ['shopee', 'tiktok', 'lazada', 'line', 'facebook', 'instagram', 'web'];

export async function GET() {
  const { ctx, res } = await authorize('analytics.read');
  if (!ctx) return res;
  const sb = adminSb();
  // Real per-channel GROUP BY via count queries — selecting all `channel` rows would
  // hit PostgREST's 1000-row cap and badly undercount at 100k+ conversations.
  const rows = await Promise.all(CHANNELS.map(async (channel) => {
    const { count } = await withBrandScope(
      sb.from('conversations').select('id', { count: 'exact', head: true }).eq('channel', channel),
      ctx.scope,
    );
    return { channel, n: count || 0 };
  }));
  return NextResponse.json(rows.filter(r => r.n > 0).sort((a, b) => b.n - a.n));
}
