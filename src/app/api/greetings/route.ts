import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// #12 The acting admin's greeting display-name per brand ("แอดมินนุ่น" for shop A).
// Table from sql/018; degrades to empty if not migrated yet.
export async function GET() {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const { data, error } = await createAdminClient().from('admin_greetings').select('brand_id, display_name').eq('user_id', ctx.userId);
  if (error) return NextResponse.json({ greetings: {}, configured: false });
  const map: Record<string, string> = {};
  for (const g of (data as any[]) || []) map[g.brand_id] = g.display_name;
  return NextResponse.json({ greetings: map, configured: true });
}

export async function PUT(req: Request) {
  const { ctx, res } = await authorize();
  if (!ctx) return res;
  const body = await req.json().catch(() => ({}));
  const brand_id = body?.brand_id;
  const name = (body?.display_name || '').toString().trim().slice(0, 60);
  if (!safeUuid(brand_id)) return NextResponse.json({ error: 'brand ไม่ถูกต้อง' }, { status: 400 });
  const admin = createAdminClient();
  if (!name) {
    await admin.from('admin_greetings').delete().eq('user_id', ctx.userId).eq('brand_id', brand_id).then(() => {}, () => {});
    return NextResponse.json({ ok: true });
  }
  const { error } = await admin.from('admin_greetings').upsert({ user_id: ctx.userId, brand_id, display_name: name, updated_at: new Date().toISOString() }, { onConflict: 'user_id,brand_id' });
  if (error) return NextResponse.json({ error: 'บันทึกไม่สำเร็จ (ยังไม่ได้รัน sql/018?)' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
