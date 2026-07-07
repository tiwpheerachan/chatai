import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { parseBody, conversationPatchSchema, safeUuid } from '@/lib/validation';
import { hydrateConversation } from '@/lib/chat-source/sync';
import { markRead } from '@/lib/chat-source/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { sb } = ctx;
  const live = new URL(req.url).searchParams.get('live') === '1';

  const { data: c } = await sb
    .from('conversations')
    .select('*, customer:customers(*), brand:brands(name,slug,color)')
    .eq('id', params.id)
    .maybeSingle();
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Pull fresh history from the platform ONLY on explicit `?live=1` (background call).
  // The default open path stays DB-only so switching conversations is instant — the
  // client fires a background `?live=1` right after to fill/refresh the thread.
  if (live && (c as any).channel === 'shopee') {
    try { await hydrateConversation(params.id); } catch { /* leave what we have */ }
  }

  const { data: messages } = await sb
    .from('messages')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });

  // mark as read locally, and on the platform too (Shopee) only when there was unread.
  const hadUnread = ((c as any).unread ?? 0) > 0;
  await sb.from('conversations').update({ unread: 0 }).eq('id', params.id);
  if (hadUnread && (c as any).channel === 'shopee' && (c as any).shop_id && (c as any).external_id) {
    try { await markRead((c as any).shop_id, (c as any).external_id); } catch { /* non-fatal */ }
  }

  return NextResponse.json({ ...c, messages: messages || [] });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data: body, res: badReq } = await parseBody(req, conversationPatchSchema);
  if (!body) return badReq;

  const { error } = await ctx.sb.from('conversations').update(body).eq('id', params.id);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
