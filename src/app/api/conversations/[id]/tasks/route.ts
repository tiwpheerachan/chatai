import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { parseBody, safeUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Internal follow-up tasks ("ใบสั่งงาน") on a conversation — never sent to buyers.

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data } = await ctx.sb
    .from('conversation_tasks')
    .select('*, assignee:profiles!conversation_tasks_assigned_to_fkey(id,name), creator:profiles!conversation_tasks_created_by_fkey(id,name)')
    .eq('conversation_id', params.id)
    .order('done', { ascending: true })
    .order('created_at', { ascending: false });
  return NextResponse.json({ tasks: data || [] });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(500),
  assigned_to: z.string().uuid().nullish(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data: body, res: badReq } = await parseBody(req, createSchema);
  if (!body) return badReq;

  const { data, error } = await ctx.sb
    .from('conversation_tasks')
    .insert({ conversation_id: params.id, title: body.title, assigned_to: body.assigned_to ?? null, created_by: ctx.userId })
    .select('*, assignee:profiles!conversation_tasks_assigned_to_fkey(id,name), creator:profiles!conversation_tasks_created_by_fkey(id,name)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const patchSchema = z.object({
  task_id: z.string().uuid(),
  done: z.boolean().optional(),
  title: z.string().trim().min(1).max(500).optional(),
  assigned_to: z.string().uuid().nullish(),
}).strict();

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data: body, res: badReq } = await parseBody(req, patchSchema);
  if (!body) return badReq;

  const patch: Record<string, unknown> = {};
  if (body.done !== undefined) { patch.done = body.done; patch.done_at = body.done ? new Date().toISOString() : null; }
  if (body.title !== undefined) patch.title = body.title;
  if (body.assigned_to !== undefined) patch.assigned_to = body.assigned_to;

  const { error } = await ctx.sb
    .from('conversation_tasks')
    .update(patch)
    .eq('id', body.task_id)
    .eq('conversation_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const taskId = new URL(req.url).searchParams.get('task_id');
  if (!taskId || !safeUuid(taskId)) return NextResponse.json({ error: 'task_id required' }, { status: 400 });

  const { error } = await ctx.sb.from('conversation_tasks').delete().eq('id', taskId).eq('conversation_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
