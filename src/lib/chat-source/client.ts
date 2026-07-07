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
