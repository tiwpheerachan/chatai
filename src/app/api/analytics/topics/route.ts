import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { scopedMessages } from '@/lib/analytics-scope';

export const dynamic = 'force-dynamic';

// Each topic = a set of substrings matched case-insensitively against the message text.
// We count in the DB (per-topic ILIKE-OR count) instead of pulling every message row —
// the old .select('text') fetch hit the 1000-row cap and undercounted badly at scale.
const TOPICS: Record<string, string[]> = {
  'การจัดส่ง / พัสดุ':  ['ส่ง', 'delivery', 'พัสดุ', 'ของถึง', 'tracking'],
  'คืนสินค้า / Refund': ['คืน', 'refund', 'return', 'เงินคืน'],
  'สอบถามสินค้า':       ['สินค้า', 'product', 'วิธีใช้', 'วิธี'],
  'โปรโมชั่น / โค้ด':    ['โปร', 'โค้ด', 'ส่วนลด', 'sale', 'discount'],
  'การชำระเงิน':         ['ชำระ', 'payment', 'จ่าย', 'โอน', 'cod'],
  'เคลม / เสีย':          ['เคลม', 'เสีย', 'พัง', 'ใช้ไม่ได้', 'claim'],
};

export async function GET() {
  const { ctx, res } = await authorize('analytics.read');
  if (!ctx) return res;
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  const entries = await Promise.all(Object.entries(TOPICS).map(async ([name, kws]) => {
    const orExpr = kws.map(k => `text.ilike.%${k}%`).join(',');
    const { count } = await scopedMessages(ctx.scope)
      .eq('sender_type', 'customer')
      .gte('created_at', since)
      .or(orExpr);
    return [name, count || 0] as const;
  }));

  return NextResponse.json(Object.fromEntries(entries));
}
