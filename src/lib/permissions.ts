import type { UserRole } from '@/types/database';
import { DEFAULT_ROLE_PERMISSIONS } from './rbac';

/**
 * Catalog of all assignable permission keys, grouped for the role editor UI.
 * Keys use `area.action`; `area.*` grants every action in that area.
 */
export const PERMISSION_CATALOG: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: 'แชท (Chat)',
    items: [
      { key: 'chat.read', label: 'ดูแชท' },
      { key: 'chat.reply', label: 'ตอบแชท' },
      { key: 'chat.transfer', label: 'โอนแชท' },
      { key: 'chat.tag', label: 'ติดแท็ก / จัดการ' },
    ],
  },
  {
    group: 'Knowledge Base',
    items: [
      { key: 'kb.read', label: 'ดู KB' },
      { key: 'kb.write', label: 'แก้ไข KB / Train AI' },
    ],
  },
  {
    group: 'Macros',
    items: [
      { key: 'macro.read', label: 'ดู Macro' },
      { key: 'macro.write', label: 'จัดการ Macro' },
    ],
  },
  {
    group: 'Analytics',
    items: [
      { key: 'analytics.read', label: 'ดู Analytics ทั้งหมด' },
      { key: 'analytics.own', label: 'ดู Analytics ของตัวเอง' },
    ],
  },
  {
    group: 'ทีม (Team)',
    items: [
      { key: 'team.read', label: 'ดูสมาชิกทีม' },
      { key: 'team.write', label: 'จัดการสมาชิก / สิทธิ์' },
    ],
  },
  {
    group: 'Channels',
    items: [
      { key: 'channel.read', label: 'ดูช่องทาง' },
      { key: 'channel.write', label: 'จัดการช่องทาง' },
    ],
  },
  {
    group: 'คำสั่งซื้อ (Order)',
    items: [
      { key: 'order.read', label: 'ดูคำสั่งซื้อ' },
      { key: 'order.write', label: 'จัดการ / Refund' },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.flatMap(g => g.items.map(i => i.key));

/** Does a permission list (with wildcards) grant `action`? */
export function matchPermission(perms: string[] | null | undefined, action: string): boolean {
  if (!perms) return false;
  if (perms.includes('*')) return true;
  for (const p of perms) {
    if (p === action) return true;
    if (p.endsWith('.*') && action.startsWith(p.slice(0, -1))) return true;
  }
  return false;
}

/** A single role's effective config (DB row falling back to hardcoded defaults). */
export interface RolePermission {
  role: UserRole;
  permissions: string[];
  brand_scope: string[] | null;   // null = all brands
  channel_scope: string[] | null; // null = all channels
}

export function defaultRolePermission(role: UserRole): RolePermission {
  return {
    role,
    permissions: DEFAULT_ROLE_PERMISSIONS[role] || [],
    brand_scope: null,
    channel_scope: null,
  };
}

export interface EffectiveScope {
  isOwner: boolean;
  brands: string[] | null;   // null = all
  channels: string[] | null; // null = all
}

/**
 * Combine role default scope with per-user overrides.
 * User override (non-null) wins; otherwise inherit the role; owner = all.
 */
export function effectiveScope(
  role: UserRole,
  rolePerm: RolePermission | null,
  userBrands: string[] | null,
  userChannels: string[] | null,
): EffectiveScope {
  if (role === 'owner') return { isOwner: true, brands: null, channels: null };
  const rp = rolePerm ?? defaultRolePermission(role);
  return {
    isOwner: false,
    brands: userBrands ?? rp.brand_scope,
    channels: userChannels ?? rp.channel_scope,
  };
}

export function scopeAllowsBrand(scope: EffectiveScope, brandId: string | null): boolean {
  if (scope.isOwner) return true;
  if (brandId === null) return true; // global
  if (scope.brands === null) return true; // all
  return scope.brands.includes(brandId);
}

export function scopeAllowsChannel(scope: EffectiveScope, channel: string | null): boolean {
  if (scope.isOwner) return true;
  if (channel === null) return true;
  if (scope.channels === null) return true;
  return scope.channels.includes(channel);
}
