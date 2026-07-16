import { createAdminClient } from '@/lib/supabase/admin';

// ============================================================
// Tutorial-video finder for the AI reply draft. When a customer can't work out
// how to USE a product, we surface a REAL how-to video the admin can send.
//
// HARD RULE: never fabricate a link. Sources are, in order:
//   1) a curated YouTube link in the brand's Knowledge Base (admin-controlled)
//   2) the YouTube Data API (real search results) — only if YOUTUBE_API_KEY set
// If neither yields a link, we return nothing (the admin just types a reply).
// ============================================================

export interface TutorialVideo {
  title: string;
  url: string;
  thumbnail: string | null;
  channel: string | null;
  source: 'kb' | 'youtube';
}

const YT_RE = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i;

/** Pull the first real YouTube URL out of arbitrary text (or null). */
export function extractYouTube(text: string | null | undefined): string | null {
  const m = (text || '').match(YT_RE);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : null;
}

export const youtubeConfigured = () => Boolean(process.env.YOUTUBE_API_KEY);

/** KB-first: find a curated tutorial link in this brand's (or global) KB docs. */
export async function findKbTutorial(brandId: string | null, keywords: string): Promise<TutorialVideo | null> {
  const sb = createAdminClient();
  // Only rows that actually contain a YouTube link — cheap, tiny result set.
  const { data } = await sb.from('knowledge_base')
    .select('title, content, brand_id')
    .or('content.ilike.*youtu*,title.ilike.*youtu*')
    .limit(200);
  if (!data?.length) return null;

  const words = keywords.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let best: TutorialVideo | null = null;
  let bestScore = -1;
  for (const d of data as any[]) {
    if (d.brand_id != null && d.brand_id !== brandId) continue;   // brand-scoped or global only
    const url = extractYouTube(d.content) || extractYouTube(d.title);
    if (!url) continue;
    const hay = `${d.title || ''} ${d.content || ''}`.toLowerCase();
    let score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    if (d.brand_id === brandId) score += 2;                        // prefer exact-brand docs
    if (score > bestScore) {
      bestScore = score;
      best = { title: (d.title || 'วิดีโอสอนใช้งาน').slice(0, 120), url, thumbnail: null, channel: null, source: 'kb' };
    }
  }
  return bestScore >= 1 ? best : null;   // require at least some topical relevance
}

const ytCache = new Map<string, { t: number; v: TutorialVideo[] }>();
const YT_TTL = 6 * 3600_000;

function officialRank(v: TutorialVideo, brand: string): number {
  const c = (v.channel || '').toLowerCase();
  let s = 0;
  if (brand && c.includes(brand)) s += 3;
  if (/official|thailand|thai|ประเทศไทย/.test(c)) s += 1;
  return s;
}

/** Real YouTube search (Data API v3). Returns [] when no key / on any error. */
export async function searchTutorialVideos(query: string, opts: { brand?: string; max?: number } = {}): Promise<TutorialVideo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !query.trim()) return [];
  const q = `${query} วิธีใช้ how to`.trim();
  const ck = q.toLowerCase();
  const hit = ytCache.get(ck);
  if (hit && Date.now() - hit.t < YT_TTL) return hit.v;

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${opts.max || 4}`
    + `&safeSearch=strict&relevanceLanguage=th&q=${encodeURIComponent(q)}&key=${key}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    const vids: TutorialVideo[] = ((j.items as any[]) || [])
      .filter(it => it?.id?.videoId)
      .map(it => ({
        title: (it.snippet?.title || 'วิดีโอสอนใช้งาน') as string,
        url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
        thumbnail: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || null,
        channel: it.snippet?.channelTitle || null,
        source: 'youtube' as const,
      }));
    if (opts.brand) {
      const b = opts.brand.toLowerCase();
      vids.sort((a, c) => officialRank(c, b) - officialRank(a, b));
    }
    ytCache.set(ck, { t: Date.now(), v: vids });
    return vids;
  } catch { return []; }
}

/** KB link first; otherwise a real YouTube search. Empty ⇒ no reliable link. */
export async function resolveTutorial(opts: {
  brandId: string | null; brandSlug?: string | null; productName?: string | null; keywords: string;
}): Promise<TutorialVideo[]> {
  const kb = await findKbTutorial(opts.brandId, [opts.productName, opts.keywords].filter(Boolean).join(' ')).catch(() => null);
  if (kb) return [kb];
  const q = [opts.brandSlug, opts.productName].filter(Boolean).join(' ').trim() || opts.keywords;
  return searchTutorialVideos(q, { brand: opts.brandSlug || undefined, max: 3 }).catch(() => []);
}
