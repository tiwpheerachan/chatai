import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { parseBody } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';
import { draftCommentReply } from '@/lib/comments/reply-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({
  comment_id: z.union([z.string(), z.number()]).optional(),
  comment_text: z.string().max(4000).optional(),
  rating: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  sentiment: z.string().nullable().optional(),
  urgent: z.boolean().nullable().optional(),
  product_item_name: z.string().nullable().optional(),
  product_name: z.string().nullable().optional(),
}).strict();

/** DeepSeek draft of a natural Thai reply for one review comment (human copies/sends). */
export async function POST(req: Request) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  const limited = enforceRateLimit(`comment-draft:${ctx.userId}`, 40, 60_000);
  if (limited) return limited;
  const { data: body, res: bad } = await parseBody(req, schema);
  if (!body) return bad;

  const reply = await draftCommentReply({
    comment_id: String(body.comment_id ?? ''),
    comment_text: body.comment_text ?? null,
    rating: body.rating ?? null,
    category: body.category ?? null,
    sentiment: body.sentiment ?? null,
    urgent: body.urgent ?? null,
    product_item_name: body.product_item_name ?? null,
    product_name: body.product_name ?? null,
  });
  return NextResponse.json({ reply });
}
