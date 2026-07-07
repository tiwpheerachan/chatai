import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
};

export async function POST(req: Request) {
  const { ctx, res } = await authorize();
  if (!ctx) return res;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 2MB' }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json({ error: 'รองรับเฉพาะ PNG/JPG/WEBP/GIF' }, { status: 400 });
  }

  const admin = createAdminClient();
  const path = `${ctx.userId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await admin.storage.from('avatars').upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: 'อัปโหลดไม่สำเร็จ' }, { status: 500 });

  const { data: pub } = admin.storage.from('avatars').getPublicUrl(path);
  const url = pub.publicUrl;

  const { error: updErr } = await ctx.sb.from('profiles').update({ avatar: url }).eq('id', ctx.userId);
  if (updErr) return NextResponse.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 });

  return NextResponse.json({ url });
}
