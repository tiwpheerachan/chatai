import { cn } from '@/lib/utils';

/**
 * Flaticon UIcons (regular-rounded) glyph — the app-wide icon style.
 * Usage: <Fi name="search" className="text-base" />  →  <i class="fi fi-rr-search ..." />
 * Icons scale with font-size, so size via a Tailwind text-* class (default text-base).
 * Font + CSS are imported once in app/layout.tsx.
 */
export function Fi({ name, className }: { name: string; className?: string }) {
  return <i className={cn('fi', `fi-rr-${name}`, 'leading-none inline-flex items-center', className)} aria-hidden />;
}
