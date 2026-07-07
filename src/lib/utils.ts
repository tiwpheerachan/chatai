import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ComponentType } from 'react';

/** Structural type for a Phosphor (or any) icon component. */
export type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
export type IconComponent = ComponentType<{ size?: number | string; weight?: IconWeight; className?: string; color?: string }>;
import {
  MessageCircle, Facebook, Instagram, ShoppingBag, Music2, ShoppingCart,
  Phone, Globe, Mail, MessageSquare, Store, type LucideIcon,
} from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ChannelMeta {
  name: string;
  color: string;   // brand hex
  bg: string;      // tailwind bg tint
  text: string;    // tailwind text tint
  ring: string;    // tailwind ring tint
  icon: LucideIcon;
}

export const CHANNEL_META: Record<string, ChannelMeta> = {
  line:      { name: 'LINE OA',     color: '#06C755', bg: 'bg-green-50',   text: 'text-green-700',   ring: 'ring-green-200',   icon: MessageCircle },
  facebook:  { name: 'Facebook',    color: '#1877F2', bg: 'bg-blue-50',    text: 'text-blue-700',    ring: 'ring-blue-200',    icon: Facebook },
  instagram: { name: 'Instagram',   color: '#E4405F', bg: 'bg-pink-50',    text: 'text-pink-700',    ring: 'ring-pink-200',    icon: Instagram },
  shopee:    { name: 'Shopee',      color: '#EE4D2D', bg: 'bg-orange-50',  text: 'text-orange-700',  ring: 'ring-orange-200',  icon: ShoppingBag },
  tiktok:    { name: 'TikTok Shop', color: '#111111', bg: 'bg-gray-100',   text: 'text-gray-900',    ring: 'ring-gray-300',    icon: Music2 },
  lazada:    { name: 'Lazada',      color: '#0F146D', bg: 'bg-indigo-50',  text: 'text-indigo-700',  ring: 'ring-indigo-200',  icon: ShoppingCart },
  whatsapp:  { name: 'WhatsApp',    color: '#25D366', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', icon: Phone },
  web:       { name: 'Web Widget',  color: '#6366F1', bg: 'bg-violet-50',  text: 'text-violet-700',  ring: 'ring-violet-200',  icon: Globe },
  email:     { name: 'Email',       color: '#64748b', bg: 'bg-slate-100',  text: 'text-slate-700',   ring: 'ring-slate-200',   icon: Mail },
  sms:       { name: 'SMS',         color: '#0ea5e9', bg: 'bg-sky-50',     text: 'text-sky-700',     ring: 'ring-sky-200',     icon: MessageSquare },
  shopify:   { name: 'Shopify',     color: '#95BF47', bg: 'bg-lime-50',    text: 'text-lime-700',    ring: 'ring-lime-200',    icon: Store },
};

/** Active platforms the product supports — drives every channel picker/filter. */
export const PLATFORM_CHANNELS = ['facebook', 'line', 'lazada', 'shopee', 'tiktok', 'shopify'] as const;

export function formatRelativeTime(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาที`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชม.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} วัน`;
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

/** Deterministic pleasant color from a string (for avatars). */
const AVATAR_COLORS = [
  'bg-rose-500', 'bg-pink-500', 'bg-fuchsia-500', 'bg-purple-500', 'bg-violet-500',
  'bg-indigo-500', 'bg-blue-500', 'bg-sky-500', 'bg-cyan-500', 'bg-teal-500',
  'bg-emerald-500', 'bg-green-500', 'bg-lime-600', 'bg-amber-500', 'bg-orange-500',
];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const AVATAR_HEX = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#3b82f6', '#a855f7', '#06b6d4'];

export function colorHex(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_HEX[Math.abs(hash) % AVATAR_HEX.length];
}

/** Real brand logos (in /public/brands). Brands without a file fall back to an initials avatar. */
export const BRAND_LOGOS: Record<string, string> = {
  '70mai': '/brands/70mai.png',
  'Anker': '/brands/anker.jpg',
  'DDpai': '/brands/ddpai.jpg',
  'Dreame': '/brands/dreame.png',
  'Levoit': '/brands/levoit.jpg',
  'Mibro': '/brands/mibro.png',
  'Mova': '/brands/mova.png',
  'Soundcore': '/brands/soundcore.jpg',
  'Thaimall': '/brands/thaimall.jpg',
  'Toptoy': '/brands/toptoy.jpg',
  'Uwant': '/brands/uwant.png',
  'Vinko': '/brands/vinko.png',
  'Wanbo': '/brands/wanbo.jpg',
  'Xiaomi Home Appliances': '/brands/xiaomi-home.webp',
  'Xiaomi MG': '/brands/xiaomi.png',
  'Xiaomi Smart App': '/brands/xiaomi.png',
  'Zepp': '/brands/zepp.png',
};

/** Brand logo image if available, otherwise a generated initials avatar. */
export function brandIcon(name: string): string {
  return BRAND_LOGOS[name] ?? brandAvatarUri(name);
}

/** Generates an inline SVG data-URI avatar (gradient tile + initials) for a brand. */
export function brandAvatarUri(name: string): string {
  const bg = colorHex(name);
  const t = initials(name);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${bg}bb"/></linearGradient></defs>` +
    `<rect width="64" height="64" rx="20" fill="url(#g)"/>` +
    `<text x="32" y="34" font-family="Space Grotesk,Inter,sans-serif" font-size="24" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">${t}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
