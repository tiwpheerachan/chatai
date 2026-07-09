import { createAdminClient } from './supabase/admin';
import OpenAI from 'openai';

/**
 * RAG layer — generates embeddings + retrieves top-K via pgvector.
 * Falls back to keyword search if no OPENAI_API_KEY.
 */
let openai: OpenAI | null = null;
function getOpenAI() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export async function embed(text: string): Promise<number[] | null> {
  const client = getOpenAI();
  if (!client) return null;
  try {
    const r = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return r.data[0].embedding;
  } catch (e) {
    console.warn('[RAG] embed failed', (e as Error).message);
    return null;
  }
}

export interface RetrievedDoc {
  id: string;
  title: string;
  content: string;
  tags: string[];
  similarity: number;
}

export async function retrieve(
  query: string,
  opts: { brand_id?: string | null; k?: number } = {},
): Promise<RetrievedDoc[]> {
  const sb = createAdminClient();
  const k = opts.k || 3;

  const queryEmbedding = await embed(query);

  // Vector similarity path
  if (queryEmbedding) {
    const { data, error } = await sb.rpc('match_kb', {
      query_embedding: queryEmbedding as unknown as string,
      match_count: k,
      filter_brand_id: opts.brand_id || null,
    });
    if (!error && data) return data as RetrievedDoc[];
  }

  // Keyword fallback — Thai-friendly (no OpenAI embeddings). Thai has no word
  // spaces, so space-tokenising fails; use character-bigram overlap (Dice) against
  // the title + content, plus a substring bonus when the whole query appears.
  let q = sb.from('knowledge_base').select('id,title,content,tags');
  if (opts.brand_id) q = q.or(`brand_id.eq.${opts.brand_id},brand_id.is.null`);
  const { data } = await q;
  const nq = kwNorm(query);
  const qg = kwBigrams(nq);
  const scored = (data || []).map(d => {
    const title = kwNorm(d.title);
    const content = kwNorm(d.content).slice(0, 600);
    let sim = Math.max(kwDice(qg, kwBigrams(title)), kwDice(qg, kwBigrams(content)));
    if (nq.length >= 4 && (title.includes(nq) || content.includes(nq))) sim = Math.max(sim, 0.6);
    // reward when significant title words appear in the query (e.g. "อะไหล่")
    if (title && nq.length >= 4 && (nq.includes(title) || title.includes(nq.slice(0, 8)))) sim = Math.max(sim, 0.5);
    return { ...d, similarity: sim };
  });
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k) as RetrievedDoc[];
}

function kwNorm(s: string): string { return (s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ''); }
function kwBigrams(s: string): Set<string> { const g = new Set<string>(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; }
function kwDice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return (2 * inter) / (a.size + b.size);
}

export async function upsertDocument(opts: {
  title: string;
  content: string;
  brand_id?: string | null;
  tags?: string[];
  source?: string;
}) {
  const sb = createAdminClient();
  const embedding = await embed(`${opts.title}\n${opts.content}`);
  const { data, error } = await sb
    .from('knowledge_base')
    .insert({
      title: opts.title,
      content: opts.content,
      brand_id: opts.brand_id || null,
      tags: opts.tags || [],
      source: opts.source || null,
      embedding,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}
