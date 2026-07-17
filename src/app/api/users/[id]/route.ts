import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseBody, userAdminUpdateSchema, safeUuid } from '@/lib/validation';
import { logAudit, reqIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Admin edits another user's role, status, brand, scope — AND their login
 *  (email / password) and display name. */
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

  // Login changes (email/password) go through Supabase Auth (service role).
  if (body.email || body.password) {
    const admin = createAdminClient();
    const authPatch: Record<string, unknown> = {};
    if (body.email) { authPatch.email = body.email; authPatch.email_confirm = true; }
    if (body.password) authPatch.password = body.password;
    const { error: authErr } = await admin.auth.admin.updateUserById(params.id, authPatch);
    if (authErr) {
      const msg = /already|exist|registered/i.test(authErr.message) ? 'อีเมลนี้ถูกใช้แล้ว' : authErr.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = {};
  for (const k of ['role', 'status', 'brand_id', 'allowed_brand_ids', 'allowed_channels', 'auto_assign', 'max_open_chats', 'name', 'email'] as const) {
    if (k in body) patch[k] = (body as Record<string, unknown>)[k];
  }
  if (Object.keys(patch).length) {
    const { error } = await ctx.sb.from('profiles').update(patch).eq('id', params.id);
    if (error) return NextResponse.json({ error: 'Could not update user' }, { status: 500 });
  }

  await logAudit(ctx.sb, ctx.userId, 'user.update', {
    targetType: 'profile', targetId: params.id,
    details: { ...patch, password: body.password ? '***' : undefined }, ip: reqIp(req),
  });
  return NextResponse.json({ ok: true });
}
