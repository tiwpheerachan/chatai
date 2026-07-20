'use client';

import { useEffect } from 'react';

/** Marks the logged-in user online while the app is open (heartbeat every 60s,
 *  and immediately when the tab becomes visible). A server sweep flips stale
 *  users to offline. Powers real online status + auto-assignment eligibility. */
export function PresencePing() {
  useEffect(() => {
    const ping = () => { if (document.visibilityState === 'visible') fetch('/api/presence', { method: 'POST' }).catch(() => {}); };
    ping();
    const t = setInterval(ping, 60_000);
    document.addEventListener('visibilitychange', ping);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', ping); };
  }, []);
  return null;
}
