import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { parseBody, botRuleSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { data } = await ctx.sb.from('bot_rules').select('*').order('priority', { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const { ctx, res } = await authorize('kb.write');
  if (!ctx) return res;
  const { data: body, res: badReq } = await parseBody(req, botRuleSchema);
  if (!body) return badReq;

  // Reject regex patterns that fail to compile so they never break the bot loop.
  try {
    // eslint-disable-next-line no-new
    new RegExp(body.pattern);
  } catch {
    return NextResponse.json({ error: 'Invalid regex pattern' }, { status: 400 });
  }

  const { data, error } = await ctx.sb.from('bot_rules').insert(body).select('id').single();
  if (error) return NextResponse.json({ error: 'Could not create rule' }, { status: 500 });
  return NextResponse.json(data);
}
