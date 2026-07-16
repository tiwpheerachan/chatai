import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// #4 Personal star — private to the acting user (not the team-wide pin).
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const sb = createAdminClient();
  await sb.from('conversation_stars').upsert(
    { user_id: ctx.userId, conversation_id: params.id },
    { onConflict: 'user_id,conversation_id' },
  );
  return NextResponse.json({ starred: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!safeUuid(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const sb = createAdminClient();
  await sb.from('conversation_stars').delete().eq('user_id', ctx.userId).eq('conversation_id', params.id);
  return NextResponse.json({ starred: false });
}
