import { cn, avatarColor, initials } from '@/lib/utils';

/**
 * Initials avatar with a deterministic color — no emoji.
 * If `src` is a real URL it renders the image instead.
 */
export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const box = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
  }[size];

  const isImage = !!src && /^https?:\/\//.test(src);

  if (isImage) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src!} alt={name || ''} className={cn('rounded-full object-cover', box, className)} />;
  }

  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-full font-semibold text-white select-none', avatarColor(name || '?'), box, className)}
    >
      {initials(name)}
    </span>
  );
}
