import { NextResponse } from 'next/server';
import { ingest } from '@/lib/ingest';
import { verifyHexHmac } from '@/lib/webhook-security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyHexHmac(raw, req.headers.get('x-tts-signature'), process.env.TIKTOK_APP_SECRET)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse('Bad request', { status: 400 });
  }

  const { user_id, user_name, message } = body;
  if (message && user_id) {
    try {
      await ingest({
        channel: 'tiktok',
        channel_user_id: String(user_id),
        display_name: user_name || 'TikTok User',
        text: String(message),
        avatar: '🎵',
      });
    } catch (e) {
      console.error('[webhook:tiktok] ingest failed', (e as Error).message);
    }
  }
  return NextResponse.json({ ok: true });
}
