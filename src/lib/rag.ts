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

  // Keyword fallback
  let q = sb.from('knowledge_base').select('id,title,content,tags');
  if (opts.brand_id) q = q.or(`brand_id.eq.${opts.brand_id},brand_id.is.null`);
  const { data } = await q;
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const scored = (data || []).map(d => {
    const text = (d.title + ' ' + d.content + ' ' + (d.tags || []).join(' ')).toLowerCase();
    const hits = tokens.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
    return { ...d, similarity: hits / Math.max(tokens.length, 1) };
  });
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k) as RetrievedDoc[];
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
