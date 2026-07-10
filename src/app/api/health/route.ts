import { NextResponse } from 'next/server';
import { commentsClient, commentsConfigured } from '@/lib/comments/db';
import { replyConfigured } from '@/lib/comments/shopee-reply';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const out: Record<string, unknown> = {
    ok: true,
    ts: Date.now(),
    commit: (process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7), // which deploy is live
  };

  // ?diag=comments → confirm what THIS deploy sees for the comment feature (no secrets).
  if (new URL(req.url).searchParams.get('diag') === 'comments') {
    const project = (process.env.COMMENTS_SUPABASE_URL || '').replace(/^https:\/\//, '').split('.')[0].slice(0, 8) || null;
    let latest: string | null = null;
    let count7d: number | null = null;
    const sb = commentsClient();
    if (sb) {
      try {
        const { data } = await sb.from('comments').select('created_at').order('created_at', { ascending: false }).limit(1);
        latest = (data as any[])?.[0]?.created_at ?? null;
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        const { count } = await sb.from('comments').select('comment_id', { count: 'exact', head: true }).gte('created_at', since);
        count7d = count ?? null;
      } catch (e) { out.commentsError = (e as Error).message; }
    }
    out.comments = { configured: commentsConfigured(), replyConfigured: replyConfigured(), project, latest, count7d };
  }
  return NextResponse.json(out);
}
