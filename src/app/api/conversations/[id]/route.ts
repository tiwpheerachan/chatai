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
  const sp = new URL(req.url).searchParams;
  const live = sp.get('live') === '1';
  const noHydrate = sp.get('nohydrate') === '1'; // DB-only refresh (never call upstream)

  const { data: c } = await sb
    .from('conversations')
    .select('*, customer:customers(*), brand:brands(name,slug,color)')
    .eq('id', params.id)
    .maybeSingle();
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Hydrate the full thread from the platform the FIRST time a conversation is opened
  // (bulk sync only stored the 1-message preview), then persist it so every later open
  // reads straight from the DB — no re-fetching from Shopee on each open. `?live=1`
  // forces a refresh on demand.
  if ((c as any).channel === 'shopee' && !noHydrate) {
    let need = live;
    if (!need) {
      const { count } = await sb
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', params.id);
      need = (count ?? 0) <= 1; // only the preview stored → fill it once
    }
    if (need) {
      try { await hydrateConversation(params.id); } catch { /* leave what we have */ }
    }
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
