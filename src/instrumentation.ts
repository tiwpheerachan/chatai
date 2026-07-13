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

  const INTERVAL_MS = 3 * 60 * 1000; // full sweep of ALL shops every 3 min
  let running = false;

  const tick = async () => {
    if (running) return; // never overlap runs (a sweep takes ~1.5–2 min at the API rate cap)
    running = true;
    try {
      // Sweep EVERY shop recent-first (last 24h → newest). Bounded by the Shopee
      // read cap (~120/min), a full sweep is ~1.5–2 min, so all brands refresh
      // together roughly every 3 min (vs ~20 min with one-shop-per-tick).
      const { syncAllShops, backfillShops } = await import('@/lib/chat-source/sync');
      // LIGHT recent sweep: 4 pages/shop (pageSize 50 → ~200 newest convs/shop is
      // plenty for 24h freshness). 15 pages hammered the single CPU + rate limit
      // every 3 min and stalled interactive requests (chat loading slowly).
      const res = await syncAllShops({ reseekDays: 1, maxPagesPerShop: 4 });
      const convs = res.reduce((s, x) => s + (x?.conversations || 0), 0);
      const msgs = res.reduce((s, x) => s + (x?.messages || 0), 0);
      console.log(`[cron] recent sweep — ${res.length} shops, +${convs} conv, +${msgs} msg`);

      // Backfill any shop still catching up (all 17 are caught_up now → usually a
      // no-op). Kept gentle so it never eats the interactive rate budget again.
      const bf = await backfillShops({ shops: 2, maxPagesPerShop: 10, sinceDays: 30 });
      const bfConv = bf.reduce((s, x) => s + (x?.conversations || 0), 0);
      const done = bf.filter((x) => x?.caught_up).length;
      if (bf.length) console.log(`[cron] backfill — ${bf.length} shops, +${bfConv} conv, ${done} now caught up`);

      // Smart distribution: auto-assign the freshly-arrived WAITING queue to
      // eligible online agents (no-op when disabled or no online agents).
      try {
        const { getSettings, autoAssignQueue } = await import('@/lib/assignment');
        if ((await getSettings()).enabled) {
          const a = await autoAssignQueue({ limit: 300 });
          if (a.assigned) console.log(`[cron] auto-assign — ${a.assigned} chats to ${Object.keys(a.perAgent).length} agents`);
        }
      } catch (e) {
        console.error('[cron] auto-assign failed:', (e as Error)?.message);
      }
    } catch (e) {
      console.error('[cron] sweep failed:', (e as Error)?.message);
    } finally {
      running = false;
    }
  };

  setTimeout(tick, 10_000);
  setInterval(tick, INTERVAL_MS);
  console.log('[cron] in-process sync scheduler started (full sweep / 3 min)');
}
