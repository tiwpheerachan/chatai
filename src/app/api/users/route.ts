import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { data } = await ctx.sb
    .from('profiles')
    .select('id,email,name,avatar,role,brand_id,status')
    .order('created_at', { ascending: false });
  return NextResponse.json(data || []);
}
