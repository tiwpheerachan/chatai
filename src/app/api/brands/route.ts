import { NextResponse } from 'next/server';
import { authorize, isAdminOrAbove } from '@/lib/auth';
import { parseBody, brandSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { data } = await ctx.sb.from('brands').select('*').order('created_at', { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  if (!isAdminOrAbove(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { data: body, res: badReq } = await parseBody(req, brandSchema);
  if (!body) return badReq;

  const { data, error } = await ctx.sb.from('brands').insert(body).select('id').single();
  if (error) return NextResponse.json({ error: 'Could not create brand' }, { status: 500 });
  return NextResponse.json(data);
}
