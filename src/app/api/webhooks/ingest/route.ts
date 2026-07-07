import { NextResponse } from 'next/server';
import { ingest } from '@/lib/ingest';
import { parseBody, ingestSchema } from '@/lib/validation';
import { enforceRateLimit, clientIp } from '@/lib/rate-limit';
import { safeEqual } from '@/lib/webhook-security';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Generic ingest endpoint — useful for testing without configuring real
 * platform webhooks. Protected by a shared secret so it can't be abused in
 * production. Set INGEST_SECRET and send it as `x-ingest-token`.
 *
 * curl -X POST $URL/api/webhooks/ingest \
 *   -H "Content-Type: application/json" \
 *   -H "x-ingest-token: $INGEST_SECRET" \
 *   -d '{"channel":"line","channel_user_id":"U1","display_name":"Test","text":"ขอคืนเงิน"}'
 */
export async function POST(req: Request) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Endpoint disabled' }, { status: 404 });
  }
  const token = req.headers.get('x-ingest-token') || '';
  if (!safeEqual(token, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = enforceRateLimit(`ingest:${clientIp(req)}`, 60, 60_000);
  if (limited) return limited;

  const { data: body, res: badReq } = await parseBody(req, ingestSchema);
  if (!body) return badReq;

  try {
    const result = await ingest(body);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500 });
  }
}
