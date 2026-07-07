import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from './supabase/server';
import {
  matchPermission, effectiveScope, scopeAllowsBrand, scopeAllowsChannel,
  type EffectiveScope, type RolePermission,
} from './permissions';
import { DEFAULT_ROLE_PERMISSIONS } from './rbac';
import type { UserRole } from '@/types/database';

export interface AuthContext {
  sb: SupabaseClient;
  userId: string;
  email: string;
  name: string;
  avatarColor: string | null;
  role: UserRole;
  brandId: string | null;
  avatarUrl: string | null;
  permissions: string[];
  scope: EffectiveScope;
  can: (action: string) => boolean;
  canSeeBrand: (brandId: string | null) => boolean;
  canSeeChannel: (channel: string | null) => boolean;
}

/**
 * Resolve the current user's full context (or null if not signed in).
 * Use in server components/layouts. API routes should use `authorize()`.
 */
export async function getCurrentContext(): Promise<AuthContext | null> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data: profile } = await sb
    .from('profiles')
    .select('name, role, brand_id, status, avatar, avatar_color, allowed_brand_ids, allowed_channels')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.status === 'disabled') return null;

  const role = profile.role as UserRole;
  const { data: roleRow } = await sb
    .from('role_permissions')
    .select('permissions, brand_scope, channel_scope')
    .eq('role', role)
    .maybeSingle();

  const rolePerm: RolePermission | null = roleRow
    ? { role, permissions: roleRow.permissions || [], brand_scope: roleRow.brand_scope, channel_scope: roleRow.channel_scope }
    : null;

  const permissions = role === 'owner' ? ['*'] : (rolePerm?.permissions ?? DEFAULT_ROLE_PERMISSIONS[role] ?? []);
  const scope = effectiveScope(role, rolePerm, profile.allowed_brand_ids ?? null, profile.allowed_channels ?? null);

  return {
    sb: sb as unknown as SupabaseClient,
    userId: user.id,
    email: user.email || '',
    name: profile.name,
    avatarColor: profile.avatar_color ?? null,
    role,
    brandId: profile.brand_id ?? null,
    avatarUrl: profile.avatar ?? null,
    permissions,
    scope,
    can: (a: string) => matchPermission(permissions, a),
    canSeeBrand: (b: string | null) => scopeAllowsBrand(scope, b),
    canSeeChannel: (c: string | null) => scopeAllowsChannel(scope, c),
  };
}

/**
 * Server-side guard for API routes.
 *
 *   const { ctx, res } = await authorize('kb.write');
 *   if (!ctx) return res;
 *   const { sb } = ctx;
 *
 * Loads the user's effective permissions and brand/channel scope from the DB
 * (role_permissions + per-user overrides), with owner bypass.
 */
export async function authorize(
  action?: string,
): Promise<{ ctx: AuthContext; res?: undefined } | { ctx?: undefined; res: NextResponse }> {
  const ctx = await getCurrentContext();
  if (!ctx) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (action && !ctx.can(action)) {
    return { res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ctx };
}

export function isAdminOrAbove(role: UserRole): boolean {
  return role === 'owner' || role === 'admin';
}
