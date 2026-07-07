import type { UserRole } from '@/types/database';

/**
 * Default role-based permission matrix. Used to seed `role_permissions` and as
 * a fallback when a role's DB row is missing. The live source of truth at
 * runtime is the `role_permissions` table (editable in the UI).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  owner:      ['*'],
  admin:      ['chat.*', 'macro.*', 'kb.*', 'team.*', 'channel.*', 'analytics.*', 'order.*'],
  supervisor: ['chat.*', 'macro.*', 'kb.*', 'analytics.*', 'order.*'],
  agent:      ['chat.read', 'chat.reply', 'chat.transfer', 'chat.tag', 'macro.read', 'analytics.own'],
  viewer:     ['chat.read', 'analytics.read'],
  ai:         ['chat.reply'],
};

/** @deprecated use DEFAULT_ROLE_PERMISSIONS */
export const PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;

export function can(role: UserRole | undefined | null, action: string): boolean {
  if (!role) return false;
  const perms = PERMISSIONS[role] || [];
  if (perms.includes('*')) return true;
  for (const p of perms) {
    if (p === action) return true;
    if (p.endsWith('.*') && action.startsWith(p.slice(0, -1))) return true;
  }
  return false;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  supervisor: 'Supervisor',
  agent: 'Agent',
  viewer: 'Viewer',
  ai: 'AI',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-indigo-100 text-indigo-700',
  supervisor: 'bg-blue-100 text-blue-700',
  agent: 'bg-emerald-100 text-emerald-700',
  viewer: 'bg-slate-100 text-slate-700',
  ai: 'bg-violet-100 text-violet-700',
};
