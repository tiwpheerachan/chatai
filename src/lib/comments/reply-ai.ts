import { callLLM, stripAiTells } from '@/lib/bot';
import { REPLY_MAX_LEN } from './shopee-reply';
import { suggestReply } from './template';
import type { CommentRow } from './db';

/**
 * DeepSeek draft: a natural, human-sounding Thai reply tailored to THIS review —
 * uses the rating/product/sentiment/text. Falls back to the template if no LLM.
 * Kept ≤ REPLY_MAX_LEN and free of markdown (Shopee replies are plain text).
 */
export async function draftCommentReply(c: Pick<CommentRow, 'comment_id' | 'comment_text' | 'rating' | 'category' | 'sentiment' | 'urgent' | 'product_item_name' | 'product_name'>): Promise<string> {
  const template = suggestReply({ category: c.category, sentiment: c.sentiment, urgent: c.urgent, seed: c.comment_id });
  const text = (c.comment_text || '').trim();
  if (!text) return template;

  const system = `คุณคือแอดมินร้านค้าออนไลน์ (คนจริง) กำลังพิมพ์ "ตอบกลับรีวิว/คอมเมนต์" ของลูกค้าบนหน้าสินค้า Shopee
- ตอบสุภาพ อบอุ่น เป็นกันเองเหมือนคนจริง ไม่ใช่บอท ลงท้าย ค่ะ/นะคะ
- ตอบให้ตรงกับสิ่งที่ลูกค้าพูดในรีวิวจริงๆ (ไม่ตอบกว้างๆ แบบก็อปวาง)
- รีวิวบวก: ขอบคุณอย่างจริงใจ ชวนติดตาม/กลับมาซื้อซ้ำ · รีวิวลบ/มีปัญหา: ขอโทษ รับผิดชอบ เสนอทางแก้ ชวนทักแชทพร้อมเลขออเดอร์
- สั้น กระชับ 1–3 ประโยค ไม่เกิน ${REPLY_MAX_LEN} ตัวอักษร
- ห้ามใช้ Markdown/ ** /_ /# /bullet ใดๆ พิมพ์เป็นข้อความธรรมดา ใช้อีโมจิได้เล็กน้อย
- ห้ามแต่งข้อมูลที่ไม่รู้ (โปร/ราคา/นโยบายเจาะจง) ถ้าไม่แน่ใจให้ชวนคุยต่อทางแชท
ตอบกลับเป็น JSON เท่านั้น: {"reply":"<ข้อความตอบรีวิว>"}`;

  const info = [
    c.product_item_name ? `สินค้า: ${c.product_item_name}` : '',
    c.rating != null ? `ให้คะแนน: ${c.rating} ดาว` : '',
    c.sentiment ? `โทน: ${c.sentiment}` : '',
    c.category ? `หมวด: ${c.category}` : '',
  ].filter(Boolean).join(' · ');
  const user = `${info ? info + '\n' : ''}รีวิวของลูกค้า: "${text}"`;

  try {
    const raw = await callLLM(system, [{ role: 'user', content: user }], { temperature: 0.7 });
    if (!raw) return template;
    let reply = '';
    try {
      const j = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
      reply = typeof j?.reply === 'string' ? j.reply : raw;
    } catch { reply = raw; }
    reply = stripAiTells(reply).trim();
    if (!reply) return template;
    return reply.length > REPLY_MAX_LEN ? reply.slice(0, REPLY_MAX_LEN).trim() : reply;
  } catch { return template; }
}
