import { NextResponse } from 'next/server';
import { verifyEcomWebhook } from '@/lib/webhook-security';
import { ingestConversation } from '@/lib/chat-source/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Receiver for ecom-data-platform outbound webhooks (realtime push).
 * Docs: ~/Downloads/outbound-webhooks-api.md
 *
 * - Verifies X-Ecom-Hmac-Sha256 (HMAC-SHA256 of the RAW body, secret = SHA256(API key)).
 * - For chat events (chat.new_message / chat.new_conversation) it ingests the conversation
 *   into Supabase (customer + conversation + recent messages); Supabase Realtime then pushes
 *   it to the open inbox — no polling needed.
 * - Idempotent: re-delivered events re-ingest with external-id dedup (no dupes).
 * - Always returns 2xx quickly so deliveries are marked DELIVERED (non-2xx triggers retries).
 *
 * NOTE: never auto-replies — ingest only (Shopee is human-agent only; AI stays off).
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('x-ecom-hmac-sha256');
  const event = req.headers.get('x-ecom-event') || '';
  const deliveryId = req.headers.get('x-ecom-delivery-id') || '';

  if (!verifyEcomWebhook(raw, sig, process.env.CHAT_API_KEY)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let body: any = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* tolerate non-JSON test pings */ }
  const evt: string = body?.event || event;

  // Only chat events drive the inbox. Everything else is acked (200) as a no-op.
  if (evt === 'chat.new_message' || evt === 'chat.new_conversation') {
    const shopId = body?.shop_id != null ? String(body.shop_id) : null;
    const chat = body?.chat || {};
    const convId = chat?.conversation_id != null ? String(chat.conversation_id) : null;
    if (shopId && convId) {
      try {
        const res = await ingestConversation(shopId, convId);
        return NextResponse.json({ event: evt, delivery_id: deliveryId, ...res });
      } catch (e) {
        // Ack anyway (return 200) so the platform doesn't hammer retries on a transient
        // upstream hiccup — the next delivery / poll will reconcile.
        return NextResponse.json({ ok: false, event: evt, note: 'ingest failed, acked' });
      }
    }
  }

  return NextResponse.json({ ok: true, event: evt || 'unknown', ignored: true });
}
