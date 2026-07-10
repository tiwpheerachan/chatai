import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { parseBody } from '@/lib/validation';
import { persistReplies } from '@/lib/comments/db';
import { replyConfigured, replyToShopee, REPLY_MAX_BATCH, REPLY_MAX_LEN, type ReplyItem } from '@/lib/comments/shopee-reply';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const itemSchema = z.object({
  comment_id: z.union([z.string(), z.number()]),
  reply_text: z.string().trim().min(1).max(REPLY_MAX_LEN),
  shop_id: z.union([z.string(), z.number()]).optional(),
});
const bodySchema = z.union([
  itemSchema,
  z.object({ items: z.array(itemSchema).min(1).max(REPLY_MAX_BATCH) }),
]);

/**
 * Reply to Shopee review comments (human-triggered) + record the outcome in the
 * comments dataset. Accepts one item or { items:[...] }. Groups by shop_id and
 * sends one batch per shop. If SHOPEE_REPLY_API_KEY is unset → saves as draft.
 */
export async function POST(req: Request) {
  const { ctx, res } = await authorize('chat.reply');
  if (!ctx) return res;
  const { data: body, res: bad } = await parseBody(req, bodySchema);
  if (!body) return bad;

  const raw = 'items' in body ? body.items : [body];
  const norm = raw
    .map(it => ({ comment_id: String(it.comment_id).trim(), reply_text: it.reply_text.trim(), shop_id: Number(it.shop_id) || 0 }))
    .filter(it => it.comment_id && it.reply_text);
  if (!norm.length) return NextResponse.json({ error: 'ต้องมี comment_id และ reply_text' }, { status: 400 });

  const result = new Map<string, { status: string; note: string | null }>();
  norm.forEach(it => result.set(it.comment_id, { status: 'draft', note: null }));

  if (!replyConfigured()) {
    norm.forEach(it => result.set(it.comment_id, { status: 'draft', note: 'ยังไม่ตั้ง SHOPEE_REPLY_API_KEY → บันทึกร่างไว้ก่อน' }));
  } else {
    const byShop = new Map<number, { comment_id: string; reply_text: string }[]>();
    for (const it of norm) {
      if (!it.shop_id) { result.set(it.comment_id, { status: 'failed', note: 'ไม่พบ shop_id ของคอมเมนต์นี้' }); continue; }
      const arr = byShop.get(it.shop_id) || [];
      arr.push({ comment_id: it.comment_id, reply_text: it.reply_text });
      byShop.set(it.shop_id, arr);
    }
    for (const [shopId, group] of byShop) {
      const payload: ReplyItem[] = group.map(g => ({ comment_id: Number(g.comment_id), comment: g.reply_text }));
      const outcome = await replyToShopee(shopId, payload);
      const acc = new Set(outcome.accepted.map(String));
      for (const g of group) {
        result.set(g.comment_id, acc.has(g.comment_id)
          ? { status: 'sent', note: null }
          : { status: 'failed', note: outcome.error || 'Shopee ไม่รับคำตอบ' });
      }
    }
  }

  await persistReplies(
    norm.map(it => ({ comment_id: it.comment_id, reply_text: it.reply_text, status: result.get(it.comment_id)!.status, note: result.get(it.comment_id)!.note })),
    ctx.name || null,
  ).catch(() => {});

  const statuses = [...result.values()];
  const sent = statuses.filter(s => s.status === 'sent').length;
  const failed = statuses.filter(s => s.status === 'failed').length;
  const draft = statuses.filter(s => s.status === 'draft').length;
  const firstErr = statuses.find(s => s.status === 'failed')?.note;
  const single = norm.length === 1;
  const message = single
    ? (statuses[0].status === 'sent' ? 'ส่งคำตอบไป Shopee สำเร็จ'
      : statuses[0].status === 'failed' ? 'ส่งไม่สำเร็จ: ' + (statuses[0].note || '')
      : 'บันทึกร่างคำตอบแล้ว (ยังไม่ตั้ง API key)')
    : `ส่งสำเร็จ ${sent} • ล้มเหลว ${failed}${draft ? ` • ร่าง ${draft}` : ''}${firstErr ? ` (เช่น: ${firstErr})` : ''}`;

  return NextResponse.json({
    ok: failed === 0,
    summary: { sent, failed, draft, total: norm.length },
    results: Object.fromEntries([...result.entries()].map(([k, v]) => [k, v.status])),
    message,
  });
}
