import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The Shopee review-comment data lives in a SEPARATE Supabase project (the
 * shopee-comment-ai app), populated there by its BigQuery ingest + AI-triage
 * pipeline. Nexus only surfaces the "reply to comments" side, so it connects to
 * that project read-mostly (list comments; write reply status). Returns null when
 * the env isn't configured so the feature degrades gracefully.
 */
let _sb: SupabaseClient | null | undefined;
export function commentsClient(): SupabaseClient | null {
  if (_sb !== undefined) return _sb;
  const url = process.env.COMMENTS_SUPABASE_URL;
  const key = process.env.COMMENTS_SUPABASE_SERVICE_ROLE_KEY;
  _sb = url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
  return _sb;
}
export const commentsConfigured = () => Boolean(process.env.COMMENTS_SUPABASE_URL && process.env.COMMENTS_SUPABASE_SERVICE_ROLE_KEY);

export interface CommentRow {
  comment_id: string;
  brand: string | null;
  shop_id: string | null;
  product_name: string | null;   // = item_id in the source data
  rating: number | null;
  comment_text: string | null;
  username: string | null;
  created_at: string | null;
  sentiment: string | null;
  category: string | null;
  severity: number | null;
  summary: string | null;
  suggested_action: string | null;
  urgent: boolean | null;
  status: string | null;
  assignee: string | null;
  note: string | null;
  seller_reply: string | null;
  seller_reply_at: string | null;
  seller_reply_hidden: boolean | null;
  images: string[] | null;
  product_item_name: string | null; // enriched from products
  product_image: string | null;
}

export interface CommentFilters {
  brand?: string; brandsIn?: string[]; product?: string;
  sentiment?: string; category?: string; status?: string;
  urgentOnly?: boolean; replied?: 'yes' | 'no'; q?: string;
  from?: string; to?: string;   // created_at range (ISO)
  sort?: 'priority' | 'created_desc' | 'created_asc' | 'severity_desc' | 'rating_asc' | 'rating_desc';
  page?: number; pageSize?: number;
}

const COLS = 'comment_id, brand, shop_id, product_name, rating, comment_text, username, created_at, sentiment, category, severity, summary, suggested_action, urgent, status, assignee, note, seller_reply, seller_reply_at, seller_reply_hidden, images';

/** Map item_id → real product name + image (source stores product_name = item_id). */
async function productMeta(sb: SupabaseClient, ids: (string | null)[]): Promise<Map<string, { name: string | null; img: string | null }>> {
  const uniq = [...new Set(ids.filter(Boolean) as string[])];
  const out = new Map<string, { name: string | null; img: string | null }>();
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await sb.from('products').select('item_id, item_name, thumbnail_url, image_url').in('item_id', uniq.slice(i, i + 300));
    for (const p of (data as any[]) || []) out.set(String(p.item_id), { name: p.item_name ?? null, img: p.thumbnail_url || p.image_url || null });
  }
  return out;
}

export async function listComments(f: CommentFilters): Promise<{ rows: CommentRow[]; total: number }> {
  const sb = commentsClient();
  if (!sb) return { rows: [], total: 0 };
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const from = (page - 1) * pageSize;

  let q = sb.from('comments').select(COLS, { count: 'exact' });
  if (f.brandsIn?.length) q = q.in('brand', f.brandsIn);
  if (f.brand) q = q.eq('brand', f.brand);
  if (f.product) q = q.eq('product_name', f.product);
  if (f.sentiment) q = q.eq('sentiment', f.sentiment);
  if (f.category) q = q.eq('category', f.category);
  if (f.status) q = q.eq('status', f.status);
  if (f.urgentOnly) q = q.eq('urgent', true);
  if (f.replied === 'yes') q = q.not('seller_reply', 'is', null);
  if (f.replied === 'no') q = q.is('seller_reply', null);
  if (f.from) q = q.gte('created_at', f.from);
  if (f.to) q = q.lte('created_at', f.to);
  if (f.q) q = q.ilike('comment_text', `%${f.q}%`);
  switch (f.sort) {
    case 'priority':
      // Urgent + most-severe + newest first — floats "must handle now" to the top.
      q = q.order('urgent', { ascending: false, nullsFirst: false }).order('severity', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
      break;
    case 'created_asc': q = q.order('created_at', { ascending: true }); break;
    case 'severity_desc': q = q.order('severity', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }); break;
    case 'rating_asc': q = q.order('rating', { ascending: true, nullsFirst: false }); break;
    case 'rating_desc': q = q.order('rating', { ascending: false, nullsFirst: false }); break;
    default: q = q.order('created_at', { ascending: false });
  }
  q = q.range(from, from + pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const base = ((data ?? []) as unknown) as CommentRow[];
  const meta = await productMeta(sb, base.map(r => r.product_name)).catch(() => new Map());
  const rows = base.map(r => {
    const m = r.product_name ? meta.get(r.product_name) : null;
    return { ...r, product_item_name: m?.name ?? null, product_image: m?.img ?? null };
  });
  return { rows, total: count ?? 0 };
}

/** Distinct brands present in the comments table (for the filter dropdown). */
export async function commentBrands(brandsIn?: string[]): Promise<string[]> {
  const sb = commentsClient();
  if (!sb) return [];
  let q = sb.from('comments').select('brand').not('brand', 'is', null).limit(5000);
  if (brandsIn?.length) q = q.in('brand', brandsIn);
  const { data } = await q;
  return [...new Set(((data as any[]) || []).map(r => r.brand).filter(Boolean))].sort();
}

/** Persist a reply attempt: comment_replies + comments status. Best-effort per row. */
export async function persistReplies(
  rows: { comment_id: string; reply_text: string; status: string; note: string | null }[],
  repliedBy: string | null,
): Promise<void> {
  const sb = commentsClient();
  if (!sb) return;
  const now = new Date().toISOString();
  await sb.from('comment_replies').upsert(
    rows.map(r => ({ comment_id: r.comment_id, reply_text: r.reply_text, status: r.status, replied_by: repliedBy, platform_response: r.note, updated_at: now })),
    { onConflict: 'comment_id' },
  );
  await Promise.all(rows.map(r => {
    const patch: Record<string, unknown> = { note: r.reply_text, status: r.status === 'sent' ? 'resolved' : 'in_progress' };
    if (repliedBy) patch.assignee = repliedBy;
    if (r.status === 'sent') patch.handled_at = now;
    return sb.from('comments').update(patch).eq('comment_id', r.comment_id);
  }));
}
