import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Heartbeat: mark the acting user online + stamp last_seen. Called by the app
 *  every ~60s. last_seen comes from sql/018 — updated best-effort if present. */
export async function POST() {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const admin = createAdminClient();
  // Try with last_seen (sql/018). If the column isn't there yet, fall back to status.
  const withSeen = await admin.from('profiles').update({ status: 'online', last_seen: new Date().toISOString() }).eq('id', ctx.userId);
  if (withSeen.error) await admin.from('profiles').update({ status: 'online' }).eq('id', ctx.userId).then(() => {}, () => {});
  return NextResponse.json({ ok: true });
}
