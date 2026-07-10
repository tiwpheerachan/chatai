import { callLLM, stripAiTells, extractJson } from '@/lib/bot';
import type { Message } from '@/types/database';

// ============================================================
// Smart chat-behaviour analysis: an instant free pattern signal +
// a deeper DeepSeek analysis (cached). Human-in-the-loop context only.
// ============================================================

export type Mood = 'angry' | 'frustrated' | 'neutral' | 'happy' | 'interested';
export type Urgency = 'high' | 'medium' | 'low';
export type Stage = 'browsing' | 'comparing' | 'ready' | 'existing' | 'support';

const URGENT_RE = /ด่วน|เดี๋ยวนี้|รีบ|พังแล้ว|ใช้ไม่ได้|ใช้งานไม่ได้|เสียแล้ว|ยังไม่ได้ของ|กี่วันแล้ว|ทำไมยัง|เมื่อไหร่จะ|รอนานมาก|แจ้งความ|ร้องเรียน|คืนเงิน|ยกเลิก/;
const ANGRY_RE = /แย่|ห่วย|โกง|หลอก|โมโห|หัวเสีย|ไม่พอใจ|ผิดหวัง|แจ้งความ|ร้องเรียน|เฮงซวย|กาก|!{2,}|ทำไมถึง|แย่มาก/;
const BUY_RE = /ราคา|กี่บาท|เท่าไหร่|ส่วนลด|โปร|ซื้อ|สั่ง|โอน|ชำระ|เก็บปลายทาง|cod|มีสต็อก|พร้อมส่ง|ขอใบเสนอ|จองไว้|สนใจ|เอา\s*\d|รับประกัน/i;
const GREET_RE = /สวัสดี|ทัก|สอบถาม|ขอถาม|hello|hi\b/i;

export interface QuickSignal { urgency: Urgency; mood: Mood; buyingHint: boolean }

/** Instant, free signal from the recent customer text (no LLM). */
export function quickSignal(customerText: string): QuickSignal {
  const t = customerText || '';
  const urgency: Urgency = URGENT_RE.test(t) ? 'high' : ANGRY_RE.test(t) ? 'medium' : 'low';
  const mood: Mood = ANGRY_RE.test(t) ? 'angry'
    : URGENT_RE.test(t) ? 'frustrated'
    : BUY_RE.test(t) ? 'interested'
    : GREET_RE.test(t) ? 'neutral'
    : 'neutral';
  return { urgency, mood, buyingHint: BUY_RE.test(t) };
}

export const MOOD_TH: Record<Mood, string> = { angry: 'โกรธ/ไม่พอใจ', frustrated: 'หงุดหงิด/เร่ง', neutral: 'ปกติ', happy: 'พอใจ', interested: 'สนใจซื้อ' };
export const URGENCY_TH: Record<Urgency, string> = { high: 'ด่วนมาก', medium: 'ควรรีบ', low: 'ปกติ' };
export const STAGE_TH: Record<Stage, string> = { browsing: 'กำลังดูข้อมูล', comparing: 'เปรียบเทียบ/ตัดสินใจ', ready: 'พร้อมซื้อ', existing: 'ลูกค้าเก่า', support: 'ขอความช่วยเหลือ' };

export interface ChatInsight {
  mood: Mood; urgency: Urgency; stage: Stage;
  buying_intent: number;      // 0-100
  topics: string[];           // Thai topic labels
  pain_point: string;         // 1-2 line summary for the next admin
  handling_tip: string;       // how to respond
  quick: QuickSignal;         // instant signal (always present)
}

// In-memory cache keyed by conversationId + last message id (persists on the Render
// process). Re-analyses only when a new message arrives.
const cache = new Map<string, { t: number; v: ChatInsight }>();
const TTL = 15 * 60_000;

function normStage(s: unknown): Stage {
  return (['browsing', 'comparing', 'ready', 'existing', 'support'] as const).includes(s as Stage) ? s as Stage : 'support';
}
function normMood(s: unknown): Mood {
  return (['angry', 'frustrated', 'neutral', 'happy', 'interested'] as const).includes(s as Mood) ? s as Mood : 'neutral';
}
function normUrg(s: unknown): Urgency {
  return (['high', 'medium', 'low'] as const).includes(s as Urgency) ? s as Urgency : 'low';
}

/** Deep DeepSeek analysis of the whole thread. Falls back to the quick signal when no LLM. */
export async function analyzeConversation(conversationId: string, history: Message[]): Promise<ChatInsight> {
  const customerMsgs = history.filter(m => m.sender_type === 'customer' && (m.text || '').trim());
  const lastCustomer = [...customerMsgs].reverse()[0]?.text || '';
  const quick = quickSignal(customerMsgs.slice(-4).map(m => m.text).join(' '));

  const lastId = history[history.length - 1]?.id || '';
  const key = `${conversationId}:${lastId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;

  const fallback: ChatInsight = {
    mood: quick.mood, urgency: quick.urgency,
    stage: quick.buyingHint ? 'comparing' : 'support',
    buying_intent: quick.buyingHint ? 55 : 15,
    topics: [], pain_point: '', handling_tip: '', quick,
  };
  if (!history.length) return fallback;

  const transcript = history.slice(-20)
    .map(m => `${m.sender_type === 'customer' ? 'ลูกค้า' : m.sender_type === 'agent' ? 'แอดมิน' : 'ระบบ'}: ${(m.text || '').trim() || '[รูป/การ์ด]'}`)
    .join('\n');

  const system = `คุณคือนักวิเคราะห์พฤติกรรมลูกค้าของร้านค้าออนไลน์ อ่านบทสนทนาแล้วสรุปเชิงลึกให้แอดมินเข้าใจบริบทใน 3 วินาที
ตอบเป็น JSON เท่านั้น ห้ามมี Markdown:
{
 "mood": "angry|frustrated|neutral|happy|interested",
 "urgency": "high|medium|low",
 "stage": "browsing|comparing|ready|existing|support",
 "buying_intent": <0-100 โอกาสที่จะซื้อ/ปิดการขาย>,
 "topics": ["<หัวข้อที่ลูกค้าคุย ภาษาไทยสั้นๆ 1-3 หัวข้อ>"],
 "pain_point": "<สรุป 1-2 บรรทัดว่าลูกค้าติดปัญหา/ต้องการอะไร ให้แอดมินคนถัดไปอ่านเข้าใจทันที>",
 "handling_tip": "<คำแนะนำสั้นๆ ว่าควรรับมือ/ตอบยังไงให้เหมาะกับอารมณ์และสถานะลูกค้า>"
}
เกณฑ์: โกรธ/ขู่ร้องเรียน/ของเสีย = urgency high · ถามราคา/ส่วนลด/ขอซื้อ = buying_intent สูง · ทักทายเฉยๆ = intent ต่ำ`;

  try {
    const raw = await callLLM(system, [{ role: 'user', content: `บทสนทนา:\n${transcript}\n\nข้อความล่าสุดของลูกค้า: "${lastCustomer}"` }], { temperature: 0.3 });
    const j = extractJson(raw);
    if (!j) return fallback;
    const insight: ChatInsight = {
      mood: normMood(j?.mood),
      urgency: normUrg(j?.urgency),
      stage: normStage(j?.stage),
      buying_intent: Math.max(0, Math.min(100, Math.round(Number(j?.buying_intent) || fallback.buying_intent))),
      topics: Array.isArray(j?.topics) ? j.topics.map((s: unknown) => stripAiTells(String(s)).trim()).filter(Boolean).slice(0, 4) : [],
      pain_point: stripAiTells(String(j?.pain_point || '')).trim(),
      handling_tip: stripAiTells(String(j?.handling_tip || '')).trim(),
      quick,
    };
    cache.set(key, { t: Date.now(), v: insight });
    return insight;
  } catch { return fallback; }
}
