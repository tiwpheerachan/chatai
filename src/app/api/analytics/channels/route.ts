import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { ctx, res } = await authorize('analytics.read');
  if (!ctx) return res;
  const { sb } = ctx;
  const { data } = await sb.from('conversations').select('channel');
  const counts: Record<string, number> = {};
  for (const r of data || []) counts[r.channel] = (counts[r.channel] || 0) + 1;
  return NextResponse.json(Object.entries(counts).map(([channel, n]) => ({ channel, n })));
}
