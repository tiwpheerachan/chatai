import { createAdminClient } from '@/lib/supabase/admin';
import type { EffectiveScope } from '@/lib/permissions';

const NIL = '00000000-0000-0000-0000-000000000000';

/**
 * Analytics/overview reads run through the ADMIN (service-role) client and apply the
 * user's brand scope IN CODE. The RLS policies on conversations/messages call
 * current_user_role()/current_user_brand() per row, so counts/aggregates over the
 * 100k+ row tables time out (returned 0) or hit PostgREST's 1000-row select cap.
 * The admin client skips RLS; we re-apply the exact visibility here.
 *
 * scope.brands === null → all brands (owner / unrestricted). Otherwise limit to the
 * allowed brand ids ([NIL] guards the empty-scope case so nothing leaks).
 */
export function adminSb() {
  return createAdminClient();
}

export function brandIds(scope: EffectiveScope): string[] | null {
  if (scope.brands === null) return null;
  return scope.brands.length ? scope.brands : [NIL];
}

/** Apply brand scope to a conversations query (filters on the brand_id column). */
export function withBrandScope<T>(q: T, scope: EffectiveScope): T {
  const ids = brandIds(scope);
  if (ids) return (q as any).in('brand_id', ids) as T;
  return q;
}

/**
 * Build a messages query with brand scope applied. When the user is unrestricted we
 * query messages directly; when scoped we inner-join conversations and filter on
 * brand_id so only messages from in-scope conversations are counted.
 *
 * head=true → count-only (no rows); head=false → return the selected columns.
 */
export function scopedMessages(scope: EffectiveScope, opts: { select?: string; head?: boolean } = {}) {
  const { select = 'id', head = true } = opts;
  const ids = brandIds(scope);
  const sb = adminSb();
  if (ids === null) {
    return sb.from('messages').select(select, { count: 'exact', head });
  }
  return sb
    .from('messages')
    .select(`${select}, conversation:conversations!inner(brand_id)`, { count: 'exact', head })
    .in('conversation.brand_id', ids);
}
