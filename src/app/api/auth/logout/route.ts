import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const sb = createClient();
  await sb.auth.signOut();
  return NextResponse.json({ ok: true });
}
