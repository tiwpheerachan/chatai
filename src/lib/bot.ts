import OpenAI from 'openai';
import { createAdminClient } from './supabase/admin';
import { retrieve, type RetrievedDoc } from './rag';
import { getPlaybook, matchScenario, type PlaybookScenario } from './playbook';
import { getBuyerOrders, searchProducts, type BuyerOrder } from './chat-source/client';
import type { Message } from '@/types/database';

// Shopee order_status → our playbook condition + a Thai label, so the draft can
// pick the right strategy AND tell the buyer their real status.
const ORDER_STATUS_TH: Record<string, string> = {
  UNPAID: 'รอชำระเงิน', READY_TO_SHIP: 'เตรียมจัดส่ง', PROCESSED: 'กำลังจัดการ',
  TO_CONFIRM_RECEIVE: 'จัดส่งแล้ว/รอรับสินค้า', SHIPPED: 'จัดส่งแล้ว', COMPLETED: 'สำเร็จ',
  CANCELLED: 'ยกเลิก', IN_CANCEL: 'กำลังยกเลิก', TO_RETURN: 'คืนสินค้า',
};
function deriveCondition(orders: BuyerOrder[]): string | null {
  if (!orders.length) return 'no_order';
  const o = orders[0]; // newest
  const s = o.order_status;
  const ageDays = o.order_date ? (Date.now() - Date.parse(o.order_date)) / 86400000 : 0;
  if (ageDays > 15 && s !== 'COMPLETED' && s !== 'CANCELLED') return 'over_15d';
  if (s === 'UNPAID' || s === 'READY_TO_SHIP' || s === 'PROCESSED') return 'to_ship';
  if (s === 'SHIPPED' || s === 'TO_CONFIRM_RECEIVE') return 'to_receive';
  return null;
}
const PRODUCT_HINTS = ['ราคา', 'กี่บาท', 'บาท', 'มีของ', 'มีไหม', 'พร้อมส่ง', 'สต็อก', 'สต๊อก', 'stock', 'รุ่น', 'สี', 'ไซส์', 'size', 'โปร', 'ส่วนลด', 'รับประกัน'];
const ORDER_HINTS = /(ของ|พัสดุ|จัดส่ง|ส่ง|สถานะ|เลขพัสดุ|ถึงไหน|กี่วัน|ถึงยัง|เมื่อไหร่|ออเดอร์|คำสั่งซื้อ|order|track|ยกเลิก|คืนเงิน|คืนสินค้า|เคลม)/i;

const SYSTEM_PROMPT_DEFAULT = `คุณคือ Aria — ผู้ช่วยลูกค้าของร้านค้าออนไลน์ พูดสุภาพ เป็นกันเอง ลงท้ายด้วย "ค่ะ" หรือ "ครับ" ตามที่เหมาะสม
- ตอบสั้น กระชับ ตรงประเด็น ไม่ใช้คำฟุ่มเฟือย
- หากมีข้อมูลจาก Knowledge Base ให้ใช้ข้อมูลนั้นเป็นหลัก
- หากไม่มั่นใจคำตอบ ให้บอกว่าจะโอนให้พนักงานช่วยตอบ ห้ามมั่ว
- ห้ามให้ข้อมูลส่วนตัวของลูกค้าอื่น
- เมื่อลูกค้าโกรธ ใช้คำสุภาพ ปลอบโยน และเสนอโอนให้หัวหน้า`;

export interface BotReply {
  text: string;
  sources: { id: string; title: string }[];
  confidence: number;
  intent: string;
  handoff: boolean;
  fromRule?: string;
}

async function callLLM(system: string, messages: { role: 'user' | 'assistant'; content: string }[], opts: { temperature?: number } = {}): Promise<string | null> {
  const temperature = opts.temperature ?? 0.4;
  // Prefer the explicit LLM_PROVIDER, but if it's unset/mock, auto-pick whichever
  // API key is actually configured — so setting ANY key in the host makes AI work.
  const configured = process.env.LLM_PROVIDER;
  const provider = configured && configured !== 'mock'
    ? configured
    : (process.env.DEEPSEEK_API_KEY ? 'deepseek' : process.env.OPENAI_API_KEY ? 'openai' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock');
  const model = process.env.LLM_MODEL
    || (provider === 'anthropic' ? 'claude-3-5-sonnet-latest' : provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');

  // DeepSeek is OpenAI-compatible — same SDK, custom baseURL.
  if (provider === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
    try {
      const ds = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' });
      const r = await ds.chat.completions.create({
        model: model.startsWith('deepseek') ? model : 'deepseek-chat',
        messages: [{ role: 'system', content: system }, ...messages],
        temperature,
        max_tokens: 500,
      });
      return r.choices[0].message.content?.trim() || null;
    } catch (e) {
      console.warn('[Bot] DeepSeek call failed:', (e as Error).message);
      return null;
    }
  }

  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const r = await openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: system }, ...messages],
        temperature,
        max_tokens: 400,
      });
      return r.choices[0].message.content?.trim() || null;
    } catch (e) {
      console.warn('[Bot] OpenAI call failed:', (e as Error).message);
      return null;
    }
  }

  if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: model.startsWith('claude') ? model : 'claude-3-5-sonnet-latest',
          max_tokens: 400,
          system,
          messages,
        }),
      });
      const data = await r.json();
      return data.content?.[0]?.text?.trim() || null;
    } catch (e) {
      console.warn('[Bot] Claude call failed:', (e as Error).message);
      return null;
    }
  }

  return null;
}

// ============================================================================
// DRAFT ASSISTANT — suggests a reply for a HUMAN admin to review/copy/send.
// Learns the team's OWN reply style from their past replies (few-shot) so drafts
// sound natural (Shopee bans bot-like replies) — this NEVER sends on its own.
// ============================================================================

// Per-brand cache (persistent Node process) so repeat drafts don't re-query the
// team's style examples every time — they change slowly. 5-min TTL.
const styleCache = new Map<string, { t: number; v: string[] }>();
const STYLE_TTL = 5 * 60 * 1000;

/** Recent real agent replies for this brand, used as style/tone examples. */
async function getAdminStyleExamples(sb: ReturnType<typeof createAdminClient>, brandId: string | null, max = 12): Promise<string[]> {
  const ck = brandId || '_global';
  const cached = styleCache.get(ck);
  if (cached && Date.now() - cached.t < STYLE_TTL) return cached.v;
  // Bound the scan to a handful of recent conversations in the brand (indexed),
  // then read their agent messages — avoids scanning the whole messages table.
  let convIds: string[] = [];
  if (brandId) {
    const { data: convs } = await sb.from('conversations').select('id').eq('brand_id', brandId).order('last_message_at', { ascending: false }).limit(30);
    convIds = (convs || []).map((c: any) => c.id);
    if (!convIds.length) return [];
  }
  let q = sb.from('messages').select('text').eq('sender_type', 'agent').not('text', 'is', null).order('created_at', { ascending: false }).limit(60);
  if (convIds.length) q = q.in('conversation_id', convIds);
  const { data } = await q;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of (data as any[]) || []) {
    const t = (m.text || '').trim();
    // Skip empties, one-word acks, and huge blobs; dedupe.
    if (t.length < 4 || t.length > 400 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  styleCache.set(ck, { t: Date.now(), v: out });
  return out;
}

export interface DraftResult extends BotReply { needsHuman: boolean; reason?: string; usedExamples: number; used?: string[]; }

export async function draftReply(opts: {
  userMessage: string;
  brand_id?: string | null;
  history?: Message[];
  customerName?: string;
  shopId?: string | null;
  buyerUsername?: string | null;   // = conversation to_name; used to look up real orders
}): Promise<DraftResult> {
  const { userMessage, brand_id = null, history = [], customerName = '', shopId = null, buyerUsername = null } = opts;
  const sb = createAdminClient();

  const productish = PRODUCT_HINTS.some(k => userMessage.toLowerCase().includes(k));
  const orderIsh = ORDER_HINTS.test(userMessage);
  const [examples, docs, scenarios, orders, products] = await Promise.all([
    getAdminStyleExamples(sb, brand_id),
    retrieve(userMessage, { brand_id, k: 3 }),
    getPlaybook(sb, brand_id).catch(() => [] as PlaybookScenario[]),
    // Pull the buyer's REAL orders — but ONLY for order/shipping questions. buyer-orders
    // is a ~4.5s upstream call, so skipping it for general/product questions makes those
    // drafts fast (~1–2s); order questions still get the real data (worth the wait).
    (orderIsh && shopId && buyerUsername && buyerUsername !== 'Shopee Buyer'
      ? getBuyerOrders(shopId, buyerUsername, { limit: 5 }).catch(() => [] as BuyerOrder[])
      : Promise.resolve([] as BuyerOrder[])),
    // For product questions, search the catalog so the draft can give price/stock.
    (productish && shopId ? searchProducts(shopId, { q: userMessage.slice(0, 40), limit: 4 }).catch(() => []) : Promise.resolve([])),
  ]);
  const contextDocs = docs.filter(d => d.similarity > 0.15).slice(0, 3);
  const topSim = docs[0]?.similarity || 0;
  const derivedCond = deriveCondition(orders);

  // ---- Real data the admin would otherwise dig up by hand ----
  const ordersBlock = orders.length
    ? `\n\n=== ออเดอร์จริงของลูกค้าคนนี้ (ใช้ตอบเรื่องสถานะ/การจัดส่ง/สินค้าที่สั่งได้เลย) ===\n${orders.slice(0, 4).map(o => `• ${o.order_sn} — ${ORDER_STATUS_TH[o.order_status] || o.order_status} · สั่ง ${o.order_date}${o.cod ? ' · เก็บเงินปลายทาง' : ''} · ${(o.items || []).map(it => `${it.item_name}${it.model_name ? ` (${it.model_name})` : ''}×${it.quantity}`).join(', ')}`).join('\n')}`
    : '';
  const productsBlock = products.length
    ? `\n\n=== สินค้าในร้าน (ตอบเรื่องราคา/สต็อก/รุ่นได้) ===\n${products.map((p: any) => `• ${p.item_name} — ฿${Number(p.price).toLocaleString()}${p.original_price > p.price ? ` (ปกติ ฿${Number(p.original_price).toLocaleString()})` : ''} · ${p.in_stock ? `มีสต็อก ${p.stock}` : 'สินค้าหมด'}`).join('\n')}`
    : '';

  // ---- Playbook: prefer the strategy whose condition matches the real order status ----
  const matched = matchScenario(userMessage, scenarios);
  const allStrategies = (matched?.scenario.strategies || []).filter(s => s.enabled);
  // Rank strategies: exact condition-match first, then unconditional.
  const strategies = [...allStrategies].sort((a, b) => {
    const am = a.order_condition === derivedCond ? 0 : a.order_condition ? 2 : 1;
    const bm = b.order_condition === derivedCond ? 0 : b.order_condition ? 2 : 1;
    return am - bm;
  });
  const replyStrategies = strategies.filter(s => s.action === 'reply' && (s.response || '').trim());
  // Handoff only if the BEST-matching strategy (by condition) is a handoff and no usable reply.
  const best = strategies[0];
  const onlyHandoff = !!best && best.action === 'handoff' && replyStrategies.length === 0;
  let playbookBlock = '';
  if (matched && replyStrategies.length) {
    playbookBlock = `\n\n=== สคริปต์ที่ร้านกำหนดไว้สำหรับฉาก "${matched.scenario.title}"${derivedCond ? ` (สถานะออเดอร์ลูกค้า: ${derivedCond})` : ''} (ใช้เป็นคำตอบหลัก ปรับถ้อยคำเล็กน้อย เลือกอันที่ตรงเงื่อนไขที่สุด) ===\n${replyStrategies.map((s, i) => `${i + 1}. ${s.order_condition ? `[เงื่อนไข: ${s.order_condition}] ` : ''}${s.response}`).join('\n')}`;
  }
  // If the matched scenario's best strategy is handoff-only AND we truly have no data → human.
  if (matched && onlyHandoff && !orders.length && !products.length && !contextDocs.length) {
    return {
      text: '', sources: [], confidence: 0.3, intent: 'playbook-handoff',
      handoff: true, needsHuman: true,
      reason: `ฉาก “${matched.scenario.title}” ตั้งไว้ให้โอนพนักงาน${best?.label ? ` (${best.label})` : ''}`,
      usedExamples: examples.length,
    };
  }

  const styleBlock = examples.length
    ? `\n\n=== ตัวอย่างวิธีที่แอดมินตอบจริง (เลียนแบบโทน สำนวน ความยาว คำลงท้าย และอีโมจิแบบนี้) ===\n${examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
    : '';
  const kb = contextDocs.length
    ? `\n\n=== Knowledge Base (ใช้เป็นข้อเท็จจริงเท่านั้น) ===\n${contextDocs.map((d, i) => `[${i + 1}] ${d.title}\n${d.content}`).join('\n\n')}`
    : '';

  const system = `คุณคือแอดมินร้านค้าออนไลน์ (คนจริง) กำลังพิมพ์ตอบลูกค้าในแชท — ร่างข้อความให้เพื่อนแอดมินตรวจแล้วกดส่งเอง
สำคัญที่สุด: ให้ "เหมือนคนพิมพ์จริง" มากที่สุด อย่าให้ดูเหมือนบอท (Shopee แบนบอท)
วิธีพิมพ์ให้เหมือนคน:
- **อ่านบทสนทนาทั้งหมดก่อน** เข้าใจว่าลูกค้ากำลังคุยเรื่องอะไรอยู่ แล้วตอบให้ต่อเนื่องกับบริบท ไม่ใช่ดูแค่ข้อความล่าสุด
- เป็นกันเอง เหมือนคุยจริงในมือถือ ไม่ทางการหรือเป๊ะเกินไป ไม่ต้องจัดเป็นข้อๆ/บุลเล็ต เว้นแต่จำเป็นจริงๆ
- โทน ความยาว คำลงท้าย (ค่ะ/นะคะ/จ้า) และอีโมจิ ให้เหมือนตัวอย่างจริงของแอดมินด้านล่าง
- ความยาวไม่ตายตัว: บางทีหลายประโยค/หลายบรรทัดสั้นๆ (คั่นด้วยขึ้นบรรทัดใหม่) บางทีบรรทัดเดียว — เอาที่เป็นธรรมชาติตามสถานการณ์ ไม่ต้องยาวหรือหลายบรรทัดทุกครั้ง
- ใส่คำอุทาน/รับคำแบบธรรมชาติได้ เช่น "ได้เลยค่ะ" "โอเคค่ะ" "จ้า" "สักครู่นะคะ" ตามจังหวะการคุย
- ไม่ต้องสมบูรณ์แบบ 100% — ภาษาพูด/ตัวสะกดไม่เป๊ะเป๊ะได้บ้างตามธรรมชาติ (อย่าจงใจพิมพ์ผิดเยอะ)
เนื้อหา:
- พยายามตอบให้ได้เองก่อนเสมอ โดยใช้ข้อมูลจริงด้านล่าง (ออเดอร์ลูกค้า/สินค้า/สคริปต์ร้าน/คลังความรู้) อย่ารีบโยนให้พนักงาน
- ถามสถานะ/จัดส่ง/ของที่สั่ง → ดู "ออเดอร์จริงของลูกค้า" · ถามราคา/สต็อก/รุ่น → ดู "สินค้าในร้าน" · มี "สคริปต์ร้าน" → ยึดตามนั้น (เลือกให้ตรงสถานะออเดอร์)
- ห้ามแต่งตัวเลข/ราคา/โปร/สถานะที่ไม่มีในข้อมูล
- ตั้ง needs_human=true เฉพาะเมื่อไม่มีข้อมูลช่วยได้เลย หรือเป็นเรื่องต้องตัดสินใจแทนลูกค้า (ยกเลิก/คืนเงิน/เคลม)
- ตอบภาษาเดียวกับลูกค้า${ordersBlock}${productsBlock}${playbookBlock}${styleBlock}${kb}

ตอบกลับเป็น JSON อย่างเดียว: {"reply":"<ข้อความร่างแบบเป็นธรรมชาติ>","needs_human":true|false,"reason":"<เหตุผลสั้นๆ>"}`;

  // Give the model the WHOLE recent conversation (last 14 turns) so it understands
  // the topic, not just the last line. Non-text messages become short markers.
  const marker = (t?: string) => ({ image: '[รูปภาพ]', sticker: '[สติกเกอร์]', item: '[การ์ดสินค้า]', order: '[การ์ดออเดอร์]', voucher: '[คูปอง]', video: '[วิดีโอ]' }[t || ''] || '');
  const chatHistory = history.slice(-14)
    .map(h => ({
      role: (h.sender_type === 'customer' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: (h.text || '').trim() || marker((h as any).message_type),
    }))
    .filter(m => m.content);
  // Ensure the thread ends with the customer's current question.
  const last = chatHistory[chatHistory.length - 1];
  if (!last || last.role !== 'user' || last.content !== (userMessage || '').trim()) {
    chatHistory.push({ role: 'user', content: userMessage || '(ลูกค้าส่งรูป/สติกเกอร์/การ์ด)' });
  }

  const raw = await callLLM(system, chatHistory, { temperature: 0.8 });   // higher = more human-like variation
  let reply = '';
  let needsHuman = false;
  let reason = '';
  if (raw) {
    try {
      const j = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
      if (j && typeof j.reply === 'string') { reply = j.reply.trim(); needsHuman = !!j.needs_human; reason = j.reason || ''; }
      else reply = raw.trim();
    } catch { reply = raw.trim(); }
  }
  if (!reply) {
    // No LLM configured (mock) or empty → degrade gracefully, still using real data.
    // Prefer the order-status line only for order/shipping questions; else KB.
    if (replyStrategies.length) { reply = replyStrategies[0].response || ''; needsHuman = false; }   // playbook script verbatim
    else if (orders.length && orderIsh) {
      const o = orders[0];
      reply = `ออเดอร์ ${o.order_sn} สถานะ: ${ORDER_STATUS_TH[o.order_status] || o.order_status} ค่ะ (สั่งเมื่อ ${o.order_date})`;
      needsHuman = false;
    } else if (contextDocs.length && (contextDocs[0].similarity ?? 0) > 0.2) { reply = contextDocs[0].content.slice(0, 400); needsHuman = false; }
    else if (orders.length) {
      const o = orders[0];
      reply = `ออเดอร์ ${o.order_sn} สถานะ: ${ORDER_STATUS_TH[o.order_status] || o.order_status} ค่ะ (สั่งเมื่อ ${o.order_date})`;
      needsHuman = false;
    } else { needsHuman = true; reason = reason || 'ไม่มีข้อมูลพอให้ร่าง — ให้แอดมินตอบเอง'; }
  }
  // More data on hand ⇒ higher confidence; needs-human stays low.
  const dataBoost = (orders.length ? 0.15 : 0) + (products.length ? 0.1 : 0) + (matched ? 0.1 : 0);
  const confidence = needsHuman ? 0.3 : Math.min(0.96, 0.5 + topSim * 0.35 + dataBoost);
  void customerName;
  const used: string[] = [];
  if (orders.length) used.push(`ออเดอร์ลูกค้า ${orders.length} รายการ`);
  if (products.length) used.push(`สินค้าในร้าน ${products.length} รายการ`);
  if (matched) used.push(`ฉาก “${matched.scenario.title}”`);
  if (contextDocs.length) used.push(`คลังความรู้ ${contextDocs.length} หัวข้อ`);
  return {
    text: reply,
    sources: contextDocs.map(d => ({ id: d.id, title: d.title })),
    confidence,
    intent: 'draft',
    handoff: needsHuman,
    needsHuman,
    reason,
    usedExamples: examples.length,
    used,
  };
}

export async function generateReply(opts: {
  userMessage: string;
  brand_id?: string | null;
  history?: Message[];
  customerName?: string;
}): Promise<BotReply> {
  const { userMessage, brand_id = null, history = [], customerName = '' } = opts;
  const sb = createAdminClient();

  // 1. Bot rules
  const { data: rules } = await sb
    .from('bot_rules')
    .select('*')
    .eq('enabled', true)
    .order('priority', { ascending: false });

  for (const r of rules || []) {
    // Guard against ReDoS: skip overly long patterns and cap the input we test.
    if (!r.pattern || r.pattern.length > 200) continue;
    try {
      const re = new RegExp(r.pattern, 'i');
      if (re.test(userMessage.slice(0, 2000))) {
        return {
          text: (r.response_template || '').replace('{{name}}', customerName || 'ลูกค้า'),
          sources: [],
          confidence: 0.95,
          intent: r.intent,
          handoff: r.action === 'handoff',
          fromRule: r.id,
        };
      }
    } catch { /* invalid regex */ }
  }

  // 2. RAG
  const docs: RetrievedDoc[] = await retrieve(userMessage, { brand_id, k: 3 });
  const topSim = docs[0]?.similarity || 0;
  const contextDocs = docs.filter(d => d.similarity > 0.15).slice(0, 3);

  const context = contextDocs.length
    ? `\n\n=== ข้อมูลจาก Knowledge Base ===\n${contextDocs.map((d, i) => `[${i + 1}] ${d.title}\n${d.content}`).join('\n\n')}\n=== จบ ===`
    : '';

  const system = SYSTEM_PROMPT_DEFAULT + context;
  const chatHistory = history.slice(-6).map(h => ({
    role: (h.sender_type === 'customer' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: h.text || '',
  }));
  chatHistory.push({ role: 'user', content: userMessage });

  // 3. LLM
  const llmReply = await callLLM(system, chatHistory);
  if (llmReply) {
    return {
      text: llmReply,
      sources: contextDocs.map(d => ({ id: d.id, title: d.title })),
      confidence: Math.min(0.95, 0.5 + topSim * 0.5),
      intent: contextDocs.length ? 'rag' : 'chat',
      handoff: false,
    };
  }

  // 4. Mock fallback
  if (contextDocs.length) {
    return {
      text: `จากข้อมูลที่มี: ${contextDocs[0].content.slice(0, 280)}${contextDocs[0].content.length > 280 ? '...' : ''}`,
      sources: contextDocs.map(d => ({ id: d.id, title: d.title })),
      confidence: 0.7,
      intent: 'rag-fallback',
      handoff: false,
    };
  }

  return {
    text: 'ขออภัยค่ะ Aria ไม่แน่ใจคำตอบ ขอโอนให้พนักงานช่วยตอบให้นะคะ 🙏',
    sources: [],
    confidence: 0.3,
    intent: 'handoff',
    handoff: true,
  };
}
