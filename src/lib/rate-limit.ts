import { NextResponse } from 'next/server';

/**
 * Lightweight fixed-window rate limiter.
 *
 * NOTE: state is in-memory per server instance — on serverless/multi-instance
 * deployments this is best-effort, not a global limit. For hard guarantees use
 * Upstash Redis / @vercel/kv. It still meaningfully blocks naive abuse/loops.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }

  bucket.count += 1;
  const ok = bucket.count <= limit;
  return { ok, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

/** Best-effort client IP from common proxy headers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Guard helper for routes: returns a 429 response when over the limit.
 *
 *   const limited = enforceRateLimit(`web:${clientIp(req)}`, 30, 60_000);
 *   if (limited) return limited;
 */
export function enforceRateLimit(key: string, limit: number, windowMs: number): NextResponse | null {
  const r = rateLimit(key, limit, windowMs);
  if (r.ok) return null;
  const retryAfter = Math.ceil((r.resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

// Periodically drop expired buckets to avoid unbounded growth.
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }, 60_000);
  // Do not keep the event loop alive just for cleanup.
  (timer as { unref?: () => void }).unref?.();
}
