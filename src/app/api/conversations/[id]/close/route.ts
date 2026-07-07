import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { safeUuid } from '@/lib/validation';
import { logAudit, reqIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { error } = await ctx.sb.from('conversations').update({ status: 'solved' }).eq('id', params.id);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  await logAudit(ctx.sb, ctx.userId, 'chat.close', { targetType: 'conversation', targetId: params.id, ip: reqIp(req) });
  return NextResponse.json({ ok: true });
}
