import { cn } from '@/lib/utils';

type Tone = 'slate' | 'brand' | 'emerald' | 'amber' | 'rose' | 'blue' | 'violet' | 'indigo' | 'purple';

const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-50 text-brand-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  purple: 'bg-purple-100 text-purple-700',
};

export function Badge({
  tone = 'slate',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

/** Small dot status indicator. */
export function StatusDot({ online }: { online?: boolean }) {
  return <span className={cn('w-1.5 h-1.5 rounded-full', online ? 'bg-emerald-500' : 'bg-slate-300')} />;
}
