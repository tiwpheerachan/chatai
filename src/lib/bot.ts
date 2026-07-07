import OpenAI from 'openai';
import { createAdminClient } from './supabase/admin';
import { retrieve, type RetrievedDoc } from './rag';
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
  const provider = process.env.LLM_PROVIDER || 'mock';
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

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
          model: model.startsWith('claude') ? model : 'claude-sonnet-4-6',
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
