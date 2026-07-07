import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const TOPICS: Record<string, RegExp> = {
  'การจัดส่ง / พัสดุ':  /ส่ง|delivery|พัสดุ|ของถึง|tracking/i,
  'คืนสินค้า / Refund': /คืน|refund|return|เงินคืน/i,
  'สอบถามสินค้า':       /สินค้า|product|ใช้|วิธี/i,
  'โปรโมชั่น / โค้ด':    /โปร|โค้ด|ส่วนลด|sale|discount/i,
  'การชำระเงิน':         /ชำระ|payment|จ่าย|โอน|cod/i,
  'เคลม / เสีย':          /เคลม|เสีย|พัง|ใช้ไม่ได้|claim/i,
};

export async function GET() {
  const { ctx, res } = await authorize('analytics.read');
  if (!ctx) return res;
  const { sb } = ctx;
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { data } = await sb.from('messages').select('text').eq('sender_type', 'customer').gte('created_at', since);
  const counts: Record<string, number> = {};
  for (const [name, re] of Object.entries(TOPICS)) {
    counts[name] = (data || []).filter(m => m.text && re.test(m.text)).length;
  }
  return NextResponse.json(counts);
}
