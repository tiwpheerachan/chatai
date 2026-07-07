import { NextResponse } from 'next/server';
import { retrieve } from '@/lib/rag';
import { authorize } from '@/lib/auth';
import { parseBody, kbRetrieveSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const { ctx, res } = await authorize('kb.read');
  if (!ctx) return res;

  const limited = enforceRateLimit(`kb-retrieve:${ctx.userId}`, 30, 60_000);
  if (limited) return limited;

  const { data: body, res: badReq } = await parseBody(req, kbRetrieveSchema);
  if (!body) return badReq;

  const docs = await retrieve(body.query, { brand_id: body.brand_id, k: body.k });
  return NextResponse.json(docs);
}
