import { callLLM, stripAiTells, extractJson } from '@/lib/bot';
import { REPLY_MAX_LEN } from './shopee-reply';
import { suggestReply } from './template';
import { commentPriority, type PriorityLevel } from './priority';
import type { CommentRow } from './db';

export interface TriageResult {
  level: PriorityLevel;          // final urgency (AI may escalate the computed one)
  reason: string;                // one line: why this priority
  steps: string[];               // concrete handling steps for the admin
  sla: string;                   // how soon to act
}

/**
 * DeepSeek triage: given ONE review comment, explain how urgently to handle it and
 * the concrete steps to help the customer in time. Starts from the instant
 * computed priority and lets the model escalate/refine + add action steps. Falls
 * back to the computed priority + generic steps when no LLM is configured.
 */
export async function triageComment(c: Pick<CommentRow, 'comment_text' | 'rating' | 'category' | 'sentiment' | 'urgent' | 'severity' | 'product_item_name'>): Promise<TriageResult> {
  const base = commentPriority(c);
  const fallback: TriageResult = {
    level: base.level, sla: base.sla,
    reason: base.level === 'low' ? 'รีวิวเชิงบวก/ทั่วไป ไม่มีปัญหาเร่งด่วน' : 'มีสัญญาณที่ควรดูแล',
    steps: base.level === 'low'
      ? ['ขอบคุณลูกค้าอย่างจริงใจ', 'ชวนติดตามร้าน/กลับมาซื้อซ้ำ']
      : ['ตอบขอโทษและรับเรื่องทันที', 'ขอเลขออเดอร์ + รายละเอียด/รูปทางแชท', 'ประสานทีมที่เกี่ยวข้องเพื่อแก้ไข'],
  };
  const text = (c.comment_text || '').trim();
  if (!text) return fallback;

  const system = `คุณคือหัวหน้าทีมบริการลูกค้าร้านค้าออนไลน์ ช่วยจัดลำดับความเร่งด่วนของรีวิว/คอมเมนต์ลูกค้า Shopee และบอกวิธีจัดการให้แอดมินช่วยลูกค้าได้ทัน
ประเมินจากเนื้อหาจริง: ปัญหาความปลอดภัย/สุขภาพ/สินค้าอันตราย = วิกฤตเสมอ, โกรธ/ขู่รีวิว/ของเสีย/ไม่ได้ของ = ด่วน, สอบถามทั่วไป = ปานกลาง, ชม/พอใจ = ปกติ
ตอบเป็น JSON เท่านั้น ห้ามมี Markdown:
{"level":"critical|high|medium|low","reason":"<เหตุผลสั้นๆ 1 บรรทัด>","sla":"<ควรตอบเร็วแค่ไหน เช่น ทันที/ภายใน 1 ชม./ภายใน 24 ชม.>","steps":["<ขั้นตอนจัดการที่ 1>","<ขั้นตอนที่ 2>","<ขั้นตอนที่ 3>"]}`;
  const info = [
    c.product_item_name ? `สินค้า: ${c.product_item_name}` : '',
    c.rating != null ? `คะแนน: ${c.rating} ดาว` : '',
    c.category ? `หมวด: ${c.category}` : '',
    `ระบบประเมินเบื้องต้น: ${base.level}`,
  ].filter(Boolean).join(' · ');

  try {
    const raw = await callLLM(system, [{ role: 'user', content: `${info}\nรีวิว: "${text}"` }], { temperature: 0.3 });
    const j = extractJson(raw);
    if (!j) return fallback;
    const level = (['critical', 'high', 'medium', 'low'] as const).includes(j?.level) ? j.level as PriorityLevel : base.level;
    const steps = Array.isArray(j?.steps) ? j.steps.map((s: unknown) => stripAiTells(String(s)).trim()).filter(Boolean).slice(0, 5) : fallback.steps;
    return {
      level,
      reason: stripAiTells(String(j?.reason || fallback.reason)).trim(),
      sla: stripAiTells(String(j?.sla || base.sla)).trim(),
      steps: steps.length ? steps : fallback.steps,
    };
  } catch { return fallback; }
}

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
    const j = extractJson(raw);
    let reply = typeof j?.reply === 'string' ? j.reply : (j ? '' : raw);
    reply = stripAiTells(reply).trim();
    if (!reply) return template;
    return reply.length > REPLY_MAX_LEN ? reply.slice(0, REPLY_MAX_LEN).trim() : reply;
  } catch { return template; }
}
