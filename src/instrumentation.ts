/**
 * In-process scheduled sync — the simplest "server keeps syncing on its own"
 * option: no external cron, no secret, no third-party. When the Next server is
 * running (production), it pulls new Shopee chat into Supabase every few minutes
 * so the inbox stays fresh even with no browser open.
 *
 * `register()` runs once when the server boots (Next instrumentation hook).
 *
 * Caveat: on a plan that SLEEPS when idle (e.g. Render Starter), the process
 * stops while asleep so the timer pauses; the next request wakes it and the timer
 * resumes. For guaranteed 24/7 ticks, keep the instance awake (any external pinger
 * hitting the app, or a non-sleeping plan) — but nothing extra is required for it
 * to work while the app is up. Set DISABLE_CRON=1 to turn it off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return; // node server only, not edge
  if (process.env.NODE_ENV !== 'production') return;  // don't auto-sync in local dev
  if (process.env.DISABLE_CRON === '1') return;

  const INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes, ONE shop (round-robin)
  let running = false;

  const tick = async () => {
    if (running) return; // never overlap runs
    running = true;
    try {
      // Light: sync only the next shop in rotation so a small instance stays
      // responsive (a full 17-shop sweep at once overloaded Render Starter →
      // "เชื่อมต่อสะดุด"). Over ~34 min the whole fleet is covered, then repeats.
      const { syncNextShop } = await import('@/lib/chat-source/sync');
      const r = await syncNextShop({ maxPages: 2, sinceDays: 7 });
      if (r) console.log(`[cron] synced ${r.brand ?? r.shop_id}: +${r.conversations} conv, +${r.messages} msg`);
    } catch (e) {
      console.error('[cron] sync failed:', (e as Error)?.message);
    } finally {
      running = false;
    }
  };

  setTimeout(tick, 15_000);
  setInterval(tick, INTERVAL_MS);
  console.log('[cron] in-process sync scheduler started (1 shop / 2 min)');
}
