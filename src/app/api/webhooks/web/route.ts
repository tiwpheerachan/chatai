import { NextResponse } from 'next/server';
import { ingest } from '@/lib/ingest';
import { parseBody, webWidgetSchema } from '@/lib/validation';
import { enforceRateLimit, clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Web widget endpoint — embed in any website:
 * <script src="/widget.js"></script>
 * Returns AI reply synchronously so widget can render it.
 *
 * Public + unauthenticated by design, so it is rate-limited per IP to cap
 * LLM/embedding spend from abuse.
 */
export async function POST(req: Request) {
  const limited = enforceRateLimit(`web:${clientIp(req)}`, 20, 60_000);
  if (limited) return limited;

  const { data: body, res: badReq } = await parseBody(req, webWidgetSchema);
  if (!body) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: badReq?.status ?? 400, headers: CORS },
    );
  }

  const { conversationId, aiReplyText } = await ingest({
    channel: 'web',
    channel_user_id: body.session_id,
    display_name: body.name || 'Web Visitor',
    text: body.text,
    brand_id: body.brand_id,
    avatar: '🌐',
  });

  return NextResponse.json(
    { conversationId, reply: aiReplyText || null },
    { headers: CORS },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
