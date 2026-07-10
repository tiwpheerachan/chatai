/**
 * Client for the external multi-brand Chat API (api-center — Shopee / TikTok proxy).
 * Server-only: reads CHAT_API_KEY from env and never exposes it to the browser.
 * Docs: ~/Downloads/chat-api(1).md  (base host: api-center.shd-technology.co.th)
 *
 * Availability today: platform=shopee is LIVE across all brand shops.
 * platform=tiktok returns 502 until each shop re-authorizes the
 * `seller.customer_service` scope — same request shapes, no client change needed.
 *
 * Reads (shops / conversations / messages / unread-count) and a single
 * person-triggered text send are implemented. There is intentionally NO
 * AI auto-reply and no proactive/broadcast send — Shopee is human-agent only.
 */

const BASE = process.env.CHAT_API_BASE_URL || 'https://api-center.shd-technology.co.th';

export type Platform = 'shopee' | 'tiktok';

export class ChatSourceError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'ChatSourceError';
    this.status = status;
    this.detail = detail;
  }
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.set(k, String(v));
  return u.toString();
}

interface CallOpts {
  method?: 'GET' | 'POST';
  body?: unknown; // JSON body for POST
}

async function call<T = any>(path: string, opts: CallOpts = {}): Promise<T> {
  const key = process.env.CHAT_API_KEY;
  if (!key) throw new ChatSourceError('CHAT_API_KEY ยังไม่ได้ตั้งค่าใน .env.local', 503);

  const headers: Record<string, string> = { 'X-API-Key': key, Accept: 'application/json' };
  const init: RequestInit = { method: opts.method ?? 'GET', headers, cache: 'no-store' };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }

  let r: Response;
  try {
    r = await fetch(`${BASE}${path}`, init);
  } catch (e) {
    throw new ChatSourceError(`เชื่อมต่อ Chat API ไม่ได้: ${(e as Error).message}`, 502);
  }

  const raw = await r.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { /* non-JSON (e.g. plain 500) */ }

  if (!r.ok) {
    const detail = json?.detail ?? raw ?? 'Upstream error';
    const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
    throw new ChatSourceError(msg, r.status, json ?? raw);
  }
  return json as T;
}

// ---- Shops ----

export interface SourceShop {
  shop_id: string;
  shop_name: string;
  platform: string;
  brand_id: string | null;
}

/** List chat-capable shops the key can access, optionally filtered by platform. */
export async function listShops(platform?: Platform): Promise<SourceShop[]> {
  const path = `/api/chat/shops${platform ? `?${qs({ platform })}` : ''}`;
  const data = await call<{ shops?: SourceShop[] }>(path);
  return Array.isArray(data?.shops) ? data.shops : [];
}

// ---- Reads ----

export interface ConversationsPage {
  conversations?: any[];
  next_page_token?: string;
  page_result?: unknown; // Shopee returns a cursor object here
  [k: string]: unknown;
}

export async function listConversations(
  platform: Platform,
  shopId: string,
  opts: { pageSize?: number; pageToken?: string } = {},
): Promise<ConversationsPage> {
  return call<ConversationsPage>(
    `/api/chat/conversations?${qs({
      platform,
      shop_id: shopId,
      page_size: opts.pageSize ?? 20,
      page_token: opts.pageToken,
    })}`,
  );
}

export interface MessagesPage {
  messages?: any[];
  next_page_token?: string;
  page_result?: unknown;
  [k: string]: unknown;
}

export async function getMessages(
  platform: Platform,
  shopId: string,
  conversationId: string,
  opts: { pageSize?: number; pageToken?: string } = {},
): Promise<MessagesPage> {
  return call<MessagesPage>(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?${qs({
      platform,
      shop_id: shopId,
      page_size: opts.pageSize ?? 20,
      page_token: opts.pageToken,
      // need_plaintext/need_data are TikTok-only; harmless (ignored) for Shopee.
      need_plaintext: true,
      need_data: false,
    })}`,
  );
}

/** Shopee-only: total unread conversation count for a shop. */
export async function getUnreadCount(shopId: string): Promise<{ total_unread_count?: number; [k: string]: unknown }> {
  return call(`/api/chat/unread-count?${qs({ shop_id: shopId })}`);
}

/** Shopee-only: one conversation's detail/metadata (buyer id/name/avatar, unread, latest msg). */
export async function getOneConversation(shopId: string, conversationId: string): Promise<any> {
  return call(`/api/chat/conversations/${encodeURIComponent(conversationId)}?${qs({ shop_id: shopId })}`);
}

// ---- Writes (human-triggered only) ----

/**
 * Send a plain-text reply. Person-triggered ONLY — the caller must be an
 * authenticated agent acting on a real conversation. No AI / bot / broadcast use.
 * Shopee routes by `to_id` (the buyer's user id from the conversation).
 */
export async function sendText(
  platform: Platform,
  args: { shopId: string; conversationId: string; toId?: string; text: string },
): Promise<any> {
  const body: Record<string, unknown> = {
    platform,
    shop_id: args.shopId,
    type: 'text',
    text: args.text,
  };
  // Shopee requires to_id; TikTok routes by conversation id in the path.
  if (args.toId) body.to_id = args.toId;

  return call(
    `/api/chat/conversations/${encodeURIComponent(args.conversationId)}/messages`,
    { method: 'POST', body },
  );
}

/** Send a product/order card (human-triggered). */
export async function sendCard(
  platform: Platform,
  args: { shopId: string; conversationId: string; toId?: string; type: 'item' | 'order'; content: Record<string, unknown> },
): Promise<any> {
  const body: Record<string, unknown> = {
    platform,
    shop_id: args.shopId,
    type: args.type,
    content: args.content,
  };
  if (args.toId) body.to_id = args.toId;
  return call(
    `/api/chat/conversations/${encodeURIComponent(args.conversationId)}/messages`,
    { method: 'POST', body },
  );
}

/** Send a sticker (human-triggered). Shopee: {sticker_id, sticker_package_id}. */
export async function sendSticker(
  platform: Platform,
  args: { shopId: string; conversationId: string; toId?: string; stickerId: string; stickerPackageId: string },
): Promise<any> {
  const body: Record<string, unknown> = {
    platform,
    shop_id: args.shopId,
    type: 'sticker',
    content: { sticker_id: args.stickerId, sticker_package_id: args.stickerPackageId },
  };
  if (args.toId) body.to_id = args.toId;
  return call(
    `/api/chat/conversations/${encodeURIComponent(args.conversationId)}/messages`,
    { method: 'POST', body },
  );
}

/**
 * Upload + send an image in one call (multipart). Human-triggered only.
 * Shopee needs platform=shopee + to_id. Image cap 10 MB (enforced upstream).
 */
export async function sendImage(
  platform: Platform,
  args: { shopId: string; conversationId: string; toId?: string; file: Blob; filename: string },
): Promise<any> {
  const key = process.env.CHAT_API_KEY;
  if (!key) throw new ChatSourceError('CHAT_API_KEY ยังไม่ได้ตั้งค่าใน .env.local', 503);

  const form = new FormData();
  form.set('platform', platform);
  form.set('shop_id', args.shopId);
  if (args.toId) form.set('to_id', args.toId);
  form.set('file', args.file, args.filename);

  let r: Response;
  try {
    r = await fetch(
      `${BASE}/api/chat/conversations/${encodeURIComponent(args.conversationId)}/images`,
      { method: 'POST', headers: { 'X-API-Key': key, Accept: 'application/json' }, body: form, cache: 'no-store' },
    );
  } catch (e) {
    throw new ChatSourceError(`เชื่อมต่อ Chat API ไม่ได้: ${(e as Error).message}`, 502);
  }
  const raw = await r.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { /* non-JSON */ }
  if (!r.ok) {
    const detail = json?.detail ?? raw ?? 'Upstream error';
    throw new ChatSourceError(typeof detail === 'string' ? detail : JSON.stringify(detail), r.status, json ?? raw);
  }
  return json;
}

/** Shopee-only: mark a conversation as read. */
export async function markRead(shopId: string, conversationId: string): Promise<any> {
  return call(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/read?${qs({ shop_id: shopId })}`,
    { method: 'POST' },
  );
}

// ---- Context reads (Shopee) — order history + product catalog ----

export interface BuyerOrderItem {
  item_name: string; model_name?: string; quantity: number;
  // Enriched from the product catalog (product-search) when available — the
  // buyer-orders API itself returns only name/model/qty.
  item_id?: number; item_sku?: string; image_url?: string;
  price?: number; original_price?: number; in_stock?: boolean;
}
export interface BuyerOrder {
  order_sn: string;
  order_date: string;
  order_status: string;
  cod: boolean;
  currency: string;
  total_qty: number;
  items: BuyerOrderItem[];
}

/**
 * Shopee-only: the buyer's past orders for THIS shop, for agent context in the
 * conversation. Matched by `buyer_username` = the conversation's `to_name`
 * (our order data has no buyer user_id). Reads ingested order data (BigQuery),
 * not a live Shopee call. A 0-order result means "no match on this username"
 * (renamed/different display name), NOT necessarily "never ordered".
 */
export async function getBuyerOrders(
  shopId: string,
  buyerUsername: string,
  opts: { limit?: number } = {},
): Promise<BuyerOrder[]> {
  const data = await call<{ orders?: BuyerOrder[] }>(
    `/api/chat/buyer-orders?${qs({ shop_id: shopId, buyer_username: buyerUsername, limit: opts.limit ?? 20 })}`,
  );
  return Array.isArray(data?.orders) ? data.orders : [];
}

/**
 * Best-effort: fill in each order item's catalog fields (image, SKU, price, stock)
 * by matching its name/model against the product-search catalog. The buyer-orders
 * API gives only name/model/qty; this makes the order panel as rich as we can.
 * Bounded to a few catalog lookups so it doesn't hammer the 120/min rate limit,
 * and any failure is swallowed (the order list still renders).
 */
export async function enrichOrderItems(shopId: string, orders: BuyerOrder[], opts: { maxLookups?: number } = {}): Promise<void> {
  const names = [...new Set(orders.flatMap(o => (o.items || []).map(it => it.item_name)).filter(Boolean))].slice(0, opts.maxLookups ?? 6);
  if (!names.length) return;
  const byName = new Map<string, CatalogProduct[]>();
  await Promise.all(names.map(async (name) => {
    // Strip "[TAG]" prefixes, use the first few distinctive words as the query.
    const q = name.replace(/\[[^\]]*\]/g, '').trim().split(/\s+/).slice(0, 4).join(' ');
    try { byName.set(name, await searchProducts(shopId, { q, limit: 20 })); } catch { /* ignore */ }
  }));
  const norm = (s?: string) => (s || '').trim().toLowerCase();
  for (const o of orders) {
    for (const it of o.items || []) {
      const prods = byName.get(it.item_name) || [];
      if (!prods.length) continue;
      const m =
        prods.find(p => it.model_name && norm(p.model_name) === norm(it.model_name)) ||
        prods.find(p => norm(p.item_name) === norm(it.item_name)) ||
        prods[0];
      if (!m) continue;
      it.item_id = m.item_id;
      it.item_sku = m.model_sku || m.item_sku;
      it.image_url = m.image_url;
      it.price = m.price;
      it.original_price = m.original_price;
      it.in_stock = m.in_stock;
    }
  }
}

export interface CatalogProduct {
  item_id: number;
  model_id?: number;
  item_name: string;
  model_name?: string;
  item_sku?: string;
  model_sku?: string;
  item_status?: string;
  price: number;
  original_price?: number;
  stock: number;
  in_stock: boolean;
  image_url?: string;
  lifetime_sales?: number;
}

/**
 * Shopee-only: search the shop's catalog to build product cards. Rows are
 * variant (model) grain — group by `item_id` for item-level cards. Data is a
 * daily catalog snapshot (stock is day-fresh, indicative). Empty `q` lists
 * best-sellers. `sort`: 'sales' (default) | 'price_asc' | 'price_desc'.
 */
export async function searchProducts(
  shopId: string,
  opts: { q?: string; inStock?: boolean; sort?: 'sales' | 'price_asc' | 'price_desc'; limit?: number } = {},
): Promise<CatalogProduct[]> {
  const data = await call<{ products?: CatalogProduct[] }>(
    `/api/chat/product-search?${qs({
      shop_id: shopId,
      q: opts.q ?? '',
      in_stock: opts.inStock === undefined ? undefined : opts.inStock,
      sort: opts.sort ?? 'sales',
      limit: opts.limit ?? 30,
    })}`,
  );
  return Array.isArray(data?.products) ? data.products : [];
}

// ---- Vouchers (Shopee) — needs the separate `shopee_voucher` scope ----
// NOTE: our current key does NOT have this scope yet (list/create → 403
// "API key missing 'shopee_voucher' scope"). Sending an existing voucher into
// a chat uses the `chat` scope (sendVoucher below) and works once you have a
// voucher_id + code. Enumerating/creating vouchers stays 403 until the platform
// grants `shopee_voucher` on the key.

export interface Voucher {
  voucher_id: number;
  voucher_code: string;
  voucher_name: string;
  voucher_type: number;   // 1 shop / 2 product
  reward_type: number;    // 1 fixed / 2 percentage / 3 coin
  discount_amount?: number;
  percentage?: number;
  max_price?: number;
  min_basket_price?: number;
  usage_quantity?: number;
  current_usage?: number;
  start_time?: number;
  end_time?: number;
}

/** Shopee-only: list vouchers. Requires `shopee_voucher` scope (403 without it). */
export async function listVouchers(
  shopId: string,
  status: 'upcoming' | 'ongoing' | 'expired' | 'all' = 'ongoing',
): Promise<Voucher[]> {
  const data = await call<any>(
    `/api/v1/shopee/vouchers?${qs({ shop_id: shopId, status, page_size: 50 })}`,
  );
  // Proxy returns Shopee's raw body — the list may sit at a few nesting levels.
  const list = data?.voucher_list || data?.vouchers || data?.response?.voucher_list || data?.data?.voucher_list;
  return Array.isArray(list) ? (list as Voucher[]) : [];
}

/** Send an existing voucher card into a chat (human-triggered). Uses `chat` scope. */
export async function sendVoucher(
  args: { shopId: string; conversationId: string; toId?: string; voucherId: number; voucherCode: string },
): Promise<any> {
  const body: Record<string, unknown> = {
    platform: 'shopee',
    shop_id: args.shopId,
    type: 'voucher',
    content: { voucher_id: args.voucherId, voucher_code: args.voucherCode },
  };
  if (args.toId) body.to_id = args.toId;
  return call(
    `/api/chat/conversations/${encodeURIComponent(args.conversationId)}/messages`,
    { method: 'POST', body },
  );
}
