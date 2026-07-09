import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize, isAdminOrAbove } from '@/lib/auth';
import { parseBody } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const canWrite = (role: string) => isAdminOrAbove(role as any) || role === 'supervisor';

// GET — all scenarios (+ strategies). Optional ?brand_id filters to a brand + globals.
export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  const brandId = new URL(req.url).searchParams.get('brand_id');
  let q = ctx.sb.from('reply_scenarios').select('*, strategies:reply_strategies(*)').order('sort', { ascending: true });
  if (brandId) q = q.or(`brand_id.eq.${brandId},brand_id.is.null`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const scenarios = (data || []).map((s: any) => ({ ...s, strategies: (s.strategies || []).sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0)) }));
  return NextResponse.json({ scenarios });
}

const scenarioSchema = z.object({
  title: z.string().trim().min(1).max(200),
  examples: z.array(z.string().max(300)).max(30).optional(),
  brand_id: z.string().uuid().nullish(),
  category: z.string().max(60).nullish(),
});

// POST — create a scenario.
export async function POST(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;
  if (!canWrite(ctx.role)) return NextResponse.json({ error: 'ต้องเป็นหัวหน้าทีมขึ้นไป' }, { status: 403 });
  const { data: body, res: bad } = await parseBody(req, scenarioSchema);
  if (!body) return bad;
  const { data, error } = await ctx.sb.from('reply_scenarios')
    .insert({ title: body.title, examples: body.examples ?? [], brand_id: body.brand_id ?? null, category: body.category ?? null, created_by: ctx.userId })
    .select('*, strategies:reply_strategies(*)').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
