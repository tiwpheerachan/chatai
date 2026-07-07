import { CHANNEL_META, cn, type IconComponent } from '@/lib/utils';
import {
  InstagramLogo, WhatsappLogo, Globe, ChatText, Question,
} from '@phosphor-icons/react/dist/ssr';

// Real brand logos (saved in /public/channels).
const LOGOS: Record<string, string> = {
  line: '/channels/line.png',
  facebook: '/channels/facebook.png',
  lazada: '/channels/lazada.png',
  shopee: '/channels/shopee.png',
  tiktok: '/channels/tiktok.png',
  shopify: '/channels/shopify.png',
  email: '/channels/gmail.png',
};

// Per-logo zoom so glyphs that sit small inside their canvas (TikTok's note has
// lots of black padding) read at the same visual size as the others.
const ZOOM: Record<string, number> = {
  tiktok: 1.32,
};

// Channels without a supplied logo fall back to a tinted Phosphor glyph.
const ICONS: Record<string, IconComponent> = {
  instagram: InstagramLogo,
  whatsapp: WhatsappLogo,
  web: Globe,
  sms: ChatText,
};

/**
 * Channel marker — always a uniform CIRCLE of equal size. Brand logos fill the
 * circle edge-to-edge (object-cover); channels without a logo show a tinted
 * Phosphor glyph in a matching circle.
 */
export function ChannelIcon({
  channel,
  size = 'md',
  className,
}: {
  channel: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = { xs: 'w-5 h-5', sm: 'w-6 h-6', md: 'w-8 h-8', lg: 'w-10 h-10' }[size];
  const meta = CHANNEL_META[channel];
  const logo = LOGOS[channel];

  if (logo) {
    const zoom = ZOOM[channel] ?? 1;
    return (
      <span className={cn('inline-flex items-center justify-center rounded-full overflow-hidden bg-white', box, className)} title={meta?.name ?? channel}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt={meta?.name ?? channel}
          className="w-full h-full object-cover"
          style={zoom !== 1 ? { transform: `scale(${zoom})` } : undefined}
        />
      </span>
    );
  }

  const Icon = ICONS[channel] ?? Question;
  const px = { xs: 12, sm: 14, md: 18, lg: 22 }[size];
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-full', box, className)}
      style={{ backgroundColor: meta ? `${meta.color}1A` : '#e2e8f0', color: meta?.color ?? '#64748b' }}
      title={meta?.name ?? channel}
    >
      <Icon size={px} weight="fill" />
    </span>
  );
}
