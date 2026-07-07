import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { data } = await ctx.sb.from('channels').select('id,brand_id,type,name,status,webhook_url,created_at').order('created_at', { ascending: false });
  return NextResponse.json(data || []);
}
