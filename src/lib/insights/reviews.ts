import { commentsClient } from '@/lib/comments/db';

// ============================================================
// Deep review/shop insights — aggregations over the shopee-comment-ai dataset.
// Powers the "วิเคราะห์เชิงลึก" hub (Review Analysis · Shop Performance ·
// Pending-to-handle), grounded ONLY in the columns the pipeline actually fills:
// brand, product, rating, sentiment, category, severity, urgent, status,
// created_at, seller_reply_at, handled_at, summary. No fabricated metrics.
// ============================================================

export type InsightView = 'reviews' | 'performance' | 'pending';

export interface InsightFilters {
  from?: string;         // created_at >= (ISO)
  to?: string;           // created_at <= (ISO)
  brandsIn?: string[];   // brand scope (undefined = all)
  brand?: string;        // single-brand narrow
}

// The raw row we pull — kept narrow so a date window over 66k rows stays cheap.
export interface RawComment {
  brand: string | null;
  product_id: string | null;
  product_name: string | null;
  rating: number | null;
  sentiment: string | null;
  category: string | null;
  severity: number | null;
  urgent: boolean | null;
  status: string | null;
  created_at: string | null;
  seller_reply_at: string | null;
  seller_reply: string | null;
  handled_at: string | null;
  summary: string | null;
}

const SELECT =
  'brand, product_id, product_name, rating, sentiment, category, severity, urgent, status, created_at, seller_reply_at, seller_reply, handled_at, summary';

// Category → high-level issue group (mirrors the reference's 4 negative buckets).
export const GROUP_TH: Record<string, string> = {
  product: 'เกี่ยวกับสินค้า',
  shipping: 'การจัดส่ง',
  service: 'ประสบการณ์การใช้บริการ',
  promotion: 'ราคา/โปรโมชั่น',
  other: 'อื่น ๆ',
};
export type IssueGroup = keyof typeof GROUP_TH;

export function categoryGroup(category: string | null): IssueGroup {
  const c = category || '';
  if (/สินค้า|ปลอดภัย|สุขภาพ|บรรจุภัณฑ์|คุณภาพ/.test(c)) return 'product';
  if (/จัดส่ง|ขนส่ง|ส่งผิด|ส่งช้า/.test(c)) return 'shipping';
  if (/บริการ|แอดมิน|ชำระเงิน|จ่ายเงิน/.test(c)) return 'service';
  if (/ราคา|โปรโมชั่น|โปร|ส่วนลด/.test(c)) return 'promotion';
  return 'other';
}

/** Pull the scoped comment rows for a date window, paginating past the 1000 cap. */
export async function fetchComments(f: InsightFilters, cap = 40000): Promise<RawComment[]> {
  const sb = commentsClient();
  if (!sb) return [];
  const out: RawComment[] = [];
  const PAGE = 1000;
  for (let p = 0; p < Math.ceil(cap / PAGE); p++) {
    let q = sb.from('comments').select(SELECT).order('created_at', { ascending: false });
    if (f.brandsIn?.length) q = q.in('brand', f.brandsIn);
    if (f.brand) q = q.eq('brand', f.brand);
    if (f.from) q = q.gte('created_at', f.from);
    if (f.to) q = q.lte('created_at', f.to);
    q = q.range(p * PAGE, p * PAGE + PAGE - 1);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = ((data ?? []) as unknown) as RawComment[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

/**
 * Fill displayName + image on the top-N products by matching their item_id
 * (product_id, or product_name which stores the id in the source) against the
 * products catalog. Mutates in place; best-effort (leaves nulls on miss).
 */
export async function attachProductMeta(products: ProductProblem[], limit = 60): Promise<void> {
  const sb = commentsClient();
  if (!sb || !products.length) return;
  const top = products.slice(0, limit);
  const ids = [...new Set(top.flatMap(p => [p.product_id, p.product_name]).filter(Boolean) as string[])];
  if (!ids.length) return;
  const meta = new Map<string, { name: string | null; img: string | null }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('products').select('item_id,item_name,thumbnail_url,image_url').in('item_id', ids.slice(i, i + 300));
    for (const p of (data as any[]) || []) meta.set(String(p.item_id), { name: p.item_name ?? null, img: p.thumbnail_url || p.image_url || null });
  }
  for (const p of top) {
    const m = (p.product_id && meta.get(String(p.product_id))) || (p.product_name && meta.get(String(p.product_name))) || null;
    if (m) { p.displayName = m.name; p.image = m.img; }
  }
}

const isNeg = (r: RawComment) => r.sentiment === 'negative' || (r.rating != null && r.rating <= 2);
const dayKey = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

// ---------- 1) REVIEW ANALYSIS ----------
export interface ProductProblem {
  product_id: string | null;
  product_name: string | null;
  displayName: string | null;  // real item_name from the products catalog
  image: string | null;        // product thumbnail
  negatives: number;
  total: number;
  negRate: number;             // %
  problems: { label: string; group: IssueGroup; count: number }[]; // top-3
  sample: string;              // one representative summary/text
}
export interface ReviewAnalysis {
  totalNeg: number;
  negRate: number;             // % of all reviews in window
  relatedProducts: number;     // distinct products with a negative
  issuesFound: number;         // total negative category hits
  groupTotals: Record<IssueGroup, number>;
  trend: { day: string; product: number; shipping: number; service: number; promotion: number; other: number }[];
  products: ProductProblem[];
  windowTotal: number;
}

export function reviewAnalysis(rows: RawComment[]): ReviewAnalysis {
  const negs = rows.filter(isNeg);
  const groupTotals: Record<IssueGroup, number> = { product: 0, shipping: 0, service: 0, promotion: 0, other: 0 };
  const trendMap = new Map<string, Record<IssueGroup, number>>();
  const byProduct = new Map<string, { name: string | null; id: string | null; total: number; negs: RawComment[] }>();

  // per-product total (all sentiments) for accurate neg-rate
  for (const r of rows) {
    const key = r.product_id || r.product_name || '—';
    const p = byProduct.get(key) || { name: r.product_name, id: r.product_id, total: 0, negs: [] };
    p.total++;
    if (!p.name && r.product_name) p.name = r.product_name;
    byProduct.set(key, p);
  }
  for (const r of negs) {
    const g = categoryGroup(r.category);
    groupTotals[g]++;
    const d = dayKey(r.created_at);
    if (d) {
      const row = trendMap.get(d) || { product: 0, shipping: 0, service: 0, promotion: 0, other: 0 };
      row[g]++; trendMap.set(d, row);
    }
    const key = r.product_id || r.product_name || '—';
    byProduct.get(key)?.negs.push(r);
  }

  const products: ProductProblem[] = [...byProduct.values()]
    .filter(p => p.negs.length > 0)
    .map(p => {
      const catCount = new Map<string, { count: number; group: IssueGroup }>();
      for (const n of p.negs) {
        const label = n.category || 'อื่น ๆ';
        const e = catCount.get(label) || { count: 0, group: categoryGroup(n.category) };
        e.count++; catCount.set(label, e);
      }
      const problems = [...catCount.entries()]
        .sort((a, b) => b[1].count - a[1].count).slice(0, 3)
        .map(([label, v]) => ({ label, group: v.group, count: v.count }));
      const sample = p.negs.map(n => (n.summary || '').trim()).find(Boolean) || '';
      return {
        product_id: p.id, product_name: p.name, displayName: null, image: null,
        negatives: p.negs.length, total: p.total, negRate: pct(p.negs.length, p.total),
        problems, sample,
      };
    })
    .sort((a, b) => b.negatives - a.negatives);

  const trend = [...trendMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, v]) => ({ day, product: v.product, shipping: v.shipping, service: v.service, promotion: v.promotion, other: v.other }));

  return {
    totalNeg: negs.length,
    negRate: pct(negs.length, rows.length),
    relatedProducts: products.length,
    issuesFound: negs.length,
    groupTotals,
    trend,
    products,
    windowTotal: rows.length,
  };
}

// ---------- 2) SHOP / BRAND PERFORMANCE ----------
export interface BrandPerf {
  brand: string;
  reviews: number;
  avgRating: number;           // 0-5, 2dp
  csat: number;                // % positive
  negRate: number;             // % negative
  replyRate: number;           // % with a seller reply
  avgReplyHrs: number | null;  // avg (seller_reply_at - created_at) in hours
  urgent: number;
}

export function shopPerformance(rows: RawComment[]): BrandPerf[] {
  const map = new Map<string, RawComment[]>();
  for (const r of rows) {
    const b = r.brand || '—';
    (map.get(b) || map.set(b, []).get(b)!).push(r);
  }
  const perf: BrandPerf[] = [...map.entries()].map(([brand, rs]) => {
    const rated = rs.filter(r => r.rating != null);
    const avgRating = rated.length ? rated.reduce((s, r) => s + (r.rating || 0), 0) / rated.length : 0;
    const pos = rs.filter(r => r.sentiment === 'positive').length;
    const neg = rs.filter(isNeg).length;
    const replied = rs.filter(r => r.seller_reply || r.seller_reply_at);
    const lat = replied
      .map(r => (r.seller_reply_at && r.created_at ? (Date.parse(r.seller_reply_at) - Date.parse(r.created_at)) / 3.6e6 : null))
      .filter((n): n is number => n != null && n >= 0 && n < 24 * 90);
    return {
      brand,
      reviews: rs.length,
      avgRating: Math.round(avgRating * 100) / 100,
      csat: pct(pos, rs.length),
      negRate: pct(neg, rs.length),
      replyRate: pct(replied.length, rs.length),
      avgReplyHrs: lat.length ? Math.round((lat.reduce((s, n) => s + n, 0) / lat.length) * 10) / 10 : null,
      urgent: rs.filter(r => r.urgent).length,
    };
  }).sort((a, b) => b.reviews - a.reviews);
  return perf;
}

// ---------- 3) PENDING / ISSUES TO HANDLE ----------
export interface PendingOverview {
  created: number;
  resolved: number;
  inProgress: number;
  open: number;
  resolveRate: number;         // %
  sla: { h1: number; h5: number; h12: number; h24: number }; // % resolved within N hours
  avgResolveHrs: number | null;
  trend: { day: string; product: number; shipping: number; service: number; promotion: number; other: number }[];
  byBrand: { brand: string; created: number; resolved: number; open: number; resolveRate: number; avgResolveHrs: number | null }[];
}

/** "Issues" = comments that need handling (negative or urgent). */
export function pendingOverview(rows: RawComment[]): PendingOverview {
  const issues = rows.filter(r => isNeg(r) || r.urgent);
  const resolvedRows = issues.filter(r => r.status === 'resolved' || r.handled_at);
  const inProgress = issues.filter(r => r.status === 'in_progress').length;
  const open = issues.filter(r => !(r.status === 'resolved' || r.handled_at) && r.status !== 'in_progress').length;

  const resolveHrs = resolvedRows
    .map(r => (r.handled_at && r.created_at ? (Date.parse(r.handled_at) - Date.parse(r.created_at)) / 3.6e6 : null))
    .filter((n): n is number => n != null && n >= 0 && n < 24 * 120);
  const within = (h: number) => pct(resolveHrs.filter(n => n <= h).length, resolvedRows.length);

  const trendMap = new Map<string, Record<IssueGroup, number>>();
  for (const r of issues) {
    const d = dayKey(r.created_at); if (!d) continue;
    const row = trendMap.get(d) || { product: 0, shipping: 0, service: 0, promotion: 0, other: 0 };
    row[categoryGroup(r.category)]++; trendMap.set(d, row);
  }

  const brandMap = new Map<string, RawComment[]>();
  for (const r of issues) { const b = r.brand || '—'; (brandMap.get(b) || brandMap.set(b, []).get(b)!).push(r); }
  const byBrand = [...brandMap.entries()].map(([brand, rs]) => {
    const res = rs.filter(r => r.status === 'resolved' || r.handled_at);
    const hrs = res.map(r => (r.handled_at && r.created_at ? (Date.parse(r.handled_at) - Date.parse(r.created_at)) / 3.6e6 : null))
      .filter((n): n is number => n != null && n >= 0 && n < 24 * 120);
    return {
      brand, created: rs.length, resolved: res.length, open: rs.length - res.length,
      resolveRate: pct(res.length, rs.length),
      avgResolveHrs: hrs.length ? Math.round((hrs.reduce((s, n) => s + n, 0) / hrs.length) * 10) / 10 : null,
    };
  }).sort((a, b) => b.created - a.created);

  return {
    created: issues.length,
    resolved: resolvedRows.length,
    inProgress,
    open,
    resolveRate: pct(resolvedRows.length, issues.length),
    sla: { h1: within(1), h5: within(5), h12: within(12), h24: within(24) },
    avgResolveHrs: resolveHrs.length ? Math.round((resolveHrs.reduce((s, n) => s + n, 0) / resolveHrs.length) * 10) / 10 : null,
    trend: [...trendMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, v]) => ({ day, product: v.product, shipping: v.shipping, service: v.service, promotion: v.promotion, other: v.other })),
    byBrand,
  };
}
