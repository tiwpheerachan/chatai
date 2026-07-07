import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { parseBody, profileUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { data } = await ctx.sb.from('profiles').select('*').eq('id', ctx.userId).maybeSingle();
  return NextResponse.json({ profile: data, permissions: ctx.permissions, scope: ctx.scope });
}

export async function PATCH(req: Request) {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { data: body, res: badReq } = await parseBody(req, profileUpdateSchema);
  if (!body) return badReq;

  // Password change goes through Supabase Auth, not the profiles table.
  if (body.password) {
    const { error } = await ctx.sb.auth.updateUser({ password: body.password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.avatar_color !== undefined) patch.avatar_color = body.avatar_color;

  if (Object.keys(patch).length) {
    const { error } = await ctx.sb.from('profiles').update(patch).eq('id', ctx.userId);
    if (error) return NextResponse.json({ error: 'Could not update profile' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
