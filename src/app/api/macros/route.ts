import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { parseBody, macroSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { data } = await ctx.sb.from('macros').select('*').order('uses', { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const { ctx, res } = await authorize('macro.write');
  if (!ctx) return res;
  const { data: body, res: badReq } = await parseBody(req, macroSchema);
  if (!body) return badReq;

  const { data, error } = await ctx.sb.from('macros').insert(body).select('id').single();
  if (error) return NextResponse.json({ error: 'Could not create macro' }, { status: 500 });
  return NextResponse.json(data);
}
