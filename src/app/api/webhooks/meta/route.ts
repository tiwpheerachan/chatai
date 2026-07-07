import { NextResponse } from 'next/server';
import { ingest } from '@/lib/ingest';
import { verifyMetaSignature } from '@/lib/webhook-security';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge);
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
    for (const event of entry.messaging || []) {
      if (event.message?.text && event.sender?.id) {
        const platform = body.object === 'instagram' ? 'instagram' : 'facebook';
        try {
          await ingest({
            channel: platform,
            channel_user_id: event.sender.id,
            display_name: platform === 'instagram' ? 'IG User' : 'FB User',
            text: event.message.text,
            avatar: platform === 'instagram' ? '📷' : '📘',
          });
        } catch (e) {
          console.error('[webhook:meta] ingest failed', (e as Error).message);
        }
      }
    }
  }
  return new NextResponse(null, { status: 200 });
}
