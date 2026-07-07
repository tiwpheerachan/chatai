import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { parseBody, rolePermissionsUpdateSchema, roleEnum } from '@/lib/validation';
import { defaultRolePermission } from '@/lib/permissions';
import { logAudit, reqIp } from '@/lib/audit';
import type { UserRole } from '@/types/database';

export const dynamic = 'force-dynamic';

const ROLES: UserRole[] = ['owner', 'admin', 'supervisor', 'agent', 'viewer', 'ai'];

/** List every role's config, falling back to defaults for any missing row. */
export async function GET() {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { data } = await ctx.sb.from('role_permissions').select('*');
  const byRole = new Map((data || []).map(r => [r.role, r]));
  const rows = ROLES.map(role => byRole.get(role) ?? { ...defaultRolePermission(role), updated_at: null });
  return NextResponse.json(rows);
}

/** Update one role's permissions + brand/channel scope. Owner role is locked. */
export async function PUT(req: Request) {
  const { ctx, res } = await authorize('team.write');
  if (!ctx) return res;

  const { searchParams } = new URL(req.url);
  const roleParsed = roleEnum.safeParse(searchParams.get('role'));
  if (!roleParsed.success) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  const role = roleParsed.data;

  if (role === 'owner') {
    return NextResponse.json({ error: 'Owner role is full-access and cannot be edited' }, { status: 400 });
  }

  const { data: body, res: badReq } = await parseBody(req, rolePermissionsUpdateSchema);
  if (!body) return badReq;

  const { error } = await ctx.sb.from('role_permissions').upsert({
    role,
    permissions: body.permissions,
    brand_scope: body.brand_scope,
    channel_scope: body.channel_scope,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: 'Could not save role' }, { status: 500 });
  await logAudit(ctx.sb, ctx.userId, 'role.update', {
    targetType: 'role', targetId: role,
    details: { permissions: body.permissions, brand_scope: body.brand_scope, channel_scope: body.channel_scope },
    ip: reqIp(req),
  });
  return NextResponse.json({ ok: true });
}
