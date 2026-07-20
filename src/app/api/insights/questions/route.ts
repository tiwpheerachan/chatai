import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { callLLM, extractJson } from '@/lib/bot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// #14 Top questions — what customers ask most, so the team can prep answers.
// Rule-based category breakdown (deterministic, free) + an LLM pass over a sample
// to surface the specific recurring questions.

const CATS: { key: string; label: string; re: RegExp }[] = [
  { key: 'shipping', label: 'การจัดส่ง / พัสดุ', re: /จัดส่ง|พัสดุ|เลขแทร็ก|เลขพัสดุ|ถึงไหน|กี่วัน|เมื่อไหร่.*ส่ง|ยังไม่ได้ของ|ของยัง|track|ส่งของ/i },
  { key: 'price_stock', label: 'ราคา / สต็อก / มีของ', re: /ราคา|กี่บาท|เท่าไหร่|ลดไหม|สต็อก|สต๊อก|มีของ|มีไหม|พร้อมส่ง|มีสี|ไซซ์|รุ่นไหน/i },
  { key: 'howto', label: 'วิธีใช้ / ตั้งค่า', re: /วิธีใช้|ใช้ยัง?ไง|ใช้ไม่เป็น|ตั้งค่า|เชื่อมต่อ|จับคู่|รีเซ็ต|reset|เปิดเครื่อง|ต่อ\s*wifi|ติดตั้ง|pair/i },
  { key: 'spec', label: 'สเปก / ความสามารถ', re: /สเปก|รองรับ|กันน้ำ|กันฝุ่น|แบต|กี่ชม|กี่ชั่วโมง|โทรได้|บลูทูธ|ทำอะไรได้|ใช้กับ|ได้ไหม/i },
  { key: 'claim', label: 'เคลม / คืน / ประกัน', re: /เคลม|คืนเงิน|คืนสินค้า|เปลี่ยน(สินค้า|ของ)|เสีย|พัง|ชำรุด|ไม่ทำงาน|ประกัน|ซ่อม/i },
  { key: 'promo', label: 'โปรโมชั่น / โค้ด', re: /โปร|ส่วนลด|โค้ด|คูปอง|แคมเปญ|ของแถม|ผ่อน/i },
  { key: 'tax', label: 'ใบกำกับภาษี', re: /ใบกำกับ|ใบเสร็จ|vat|ภาษี|e-?tax/i },
];
const GREETING = /^(สวัสดี|หวัดดี|ดีค่ะ|ดีครับ|hello|hi|สอบถาม|ขอสอบถาม|ค่ะ|ครับ|👋)[\s\S]{0,4}$/i;

export async function GET(req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;

  const days = Math.min(90, Math.max(1, parseInt(new URL(req.url).searchParams.get('days') || '30', 10) || 30));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const sb = createAdminClient();

  let q = sb.from('messages')
    .select('text, conversation:conversations!inner(brand_id)')
    .eq('sender_type', 'customer')
    .not('text', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000);
  const { data } = await q;

  const brands = ctx.scope.brands; // null = all
  const rows = ((data as any[]) || []).filter(m => {
    if (!brands) return true;
    const bid = m.conversation?.brand_id;
    return bid && brands.includes(bid);
  });

  const counts: Record<string, number> = {};
  const samples: string[] = [];
  let categorized = 0;
  for (const m of rows) {
    const t = (m.text || '').trim();
    if (t.length < 3 || GREETING.test(t)) continue;
    let hit = false;
    for (const c of CATS) if (c.re.test(t)) { counts[c.key] = (counts[c.key] || 0) + 1; hit = true; }
    if (hit) categorized++;
    else counts.other = (counts.other || 0) + 1;
    if (samples.length < 80 && t.length > 8) samples.push(t.slice(0, 120));
  }
  const total = rows.length;
  const categories = [...CATS.map(c => ({ key: c.key, label: c.label, count: counts[c.key] || 0 })), { key: 'other', label: 'อื่นๆ', count: counts.other || 0 }]
    .filter(c => c.count > 0)
    .map(c => ({ ...c, pct: total ? Math.round((c.count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  // LLM: the specific recurring questions from a sample.
  let themes: { label: string; approx: number }[] = [];
  if (samples.length >= 8) {
    const sys = 'คุณคือนักวิเคราะห์ CX สรุป "คำถามที่ลูกค้าถามบ่อย" จากตัวอย่างข้อความจริง ตอบ JSON เท่านั้น: {"themes":[{"label":"หัวข้อคำถามสั้นๆ ภาษาไทย","approx":<ประมาณจำนวนครั้ง>}]} เรียงจากบ่อยสุด สูงสุด 8 หัวข้อ รวมหัวข้อที่ใกล้กัน';
    const raw = await callLLM(sys, [{ role: 'user', content: samples.map((s, i) => `${i + 1}. ${s}`).join('\n') }], { temperature: 0.3 }).catch(() => null);
    const j = raw ? extractJson(raw) : null;
    if (j?.themes && Array.isArray(j.themes)) themes = j.themes.slice(0, 8).map((x: any) => ({ label: String(x.label || '').slice(0, 80), approx: Number(x.approx) || 0 })).filter((x: any) => x.label);
  }

  return NextResponse.json({ days, total, categorized, categories, themes });
}
