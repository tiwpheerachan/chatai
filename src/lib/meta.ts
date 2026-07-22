import { createAdminClient } from '@/lib/supabase/admin';

// ============================================================
// Meta (Facebook/Instagram) multi-brand messaging.
//
// One System-User token (META_SYSTEM_USER_TOKEN) can read ALL the business's
// pages via /me/accounts, each with its own long-lived PAGE token. We keep only
// that one token in env and derive per-page tokens on demand (cached), instead
// of storing 14 page tokens in the DB.
//
// The page → brand mapping lives in the existing `channels` table:
//   { type:'facebook', brand_id, name:<page name>, credentials:{page_id}, status }
// ============================================================

const GRAPH = 'https://graph.facebook.com/v21.0';
const sysToken = () => process.env.META_SYSTEM_USER_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || '';
export const metaConfigured = () => Boolean(sysToken());

export interface MetaPage { id: string; name: string; access_token: string; category?: string; ig_id?: string | null; ig_username?: string | null }

let pageCache: { t: number; v: MetaPage[] } | null = null;
const PAGE_TTL = 60 * 60_000; // 1h — page tokens are long-lived

/** All pages the system user manages (id + name + page token). Cached 1h. */
export async function getPages(force = false): Promise<MetaPage[]> {
  const tok = sysToken();
  if (!tok) return [];
  if (!force && pageCache && Date.now() - pageCache.t < PAGE_TTL) return pageCache.v;
  const out: MetaPage[] = [];
  // Also pull the linked Instagram business account (for IG DMs + comments).
  let url = `${GRAPH}/me/accounts?fields=id,name,access_token,category,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(tok)}`;
  for (let i = 0; i < 10 && url; i++) {
    const r = await fetch(url);
    if (!r.ok) break;
    const j = await r.json();
    for (const p of (j.data as any[]) || []) {
      out.push({ id: p.id, name: p.name, access_token: p.access_token, category: p.category, ig_id: p.instagram_business_account?.id || null, ig_username: p.instagram_business_account?.username || null });
    }
    url = j.paging?.next || '';
  }
  if (out.length) pageCache = { t: Date.now(), v: out };
  return out;
}

/** Page token by page id OR its linked Instagram account id (IG uses page token). */
export async function pageTokenById(id: string): Promise<string | null> {
  const p = (await getPages()).find(x => x.id === id || x.ig_id === id);
  return p?.access_token || null;
}

/** Resolve the page token to reply through for a conversation's brand. One page
 *  serves both FB + IG, so we look up the single channel row for the brand. */
export async function pageTokenForBrand(brandId: string | null, _type: 'facebook' | 'instagram' = 'facebook'): Promise<string | null> {
  if (!brandId) return null;
  const { data } = await createAdminClient()
    .from('channels').select('credentials').eq('brand_id', brandId).eq('type', 'facebook').eq('status', 'connected').limit(1).maybeSingle();
  const pageId = (data as any)?.credentials?.page_id;
  return pageId ? pageTokenById(String(pageId)) : null;
}

/** Which Nexus brand a page (or its IG account) is connected to — webhook routing.
 *  FB webhooks send the page id in entry.id; IG webhooks send the IG account id. */
export async function brandForPage(id: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('channels').select('brand_id')
    .or(`credentials->>page_id.eq.${id},credentials->>ig_id.eq.${id}`).limit(1).maybeSingle();
  return (data as any)?.brand_id || null;
}

/** The customer's real display name + avatar (page-scoped id). Best-effort — needs
 *  the user-profile capability (App Review); returns {} otherwise. */
export async function getSenderProfile(pageToken: string, psid: string): Promise<{ name?: string; pic?: string }> {
  try {
    const r = await fetch(`${GRAPH}/${psid}?fields=name,profile_pic&access_token=${encodeURIComponent(pageToken)}`);
    if (!r.ok) return {};
    const j = await r.json();
    return { name: j.name, pic: j.profile_pic };
  } catch { return {}; }
}

/** Subscribe a page to the app's messaging webhooks (needed to RECEIVE messages). */
export async function subscribePage(pageId: string, pageToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribed_fields: 'messages,messaging_postbacks,messaging_optins,message_reactions', access_token: pageToken }),
    });
    if (!r.ok) return { ok: false, error: (await r.text()).slice(0, 200) };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Send a text message to a customer through a specific page token. */
export async function sendMetaMessage(pageToken: string, recipientId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(pageToken)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text }, messaging_type: 'RESPONSE' }),
    });
    if (!r.ok) return { ok: false, error: (await r.text()).slice(0, 200) };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Send an IMAGE (by public URL) to a customer — Meta fetches the URL itself, so
 *  our public product-media URLs work directly (no byte upload like Shopee). */
export async function sendMetaImage(pageToken: string, recipientId: string, imageUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(pageToken)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { attachment: { type: 'image', payload: { url: imageUrl, is_reusable: true } } }, messaging_type: 'RESPONSE' }),
    });
    if (!r.ok) return { ok: false, error: (await r.text()).slice(0, 200) };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ---- Comments on posts (Facebook + Instagram) --------------------------------
export interface SocialComment {
  id: string; platform: 'facebook' | 'instagram';
  text: string; from: string | null; at: string | null;
  post_id: string; post_excerpt: string; replied: boolean;
}

/** The page + IG account behind a brand (token + ids). */
async function brandPage(brandId: string): Promise<{ pageId: string; igId: string | null; token: string } | null> {
  const { data } = await createAdminClient().from('channels').select('credentials').eq('brand_id', brandId).eq('type', 'facebook').eq('status', 'connected').limit(1).maybeSingle();
  const pageId = (data as any)?.credentials?.page_id;
  if (!pageId) return null;
  const token = await pageTokenById(String(pageId));
  if (!token) return null;
  return { pageId: String(pageId), igId: (data as any)?.credentials?.ig_id || null, token };
}

/** Recent comments across the brand's latest FB posts + IG media (newest first). */
export async function getBrandComments(brandId: string, opts: { posts?: number } = {}): Promise<SocialComment[]> {
  const bp = await brandPage(brandId);
  if (!bp) return [];
  const posts = opts.posts ?? 8;
  const out: SocialComment[] = [];
  // Facebook page posts + comments.
  try {
    const r = await fetch(`${GRAPH}/${bp.pageId}/published_posts?fields=id,message,comments.limit(30){id,message,from,created_time,comment_count}&limit=${posts}&access_token=${encodeURIComponent(bp.token)}`);
    const j = await r.json();
    for (const p of (j.data as any[]) || []) {
      for (const c of (p.comments?.data as any[]) || []) {
        out.push({ id: c.id, platform: 'facebook', text: c.message || '', from: c.from?.name || null, at: c.created_time || null, post_id: p.id, post_excerpt: (p.message || '(รูป/วิดีโอ)').slice(0, 50), replied: (c.comment_count || 0) > 0 });
      }
    }
  } catch { /* ignore */ }
  // Instagram media + comments.
  if (bp.igId) {
    try {
      const r = await fetch(`${GRAPH}/${bp.igId}/media?fields=id,caption,comments.limit(30){id,text,username,timestamp,replies}&limit=${posts}&access_token=${encodeURIComponent(bp.token)}`);
      const j = await r.json();
      for (const m of (j.data as any[]) || []) {
        for (const c of (m.comments?.data as any[]) || []) {
          out.push({ id: c.id, platform: 'instagram', text: c.text || '', from: c.username || null, at: c.timestamp || null, post_id: m.id, post_excerpt: (m.caption || '(รูป/วิดีโอ)').slice(0, 50), replied: !!(c.replies?.data?.length) });
        }
      }
    } catch { /* ignore */ }
  }
  out.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return out;
}

/** Reply to a comment (public reply under the post). */
export async function replyToComment(brandId: string, commentId: string, platform: 'facebook' | 'instagram', message: string): Promise<{ ok: boolean; error?: string }> {
  const bp = await brandPage(brandId);
  if (!bp) return { ok: false, error: 'ยังไม่ได้เชื่อมเพจของแบรนด์นี้' };
  const path = platform === 'instagram' ? `${GRAPH}/${commentId}/replies` : `${GRAPH}/${commentId}/comments`;
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, access_token: bp.token }) });
    if (!r.ok) return { ok: false, error: (await r.text()).slice(0, 200) };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ---- Page + Instagram insights (engagement / reach) --------------------------
export interface BrandInsights {
  fb: { name: string | null; fans: number | null; followers: number | null; reach28: number | null; engagement28: number | null };
  ig: { username: string | null; followers: number | null; media: number | null; reach28: number | null } | null;
}

async function gget(url: string): Promise<any> {
  try { const r = await fetch(url); const j = await r.json(); return j.error ? null : j; } catch { return null; }
}
// Sum a page-insights time series (best-effort — metrics change often).
function seriesLatest(ins: any, metric: string): number | null {
  const row = (ins?.data as any[] || []).find(d => d.name === metric);
  if (!row) return null;
  if (row.total_value?.value != null) return Number(row.total_value.value);
  const vals = (row.values as any[]) || [];
  const last = vals[vals.length - 1];
  return last?.value != null ? Number(last.value) : null;
}

export async function getBrandInsights(brandId: string): Promise<BrandInsights | null> {
  const bp = await brandPage(brandId);
  if (!bp) return null;
  const t = encodeURIComponent(bp.token);
  const [page, pins, ig, iins] = await Promise.all([
    gget(`${GRAPH}/${bp.pageId}?fields=name,fan_count,followers_count&access_token=${t}`),
    gget(`${GRAPH}/${bp.pageId}/insights?metric=page_impressions_unique,page_post_engagements&period=days_28&access_token=${t}`),
    bp.igId ? gget(`${GRAPH}/${bp.igId}?fields=username,followers_count,media_count&access_token=${t}`) : Promise.resolve(null),
    bp.igId ? gget(`${GRAPH}/${bp.igId}/insights?metric=reach&period=days_28&metric_type=total_value&access_token=${t}`) : Promise.resolve(null),
  ]);
  return {
    fb: {
      name: page?.name ?? null,
      fans: page?.fan_count ?? null,
      followers: page?.followers_count ?? null,
      reach28: seriesLatest(pins, 'page_impressions_unique'),
      engagement28: seriesLatest(pins, 'page_post_engagements'),
    },
    ig: bp.igId ? {
      username: ig?.username ?? null,
      followers: ig?.followers_count ?? null,
      media: ig?.media_count ?? null,
      reach28: seriesLatest(iins, 'reach'),
    } : null,
  };
}

// Auto-map a page name to a Nexus brand: strip "Thailand/Store/Official" noise,
// then match against brand name/slug. Returns brand_id or null.
const clean = (s: string) => s.toLowerCase().replace(/thailand|thai|official|offcial|store|จำกัด|\(.*?\)/g, '').replace(/[^a-z0-9ก-๙]+/g, '').trim();
export function suggestBrand(pageName: string, brands: { id: string; name: string; slug: string }[]): string | null {
  const p = clean(pageName);
  if (!p) return null;
  let best: { id: string; score: number } | null = null;
  for (const b of brands) {
    const nb = clean(b.name), sb = b.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    let score = 0;
    if (p === nb || p === sb) score = 3;
    else if (p.includes(sb) || sb.includes(p) || p.includes(nb) || nb.includes(p)) score = 2;
    if (score && (!best || score > best.score)) best = { id: b.id, score };
  }
  return best?.id || null;
}
