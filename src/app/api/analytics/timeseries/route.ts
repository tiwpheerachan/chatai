import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { ctx, res } = await authorize('analytics.read');
  if (!ctx) return res;
  const { sb } = ctx;
  const days = 7;
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(Date.now() - (i + 1) * 86400 * 1000).toISOString();
    const end = new Date(Date.now() - i * 86400 * 1000).toISOString();
    const [{ count: customer }, { count: agent }] = await Promise.all([
      sb.from('messages').select('id', { count: 'exact', head: true }).eq('sender_type', 'customer').gte('created_at', start).lt('created_at', end),
      sb.from('messages').select('id', { count: 'exact', head: true }).eq('sender_type', 'agent').gte('created_at', start).lt('created_at', end),
    ]);
    out.push({
      day: new Date(end).toLocaleDateString('th-TH', { weekday: 'short' }),
      customer: customer || 0,
      agent: agent || 0,
    });
  }
  return NextResponse.json(out);
}
