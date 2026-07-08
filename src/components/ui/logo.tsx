import { cn } from '@/lib/utils';

/**
 * Nexus logo — the animated glossy mark (public/nexus.mp4). Autoplays muted +
 * loops; server-renderable (plain <video>). Falls back to the poster frame if
 * video can't play.
 */
export function Logo({ size = 40, className }: { size?: number; className?: string; animated?: boolean }) {
  return (
    <video
      src="/nexus.mp4"
      width={size}
      height={size}
      autoPlay
      loop
      muted
      playsInline
      aria-label="Nexus"
      className={cn('rounded-xl object-cover shrink-0', className)}
      style={{ width: size, height: size }}
    />
  );
}

/** Logo + animated "typing" dots + the Nexus wordmark. */
export function Wordmark({ subtitle = 'AI Customer Support', size = 38 }: { subtitle?: string; size?: number }) {
  return (
    <div className="group flex items-center gap-2.5">
      <Logo size={size} />
      <div className="leading-tight">
        <div className="flex items-center gap-1">
          <span className="font-display font-bold tracking-tight text-[18px] bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-600 bg-clip-text text-transparent">
            Nexus
          </span>
          <span className="flex items-end gap-[2px] pb-1">
            {[0, 1, 2].map(i => (
              <span key={i} className="logo-dot w-1 h-1 rounded-full bg-violet-500" style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </span>
        </div>
        {subtitle && <div className="text-[10px] text-slate-400 uppercase tracking-[0.12em]">{subtitle}</div>}
      </div>
    </div>
  );
}
