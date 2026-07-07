import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { upsertDocument } from '@/lib/rag';
import { parseBody, kbUpsertSchema, safeUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { searchParams } = new URL(req.url);
  const brand = safeUuid(searchParams.get('brand_id'));

  let q = ctx.sb
    .from('knowledge_base')
    .select('id,title,content,tags,brand_id,updated_at')
    .order('updated_at', { ascending: false });
  if (brand) q = q.or(`brand_id.eq.${brand},brand_id.is.null`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { ctx, res } = await authorize('kb.write');
  if (!ctx) return res;
  const { data: body, res: badReq } = await parseBody(req, kbUpsertSchema);
  if (!body) return badReq;

  try {
    const id = await upsertDocument(body);
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: 'Could not save document' }, { status: 500 });
  }
}
