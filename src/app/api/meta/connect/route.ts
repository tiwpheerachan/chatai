import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPages, subscribePage } from '@/lib/meta';
import { logAudit, reqIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Connect selected Facebook pages to brands: upsert a `channels` row (page_id →
 * brand) AND subscribe the page to the app's messaging webhook so it receives
 * messages. Body: { links: [{ page_id, brand_id }], disconnect?: [page_id] }.
 */
export async function POST(req: Request) {
  const { ctx, res } = await authorize('channel.write');
  if (!ctx) return res;

  const body = await req.json().catch(() => ({}));
  const links: { page_id: string; brand_id: string }[] = Array.isArray(body?.links) ? body.links : [];
  const disconnect: string[] = Array.isArray(body?.disconnect) ? body.disconnect.map(String) : [];

  const admin = createAdminClient();
  const pages = await getPages().catch(() => []);
  const byId = new Map(pages.map(p => [p.id, p]));

  const results: { page_id: string; ok: boolean; subscribed?: boolean; error?: string }[] = [];

  for (const l of links) {
    const page = byId.get(String(l.page_id));
    if (!page) { results.push({ page_id: l.page_id, ok: false, error: 'ไม่พบเพจนี้ในโทเค็น' }); continue; }
    if (!l.brand_id) { results.push({ page_id: l.page_id, ok: false, error: 'ยังไม่เลือกแบรนด์' }); continue; }

    // Subscribe the page to messaging webhooks (needed to receive messages).
    const sub = await subscribePage(page.id, page.access_token);

    // Upsert a channels row keyed by (type, page_id). Delete any prior row for this
    // page first (page can only map to one brand), then insert.
    await admin.from('channels').delete().eq('type', 'facebook').filter('credentials->>page_id', 'eq', page.id);
    const { error } = await admin.from('channels').insert({
      brand_id: l.brand_id, type: 'facebook', name: page.name,
      credentials: { page_id: page.id }, status: sub.ok ? 'connected' : 'pending',
    });
    results.push({ page_id: page.id, ok: !error, subscribed: sub.ok, error: error?.message || (sub.ok ? undefined : `subscribe: ${sub.error}`) });
  }

  for (const pid of disconnect) {
    await admin.from('channels').delete().eq('type', 'facebook').filter('credentials->>page_id', 'eq', pid);
    results.push({ page_id: pid, ok: true });
  }

  await logAudit(ctx.sb, ctx.userId, 'meta.connect', { targetType: 'channel', details: { links: links.length, disconnect: disconnect.length }, ip: reqIp(req) });
  return NextResponse.json({ ok: true, results });
}
