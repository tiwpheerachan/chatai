import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { parseBody, safeUuid } from '@/lib/validation';
import { bustKbCache } from '@/lib/rag';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().trim().min(1).max(8000).optional(),
  tags: z.array(z.string().max(50)).max(30).optional(),
}).strict();

// PATCH — edit a KB entry (title/content/tags). Clears embedding so it re-embeds.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('kb.write');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { data: body, res: bad } = await parseBody(req, patchSchema);
  if (!body) return bad;
  const patch: Record<string, unknown> = { ...body };
  if (body.content || body.title) patch.embedding = null; // content changed → stale embedding
  const { data: row } = await ctx.sb.from('knowledge_base').select('brand_id').eq('id', params.id).maybeSingle();
  const { error } = await ctx.sb.from('knowledge_base').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  bustKbCache((row as any)?.brand_id ?? null);
  return NextResponse.json({ ok: true });
}

// DELETE — remove a KB entry.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('kb.write');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { data: row } = await ctx.sb.from('knowledge_base').select('brand_id').eq('id', params.id).maybeSingle();
  const { error } = await ctx.sb.from('knowledge_base').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  bustKbCache((row as any)?.brand_id ?? null);
  return NextResponse.json({ ok: true });
}
