import { cn } from '@/lib/utils';

/**
 * Sigmachat logo — a refined Σ mark in a deep jewel-tone tile with a glass
 * highlight and a slow light sweep (sheen). Pure SVG/CSS, server-renderable.
 */
export function Logo({ size = 40, className, animated = true }: { size?: number; className?: string; animated?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(animated && 'logo-zoom', className)}
      role="img"
      aria-label="Sigmachat"
    >
      <defs>
        <linearGradient id="sg-bg" x1="5" y1="5" x2="43" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4f46e5" />
          <stop offset="0.55" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#be185d" />
        </linearGradient>
        <linearGradient id="sg-glass" x1="0" y1="5" x2="0" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="sg-clip">
          <rect x="5" y="5" width="38" height="38" rx="17" />
        </clipPath>
        <filter id="sg-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="3.5" floodColor="#7c3aed" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* rounded futuristic tile */}
      <rect x="5" y="5" width="38" height="38" rx="17" fill="url(#sg-bg)" filter="url(#sg-glow)" />

      <g clipPath="url(#sg-clip)">
        {/* glass highlight */}
        <rect x="5" y="5" width="38" height="22" fill="url(#sg-glass)" />
        {/* light sweep (re-runs every 10s) */}
        {animated && <rect className="logo-sheen" x="-2" y="2" width="9" height="44" fill="#ffffff" opacity="0.22" />}
      </g>

      {/* hairline edge */}
      <rect x="5.5" y="5.5" width="37" height="37" rx="16.5" fill="none" stroke="#ffffff" strokeOpacity="0.25" />

      {/* orbiting glow dot (futuristic) */}
      {animated && (
        <g className="logo-orbit">
          <circle cx="24" cy="6.5" r="1.7" fill="#c4b5fd" />
          <circle cx="24" cy="6.5" r="3" fill="#c4b5fd" opacity="0.25" />
        </g>
      )}

      {/* Sigma mark (re-draws every 10s) */}
      <path
        d="M31 17 H18 L25 24 L18 31 H31"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(animated && 'logo-sigma')}
      />
    </svg>
  );
}

/** Logo + animated "typing" dots + the Sigmachat wordmark. */
export function Wordmark({ subtitle = 'AI Customer Support', size = 38 }: { subtitle?: string; size?: number }) {
  return (
    <div className="group flex items-center gap-2.5">
      <Logo size={size} />
      <div className="leading-tight">
        <div className="flex items-center gap-1">
          <span className="font-display font-bold tracking-tight text-[18px] bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-600 bg-clip-text text-transparent">
            Sigmachat
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
