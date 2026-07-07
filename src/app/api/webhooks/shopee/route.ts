import { NextResponse } from 'next/server';
import { ingest } from '@/lib/ingest';
import { verifyHexHmac } from '@/lib/webhook-security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const raw = await req.text();
  // Shopee signs the push body with the partner key (Authorization header).
  if (!verifyHexHmac(raw, req.headers.get('authorization'), process.env.SHOPEE_PARTNER_KEY)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse('Bad request', { status: 400 });
  }

  // Shopee push schema varies — adjust per your registration
  const { conversation_id, from_user_id, content, from_user_name } = body;
  if (content) {
    try {
      await ingest({
        channel: 'shopee',
        channel_user_id: String(from_user_id || conversation_id),
        display_name: from_user_name || 'Shopee Buyer',
        text: String(content),
        avatar: '🛒',
      });
    } catch (e) {
      console.error('[webhook:shopee] ingest failed', (e as Error).message);
    }
  }
  return NextResponse.json({ ok: true });
}
