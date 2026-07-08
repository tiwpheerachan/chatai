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
      const res = await syncAllShops({ reseekDays: 1, maxPagesPerShop: 15 });
      const convs = res.reduce((s, x) => s + (x?.conversations || 0), 0);
      const msgs = res.reduce((s, x) => s + (x?.messages || 0), 0);
      console.log(`[cron] recent sweep — ${res.length} shops, +${convs} conv, +${msgs} msg`);

      // Then spend the rest of the budget backfilling shops that aren't fully
      // caught up yet (so our conversation list matches Chat++'s full history).
      // A few shops per tick; each finishes over successive ticks, then is skipped.
      const bf = await backfillShops({ shops: 3, maxPagesPerShop: 15, sinceDays: 90 });
      const bfConv = bf.reduce((s, x) => s + (x?.conversations || 0), 0);
      const done = bf.filter((x) => x?.caught_up).length;
      if (bf.length) console.log(`[cron] backfill — ${bf.length} shops, +${bfConv} conv, ${done} now caught up`);
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
