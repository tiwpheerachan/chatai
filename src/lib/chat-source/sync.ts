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
const READ_SPACING_MS = 520; // ~115 reads/min — just under the 120/min chat_read cap

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Insert many rows in ONE round-trip; if the batch fails (e.g. a rare race dup on
 * a unique index), fall back to per-row inserts so a single bad row can't drop the
 * whole page. Returns how many rows landed. This is what lets the sync batch its
 * writes (one call per page) instead of ~6 calls per conversation — the difference
 * between a full sweep taking seconds vs. many minutes.
 */
async function bulkInsert(sb: Admin, table: string, rows: any[]): Promise<number> {
  if (!rows.length) return 0;
  const { error } = await sb.from(table).insert(rows);
  if (!error) return rows.length;
  let n = 0;
  for (const r of rows) {
    const { error: e } = await sb.from(table).insert(r);
    if (!e) n++;
  }
  return n;
}

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

    // ---- BATCHED per-page persistence -------------------------------------
    // Old path did ~6 DB round-trips PER conversation (select+write customer,
    // select+insert conversation, select+insert message, update conversation) —
    // a shop with 300 recent chats = ~1,800 sequential calls = several MINUTES,
    // which is why a full sweep never reached the later shops. Below does a
    // handful of BULK calls per 20-conversation page instead (~15× fewer calls),
    // so each shop syncs in seconds and every brand refreshes together.
    const items = convs
      .map((c) => ({ c, extConvId: String(c.conversation_id), toId: c.to_id != null ? String(c.to_id) : null }))
      .filter((r) => r.extConvId && r.toId) as { c: any; extConvId: string; toId: string }[];

    if (items.length) {
      const tsOf = (c: any) =>
        c.last_message_timestamp ? new Date(Number(c.last_message_timestamp) / NANO * 1000).toISOString() : new Date().toISOString();
      const previewTypeOf = (c: any) => String(c.latest_message_type || 'text');
      const snippetOf = (c: any) => messageSnippet(previewTypeOf(c), c?.latest_message_content?.text ?? null);

      // 1) Customers — one bulk upsert (customers has UNIQUE(channel,channel_user_id)),
      //    then one select to map buyer id → customer uuid.
      const custByToId = new Map<string, string>();
      const custSeen = new Set<string>();
      const custRows = items
        .filter((r) => !custSeen.has(r.toId) && custSeen.add(r.toId))
        .map((r) => ({
          channel: 'shopee', channel_user_id: r.toId,
          display_name: r.c.to_name || 'Shopee Buyer', avatar: r.c.to_avatar || '🛒', brand_id: brandId,
        }));
      await sb.from('customers').upsert(custRows, { onConflict: 'channel,channel_user_id' });
      const { data: custs } = await sb.from('customers').select('id,channel_user_id')
        .eq('channel', 'shopee').in('channel_user_id', [...custSeen]);
      for (const r of custs || []) custByToId.set(String(r.channel_user_id), r.id);

      // 2) Conversations — find which already exist (so we preserve their
      //    status/ai_handling/assignee and only bulk-insert the truly new ones).
      const extIds = items.map((r) => r.extConvId);
      const convByExt = new Map<string, string>();
      const preExisting = new Set<string>();
      const { data: existing } = await sb.from('conversations').select('id,external_id')
        .eq('channel', 'shopee').in('external_id', extIds);
      for (const r of existing || []) { convByExt.set(String(r.external_id), r.id); preExisting.add(String(r.external_id)); }

      const newConvRows = items
        .filter((r) => !preExisting.has(r.extConvId) && custByToId.has(r.toId))
        .map((r) => ({
          customer_id: custByToId.get(r.toId)!, channel: 'shopee', brand_id: brandId,
          external_id: r.extConvId, shop_id: shopId, buyer_id: r.toId,
          ai_handling: false,          // NO AI — human agents only (Shopee policy)
          status: 'open',
          last_message_at: tsOf(r.c), unread: Number(r.c.unread_count) || 0,
          last_snippet: snippetOf(r.c), last_message_type: previewTypeOf(r.c),
        }));
      if (newConvRows.length) {
        convCount += await bulkInsert(sb, 'conversations', newConvRows);
        // Re-read to pick up the new uuids (also resolves any that lost a race).
        const { data: after } = await sb.from('conversations').select('id,external_id')
          .eq('channel', 'shopee').in('external_id', newConvRows.map((r) => r.external_id));
        for (const r of after || []) convByExt.set(String(r.external_id), r.id);
      }

      // 3) Latest-message previews — bulk. Only insert previews we don't already
      //    have; the set of conversations whose latest message is NEW tells us
      //    which EXISTING conversations actually need a preview refresh (skip the
      //    unchanged majority — the big steady-state win).
      const previewIds = items.map((r) => r.c.latest_message_id).filter(Boolean).map(String);
      const seenMsg = new Set<string>();
      if (previewIds.length) {
        const { data: sm } = await sb.from('messages').select('external_id').in('external_id', previewIds);
        for (const r of sm || []) seenMsg.add(String(r.external_id));
      }
      const changed = new Set<string>();
      const msgRows: any[] = [];
      for (const { c, extConvId } of items) {
        const extMsgId = c.latest_message_id ? String(c.latest_message_id) : null;
        if (!extMsgId || seenMsg.has(extMsgId)) continue;
        const dbId = convByExt.get(extConvId);
        if (!dbId) continue;
        changed.add(extConvId);
        const mapped = mapContent({ message_type: c.latest_message_type, content: c.latest_message_content });
        const fromBuyer = String(c.latest_message_from_id) === String(c.to_id);
        msgRows.push({
          conversation_id: dbId, external_id: extMsgId,
          sender_type: fromBuyer ? 'customer' : 'agent',
          message_type: mapped.message_type, text: mapped.text, attachments: mapped.attachments,
          metadata: { platform: 'shopee', from_list: true },
          created_at: tsOf(c),
        });
      }
      msgCount += await bulkInsert(sb, 'messages', msgRows);

      // 4) Refresh preview fields on EXISTING conversations that got a new latest
      //    message (upsert on the PK updates only these columns; status/ai_handling/
      //    assignee are left untouched). New conversations already carry fresh
      //    values from their insert, so they're excluded.
      const updRows = items
        .filter((r) => preExisting.has(r.extConvId) && changed.has(r.extConvId) && convByExt.has(r.extConvId) && custByToId.has(r.toId))
        .map((r) => ({
          id: convByExt.get(r.extConvId)!, customer_id: custByToId.get(r.toId)!, channel: 'shopee',
          last_message_at: tsOf(r.c), unread: Number(r.c.unread_count) || 0,
          last_snippet: snippetOf(r.c), last_message_type: previewTypeOf(r.c),
        }));
      if (updRows.length) await sb.from('conversations').upsert(updRows, { onConflict: 'id' });
    }

    cursor = nextCursor ? String(nextCursor) : cursor;
    if (!more) { caughtUp = true; break; }
    if (!nextCursor) break;
  }

  // Persist per mode. RECENT mode (reseek) only refreshes the newest window every
  // run, so it must NOT touch sync_cursor / caught_up — those belong to the BACKFILL
  // walk (which advances a persistent cursor from a deep baseline to full coverage).
  // If recent mode wrote sync_cursor it would keep resetting backlog progress to ~now
  // and the older conversations would never be filled (the "ไม่ขึ้นหมด / ไม่ตรงกับ
  // Chat++" gap). Recent mode only bumps last_synced_at + the running count.
  const patch: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
    conversations_synced: (shop?.conversations_synced || 0) + convCount,
  };
  if (opts.reseekDays == null) {
    patch.sync_cursor = cursor ?? null;
    patch.caught_up = caughtUp;
  }
  const { error: updErr } = await sb.from('chat_shops').update(patch).eq('shop_id', shopId);
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

/**
 * BACKFILL pass — the fix for "ไม่ขึ้นหมด / ไม่ตรงกับ Chat++". The recent-first
 * sweep only ever grabs the last day, so conversations that were last active
 * before go-live (but within Chat++'s list) were never captured. This walks each
 * NOT-yet-caught-up shop's PERSISTENT cursor forward from its deep baseline toward
 * the present, a bounded number of pages per run, advancing until it reaches "now"
 * (more:false → caught_up=true). Runs a few shops per tick so it shares the read
 * budget with the recent sweep and finishes the one-time catch-up over several ticks.
 *
 * On a shop's first backfill the cursor is seeded at (now − sinceDays); pass a deep
 * sinceDays (e.g. 90) for a one-time reseed done separately. Once caught_up, a shop
 * is skipped here and only the recent sweep keeps it fresh.
 */
export async function backfillShops(
  opts: { shops?: number; maxPagesPerShop?: number; sinceDays?: number } = {},
): Promise<SyncShopResult[]> {
  const sb = createAdminClient();
  const nShops = opts.shops ?? 3;
  // Order by sync_cursor ASC = the shop FURTHEST back in its backfill goes first
  // (least-covered wins). NOT last_synced_at — the recent sweep bumps that for
  // every shop each tick, so it can't rank backfill progress. Cursor advances only
  // as a shop backfills, so this rotates cleanly through all shops by progress.
  const { data: shops } = await sb
    .from('chat_shops')
    .select('shop_id')
    .eq('platform', 'shopee')
    .eq('caught_up', false)
    .order('sync_cursor', { ascending: true, nullsFirst: true })
    .limit(nShops);

  const results: SyncShopResult[] = [];
  for (const s of shops || []) {
    try {
      // reseekDays omitted → BACKFILL mode: uses + persists the shop's sync_cursor.
      results.push(await syncShop(s.shop_id, { maxPages: opts.maxPagesPerShop ?? 15, sinceDays: opts.sinceDays ?? 90 }));
    } catch {
      // A shop that can't be read (e.g. toptoy's broken token) would otherwise stay
      // the lowest sync_cursor forever and wedge the rotation — retire it from the
      // backfill pool (recent sweep still covers it; re-running the reseed re-includes
      // it once the token is fixed).
      results.push({ shop_id: s.shop_id, brand: null, conversations: 0, messages: 0, caught_up: false, pages: 0 });
      await sb.from('chat_shops').update({ caught_up: true }).eq('shop_id', s.shop_id);
    }
  }
  return results;
}
