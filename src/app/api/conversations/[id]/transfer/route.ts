import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { addMessage } from '@/lib/conversations';
import { parseBody, transferSchema, safeUuid } from '@/lib/validation';
import { logAudit, reqIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.transfer');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data: body, res: badReq } = await parseBody(req, transferSchema);
  if (!body) return badReq;

  const { error } = await ctx.sb
    .from('conversations')
    .update({ assigned_to: body.to_user_id, ai_handling: false })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: 'Transfer failed' }, { status: 500 });

  await addMessage({
    conversation_id: params.id,
    sender_type: 'system',
    text: 'แชทถูกโอนให้พนักงานใหม่',
  });
  await logAudit(ctx.sb, ctx.userId, 'chat.transfer', {
    targetType: 'conversation', targetId: params.id,
    details: { to_user_id: body.to_user_id }, ip: reqIp(req),
  });
  return NextResponse.json({ ok: true });
}
