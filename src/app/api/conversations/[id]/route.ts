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
    .select('*, customer:customers(*), brand:brands(name,slug,color), assignee:profiles!conversations_assigned_to_fkey(id,name)')
    .eq('id', params.id)
    .maybeSingle();
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Hydrate from the platform ONLY on explicit `?live=1` (the client fires this in the
  // BACKGROUND after showing the DB copy). The default open path is pure DB → instant,
  // never blocks on a slow Shopee fetch. Hydrated threads persist, so re-opens are DB-only.
  if ((c as any).channel === 'shopee' && live && !noHydrate) {
    try { await hydrateConversation(params.id); } catch { /* leave what we have */ }
  }

  const { data: messages } = await sb
    .from('messages')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });

  // Order numbers referenced anywhere in this thread (order cards + shipping
  // messages carry source_content.order_sn). Lets the agent see which order the
  // conversation is about even though the API can't return the order's line items.
  const orderRefs = Array.from(new Set(
    (messages || []).flatMap((m: any) => {
      const out: string[] = [];
      const sn = m?.metadata?.source_content?.order_sn;
      if (sn) out.push(String(sn));
      for (const a of (m.attachments || [])) if (a?.type === 'order' && a?.order_sn) out.push(String(a.order_sn));
      return out;
    }),
  ));

  // mark as read locally, and on the platform too (Shopee) only when there was unread.
  const hadUnread = ((c as any).unread ?? 0) > 0;
  await sb.from('conversations').update({ unread: 0 }).eq('id', params.id);
  // FIRE-AND-FORGET the Shopee markRead — never block the thread response on it.
  // The Shopee API is rate-limited and can queue for seconds behind the cron; the
  // thread must load instantly from the DB regardless. (Render is a persistent
  // server, so the promise finishes in the background.)
  if (hadUnread && (c as any).channel === 'shopee' && (c as any).shop_id && (c as any).external_id) {
    markRead((c as any).shop_id, (c as any).external_id).catch(() => { /* non-fatal */ });
  }

  return NextResponse.json({ ...c, messages: messages || [], order_refs: orderRefs });
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
