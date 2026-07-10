// Post replies to Shopee product/review comments via the api-center proxy.
// POST {URL}  header X-API-Key  body {shop_id, comment_list:[{comment_id, comment}]}
// Ref: shopee-product-api.md — needs the `shopee_reply_comment` scope on the key.

export const REPLY_MAX_LEN = 500;
export const REPLY_MAX_BATCH = 100;

const DEFAULT_URL = 'https://datacenter.shd-technology.co.th/api/v1/shopee/reply-comment';
export const REPLY_URL = (process.env.SHOPEE_REPLY_API_URL || DEFAULT_URL).trim();
const REPLY_KEY = (process.env.SHOPEE_REPLY_API_KEY || '').trim();
export const replyConfigured = () => Boolean(REPLY_KEY);

export interface ReplyItem { comment_id: number; comment: string }
export interface ReplyOutcome { ok: boolean; httpStatus: number; accepted: number[]; rejected: number[]; error?: string; retryAfterSec?: number }

interface ShopeeBody { error?: string; message?: string; detail?: string; response?: { result_list?: { comment_id?: number | string }[] } }

function explain(status: number, body: ShopeeBody | null, raw: string): string {
  const detail = body?.detail || body?.error || body?.message || raw.slice(0, 180);
  const lc = String(detail).toLowerCase();
  switch (status) {
    case 400:
      if (/no token record|token for shop|shop_id/.test(lc)) return 'ยังไม่ได้เชื่อมต่อร้านนี้ (ไม่พบโทเคนของ shop_id) — เชื่อมต่อร้านใน Shopee ก่อน';
      if (/expired|revoked|invalid_access_token|error_token|error_auth/.test(lc)) return 'โทเคน Shopee หมดอายุหรือถูกถอน — ต้องเชื่อมต่อร้านใหม่';
      return 'ข้อมูลไม่ถูกต้อง: ' + detail;
    case 401: return 'API key ไม่ถูกต้องหรือไม่ได้ตั้งค่า (X-API-Key)';
    case 403: return "API key ไม่มีสิทธิ์ shopee_reply_comment หรือ shop_id ไม่อยู่ในขอบเขตของคีย์";
    case 429: return 'ส่งถี่เกินไป (จำกัด 20 ครั้ง/นาที) — รอสักครู่แล้วลองใหม่';
    case 502: return 'Shopee ขัดข้องชั่วคราว (502): ' + detail;
    default: return `เรียก API ไม่สำเร็จ (HTTP ${status}): ${detail}`;
  }
}

export async function replyToShopee(shopId: number, items: ReplyItem[]): Promise<ReplyOutcome> {
  const base = { httpStatus: 0, accepted: [] as number[], rejected: [] as number[] };
  if (!REPLY_KEY) return { ok: false, ...base, error: 'ยังไม่ได้ตั้งค่า SHOPEE_REPLY_API_KEY' };
  if (!shopId || !Number.isFinite(shopId)) return { ok: false, ...base, error: 'ไม่พบ shop_id ที่ถูกต้อง' };

  const clean: ReplyItem[] = [];
  for (const it of items) {
    const id = Number(it.comment_id);
    const comment = String(it.comment ?? '').trim();
    if (!id || !Number.isFinite(id)) return { ok: false, ...base, error: 'comment_id ไม่ถูกต้อง' };
    if (!comment) return { ok: false, ...base, error: `คำตอบของคอมเมนต์ ${id} ว่างเปล่า` };
    if (comment.length > REPLY_MAX_LEN) return { ok: false, ...base, error: `คำตอบยาวเกิน ${REPLY_MAX_LEN} ตัวอักษร` };
    clean.push({ comment_id: id, comment });
  }
  if (!clean.length) return { ok: false, ...base, error: 'ไม่มีคอมเมนต์ให้ตอบ' };
  if (clean.length > REPLY_MAX_BATCH) return { ok: false, ...base, error: `ตอบได้ครั้งละไม่เกิน ${REPLY_MAX_BATCH} คอมเมนต์` };

  let res: Response;
  try {
    res = await fetch(REPLY_URL, {
      method: 'POST',
      headers: { 'X-API-Key': REPLY_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_id: shopId, comment_list: clean }),
    });
  } catch (e) { return { ok: false, ...base, error: 'เชื่อมต่อ Shopee API ไม่สำเร็จ: ' + (e as Error).message }; }

  const raw = (await res.text()).slice(0, 2000);
  let body: ShopeeBody | null = null;
  try { body = JSON.parse(raw); } catch { /* not json */ }
  const requested = clean.map(c => c.comment_id);

  if (!res.ok) {
    const retry = res.headers.get('retry-after');
    return { ok: false, httpStatus: res.status, accepted: [], rejected: requested, error: explain(res.status, body, raw), retryAfterSec: retry ? Number(retry) || undefined : undefined };
  }
  const list = body?.response?.result_list ?? [];
  const accepted = list.map(r => Number(r.comment_id)).filter(n => Number.isFinite(n) && n > 0);
  const accSet = new Set(accepted);
  const rejected = requested.filter(id => !accSet.has(id));
  if (body?.error) return { ok: accepted.length > 0, httpStatus: 200, accepted, rejected, error: 'Shopee: ' + body.error + (body.message ? ' — ' + body.message : '') };
  return { ok: accepted.length > 0, httpStatus: 200, accepted, rejected, error: rejected.length && !accepted.length ? 'Shopee ไม่รับคำตอบ (คอมเมนต์อาจถูกลบหรือ comment_id ไม่ถูกต้อง)' : undefined };
}
