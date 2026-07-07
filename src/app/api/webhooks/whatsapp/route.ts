import { NextResponse } from 'next/server';
import { ingest } from '@/lib/ingest';
import { verifyMetaSignature } from '@/lib/webhook-security';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(searchParams.get('hub.challenge'));
  }
  return new NextResponse(null, { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'))) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse('Bad request', { status: 400 });
  }

  for (const entry of body.entry || []) {
    for (const ch of entry.changes || []) {
      const msgs = ch.value?.messages || [];
      for (const m of msgs) {
        if (m.text && m.from) {
          try {
            await ingest({
              channel: 'whatsapp',
              channel_user_id: m.from,
              display_name: ch.value.contacts?.[0]?.profile?.name || 'WhatsApp User',
              text: m.text.body,
              avatar: '✅',
            });
          } catch (e) {
            console.error('[webhook:whatsapp] ingest failed', (e as Error).message);
          }
        }
      }
    }
  }
  return new NextResponse(null, { status: 200 });
}
