import { NextResponse } from 'next/server';
import { syncAllShops } from '@/lib/chat-source/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Server-side scheduled sync. Pull new Shopee chat into Supabase on a schedule
 * (via an external cron pinger or Render Cron Job) so the inbox stays fresh even
 * when no browser is open — and without the browser hammering the instance.
 *
 * Auth: send the shared secret as header `x-cron-key: <CRON_SECRET>` (preferred)
 * or `?key=<CRON_SECRET>`. Fails closed if CRON_SECRET is not configured.
 *
 * Never sends anything to buyers — read-only ingest (AI stays off).
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // not configured → refuse (safe default)
  const provided = req.headers.get('x-cron-key') || new URL(req.url).searchParams.get('key');
  return !!provided && provided === secret;
}

async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pages = Math.min(5, Math.max(1, parseInt(new URL(req.url).searchParams.get('pages') || '2', 10) || 2));
  try {
    const result = await syncAllShops({ maxPagesPerShop: pages, sinceDays: 7 });
    const conversations = result.reduce((s, x) => s + (x?.conversations || 0), 0);
    const messages = result.reduce((s, x) => s + (x?.messages || 0), 0);
    const caughtUp = result.filter(x => x?.caught_up).length;
    return NextResponse.json({ ok: true, shops: result.length, caught_up: caughtUp, conversations, messages });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || 'sync failed' }, { status: 502 });
  }
}

export const GET = run;
export const POST = run;
