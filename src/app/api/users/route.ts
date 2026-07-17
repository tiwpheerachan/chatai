import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseBody, userCreateSchema } from '@/lib/validation';
import { logAudit, reqIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { data } = await ctx.sb
    .from('profiles')
    .select('id,email,name,avatar,role,brand_id,status')
    .order('created_at', { ascending: false });
  return NextResponse.json(data || []);
}

/** Create a new admin/agent account — sets the login (email+password) AND the
 *  role + brand/channel scope right at first registration. Admins can edit later. */
export async function POST(req: Request) {
  const { ctx, res } = await authorize('team.write');
  if (!ctx) return res;

  const { data: body, res: badReq } = await parseBody(req, userCreateSchema);
  if (!body) return badReq;

  // Only an owner may create another owner.
  if (body.role === 'owner' && ctx.role !== 'owner') {
    return NextResponse.json({ error: 'เฉพาะ Owner เท่านั้นที่สร้างผู้ใช้ระดับ Owner ได้' }, { status: 403 });
  }

  const admin = createAdminClient();
  // 1) Create the auth user (email pre-confirmed so they can log in immediately).
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { name: body.name },
  });
  if (authErr || !created?.user) {
    const msg = /already|exist|registered/i.test(authErr?.message || '') ? 'อีเมลนี้ถูกใช้แล้ว' : (authErr?.message || 'สร้างผู้ใช้ไม่สำเร็จ');
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const uid = created.user.id;

  // 2) The on_auth_user_created trigger inserts a default profile (role 'viewer').
  //    Upsert the chosen role + scope over it (retry once in case the trigger lags).
  const patch = {
    id: uid, email: body.email, name: body.name, role: body.role,
    allowed_brand_ids: body.allowed_brand_ids ?? null,
    allowed_channels: body.allowed_channels ?? null,
  };
  let upErr = (await admin.from('profiles').upsert(patch, { onConflict: 'id' })).error;
  if (upErr) upErr = (await admin.from('profiles').update(patch).eq('id', uid)).error;
  if (upErr) {
    // Roll back the auth user so we don't leave a half-created account.
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    return NextResponse.json({ error: 'ตั้งค่าสิทธิ์ไม่สำเร็จ: ' + upErr.message }, { status: 500 });
  }
  // Best-effort: queue-capacity fields (from sql/015). Ignored if not migrated yet.
  if (body.auto_assign !== undefined || body.max_open_chats !== undefined) {
    await admin.from('profiles').update({ auto_assign: body.auto_assign ?? true, max_open_chats: body.max_open_chats ?? null }).eq('id', uid).then(() => {}, () => {});
  }

  await logAudit(ctx.sb, ctx.userId, 'user.create', {
    targetType: 'profile', targetId: uid, details: { email: body.email, role: body.role }, ip: reqIp(req),
  });
  return NextResponse.json({ ok: true, id: uid });
}
