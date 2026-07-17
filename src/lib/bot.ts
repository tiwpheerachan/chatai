import OpenAI from 'openai';
import { createAdminClient } from './supabase/admin';
import { retrieve, type RetrievedDoc } from './rag';
import { getPlaybook, matchScenario, type PlaybookScenario } from './playbook';
import { getBuyerOrders, searchProducts, getItemsByIds, type BuyerOrder } from './chat-source/client';
import { resolveTutorial, type TutorialVideo } from './youtube';
import { findProductMedia, type ProductMediaItem } from './product-media';
import type { Message } from '@/types/database';

// A customer who can't work out how to USE the product — the case where a how-to
// video helps more than text. Kept narrow so it doesn't fire on general questions.
const HOWTO_RE = /วิธีใช้|ใช้ยัง?ไง|ใช้ไม่เป็น|ใช้ไม่ถูก|ใช้ไม่ค่อยเป็น|ตั้งค่ายัง?ไง|ตั้งค่าไม่|เชื่อมต่อไม่|เชื่อมไม่|จับคู่|pair|reset|รีเซ็ต|รีเซต|เปิดเครื่องยัง?ไง|วิธีการ|สอนใช้|ต่อ\s*wifi|เชื่อม\s*wifi|ติดตั้งยัง?ไง|วิธีติดตั้ง|setup|how ?to|กดตรงไหน|ทำไง|ทำยัง?ไง|มีคลิป|มีวิดีโอ|ดูวิธี/i;

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
const PRODUCT_HINTS = ['ราคา', 'กี่บาท', 'บาท', 'มีของ', 'มีไหม', 'พร้อมส่ง', 'สต็อก', 'สต๊อก', 'stock', 'รุ่น', 'สี', 'ไซส์', 'size', 'โปร', 'ส่วนลด', 'รับประกัน', 'แนะนำ', 'อยากได้', 'สนใจ', 'ซื้อ', 'ตัวไหน', 'อันไหน', 'ต่างกัน', 'เปรียบเทียบ', 'รุ่นไหน'];
const ORDER_HINTS = /(ของ|พัสดุ|จัดส่ง|ส่ง|สถานะ|เลขพัสดุ|ถึงไหน|กี่วัน|ถึงยัง|เมื่อไหร่|ออเดอร์|คำสั่งซื้อ|order|track|ยกเลิก|คืนเงิน|คืนสินค้า|เคลม)/i;

/** Strip "[TAG]"/"【TAG】" markers + collapse spaces from a Shopee product title. */
function cleanProductName(s?: string | null): string {
  return (s || '').replace(/\[[^\]]*\]/g, '').replace(/【[^】]*】/g, '').replace(/\s+/g, ' ').trim();
}

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

export async function callLLM(system: string, messages: { role: 'user' | 'assistant'; content: string }[], opts: { temperature?: number } = {}): Promise<string | null> {
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

export interface DraftResult extends BotReply { needsHuman: boolean; reason?: string; usedExamples: number; used?: string[]; suggestedProducts?: any[]; tutorialVideos?: TutorialVideo[]; mediaSuggestions?: ProductMediaItem[]; sawImage?: boolean; blocks: string[]; }

/**
 * Robustly pull a JSON object out of an LLM response. Handles the common ways a
 * model wraps it: ```json fences anywhere, a leading newline/prose before the
 * object, or trailing commentary. Returns the parsed object or null — so callers
 * never accidentally show raw `{"messages":[...]}` scaffolding to the user.
 */
export function extractJson(raw: string | null | undefined): any | null {
  if (!raw) return null;
  const s = raw.replace(/```(?:json)?/gi, ' ').trim();
  try { return JSON.parse(s); } catch { /* try to locate the object */ }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch { /* give up */ }
  }
  return null;
}

// Strip AI-tell markdown so drafts read like a human typed them in a chat box:
// removes bold/italic/code/heading syntax and leading bullet or number markers,
// but keeps emoji, Thai text and normal punctuation untouched.
export function stripAiTells(s: string): string {
  return (s || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')       // **bold** → bold
    .replace(/__(.+?)__/g, '$1')           // __bold__ → bold
    .replace(/(?<!\S)\*(?!\s)(.+?)(?<!\s)\*(?!\S)/g, '$1') // *italic* → italic (not bare bullets)
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')  // `code` → code
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')     // # heading → heading
    .replace(/^\s*[*\-•]\s+/gm, '')          // "* " / "- " / "• " bullet → plain line
    .replace(/^\s*\d+[.)]\s+/gm, '')         // "1. " / "1) " numbered → plain line
    .replace(/\*+/g, '')                      // any stray asterisks left over
    .replace(/[ \t]+\n/g, '\n')              // trailing spaces
    .replace(/\n{3,}/g, '\n\n')              // collapse >2 blank lines
    .trim();
}

/**
 * Turn a reply into separate chat bubbles ("ช่องๆ") the way a real admin sends
 * several short messages. Accepts an explicit array from the model, or splits a
 * single string on blank lines (falling back to single newlines only if there are
 * no blank lines). Each block is sanitized; empty blocks are dropped.
 */
export function toBlocks(input: string[] | string): string[] {
  let raw: string[];
  if (Array.isArray(input)) raw = input;
  else {
    const t = (input || '').trim();
    raw = /\n\s*\n/.test(t) ? t.split(/\n\s*\n+/) : (t ? [t] : []);
  }
  return raw.map(b => stripAiTells(String(b))).map(b => b.trim()).filter(Boolean);
}

const VISION_PROMPT = 'ลูกค้าร้านออนไลน์ส่งรูปนี้มาในแชท อธิบายสั้นๆ เป็นภาษาไทยว่าในรูปมีอะไร (สินค้าอะไร/อาการเสีย/สลิปโอนเงิน/หน้าจอ/เอกสาร ฯลฯ) เพื่อช่วยแอดมินตอบ';

/** Download an image URL and return it as Gemini inline_data (base64). */
async function fetchInlineImage(url: string): Promise<{ mime_type: string; data: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const mime = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!mime.startsWith('image/')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 6_000_000) return null; // skip oversized
    return { mime_type: mime, data: buf.toString('base64') };
  } catch { return null; }
}

/** Vision via Google Gemini (generativelanguage API). Images are downloaded and
 * sent inline (Gemini's generateContent can't fetch arbitrary URLs itself). */
async function describeImagesGemini(urls: string[]): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const imgs = (await Promise.all(urls.slice(0, 3).map(fetchInlineImage))).filter(Boolean) as { mime_type: string; data: string }[];
  if (!imgs.length) return null;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: VISION_PROMPT }, ...imgs.map(i => ({ inline_data: i }))] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.4 },
      }),
    });
    if (!res.ok) { console.warn('[Bot] gemini vision', res.status, (await res.text()).slice(0, 200)); return null; }
    const j = await res.json();
    const text = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text).filter(Boolean).join(' ').trim();
    return text || null;
  } catch (e) { console.warn('[Bot] gemini vision failed:', (e as Error).message); return null; }
}

/** Describe customer-sent images so a text LLM (DeepSeek) can use them. Prefers
 * Gemini (GEMINI_API_KEY), falls back to OpenAI gpt-4o-mini (OPENAI_API_KEY);
 * returns null if neither is set (DeepSeek's chat API can't read images). */
async function describeImages(urls: string[]): Promise<string | null> {
  if (!urls.length) return null;
  if (process.env.GEMINI_API_KEY) {
    const g = await describeImagesGemini(urls);
    if (g) return g;
  }
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text' as const, text: VISION_PROMPT },
          ...urls.slice(0, 3).map(u => ({ type: 'image_url' as const, image_url: { url: u } })),
        ],
      }],
      max_tokens: 220,
    });
    return r.choices[0].message.content?.trim() || null;
  } catch (e) { console.warn('[Bot] vision failed:', (e as Error).message); return null; }
}

export async function draftReply(opts: {
  userMessage: string;
  brand_id?: string | null;
  history?: Message[];
  customerName?: string;
  shopId?: string | null;
  buyerUsername?: string | null;   // = conversation to_name; used to look up real orders
  images?: string[];               // customer-sent image URLs to "read"
  referencedItemIds?: number[];    // product cards the buyer sent (item_id only)
}): Promise<DraftResult> {
  const { userMessage, brand_id = null, history = [], customerName = '', shopId = null, buyerUsername = null, images = [], referencedItemIds = [] } = opts;
  const sb = createAdminClient();

  // Topic query = the last few CUSTOMER turns + the current message. A short
  // follow-up ("กดตอนซื้อแล้วค่ะ") has no keywords, so keying retrieval/intent off
  // it alone loses the real ask ("ขอใบกำกับภาษี") set earlier in the thread.
  const recentCustomer = history.filter(m => m.sender_type === 'customer' && (m.text || '').trim()).slice(-5).map(m => (m.text as string).trim());
  const topicText = [...recentCustomer, userMessage].filter(Boolean).join(' ').slice(0, 400);

  const productish = PRODUCT_HINTS.some(k => topicText.toLowerCase().includes(k));
  const orderIsh = ORDER_HINTS.test(topicText);
  const howish = HOWTO_RE.test(topicText);
  // Capability / spec question ("โทรได้ไหม", "กันน้ำไหม", "แบตกี่วัน", "รองรับ…") —
  // these carry no product keyword but STILL need the ordered product for context.
  const SPEC_RE = /ไหม|มั้ย|รองรับ|ใช้กับ|ใช้ได้|กันน้ำ|กันฝุ่น|กันเหงื่อ|แบต|กี่วัน|กี่ชม|กี่ชั่วโมง|โทร|รับสาย|เชื่อมต่อ|บลูทูธ|bluetooth|wi-?fi|เมนู|ภาษาไทย|น้ำหนัก|ขนาด|สเปก|spec|ฟังก์ชัน|feature|ทำอะไรได้|\?/i;
  const specish = SPEC_RE.test(topicText);
  const validBuyer = !!(shopId && buyerUsername && buyerUsername !== 'Shopee Buyer');
  // Gather every source concurrently (incl. "reading" the images) so the draft stays fast.
  const [examples, docs0, scenarios, orders, products0, referencedProducts, visionDesc] = await Promise.all([
    getAdminStyleExamples(sb, brand_id),
    retrieve(topicText, { brand_id, k: 3 }),
    getPlaybook(sb, brand_id).catch(() => [] as PlaybookScenario[]),
    // Pull the buyer's REAL orders for ANY order / product / how-to question — the
    // customer already has an order, so we should answer about THAT product instead
    // of asking "which model?". (buyer-orders is a ~4.5s call, so we still skip it
    // for pure greetings/chitchat to keep those drafts fast.)
    ((orderIsh || productish || howish || specish) && validBuyer
      ? getBuyerOrders(shopId!, buyerUsername!, { limit: 5 }).catch(() => [] as BuyerOrder[])
      : Promise.resolve([] as BuyerOrder[])),
    // For product questions, search the catalog so the draft can give price/stock.
    (productish && shopId ? searchProducts(shopId, { q: topicText.slice(0, 40), limit: 4 }).catch(() => []) : Promise.resolve([])),
    // Resolve product cards the buyer sent (so "these two models" is grounded).
    (referencedItemIds.length && shopId ? getItemsByIds(shopId, referencedItemIds).catch(() => []) : Promise.resolve([])),
    // "Read" any images the customer sent (vision model if available).
    (images.length ? describeImages(images).catch(() => null) : Promise.resolve(null)),
  ]);

  // ---- Ground the answer in the customer's ACTUAL ordered product ----
  // If they have an order and are asking about a product / how-to WITHOUT naming a
  // model, look up that exact product's specs (catalog + KB) so the draft answers
  // the right model instead of asking the customer to send it.
  let products = products0 as any[];
  let docs = docs0;
  const orderedName = orders[0]?.items?.[0]?.item_name
    ? cleanProductName(orders[0].items[0].item_name)
    : '';
  const needsOrderGrounding = orders.length > 0 && (productish || howish || specish) && !referencedProducts.length && !!orderedName;
  if (needsOrderGrounding) {
    const q = orderedName.split(' ').slice(0, 4).join(' ');
    const [extraProducts, extraDocs] = await Promise.all([
      shopId ? searchProducts(shopId, { q, limit: 3 }).catch(() => []) : Promise.resolve([]),
      retrieve(orderedName, { brand_id, k: 2 }).catch(() => [] as typeof docs0),
    ]);
    // Merge, de-duping products by item_id/name and docs by title.
    const seenP = new Set(products.map((p: any) => p.item_id ?? p.item_name));
    for (const p of extraProducts as any[]) { const k = p.item_id ?? p.item_name; if (!seenP.has(k)) { seenP.add(k); products.push(p); } }
    const seenD = new Set(docs.map((d: any) => d.title));
    for (const d of extraDocs as any[]) { if (!seenD.has(d.title)) { seenD.add(d.title); docs.push(d); } }
  }

  const visionBlock = !images.length ? '' : visionDesc
    ? `\n\n=== รูปที่ลูกค้าส่งมา (ระบบอ่านให้) ===\n${visionDesc}`
    : `\n\n(ลูกค้าส่งรูปมา ${images.length} รูป — ระบบยังอ่านรูปไม่ได้ ถ้าคำถามเกี่ยวกับรูป ให้ตอบแบบขอดูรายละเอียด/ให้แอดมินดูรูปประกอบ)`;
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
  // Products the buyer explicitly sent as cards — usually the exact items "รุ่นนี้/สองรุ่นนี้" refers to.
  const referencedBlock = referencedProducts.length
    ? `\n\n=== สินค้าที่ลูกค้าส่งการ์ด/อ้างถึงในแชท (มักคือ "รุ่นนี้/สองรุ่นนี้" ที่ลูกค้าหมายถึง — ตอบให้ตรงรุ่นเหล่านี้) ===\n${referencedProducts.map((p: any) => `• ${p.item_name}${p.model_name ? ` (${p.model_name})` : ''} — ฿${Number(p.price).toLocaleString()} · ${p.in_stock ? `มีสต็อก ${p.stock}` : 'สินค้าหมด'}`).join('\n')}`
    : '';

  // ---- Playbook: prefer the strategy whose condition matches the real order status ----
  const matched = matchScenario(topicText, scenarios);
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
      text: '', blocks: [], sources: [], confidence: 0.3, intent: 'playbook-handoff',
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
- **อ่านบทสนทนาทั้งหมดก่อนเสมอ** ข้อความล่าสุดมักเป็นการ "ตอบต่อ/ถามต่อ" จากเรื่องที่คุยไว้ก่อนหน้า (เช่น ลูกค้าเคยขอ "ใบกำกับภาษี" ไว้ แล้วพิมพ์ตามว่า "กดตอนซื้อแล้วค่ะ ยังไม่เห็นส่งมา") ต้องเข้าใจว่าประเด็นหลักที่ลูกค้าต้องการคืออะไร (โยงกับข้อความก่อนหน้า) แล้วตอบให้ตรงเรื่องนั้น ห้ามตอบลอยๆ แค่จากข้อความสุดท้าย
- ดูด้วยว่า "แอดมินเคยบอกอะไรลูกค้าไปแล้ว" ในแชทนี้ แล้วตอบต่อยอด อย่าถามซ้ำหรือขัดกับที่เคยบอก
- สุภาพ เรียบร้อย ดูเป็นมืออาชีพนิดหน่อย แต่ยังอบอุ่นเป็นกันเองเหมือนคนจริง (ไม่แข็งทื่อเป็นบอท ไม่เป๊ะเกินไป) ไม่ต้องจัดเป็นข้อๆ/บุลเล็ต เว้นแต่จำเป็น
- ถ้าลูกค้าถามหา/สนใจสินค้า หรือกำลังเลือกไม่ถูก ให้แนะนำสินค้าที่ร้านมีจริง (จาก "สินค้าในร้าน" ด้านล่าง) พร้อมเหตุผลสั้นๆ — ระบบจะแนบการ์ดสินค้าให้แอดมินกดส่งได้
- โทน ความยาว คำลงท้าย (ค่ะ/นะคะ/จ้า) และอีโมจิ ให้เหมือนตัวอย่างจริงของแอดมินด้านล่าง
- ส่งเป็น "ข้อความหลายฟอง" แบบคนจริงพิมพ์ในแชท: แยกแต่ละใจความ/แต่ละประโยคเป็นข้อความสั้นๆ แยกฟองกัน (แต่ละ item ใน messages = 1 ฟอง) เช่น ทักทาย 1 ฟอง, ตอบเนื้อหา 1 ฟอง, หมายเหตุ/ขอบคุณอีก 1 ฟอง — ปกติ 1–3 ฟอง ตามธรรมชาติ ไม่ต้องยัดทุกอย่างในฟองเดียว และไม่ต้องแตกย่อยจนถี่เกินไป
- ห้ามใช้เครื่องหมาย Markdown เด็ดขาด: ห้ามมี ** (ตัวหนา), *, _, #, \`, หรือ bullet แบบ "- " / "* " — พิมพ์เป็นข้อความธรรมดาเหมือนคนพิมพ์มือ ถ้าจะเน้นให้ใช้อีโมจินำหน้าบรรทัด (เช่น 📍 ✅) แทน
- ใส่คำอุทาน/รับคำแบบธรรมชาติได้ เช่น "ได้เลยค่ะ" "โอเคค่ะ" "จ้า" "สักครู่นะคะ" ตามจังหวะการคุย
- ไม่ต้องสมบูรณ์แบบ 100% — ภาษาพูด/ตัวสะกดไม่เป๊ะเป๊ะได้บ้างตามธรรมชาติ (อย่าจงใจพิมพ์ผิดเยอะ)
เนื้อหา:
- พยายามตอบให้ได้เองก่อนเสมอ โดยใช้ข้อมูลจริงด้านล่าง (ออเดอร์ลูกค้า/สินค้า/สคริปต์ร้าน/คลังความรู้) อย่ารีบโยนให้พนักงาน
- ถามสถานะ/จัดส่ง/ของที่สั่ง → ดู "ออเดอร์จริงของลูกค้า" · ถามราคา/สต็อก/รุ่น → ดู "สินค้าในร้าน" · มี "สคริปต์ร้าน" → ยึดตามนั้น (เลือกให้ตรงสถานะออเดอร์)
- **ถ้ามี "ออเดอร์จริงของลูกค้า" อยู่ และลูกค้าถามเรื่องสินค้า/วิธีใช้/สเปก โดยไม่ได้บอกรุ่น → ให้ถือว่าลูกค้าหมายถึง "สินค้าที่อยู่ในออเดอร์ของเขา" ระบุชื่อรุ่นจากออเดอร์นั้นได้เลย ห้ามถามลูกค้าว่า "รุ่นไหน/แคปหน้าสินค้ามา" ทั้งที่ดูจากออเดอร์รู้อยู่แล้ว** (ลูกค้าซื้อไปแล้ว การถามซ้ำทำให้ดูไม่ฉลาด) — ถ้ามีหลายออเดอร์/หลายรุ่น ค่อยถามว่าหมายถึงรุ่นไหนในออเดอร์ของเขา
- ห้ามแต่งตัวเลข/ราคา/โปร/สถานะที่ไม่มีในข้อมูล
- **ห้ามเดา/ยืนยันสเปกหรือความสามารถของสินค้าเด็ดขาด** (เช่น "โทรได้ไหม" "กันน้ำไหม" "แบตกี่วัน" "รองรับ...ไหม" "ใช้กับ...ได้ไหม" "มีสี/ไซซ์ไหน") ถ้าไม่มีข้อมูลยืนยันจาก "สินค้าในร้าน"/"สินค้าที่ลูกค้าอ้างถึง"/"คลังความรู้" — ห้ามตอบว่าได้/ไม่ได้ลอยๆ ให้ตอบแบบ "ขอเช็กสเปกรุ่นนี้ให้แป๊บนึงนะคะ" หรือถามยืนยันรุ่น/ชื่อสินค้าก่อน (ตอบผิดเรื่องสเปกอันตรายมาก เช่น Smart Band ที่โทรไม่ได้ ห้ามบอกว่าโทรได้)
- ให้ดูชื่อรุ่นจริงของสินค้าที่ลูกค้าถาม/ส่งการ์ด/**มีอยู่ในออเดอร์ของลูกค้า**ก่อนเสมอ (เช่น เห็นว่าเป็น "Smart Band" ก็รู้ว่าไม่รองรับการโทร) — ลำดับการหารุ่น: (1) สินค้าที่ลูกค้าส่งการ์ด (2) ออเดอร์จริงของลูกค้า (3) รูปที่ส่งมา แล้วค่อยตอบตามรุ่นนั้น ถ้าหาจากทั้ง 3 แหล่งแล้วยังไม่รู้จริงๆ จึงถามยืนยันรุ่นก่อนตอบเรื่องความสามารถ (อย่าเพิ่งถ้ามีออเดอร์อยู่แล้ว)
- ตั้ง needs_human=true เฉพาะเมื่อไม่มีข้อมูลช่วยได้เลย หรือเป็นเรื่องต้องตัดสินใจแทนลูกค้า (ยกเลิก/คืนเงิน/เคลม)
- ตอบภาษาเดียวกับลูกค้า
- ถ้าลูกค้าถามหลายข้อในคราวเดียว ให้ตอบให้ครบทุกข้อ
- ถ้าลูกค้าส่งรูป/การ์ดสินค้ามา ให้ยึด "รูปที่ลูกค้าส่งมา" และ "สินค้าที่ลูกค้าส่งการ์ด" ด้านล่างเป็นหลัก อย่าเดารุ่นเอง${visionBlock}${ordersBlock}${productsBlock}${referencedBlock}${playbookBlock}${styleBlock}${kb}

ตอบกลับเป็น JSON อย่างเดียว: {"messages":["<ฟองที่ 1>","<ฟองที่ 2>", ...],"needs_human":true|false,"reason":"<เหตุผลสั้นๆ>"}
- "messages" = อาเรย์ของข้อความแยกฟอง (ห้ามใส่ Markdown/** ใดๆ) ถ้าจะตอบฟองเดียวก็ใส่ item เดียว`;

  // Give the model the WHOLE recent conversation (last 14 turns) so it understands
  // the topic, not just the last line. Non-text messages become short markers.
  const marker = (t?: string) => ({ image: '[รูปภาพ]', sticker: '[สติกเกอร์]', item: '[การ์ดสินค้า]', order: '[การ์ดออเดอร์]', voucher: '[คูปอง]', video: '[วิดีโอ]' }[t || ''] || '');
  const chatHistory = history.slice(-24)
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
  let blocks: string[] = [];
  let needsHuman = false;
  let reason = '';
  if (raw) {
    const j = extractJson(raw);
    if (j && Array.isArray(j.messages)) { blocks = toBlocks(j.messages); needsHuman = !!j.needs_human; reason = j.reason || ''; }
    else if (j && typeof j.reply === 'string') { blocks = toBlocks(j.reply); needsHuman = !!j.needs_human; reason = j.reason || ''; }
    else if (j && typeof j.text === 'string') { blocks = toBlocks(j.text); needsHuman = !!j.needs_human; reason = j.reason || ''; }
    else {
      // Not JSON we recognize — treat as plain text, but never leak JSON scaffolding.
      const looksJson = /^\s*\{[\s\S]*"(messages|reply|needs_human)"/.test(raw);
      blocks = looksJson ? [] : toBlocks(raw);
      if (!blocks.length) { needsHuman = true; reason = reason || 'ระบบอ่านคำตอบ AI ไม่สำเร็จ ลองกด “ร่างใหม่”'; }
    }
    reply = blocks.join('\n\n');
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
    blocks = toBlocks(reply);
    reply = blocks.join('\n\n');
  }
  // More data on hand ⇒ higher confidence; needs-human stays low.
  const dataBoost = (orders.length ? 0.15 : 0) + (products.length ? 0.1 : 0) + (matched ? 0.1 : 0);
  const confidence = needsHuman ? 0.3 : Math.min(0.96, 0.5 + topSim * 0.35 + dataBoost);
  void customerName;
  const used: string[] = [];
  if (visionDesc && images.length) used.push(`อ่านรูปที่ลูกค้าส่ง ${images.length} รูป`);
  if (referencedProducts.length) used.push(`สินค้าที่ลูกค้าส่งการ์ด ${referencedProducts.length} รายการ`);
  if (orders.length) used.push(`ออเดอร์ลูกค้า ${orders.length} รายการ`);
  if (products.length) used.push(`สินค้าในร้าน ${products.length} รายการ`);
  if (matched) used.push(`ฉาก “${matched.scenario.title}”`);
  if (contextDocs.length) used.push(`คลังความรู้ ${contextDocs.length} หัวข้อ`);
  // Offer both the products the buyer referenced (cards they sent) and catalog matches.
  const suggest = [...referencedProducts, ...products]
    .filter((p: any, i: number, a: any[]) => p?.item_id && a.findIndex((x: any) => x.item_id === p.item_id) === i)
    .slice(0, 4)
    .map((p: any) => ({ item_id: p.item_id, item_name: p.item_name, price: p.price, image_url: p.image_url, in_stock: p.in_stock }));

  // How-to case: find a REAL tutorial video (KB link first, then YouTube search)
  // for the product being discussed. Only when the customer is clearly asking how
  // to USE it — light questions get a normal typed reply, no video. Never fabricated.
  const prodName = (referencedProducts[0]?.item_name || products[0]?.item_name || orderedName || suggest[0]?.item_name || '')
    .replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  let brandSlug: string | null = null;
  let brandName: string | null = null;
  if (brand_id) { const { data } = await sb.from('brands').select('slug,name').eq('id', brand_id).maybeSingle(); brandSlug = (data as any)?.slug || null; brandName = (data as any)?.name || null; }

  let tutorialVideos: TutorialVideo[] = [];
  if (HOWTO_RE.test(topicText)) {
    tutorialVideos = await resolveTutorial({ brandId: brand_id, brandSlug, productName: prodName || null, keywords: topicText.slice(0, 120) }).catch(() => []);
    if (tutorialVideos.length) used.push(`คลิปสอนใช้งาน (${tutorialVideos[0].source === 'kb' ? 'จาก KB' : 'YouTube'})`);
  }

  // Pre-read product images (spec sheets / how-to) the admin can SEND — surface when
  // the customer asks about a product / how-to / spec. Instant (no vision at reply time).
  let mediaSuggestions: ProductMediaItem[] = [];
  if (productish || howish || specish) {
    const modelNames = [prodName, orderedName, ...referencedProducts.map((p: any) => p.item_name), ...products.map((p: any) => p.item_name)]
      .filter(Boolean).map(String);
    mediaSuggestions = findProductMedia({ brandSlug, brandName, query: topicText, models: modelNames, limit: 4 });
    if (mediaSuggestions.length) used.push(`รูปข้อมูลสินค้า ${mediaSuggestions.length} รูป`);
  }

  return {
    text: reply,
    blocks,
    sources: contextDocs.map(d => ({ id: d.id, title: d.title })),
    confidence,
    intent: 'draft',
    handoff: needsHuman,
    needsHuman,
    reason,
    usedExamples: examples.length,
    used,
    // Real products to offer/send (buyer-referenced first, then catalog matches).
    suggestedProducts: suggest,
    // Real how-to video(s) to send when the customer can't use the product.
    tutorialVideos,
    // Pre-read brand images (spec sheets / how-to) the admin can send in one tap.
    mediaSuggestions,
    sawImage: images.length > 0,
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
