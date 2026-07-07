import { NextResponse } from 'next/server';
import { ingest } from '@/lib/ingest';
import { verifyLineSignature } from '@/lib/webhook-security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyLineSignature(raw, req.headers.get('x-line-signature'))) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse('Bad request', { status: 400 });
  }

  for (const ev of body.events || []) {
    if (ev.type === 'message' && ev.message?.type === 'text' && ev.source?.userId) {
      try {
        await ingest({
          channel: 'line',
          channel_user_id: ev.source.userId,
          display_name: 'LINE User',
          text: ev.message.text,
          avatar: '👤',
        });
      } catch (e) {
        console.error('[webhook:line] ingest failed', (e as Error).message);
      }
    }
  }
  return new NextResponse(null, { status: 200 });
}
