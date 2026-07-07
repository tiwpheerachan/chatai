import { NextResponse } from 'next/server';
import { generateReply } from '@/lib/bot';
import { authorize } from '@/lib/auth';
import { parseBody, botTestSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const { ctx, res } = await authorize('kb.read');
  if (!ctx) return res;

  const limited = enforceRateLimit(`bot-test:${ctx.userId}`, 20, 60_000);
  if (limited) return limited;

  const { data: body, res: badReq } = await parseBody(req, botTestSchema);
  if (!body) return badReq;

  const reply = await generateReply({
    userMessage: body.text,
    brand_id: body.brand_id,
    history: [],
    customerName: 'ทดสอบ',
  });
  return NextResponse.json(reply);
}
