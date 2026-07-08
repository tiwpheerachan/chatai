/**
 * Sync engine: pulls Shopee chat from the api-center proxy into Supabase
 * (customers / conversations / messages) so the unified inbox reads from the DB
 * and updates via Supabase Realtime — no re-pulling the live API on every view.
 *
 * Server-only (uses the service-role admin client, bypasses RLS).
 *
 * Design notes:
 * - Shopee's conversation list is a FORWARD cursor (oldest→newest). We persist
 *   the cursor per shop in `chat_shops.sync_cursor` and advance a bounded number
 *   of pages per run, so repeated runs incrementally catch a shop up to newest.
 * - NO AI: synced conversations are created with ai_handling = false. This engine
 *   never generates or sends a reply. It only reads + persists.
 * - Rate limits: chat_read is 120/min per key; we space read calls ~350ms.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { messageSnippet } from '@/lib/conversations';
import { listShops, listConversations, getMessages, getOneConversation } from './client';

// Upstream brand slug → pretty display name (matches the inbox brand dock labels
// so brandIcon()/filtering line up). Unknown slugs fall back to a title-cased slug.
const BRAND_DISPLAY: Record<string, string> = {
  '70mai': '70mai',
  anker: 'Anker',
  ddpai: 'DDpai',
  dreame: 'Dreame',
  jimmy: 'Jimmy',
  levoit: 'Levoit',
  mibro: 'Mibro',
  mova: 'Mova',
  soundcore: 'Soundcore',
  thaimall: 'Thaimall',
  toptoy: 'Toptoy',
  vinko: 'Vinko',
  wanbo: 'Wanbo',
  xiaomi_ha: 'Xiaomi Home Appliances',
  xiaomi_mg: 'Xiaomi MG',
  xiaomi_sa: 'Xiaomi Smart App',
  zepp: 'Zepp',
};

function brandDisplayName(slug: string | null | undefined): string {
  if (!slug) return 'Unknown';
  return BRAND_DISPLAY[slug] || slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const NANO = 1_000_000_000; // ns per second
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const READ_SPACING_MS = 350; // stay well under 120 reads/min

type Admin = ReturnType<typeof createAdminClient>;

// ---- brand resolution (cache within a run) ----

async function resolveBrandId(sb: Admin, slug: string | null, cache: Map<string, string>): Promise<string | null> {
  if (!slug) return null;
  if (cache.has(slug)) return cache.get(slug)!;

  const name = brandDisplayName(slug);
  const { data: existing } = await sb.from('brands').select('id').eq('slug', slug).maybeSingle();
  if (existing?.id) { cache.set(slug, existing.id); return existing.id; }

  const { data: created } = await sb
    .from('brands')
    .insert({ name, slug, platform: 'shopee' })
    .select('id')
    .maybeSingle();
  if (created?.id) { cache.set(slug, created.id); return created.id; }

  // Race / unique conflict — re-read.
  const { data: again } = await sb.from('brands').select('id').eq('slug', slug).maybeSingle();
  if (again?.id) cache.set(slug, again.id);
  return again?.id ?? null;
}

// ---- shop directory ----

/** Refresh the chat_shops directory from the live shop list (Shopee). */
export async function syncShops(): Promise<{ shops: number }> {
  const sb = createAdminClient();
  const brandCache = new Map<string, string>();
  const shops = await listShops('shopee');

  for (const s of shops) {
    const brandId = await resolveBrandId(sb, s.brand_id, brandCache);
    const { data: existing } = await sb.from('chat_shops').select('shop_id').eq('shop_id', s.shop_id).maybeSingle();
    if (existing) {
      await sb.from('chat_shops').update({
        platform: 'shopee', brand_slug: s.brand_id, brand_id: brandId, shop_name: s.shop_name,
      }).eq('shop_id', s.shop_id);
    } else {
      await sb.from('chat_shops').insert({
        shop_id: s.shop_id, platform: 'shopee', brand_slug: s.brand_id, brand_id: brandId, shop_name: s.shop_name,
      });
    }
  }
  return { shops: shops.length };
}

// ---- message content mapping ----

interface MappedMsg { text: string | null; message_type: string; attachments: unknown[]; }

function mapContent(m: any): MappedMsg {
  const type = String(m?.message_type || m?.type || 'text');
  const c = m?.content || {};
  switch (type) {
    case 'text':
      return { text: c.text ?? m.plaintext ?? null, message_type: 'text', attachments: [] };
    case 'image':
      return { text: null, message_type: 'image', attachments: [{ type: 'image', url: c.url, thumb_url: c.thumb_url || c.url, width: c.thumb_width, height: c.thumb_height }] };
    case 'video':
      return { text: null, message_type: 'video', attachments: [{ type: 'video', url: c.video_url }] };
    case 'sticker':
      return { text: null, message_type: 'sticker', attachments: [{ type: 'sticker', url: c.image_url, sticker_id: c.sticker_id, sticker_package_id: c.sticker_package_id }] };
    case 'item':
      return { text: null, message_type: 'item', attachments: [{ type: 'item', item_id: c.item_id, shop_id: c.shop_id }] };
    case 'order':
      return { text: null, message_type: 'order', attachments: [{ type: 'order', order_sn: c.order_sn }] };
    default:
      return { text: c.text ?? null, message_type: type, attachments: c && Object.keys(c).length ? [{ type, raw: c }] : [] };
  }
}

// ---- latest-message preview (from the conversation-list payload; no extra API call) ----

async function insertLatestFromList(sb: Admin, dbConvId: string, c: any): Promise<number> {
  const extId = c.latest_message_id ? String(c.latest_message_id) : null;
  if (!extId) return 0;
  const { data: seen } = await sb.from('messages').select('id').eq('external_id', extId).maybeSingle();
  if (seen) return 0;

  const mapped = mapContent({ message_type: c.latest_message_type, content: c.latest_message_content });
  // Buyer messages carry from_id === conversation.to_id; anything else is the shop/agent.
  const fromBuyer = String(c.latest_message_from_id) === String(c.to_id);
  const { error } = await sb.from('messages').insert({
    conversation_id: dbConvId,
    external_id: extId,
    sender_type: fromBuyer ? 'customer' : 'agent',
    message_type: mapped.message_type,
    text: mapped.text,
    attachments: mapped.attachments,
    metadata: { platform: 'shopee', from_list: true },
    created_at: c.last_message_timestamp ? new Date(Number(c.last_message_timestamp) / NANO * 1000).toISOString() : new Date().toISOString(),
  });
  return error ? 0 : 1;
}

// ---- per-conversation message sync (full thread, used on-demand) ----

async function syncMessages(
  sb: Admin,
  shopId: string,
  dbConvId: string,
  extConvId: string,
  sinceTs: number,        // unix seconds; stop paging older than this
  maxPages: number,
): Promise<number> {
  let pageToken: string | undefined;
  let inserted = 0;

  for (let page = 0; page < maxPages; page++) {
    const res = await getMessages('shopee', shopId, extConvId, { pageSize: 50, pageToken });
    await sleep(READ_SPACING_MS);
    const msgs: any[] = Array.isArray(res?.messages) ? res.messages : [];
    if (!msgs.length) break;

    // dedup: skip external_ids already stored
    const extIds = msgs.map(m => String(m.message_id)).filter(Boolean);
    const { data: seen } = await sb.from('messages').select('external_id').in('external_id', extIds);
    const seenSet = new Set((seen || []).map((r: any) => r.external_id));

    const rows = msgs
      .filter(m => m.message_id && !seenSet.has(String(m.message_id)))
      .map(m => {
        const mapped = mapContent(m);
        const fromSeller = String(m.from_shop_id) === String(shopId);
        return {
          conversation_id: dbConvId,
          external_id: String(m.message_id),
          sender_type: fromSeller ? 'agent' : 'customer',
          message_type: mapped.message_type,
          text: mapped.text,
          attachments: mapped.attachments,
          metadata: { source: m.source ?? null, status: m.status ?? null, source_content: m.source_content ?? null, platform: 'shopee' },
          created_at: m.created_timestamp ? new Date(Number(m.created_timestamp) * 1000).toISOString() : new Date().toISOString(),
        };
      });

    if (rows.length) {
      const { error } = await sb.from('messages').insert(rows);
      if (!error) inserted += rows.length;
    }

    // Messages come newest→oldest. Stop once the oldest on this page predates the window.
    const oldest = msgs[msgs.length - 1];
    const oldestTs = Number(oldest?.created_timestamp || 0);
    const next = (res?.page_result as any)?.next_offset;
    if (oldestTs && oldestTs < sinceTs) break;
    if (!next || String(next) === '0') break;
    pageToken = String(next);
  }
  return inserted;
}

// ---- per-shop conversation sync ----

export interface SyncShopResult {
  shop_id: string;
  brand: string | null;
  conversations: number;
  messages: number;
  caught_up: boolean;
  pages: number;
}

/**
 * Advance a shop's forward cursor by up to `maxPages` conversation pages,
 * persisting conversations + their recent messages. Resumes from the stored cursor.
 *
 * Go-live model: we do NOT backfill years of history. On a shop's first sync we
 * seed the cursor at (now − sinceDays) using the platform's time-seek cursor, then
 * only ever move forward. Everything from that baseline onward is kept in our DB;
 * older history is never pulled. `sinceDays` is the initial look-back on day one.
 */
export async function syncShop(
  shopId: string,
  opts: { maxPages?: number; sinceDays?: number; maxMsgPagesPerConv?: number; reseekDays?: number } = {},
): Promise<SyncShopResult> {
  const sb = createAdminClient();
  const maxPages = opts.maxPages ?? 3;
  const sinceDays = opts.sinceDays ?? 7;
  const brandCache = new Map<string, string>();

  const { data: shop } = await sb.from('chat_shops').select('*').eq('shop_id', shopId).maybeSingle();
  const brandSlug: string | null = shop?.brand_slug ?? null;
  const brandId = await resolveBrandId(sb, brandSlug, brandCache);

  // Go-live baseline: on a shop's FIRST sync, seek the cursor to (now − sinceDays)
  // via the platform's time-seek cursor; thereafter resume from the SAVED cursor and
  // only move forward. The baseline is captured in the initial cursor itself — no
  // separate column needed. (An earlier version wrote a `sync_started_at` column that
  // doesn't exist, which made the whole chat_shops UPDATE fail and the cursor never
  // persist → sync kept re-reading the same window. Fixed by dropping that field.)
  const nowMs = Date.now();
  const baselineMs = nowMs - sinceDays * 86400 * 1000;
  let cursor: string | undefined = shop?.sync_cursor || undefined;
  if (opts.reseekDays != null) {
    // Recent-first mode: ALWAYS seek to (now − reseekDays) and walk to the newest,
    // so the latest chats are captured every run (instead of slowly filling the
    // backlog oldest-first and reaching "now" last).
    cursor = String((nowMs - opts.reseekDays * 86400 * 1000) * 1_000_000);
  } else if (!cursor) {
    cursor = String(baselineMs * 1_000_000); // ms → ns
  }
  let convCount = 0;
  let msgCount = 0;
  let caughtUp = shop?.caught_up ?? false;
  let pagesWalked = 0;

  for (let page = 0; page < maxPages; page++) {
    const res = await listConversations('shopee', shopId, { pageSize: 20, pageToken: cursor });
    await sleep(READ_SPACING_MS);
    pagesWalked++;
    const convs: any[] = Array.isArray(res?.conversations) ? res.conversations : [];
    const pr: any = res?.page_result || {};
    const nextCursor = pr?.next_cursor?.next_message_time_nano;
    const more = pr?.more === true;

    for (const c of convs) {
      const extConvId = String(c.conversation_id);
      const toId = c.to_id != null ? String(c.to_id) : null;
      if (!extConvId || !toId) continue;

      // upsert customer (keyed on channel+channel_user_id)
      let customerId: string;
      const { data: cust } = await sb.from('customers').select('id')
        .eq('channel', 'shopee').eq('channel_user_id', toId).maybeSingle();
      if (cust?.id) {
        customerId = cust.id;
        await sb.from('customers').update({
          display_name: c.to_name || 'Shopee Buyer', avatar: c.to_avatar || '🛒', brand_id: brandId,
        }).eq('id', customerId);
      } else {
        const { data: newCust, error } = await sb.from('customers').insert({
          channel: 'shopee', channel_user_id: toId, display_name: c.to_name || 'Shopee Buyer',
          avatar: c.to_avatar || '🛒', brand_id: brandId,
        }).select('id').maybeSingle();
        if (error || !newCust) continue;
        customerId = newCust.id;
      }

      // upsert conversation (keyed on channel+external_id)
      const lastTs = c.last_message_timestamp ? new Date(Number(c.last_message_timestamp) / NANO * 1000).toISOString() : new Date().toISOString();
      let dbConvId: string;
      const { data: existingConv } = await sb.from('conversations').select('id')
        .eq('channel', 'shopee').eq('external_id', extConvId).maybeSingle();
      if (existingConv?.id) {
        dbConvId = existingConv.id;
      } else {
        const { data: newConv, error } = await sb.from('conversations').insert({
          customer_id: customerId, channel: 'shopee', brand_id: brandId,
          external_id: extConvId, shop_id: shopId, buyer_id: toId,
          ai_handling: false,            // NO AI — human agents only (Shopee policy)
          status: 'open',
        }).select('id').maybeSingle();
        if (error || !newConv) continue;
        dbConvId = newConv.id;
        convCount++;
      }

      // Store only the latest-message preview here (no extra API call). The full
      // thread is fetched + persisted on demand when the conversation is opened.
      msgCount += await insertLatestFromList(sb, dbConvId, c);

      // Source-of-truth conversation fields (override the message trigger's now()/unread bumps).
      const previewType = String(c.latest_message_type || 'text');
      await sb.from('conversations').update({
        last_message_at: lastTs,
        unread: Number(c.unread_count) || 0,
        last_snippet: messageSnippet(previewType, c?.latest_message_content?.text ?? null),
        last_message_type: previewType,
      }).eq('id', dbConvId);
    }

    cursor = nextCursor ? String(nextCursor) : cursor;
    if (!more) { caughtUp = true; break; }
    if (!nextCursor) break;
  }

  const { error: updErr } = await sb.from('chat_shops').update({
    sync_cursor: cursor ?? null,
    caught_up: caughtUp,
    last_synced_at: new Date().toISOString(),
    conversations_synced: (shop?.conversations_synced || 0) + convCount,
  }).eq('shop_id', shopId);
  if (updErr) console.error('[sync] chat_shops update failed for', shopId, updErr.message);

  return { shop_id: shopId, brand: brandSlug, conversations: convCount, messages: msgCount, caught_up: caughtUp, pages: pagesWalked };
}

/**
 * On-demand: fetch + persist the full recent thread for one conversation.
 * Called when a Shopee conversation is opened in the inbox (first time), so the
 * thread lives in our DB afterwards. Bounded to messages at/after the go-live baseline.
 */
export async function hydrateConversation(dbConvId: string, opts: { maxPages?: number } = {}): Promise<number> {
  const sb = createAdminClient();
  const { data: conv } = await sb
    .from('conversations')
    .select('external_id, shop_id, channel')
    .eq('id', dbConvId)
    .maybeSingle();
  if (!conv || conv.channel !== 'shopee' || !conv.external_id || !conv.shop_id) return 0;

  // Opening a thread is user intent → pull the full recent history (no baseline
  // cutoff) so nothing looks missing. Bounded by maxPages (6 × 50 = 300 msgs).
  return syncMessages(sb, conv.shop_id, dbConvId, conv.external_id, 0, opts.maxPages ?? 6);
}

/**
 * Ingest ONE conversation on demand (used by the realtime webhook receiver):
 * fetch its metadata + upsert customer/conversation, then hydrate its messages.
 * Idempotent — dedupes on channel+external_id and message external_id.
 */
export async function ingestConversation(shopId: string, extConvId: string): Promise<{ ok: boolean; conversation_id?: string; messages: number }> {
  const sb = createAdminClient();
  const brandCache = new Map<string, string>();

  const { data: shop } = await sb.from('chat_shops').select('brand_slug').eq('shop_id', shopId).maybeSingle();
  const brandId = await resolveBrandId(sb, shop?.brand_slug ?? null, brandCache);

  let c: any;
  try { c = await getOneConversation(shopId, extConvId); } catch { return { ok: false, messages: 0 }; }
  const toId = c?.to_id != null ? String(c.to_id) : null;
  if (!c || !toId) return { ok: false, messages: 0 };

  // upsert customer (channel + channel_user_id)
  let customerId: string;
  const { data: cust } = await sb.from('customers').select('id').eq('channel', 'shopee').eq('channel_user_id', toId).maybeSingle();
  if (cust?.id) {
    customerId = cust.id;
    await sb.from('customers').update({ display_name: c.to_name || 'Shopee Buyer', avatar: c.to_avatar || '🛒', brand_id: brandId }).eq('id', customerId);
  } else {
    const { data: nc, error } = await sb.from('customers').insert({
      channel: 'shopee', channel_user_id: toId, display_name: c.to_name || 'Shopee Buyer', avatar: c.to_avatar || '🛒', brand_id: brandId,
    }).select('id').maybeSingle();
    if (error || !nc) return { ok: false, messages: 0 };
    customerId = nc.id;
  }

  // upsert conversation (channel + external_id)
  const lastTs = c.last_message_timestamp ? new Date(Number(c.last_message_timestamp) / NANO * 1000).toISOString() : new Date().toISOString();
  let dbConvId: string;
  const { data: ec } = await sb.from('conversations').select('id').eq('channel', 'shopee').eq('external_id', extConvId).maybeSingle();
  if (ec?.id) {
    dbConvId = ec.id;
  } else {
    const { data: nconv, error } = await sb.from('conversations').insert({
      customer_id: customerId, channel: 'shopee', brand_id: brandId,
      external_id: extConvId, shop_id: shopId, buyer_id: toId, ai_handling: false, status: 'open',
    }).select('id').maybeSingle();
    if (error || !nconv) return { ok: false, messages: 0 };
    dbConvId = nconv.id;
  }

  const previewType = String(c.latest_message_type || 'text');
  await sb.from('conversations').update({
    last_message_at: lastTs,
    unread: Number(c.unread_count) || 0,
    last_snippet: messageSnippet(previewType, c?.latest_message_content?.text ?? null),
    last_message_type: previewType,
  }).eq('id', dbConvId);

  // Pull the recent thread so the inbox shows it in full (Supabase Realtime pushes it live).
  const inserted = await syncMessages(sb, shopId, dbConvId, extConvId, 0, 6);
  return { ok: true, conversation_id: dbConvId, messages: inserted };
}

let _rrTicks = 0;

/**
 * Sync the STALEST shop (oldest last_synced_at) recent-first. Staleness-based
 * selection (from the DB, not an in-memory index) survives server restarts/deploys
 * and always prioritizes the shop that's furthest behind — so no shop gets starved
 * and the broken-token shop (toptoy) can't wedge the rotation.
 */
export async function syncNextShop(opts: { maxPages?: number; sinceDays?: number; reseekDays?: number } = {}): Promise<SyncShopResult | null> {
  const sb = createAdminClient();
  // Refresh the shop directory occasionally (rarely changes).
  if (_rrTicks % 20 === 0) { try { await syncShops(); } catch { /* use existing */ } }
  _rrTicks++;

  const { data } = await sb
    .from('chat_shops').select('shop_id')
    .eq('platform', 'shopee')
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(1);
  const shopId = data?.[0]?.shop_id ? String(data[0].shop_id) : null;
  if (!shopId) return null;

  let result: SyncShopResult | null = null;
  try {
    result = await syncShop(shopId, { reseekDays: opts.reseekDays ?? 1, maxPages: opts.maxPages ?? 40 });
  } catch {
    result = { shop_id: shopId, brand: null, conversations: 0, messages: 0, caught_up: false, pages: 0 };
  }
  // Always advance last_synced_at (even if the sync errored before its own update),
  // so the rotation moves on instead of re-picking the same failing shop forever.
  await sb.from('chat_shops').update({ last_synced_at: new Date().toISOString() }).eq('shop_id', shopId);
  return result;
}

/** Sync every shop, recent-first (grab the newest chats), for the manual "ซิงค์" button + cron endpoint. */
export async function syncAllShops(opts: { maxPagesPerShop?: number; sinceDays?: number; reseekDays?: number } = {}): Promise<SyncShopResult[]> {
  const sb = createAdminClient();
  await syncShops();
  const { data: shops } = await sb.from('chat_shops').select('shop_id').eq('platform', 'shopee');
  const results: SyncShopResult[] = [];
  for (const s of shops || []) {
    try {
      results.push(await syncShop(s.shop_id, { reseekDays: opts.reseekDays ?? 1, maxPages: opts.maxPagesPerShop ?? 12 }));
    } catch (e) {
      results.push({ shop_id: s.shop_id, brand: null, conversations: 0, messages: 0, caught_up: false, pages: 0 });
    }
  }
  return results;
}
