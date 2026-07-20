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

export interface MetaPage { id: string; name: string; access_token: string; category?: string }

let pageCache: { t: number; v: MetaPage[] } | null = null;
const PAGE_TTL = 60 * 60_000; // 1h — page tokens are long-lived

/** All pages the system user manages (id + name + page token). Cached 1h. */
export async function getPages(force = false): Promise<MetaPage[]> {
  const tok = sysToken();
  if (!tok) return [];
  if (!force && pageCache && Date.now() - pageCache.t < PAGE_TTL) return pageCache.v;
  const out: MetaPage[] = [];
  let url = `${GRAPH}/me/accounts?fields=id,name,access_token,category&limit=100&access_token=${encodeURIComponent(tok)}`;
  for (let i = 0; i < 10 && url; i++) {
    const r = await fetch(url);
    if (!r.ok) break;
    const j = await r.json();
    out.push(...((j.data as MetaPage[]) || []));
    url = j.paging?.next || '';
  }
  if (out.length) pageCache = { t: Date.now(), v: out };
  return out;
}

export async function pageTokenById(pageId: string): Promise<string | null> {
  const p = (await getPages()).find(x => x.id === pageId);
  return p?.access_token || null;
}

/** Resolve the page token to reply through for a conversation's brand + channel. */
export async function pageTokenForBrand(brandId: string | null, type: 'facebook' | 'instagram' = 'facebook'): Promise<string | null> {
  if (!brandId) return null;
  const { data } = await createAdminClient()
    .from('channels').select('credentials').eq('brand_id', brandId).eq('type', type).eq('status', 'connected').limit(1).maybeSingle();
  const pageId = (data as any)?.credentials?.page_id;
  return pageId ? pageTokenById(String(pageId)) : null;
}

/** Which Nexus brand a page is connected to (webhook routing). */
export async function brandForPage(pageId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('channels').select('brand_id').filter('credentials->>page_id', 'eq', pageId).limit(1).maybeSingle();
  return (data as any)?.brand_id || null;
}

/** The customer's real display name + avatar (page-scoped id). Best-effort. */
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
