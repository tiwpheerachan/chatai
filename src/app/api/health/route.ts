import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export function GET() {
  return NextResponse.json({
    ok: true,
    ts: Date.now(),
    commit: (process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7), // which deploy is live
  });
}
