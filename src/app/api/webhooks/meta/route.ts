import { NextResponse } from 'next/server';
import { ingest } from '@/lib/ingest';
import { verifyMetaSignature } from '@/lib/webhook-security';
import { brandForPage, pageTokenById, getSenderProfile } from '@/lib/meta';

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

  const platform = body.object === 'instagram' ? 'instagram' : 'facebook';
  for (const entry of body.entry || []) {
    // entry.id = the Page ID → which brand this message belongs to.
    const pageId = entry.id != null ? String(entry.id) : '';
    const brand_id = pageId ? await brandForPage(pageId).catch(() => null) : null;
    const pageToken = pageId ? await pageTokenById(pageId).catch(() => null) : null;

    for (const event of entry.messaging || []) {
      if (!event.message?.text || !event.sender?.id) continue;
      // Real customer name + avatar (needs the page token).
      let name = platform === 'instagram' ? 'IG User' : 'FB User';
      let avatar = platform === 'instagram' ? '📷' : '📘';
      if (pageToken) {
        const prof = await getSenderProfile(pageToken, String(event.sender.id)).catch(() => ({} as { name?: string; pic?: string }));
        if (prof.name) name = prof.name;
        if (prof.pic) avatar = prof.pic;
      }
      try {
        await ingest({ channel: platform, channel_user_id: String(event.sender.id), display_name: name, text: event.message.text, avatar, brand_id });
      } catch (e) {
        console.error('[webhook:meta] ingest failed', (e as Error).message);
      }
    }
  }
  return new NextResponse(null, { status: 200 });
}
