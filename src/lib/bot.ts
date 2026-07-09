import OpenAI from 'openai';
import { createAdminClient } from './supabase/admin';
import { retrieve, type RetrievedDoc } from './rag';
import { getPlaybook, matchScenario, type PlaybookScenario } from './playbook';
import type { Message } from '@/types/database';

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

async function callLLM(system: string, messages: { role: 'user' | 'assistant'; content: string }[]): Promise<string | null> {
  // Prefer the explicit LLM_PROVIDER, but if it's unset/mock, auto-pick whichever
  // API key is actually configured — so setting EITHER key in the host makes AI work.
  const configured = process.env.LLM_PROVIDER;
  const provider = configured && configured !== 'mock'
    ? configured
    : (process.env.OPENAI_API_KEY ? 'openai' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock');
  const model = process.env.LLM_MODEL || (provider === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'gpt-4o-mini');

  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const r = await openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.4,
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

/** Recent real agent replies for this brand, used as style/tone examples. */
async function getAdminStyleExamples(sb: ReturnType<typeof createAdminClient>, brandId: string | null, max = 12): Promise<string[]> {
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
  return out;
}

export interface DraftResult extends BotReply { needsHuman: boolean; reason?: string; usedExamples: number; }

export async function draftReply(opts: {
  userMessage: string;
  brand_id?: string | null;
  history?: Message[];
  customerName?: string;
}): Promise<DraftResult> {
  const { userMessage, brand_id = null, history = [], customerName = '' } = opts;
  const sb = createAdminClient();

  const [examples, docs, scenarios] = await Promise.all([
    getAdminStyleExamples(sb, brand_id),
    retrieve(userMessage, { brand_id, k: 3 }),
    getPlaybook(sb, brand_id).catch(() => [] as PlaybookScenario[]),
  ]);
  const contextDocs = docs.filter(d => d.similarity > 0.15).slice(0, 3);
  const topSim = docs[0]?.similarity || 0;

  // ---- Playbook: follow the admin-defined scenario/strategy if the question matches ----
  const matched = matchScenario(userMessage, scenarios);
  const strategies = (matched?.scenario.strategies || []).filter(s => s.enabled);
  const replyStrategies = strategies.filter(s => s.action === 'reply' && (s.response || '').trim());
  const onlyHandoff = strategies.length > 0 && replyStrategies.length === 0;
  let playbookBlock = '';
  if (matched && replyStrategies.length) {
    playbookBlock = `\n\n=== สคริปต์ที่ร้านกำหนดไว้สำหรับฉาก "${matched.scenario.title}" (ใช้เป็นคำตอบหลัก ปรับถ้อยคำเล็กน้อยให้เข้ากับลูกค้า เลือกอันที่ตรงเงื่อนไขที่สุด) ===\n${replyStrategies.map((s, i) => `${i + 1}. ${s.order_condition ? `[เงื่อนไข: ${s.order_condition}] ` : ''}${s.response}`).join('\n')}`;
  }
  // If the matched scenario is handoff-only → a human should take this.
  if (matched && onlyHandoff) {
    return {
      text: '', sources: [], confidence: 0.3, intent: 'playbook-handoff',
      handoff: true, needsHuman: true,
      reason: `ฉาก “${matched.scenario.title}” ตั้งไว้ให้โอนพนักงาน${strategies[0]?.label ? ` (${strategies[0].label})` : ''}`,
      usedExamples: examples.length,
    };
  }

  const styleBlock = examples.length
    ? `\n\n=== ตัวอย่างวิธีที่แอดมินตอบจริง (เลียนแบบโทน สำนวน ความยาว คำลงท้าย และอีโมจิแบบนี้) ===\n${examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
    : '';
  const kb = contextDocs.length
    ? `\n\n=== Knowledge Base (ใช้เป็นข้อเท็จจริงเท่านั้น) ===\n${contextDocs.map((d, i) => `[${i + 1}] ${d.title}\n${d.content}`).join('\n\n')}`
    : '';

  const system = `คุณเป็นผู้ช่วย "ร่าง" คำตอบให้แอดมินร้านค้าออนไลน์ — แอดมิน (คนจริง) จะเป็นผู้ตรวจและกดส่งเอง คุณไม่ได้ตอบแทนและห้ามส่งเอง
เป้าหมาย: ร่างคำตอบที่ฟังดูเป็นธรรมชาติเหมือนแอดมินคนนี้พิมพ์เอง (ไม่ใช่บอท) โดยเลียนแบบ "สไตล์" จากตัวอย่างจริงด้านล่าง
กติกา:
- ถ้ามี "สคริปต์ที่ร้านกำหนด" ด้านล่าง ให้ยึดตามนั้นเป็นหลัก (ปรับถ้อยคำได้เล็กน้อยให้เข้ากับลูกค้า)
- เลียนแบบสำนวน/โทน/ความยาว/คำลงท้าย/อีโมจิ จากตัวอย่าง แต่เนื้อหาต้องตรงกับคำถามจริงของลูกค้าตอนนี้
- ใช้ข้อมูลจาก Knowledge Base เป็นข้อเท็จจริงเท่านั้น ห้ามแต่งข้อมูล/ราคา/โปรขึ้นเอง
- ถ้าคำถามต้องใช้ข้อมูลเฉพาะที่คุณไม่มีจริง (เช็คสต็อกจริง สถานะออเดอร์รายบุคคล โปรที่ไม่มีใน KB ฯลฯ) ให้ตั้ง needs_human=true แล้วร่างเป็นข้อความสั้นๆ ขอเวลาตรวจสอบให้ ในโทนของแอดมิน
- ตอบเป็นภาษาเดียวกับลูกค้า${playbookBlock}${styleBlock}${kb}

ตอบกลับเป็น JSON อย่างเดียว: {"reply":"<ข้อความร่าง>","needs_human":true|false,"reason":"<เหตุผลสั้นๆ ภาษาไทย>"}`;

  const chatHistory = history.slice(-6).map(h => ({
    role: (h.sender_type === 'customer' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: h.text || '',
  }));
  chatHistory.push({ role: 'user', content: userMessage || '(ลูกค้าส่งรูป/สติกเกอร์/การ์ด)' });

  const raw = await callLLM(system, chatHistory);
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
    // No LLM configured (mock) or empty → degrade gracefully.
    if (replyStrategies.length) { reply = replyStrategies[0].response || ''; needsHuman = false; }   // use the playbook script verbatim
    else if (contextDocs.length) { reply = contextDocs[0].content.slice(0, 280); needsHuman = false; }
    else { needsHuman = true; reason = reason || 'ไม่มีข้อมูลพอให้ร่าง — ให้แอดมินตอบเอง'; }
  }
  const confidence = needsHuman ? 0.3 : Math.min(0.95, 0.55 + topSim * 0.4);
  void customerName;
  return {
    text: reply,
    sources: contextDocs.map(d => ({ id: d.id, title: d.title })),
    confidence,
    intent: 'draft',
    handoff: needsHuman,
    needsHuman,
    reason,
    usedExamples: examples.length,
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
