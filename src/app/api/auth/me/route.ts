import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return NextResponse.json({ user, profile });
}
