import { BigQuery } from '@google-cloud/bigquery';

// ============================================================
// Warehouse stock (#6) — reads the JST-ERP inventory view on BigQuery:
//   elated-channel-468406-t4.Canonical.warehouse_inventory_current
// ~11.5k rows (warehouse × SKU), 34 warehouses, refreshed a few times/day.
//
// This is BACK-OF-HOUSE stock ("do we physically have it / how many / how fast
// it sells"), NOT live Shopee storefront stock (that stays a backend track).
// ALWAYS surface `refreshed_at` so admins know how fresh it is.
//
// Rules from the platform team, honoured here:
//  - cache app-side 5–15 min (the source refreshes in batches)
//  - maximumBytesBilled on every query
//  - never SELECT * — only the columns we render
// ============================================================

const PROJECT = 'elated-channel-468406-t4';
const VIEW = '`elated-channel-468406-t4.Canonical.warehouse_inventory_current`';
const MAX_BYTES = '1000000000'; // 1 GB guardrail

export const warehouseConfigured = () => Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

let _bq: BigQuery | null = null;
function bq(): BigQuery | null {
  if (_bq) return _bq;
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    _bq = new BigQuery({ projectId: PROJECT, credentials: JSON.parse(raw) });
    return _bq;
  } catch {
    return null;
  }
}

export interface WarehouseRow { warehouse_name: string; available: number; actual: number }
export interface StockProduct {
  key: string;
  item_id: string | null;
  sku: string | null;
  sku_name: string | null;
  name: string | null;      // best human-readable name (see bestName)
  brand: string | null;
  barcode: string | null;
  picture_url: string | null;
  available: number;   // sum available_stock across warehouses
  actual: number;      // sum actual_stock across warehouses
  sales_30d: number;
  in_stock: boolean;
  warehouses: WarehouseRow[];
  refreshed_at: string | null;
}

// The view has several name columns of uneven quality:
//   sku            = clean readable name  ("Dreame-AirStylePro Hi-Pink")   ← best
//   sku_name       = model-code + name    ("AMS01ADreame-AirStylePro Hi…") / or a bare number
//   sku_short_name = Chinese name
// Prefer `sku` when it looks like a name (has ≥2 letters); else fall back.
function bestName(sku: string | null, sku_name: string | null): string | null {
  const looksName = (s: string | null) => !!s && /[A-Za-z].*[A-Za-z]/.test(s);
  if (looksName(sku)) return sku;
  if (looksName(sku_name)) return sku_name;
  return sku || sku_name || null;
}

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === 'object' && v && 'value' in (v as any) ? Number((v as any).value) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// 10-minute in-process cache keyed on the resolved query signature.
const cache = new Map<string, { t: number; v: StockProduct[] }>();
const TTL = 10 * 60_000;

export interface StockQuery { itemIds?: (string | number)[]; skus?: string[]; q?: string; limit?: number }

export async function getStock(opts: StockQuery): Promise<StockProduct[]> {
  const client = bq();
  if (!client) return [];

  const itemIds = [...new Set((opts.itemIds || []).map(x => String(x).trim()).filter(Boolean))].slice(0, 200);
  const skus = [...new Set((opts.skus || []).map(x => String(x).trim()).filter(Boolean))].slice(0, 200);
  const q = (opts.q || '').trim().slice(0, 60);
  if (!itemIds.length && !skus.length && q.length < 2) return [];

  const ck = JSON.stringify({ itemIds, skus, q });
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < TTL) return hit.v;

  // Searchable "haystack" — the warehouse text is English/SKU-code, so we search
  // across every name field. Match by TOKENS (each word), not the whole phrase,
  // and rank by how many tokens hit — so "hair gleam", "gleam dreame", or a messy
  // Shopee title all still find the product. Thai tokens simply don't match (the
  // data is English) but any English/brand/SKU token still surfaces the item.
  const HAY = "LOWER(CONCAT(IFNULL(sku,''),' ',IFNULL(sku_name,''),' ',IFNULL(sku_short_name,''),' ',IFNULL(brand,''),' ',IFNULL(barcode,''),' ',IFNULL(CAST(item_id AS STRING),'')))";
  const where: string[] = [];
  const score: string[] = [];
  const params: Record<string, unknown> = {};
  if (itemIds.length) { where.push('CAST(item_id AS STRING) IN UNNEST(@itemIds)'); score.push('CAST(CAST(item_id AS STRING) IN UNNEST(@itemIds) AS INT64) * 5'); params.itemIds = itemIds; }
  if (skus.length) { where.push('sku IN UNNEST(@skus)'); score.push('CAST(sku IN UNNEST(@skus) AS INT64) * 5'); params.skus = skus; }

  const tokens = q ? q.toLowerCase().split(/[^\p{L}\p{N}]+/u).map(t => t.trim()).filter(t => t.length >= 2).slice(0, 6) : [];
  tokens.forEach((t, i) => { params[`tok${i}`] = `%${t}%`; where.push(`${HAY} LIKE @tok${i}`); score.push(`CAST(${HAY} LIKE @tok${i} AS INT64)`); });
  if (q.length >= 2 && !tokens.length) { params.likeall = `%${q.toLowerCase()}%`; where.push(`${HAY} LIKE @likeall`); score.push(`CAST(${HAY} LIKE @likeall AS INT64)`); }
  if (!where.length) return [];

  const scoreExpr = score.length ? score.join(' + ') : '0';
  const sql = `
    SELECT warehouse_name, company_name, sku, sku_name, item_id, brand, barcode, picture_url,
           actual_stock, available_stock, sales_30d, refreshed_at, (${scoreExpr}) AS _score
    FROM ${VIEW}
    WHERE ${where.join(' OR ')}
    ORDER BY _score DESC, sales_30d DESC, available_stock DESC
    LIMIT 800`;

  // Let query errors propagate (the API route turns them into a clear message).
  // A common one right now: "Access Denied: JST/Config …" = the consumer SA hasn't
  // been granted the underlying dataset behind the Canonical view (platform-side).
  const [data] = await client.query({ query: sql, params, maximumBytesBilled: MAX_BYTES });
  const rows = data as any[];

  // Aggregate per product (item_id, else sku).
  const byKey = new Map<string, StockProduct>();
  for (const r of rows) {
    const itemId = r.item_id != null ? String(r.item_id) : null;
    const sku = r.sku != null ? String(r.sku) : null;
    const key = itemId || sku || '';
    if (!key) continue;
    let p = byKey.get(key);
    if (!p) {
      p = {
        key, item_id: itemId, sku, sku_name: r.sku_name ?? null,
        name: bestName(sku, r.sku_name ?? null), brand: r.brand ?? null,
        barcode: r.barcode != null ? String(r.barcode) : null,
        picture_url: r.picture_url ?? null, available: 0, actual: 0, sales_30d: 0,
        in_stock: false, warehouses: [], refreshed_at: null,
      };
      byKey.set(key, p);
    }
    const avail = num(r.available_stock);
    const actual = num(r.actual_stock);
    p.available += avail;
    p.actual += actual;
    p.sales_30d += num(r.sales_30d);
    // Keep the best relevance score seen for this product (drives final ranking).
    (p as any)._score = Math.max((p as any)._score || 0, num(r._score));
    if (avail > 0 || actual > 0) p.warehouses.push({ warehouse_name: r.warehouse_name || '-', available: avail, actual });
    const ref = r.refreshed_at?.value ?? r.refreshed_at ?? null;
    if (ref && (!p.refreshed_at || String(ref) > p.refreshed_at)) p.refreshed_at = String(ref);
  }
  // Rank: most tokens matched first, then popularity (30-day sales), then stock.
  // (Sorting by raw stock alone let anomalous rows dominate loose matches.)
  const out = [...byKey.values()].map(p => {
    p.in_stock = p.available > 0;
    p.warehouses.sort((a, b) => b.available - a.available);
    return p;
  }).sort((a, b) =>
    ((b as any)._score || 0) - ((a as any)._score || 0)
    || b.sales_30d - a.sales_30d
    || b.available - a.available,
  ).slice(0, opts.limit ?? 50);

  cache.set(ck, { t: Date.now(), v: out });
  return out;
}
