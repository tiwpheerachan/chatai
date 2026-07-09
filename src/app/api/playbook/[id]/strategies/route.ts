import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize, isAdminOrAbove } from '@/lib/auth';
import { parseBody, safeUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';
const canWrite = (role: string) => isAdminOrAbove(role as any) || role === 'supervisor';

const schema = z.object({
  label: z.string().max(200).nullish(),
  response: z.string().max(3000).nullish(),
  order_condition: z.string().max(40).nullish(),
  action: z.enum(['reply', 'handoff']).optional(),
});

// POST — add a strategy under a scenario.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!canWrite(ctx.role)) return NextResponse.json({ error: 'ต้องเป็นหัวหน้าทีมขึ้นไป' }, { status: 403 });
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { data: body, res: bad } = await parseBody(req, schema);
  if (!body) return bad;
  const { data, error } = await ctx.sb.from('reply_strategies')
    .insert({ scenario_id: params.id, label: body.label ?? null, response: body.response ?? null, order_condition: body.order_condition ?? null, action: body.action ?? 'reply' })
    .select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
