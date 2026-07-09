import { createAdminClient } from './supabase/admin';

export interface PlaybookStrategy {
  id: string;
  label: string | null;
  response: string | null;
  order_condition: string | null;
  action: 'reply' | 'handoff';
  enabled: boolean;
  sort: number;
}
export interface PlaybookScenario {
  id: string;
  brand_id: string | null;
  title: string;
  examples: string[];
  category: string | null;
  enabled: boolean;
  sort: number;
  strategies: PlaybookStrategy[];
}

/** All scenarios (+ their strategies) for a brand plus the global ones. */
export async function getPlaybook(sb: ReturnType<typeof createAdminClient>, brandId: string | null): Promise<PlaybookScenario[]> {
  let q = sb.from('reply_scenarios').select('*, strategies:reply_strategies(*)').order('sort', { ascending: true });
  // brand-specific OR global (brand_id is null)
  if (brandId) q = q.or(`brand_id.eq.${brandId},brand_id.is.null`);
  else q = q.is('brand_id', null);
  const { data } = await q;
  return ((data as any[]) || []).map((s) => ({
    ...s,
    examples: Array.isArray(s.examples) ? s.examples : [],
    strategies: (s.strategies || []).sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0)),
  }));
}

// ---- Thai-friendly fuzzy match (character bigram Dice coefficient) ----
function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}
function bigrams(s: string): Set<string> {
  const g = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
  return g;
}
function dice(a: string, b: string): number {
  const A = bigrams(norm(a)), B = bigrams(norm(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/**
 * Find the scenario whose example questions best match the buyer's message.
 * Returns null below the threshold (no confident match → let the LLM/KB handle it).
 */
export function matchScenario(question: string, scenarios: PlaybookScenario[], threshold = 0.34): { scenario: PlaybookScenario; score: number } | null {
  let best: { scenario: PlaybookScenario; score: number } | null = null;
  for (const s of scenarios) {
    if (!s.enabled) continue;
    let score = 0;
    for (const ex of s.examples) {
      const d = dice(question, ex);
      if (d > score) score = d;
      // also reward when the example is essentially contained in the question
      if (norm(question).includes(norm(ex)) && norm(ex).length >= 6) score = Math.max(score, 0.8);
    }
    if (score > (best?.score ?? 0)) best = { scenario: s, score };
  }
  return best && best.score >= threshold ? best : null;
}
