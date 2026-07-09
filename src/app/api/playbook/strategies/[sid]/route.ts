import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize, isAdminOrAbove } from '@/lib/auth';
import { parseBody, safeUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';
const canWrite = (role: string) => isAdminOrAbove(role as any) || role === 'supervisor';

const patchSchema = z.object({
  label: z.string().max(200).nullish(),
  response: z.string().max(3000).nullish(),
  order_condition: z.string().max(40).nullish(),
  action: z.enum(['reply', 'handoff']).optional(),
  enabled: z.boolean().optional(),
  sort: z.number().int().optional(),
}).strict();

export async function PATCH(req: Request, { params }: { params: { sid: string } }) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!canWrite(ctx.role)) return NextResponse.json({ error: 'ต้องเป็นหัวหน้าทีมขึ้นไป' }, { status: 403 });
  if (!safeUuid(params.sid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { data: body, res: bad } = await parseBody(req, patchSchema);
  if (!body) return bad;
  const { error } = await ctx.sb.from('reply_strategies').update(body).eq('id', params.sid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { sid: string } }) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!canWrite(ctx.role)) return NextResponse.json({ error: 'ต้องเป็นหัวหน้าทีมขึ้นไป' }, { status: 403 });
  if (!safeUuid(params.sid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { error } = await ctx.sb.from('reply_strategies').delete().eq('id', params.sid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
