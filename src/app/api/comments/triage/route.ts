import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { parseBody } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';
import { triageComment } from '@/lib/comments/reply-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({
  comment_text: z.string().max(4000).optional(),
  rating: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  sentiment: z.string().nullable().optional(),
  urgent: z.boolean().nullable().optional(),
  severity: z.number().nullable().optional(),
  product_item_name: z.string().nullable().optional(),
}).strict();

/** DeepSeek urgency triage for one comment → priority + how-to-handle steps. */
export async function POST(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  const limited = enforceRateLimit(`comment-triage:${ctx.userId}`, 40, 60_000);
  if (limited) return limited;
  const { data: body, res: bad } = await parseBody(req, schema);
  if (!body) return bad;
  const t = await triageComment({
    comment_text: body.comment_text ?? null,
    rating: body.rating ?? null,
    category: body.category ?? null,
    sentiment: body.sentiment ?? null,
    urgent: body.urgent ?? null,
    severity: body.severity ?? null,
    product_item_name: body.product_item_name ?? null,
  });
  return NextResponse.json(t);
}
