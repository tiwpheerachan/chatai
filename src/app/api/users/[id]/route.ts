import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { parseBody, userAdminUpdateSchema, safeUuid } from '@/lib/validation';
import { logAudit, reqIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Admin edits another user's role, status, brand, and per-user scope overrides. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('team.write');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data: body, res: badReq } = await parseBody(req, userAdminUpdateSchema);
  if (!body) return badReq;

  // Only an owner may grant or revoke the owner role.
  if (body.role === 'owner' && ctx.role !== 'owner') {
    return NextResponse.json({ error: 'Only an owner can assign the owner role' }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  for (const k of ['role', 'status', 'brand_id', 'allowed_brand_ids', 'allowed_channels'] as const) {
    if (k in body) patch[k] = (body as Record<string, unknown>)[k];
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  const { error } = await ctx.sb.from('profiles').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: 'Could not update user' }, { status: 500 });
  await logAudit(ctx.sb, ctx.userId, 'user.update', {
    targetType: 'profile', targetId: params.id, details: patch, ip: reqIp(req),
  });
  return NextResponse.json({ ok: true });
}
