import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { getSettings, updateSettings, type Strategy } from '@/lib/assignment';
import { logAudit, reqIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const SUP = new Set(['owner', 'admin', 'supervisor']);

export async function GET() {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  return NextResponse.json(await getSettings());
}

export async function PATCH(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!SUP.has(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
  if (['performance', 'balanced', 'round_robin'].includes(b.strategy)) patch.strategy = b.strategy as Strategy;
  if (Number.isFinite(b.sla_first_sec)) patch.sla_first_sec = Number(b.sla_first_sec);
  if (Number.isFinite(b.queue_days)) patch.queue_days = Number(b.queue_days);

  const settings = await updateSettings(patch);
  await logAudit(ctx.sb, ctx.userId, 'assignment.config', { details: patch, ip: reqIp(req) }).catch(() => {});
  return NextResponse.json(settings);
}
