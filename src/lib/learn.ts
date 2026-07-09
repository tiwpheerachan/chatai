import { createAdminClient } from './supabase/admin';
import { retrieve, bustKbCache } from './rag';

// A pure greeting/closing/ack — not knowledge worth learning.
const GREETING_ONLY = /^(ค่ะ|ครับ|คะ|จ้า|จ้ะ|โอเค|โอเคค่ะ|ok(ay)?|thanks?|ขอบคุณ(ค่ะ|ครับ|มากค่ะ|มากครับ|นะคะ)?|ยินดี(ค่ะ|ครับ)?|สวัสดี(ค่ะ|ครับ)?|ได้เลย(ค่ะ|ครับ)?|👍|🙏|❤️|🥰|รับทราบ(ค่ะ|ครับ)?)[\s❤️🙏👍🥰.!]*$/i;
// The customer message looks like a real question (worth learning the answer to).
const QUESTION_SIGNAL = /(ไหม|มั้ย|หรือ|อะไร|ยังไง|อย่างไร|เท่าไหร่|กี่|ทำไม|เมื่อไหร่|ที่ไหน|ใคร|ได้ไหม|\?|คือ)/;

/**
 * SELF-LEARNING: after an admin sends a real reply, if it answers a customer
 * QUESTION that the knowledge base doesn't already cover, save it as new
 * knowledge (source 'admin-learned') so the AI draft can answer it next time.
 * Trust the admin's words as correct. Reviewable/editable on the KB page.
 * Fire-and-forget; never blocks the send.
 */
export async function learnFromAdminReply(conversationId: string, brandId: string | null, agentText: string): Promise<void> {
  const answer = (agentText || '').trim();
  if (answer.length < 20 || GREETING_ONLY.test(answer)) return; // not substantive knowledge

  const sb = createAdminClient();
  const { data: msgs } = await sb
    .from('messages')
    .select('sender_type, text, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(12);

  // The customer question this reply is answering = last customer message.
  const lastCust = (msgs || []).find((m: any) => m.sender_type === 'customer' && (m.text || '').trim().length >= 6);
  if (!lastCust) return;
  const question = (lastCust.text || '').trim();
  if (question.length < 8 || GREETING_ONLY.test(question)) return;
  if (!QUESTION_SIGNAL.test(question) && question.length < 15) return; // not really a question

  // Already covered by the KB? then no need to learn.
  try {
    const docs = await retrieve(question, { brand_id: brandId, k: 1 });
    if ((docs[0]?.similarity ?? 0) > 0.55) return;
  } catch { /* if retrieve fails, still learn */ }

  await sb.from('knowledge_base').insert({
    brand_id: brandId,
    title: question.slice(0, 200),
    content: answer,
    source: 'admin-learned',
    tags: ['learned'],
  });
  bustKbCache(brandId);
}
