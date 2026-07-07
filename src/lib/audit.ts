import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Append an entry to audit_log. Best-effort: never throws so it can't break
 * the action it is recording. Uses the caller's authenticated client
 * (audit_write policy allows any logged-in insert).
 */
export async function logAudit(
  sb: SupabaseClient,
  userId: string | null,
  action: string,
  opts: { targetType?: string; targetId?: string | null; details?: Record<string, unknown>; ip?: string | null } = {},
): Promise<void> {
  try {
    await sb.from('audit_log').insert({
      user_id: userId,
      action,
      target_type: opts.targetType ?? null,
      target_id: opts.targetId ?? null,
      details: opts.details ?? {},
      ip: opts.ip ?? null,
    });
  } catch {
    /* swallow — auditing must never block the request */
  }
}

/** Pull a client IP from proxy headers for audit records. */
export function reqIp(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || null;
}
