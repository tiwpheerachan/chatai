import MEDIA from '@/data/product-media.json';

// ============================================================
// Product media library (#): brand spec sheets / comparison tables / how-to
// images the AI "pre-read", so at reply time it can INSTANTLY suggest the right
// image for the admin to SEND to the customer (Shopee needs the actual image).
//
// Matching is in-memory over ~300 items (tiny). It scores each image by brand +
// how many of the query/model tokens appear in its text (title, folder category,
// keywords, and — once the vision pass has run — the AI summary/spec text/models).
// ============================================================

export interface ProductMediaItem {
  id: number; brand: string | null; brandLabel: string; category: string | null;
  title: string; url: string; type: string; keywords: string[];
  topic: string | null; models: string[]; summary: string; text: string;
}

const ITEMS = (MEDIA as ProductMediaItem[]).filter(m => m.type === 'image' && m.url);

/** All public URLs we host — used to authorize the send-media endpoint. */
export function isOwnedMediaUrl(url: string): boolean {
  return ITEMS.some(m => m.url === url);
}

// Split on anything that isn't a letter/number/combining-mark. Keeping \p{M}
// (Thai vowel/tone marks) means words like "หูฟัง" stay whole instead of breaking
// into single consonants — critical for Thai substring matching.
const TOK = /[^\p{L}\p{N}\p{M}]+/u;
const toTokens = (s: string, min = 2) => [...new Set((s || '').toLowerCase().split(TOK).map(t => t.trim()).filter(t => t.length >= min))];

const hay = (m: ProductMediaItem) =>
  `${m.title} ${m.category || ''} ${m.brandLabel} ${m.keywords.join(' ')} ${m.models.join(' ')} ${m.summary} ${m.text}`.toLowerCase();

// Precompute per item: the haystack string (for forward substring match) AND the
// item's own significant words (for REVERSE match — needed because Thai queries
// often have no spaces, e.g. "หูฟังกันน้ำว่ายน้ำได้" is one token, but the image's
// word "กันน้ำ" is a substring of it).
const HAY = new Map<number, string>();
const WORDS = new Map<number, string[]>();
const BRANDWORDS = new Map<number, Set<string>>();
for (const m of ITEMS) {
  HAY.set(m.id, hay(m));
  // Words from the concise, relevant fields (not the long spec text → avoids noise).
  WORDS.set(m.id, toTokens(`${m.title} ${m.category || ''} ${m.models.join(' ')} ${m.summary} ${m.keywords.join(' ')}`, 3).slice(0, 60));
  BRANDWORDS.set(m.id, new Set(toTokens(`${m.brandLabel} ${m.brand || ''}`)));
}

export interface MediaMatch { brandSlug?: string | null; brandName?: string | null; query: string; models?: string[]; topic?: string | null; limit?: number }

export function findProductMedia(opts: MediaMatch): ProductMediaItem[] {
  const q = (opts.query || '').toLowerCase();
  const tokens = toTokens(q).slice(0, 16);
  const models = [...new Set((opts.models || []).flatMap(m => toTokens(m)))].slice(0, 12);
  const brandName = (opts.brandName || '').toLowerCase();
  if (!tokens.length && !models.length) return [];

  const scored: { m: ProductMediaItem; s: number }[] = [];
  for (const m of ITEMS) {
    const h = HAY.get(m.id)!;
    const brandWords = BRANDWORDS.get(m.id)!;
    let s = 0, content = 0;

    // Cross-brand = the conversation's brand is known and this item belongs to a
    // DIFFERENT specific brand (null-brand items like Xiaomi/global are shared).
    const crossBrand = !!(opts.brandSlug && m.brand && m.brand !== opts.brandSlug);

    // Brand: a booster, NOT counted as content relevance.
    if (opts.brandSlug && m.brand === opts.brandSlug) s += 3;
    else if (brandName && h.includes(brandName)) s += 1;
    if (crossBrand) s -= 2;   // downrank other brands' images

    // Known product models (strongest signal).
    for (const mod of models) if (h.includes(mod)) { s += 3; content += 1; }

    // Forward: query tokens found in the haystack (skip pure brand words so brand
    // alone can't fake relevance).
    for (const t of tokens) if (!brandWords.has(t) && h.includes(t)) { s += 1; content += 1; }

    // Reverse: the image's own words found inside the (possibly space-less) query.
    for (const w of WORDS.get(m.id)!) if (!brandWords.has(w) && q.includes(w)) { s += 1.2; content += 1; }

    if (opts.topic && m.topic === opts.topic) s += 1;

    // Require real relevance beyond brand; cross-brand items need a stronger signal
    // (a model hit or ≥2 content hits) so an unrelated brand's image can't leak in.
    const minContent = crossBrand ? 2 : 1;
    if (content >= minContent) scored.push({ m, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, opts.limit ?? 4).map(x => x.m);
}

/** Simple browse/search for the media library UI. */
export function searchProductMedia(query: string, brandSlug?: string | null, limit = 30): ProductMediaItem[] {
  const q = (query || '').trim().toLowerCase();
  const tokens = toTokens(q);
  const scored: { m: ProductMediaItem; s: number }[] = [];
  for (const m of ITEMS) {
    if (brandSlug && m.brand && m.brand !== brandSlug) continue;
    const h = HAY.get(m.id)!;
    let s = 0;
    for (const t of tokens) if (h.includes(t)) s += 1;                      // forward
    for (const w of WORDS.get(m.id)!) if (q.includes(w)) s += 1;            // reverse (Thai no-space)
    if (!tokens.length || s > 0) scored.push({ m, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(x => x.m);
}
