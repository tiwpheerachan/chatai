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

const hay = (m: ProductMediaItem) =>
  `${m.title} ${m.category || ''} ${m.brandLabel} ${m.keywords.join(' ')} ${m.models.join(' ')} ${m.summary} ${m.text}`.toLowerCase();

// Precompute haystacks once.
const HAY = new Map<number, string>();
for (const m of ITEMS) HAY.set(m.id, hay(m));

export interface MediaMatch { brandSlug?: string | null; brandName?: string | null; query: string; models?: string[]; topic?: string | null; limit?: number }

// Split on anything that isn't a letter/number/combining-mark. Keeping \p{M}
// (Thai vowel/tone marks) means words like "หูฟัง" stay whole instead of breaking
// into single consonants — critical for Thai substring matching.
const TOK = /[^\p{L}\p{N}\p{M}]+/u;

export function findProductMedia(opts: MediaMatch): ProductMediaItem[] {
  const q = (opts.query || '').toLowerCase();
  const tokens = [...new Set(q.split(TOK).map(t => t.trim()).filter(t => t.length >= 2))].slice(0, 14);
  const models = [...new Set((opts.models || []).flatMap(m => (m || '').toLowerCase().split(TOK)).map(t => t.trim()).filter(t => t.length >= 2))].slice(0, 12);
  const brandName = (opts.brandName || '').toLowerCase();

  if (!tokens.length && !models.length) return [];

  const scored: { m: ProductMediaItem; s: number }[] = [];
  for (const m of ITEMS) {
    const h = HAY.get(m.id)!;
    let s = 0;
    // brand
    if (opts.brandSlug && m.brand === opts.brandSlug) s += 3;
    else if (brandName && h.includes(brandName)) s += 1;
    // known product models (strong signal)
    for (const mod of models) if (h.includes(mod)) s += 3;
    // free-text query tokens
    let tokHits = 0;
    for (const t of tokens) if (h.includes(t)) { s += 1; tokHits += 1; }
    // topic preference (once vision has classified)
    if (opts.topic && m.topic === opts.topic) s += 1;
    // Require a real signal: a model hit, or ≥2 query tokens, or brand+1 token.
    const strong = models.some(mod => h.includes(mod)) || tokHits >= 2 || (s >= 3 && tokHits >= 1);
    if (strong) scored.push({ m, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, opts.limit ?? 4).map(x => x.m);
}

/** Simple browse/search for the media library UI. */
export function searchProductMedia(query: string, brandSlug?: string | null, limit = 30): ProductMediaItem[] {
  const q = (query || '').trim().toLowerCase();
  const tokens = q.split(TOK).map(t => t.trim()).filter(t => t.length >= 2);
  const scored: { m: ProductMediaItem; s: number }[] = [];
  for (const m of ITEMS) {
    if (brandSlug && m.brand && m.brand !== brandSlug) continue;
    const h = HAY.get(m.id)!;
    let s = 0;
    for (const t of tokens) if (h.includes(t)) s += 1;
    if (!tokens.length || s > 0) scored.push({ m, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(x => x.m);
}
