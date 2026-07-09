import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize, isAdminOrAbove } from '@/lib/auth';
import { parseBody, safeUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';
const canWrite = (role: string) => isAdminOrAbove(role as any) || role === 'supervisor';

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  examples: z.array(z.string().max(300)).max(30).optional(),
  category: z.string().max(60).nullish(),
  enabled: z.boolean().optional(),
  sort: z.number().int().optional(),
}).strict();

// PATCH — update a scenario. DELETE — remove it (+ its strategies via cascade).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!canWrite(ctx.role)) return NextResponse.json({ error: 'ต้องเป็นหัวหน้าทีมขึ้นไป' }, { status: 403 });
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { data: body, res: bad } = await parseBody(req, patchSchema);
  if (!body) return bad;
  const { error } = await ctx.sb.from('reply_scenarios').update(body).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!canWrite(ctx.role)) return NextResponse.json({ error: 'ต้องเป็นหัวหน้าทีมขึ้นไป' }, { status: 403 });
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { error } = await ctx.sb.from('reply_scenarios').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
