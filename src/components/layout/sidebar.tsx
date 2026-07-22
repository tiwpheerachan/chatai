'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { matchPermission } from '@/lib/permissions';
import { ROLE_LABELS } from '@/lib/rbac';
import { Avatar } from '@/components/ui/avatar';
import { Wordmark } from '@/components/ui/logo';
import { Fi } from '@/components/ui/fi';
import { NotificationBell } from '@/components/layout/notification-bell';
import type { UserRole } from '@/types/database';

interface NavItem { href: string; label: string; icon: string; perm?: string | string[] }
interface NavGroup { title: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    title: 'งานหลัก',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { href: '/admin/inbox', label: 'Unified Inbox', icon: 'comment-dots', perm: 'chat.read' },
      { href: '/admin/chat-import', label: 'ดึงแชท TikTok', icon: 'cloud-download', perm: 'chat.read' },
      { href: '/admin/comments', label: 'คอมเมนต์รีวิว', icon: 'comment-alt', perm: 'chat.read' },
      { href: '/admin/social-comments', label: 'คอมเมนต์ FB/IG', icon: 'social-network', perm: 'chat.read' },
      { href: '/admin/social-insights', label: 'สถิติเพจ FB/IG', icon: 'stats', perm: ['analytics.read', 'analytics.own'] },
      { href: '/admin/customers', label: 'ลูกค้า', icon: 'users', perm: 'chat.read' },
    ],
  },
  {
    title: 'AI & เนื้อหา',
    items: [
      { href: '/admin/knowledge-base', label: 'Knowledge Base', icon: 'book-alt', perm: 'kb.read' },
      { href: '/admin/playbook', label: 'ฉากสถานการณ์', icon: 'sparkles', perm: 'chat.read' },
      { href: '/admin/ai-bot', label: 'AI Bot', icon: 'robot', perm: 'kb.read' },
      { href: '/admin/macros', label: 'Macros', icon: 'bolt', perm: 'macro.read' },
    ],
  },
  {
    title: 'ระบบ',
    items: [
      { href: '/admin/analytics', label: 'Analytics', icon: 'chart-line-up', perm: ['analytics.read', 'analytics.own'] },
      { href: '/admin/insights', label: 'วิเคราะห์เชิงลึก', icon: 'chart-pie-alt', perm: 'chat.read' },
      { href: '/admin/questions', label: 'คำถามยอดฮิต', icon: 'interrogation', perm: 'chat.read' },
      { href: '/admin/shift', label: 'สรุปปิดกะ', icon: 'clipboard-list-check', perm: 'chat.read' },
      { href: '/admin/team', label: 'ทีม & สิทธิ์', icon: 'shield-check', perm: 'team.read' },
      { href: '/admin/workload', label: 'แบ่งงาน & Performance', icon: 'users-alt', perm: ['analytics.read', 'analytics.own'] },
      { href: '/admin/channels', label: 'ช่องทาง', icon: 'plug-connection', perm: 'channel.read' },
      { href: '/admin/audit-log', label: 'Audit Log', icon: 'clipboard-list', perm: 'team.read' },
      { href: '/admin/settings', label: 'ตั้งค่า', icon: 'settings', perm: 'team.read' },
    ],
  },
];

export function Sidebar({
  user,
  permissions,
}: {
  user: { name: string; email: string; avatar: string | null; role: UserRole } | null;
  permissions: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const allow = (perm?: string | string[]) => {
    if (!perm) return true;
    const list = Array.isArray(perm) ? perm : [perm];
    return list.some(p => matchPermission(permissions, p));
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      <div className="px-4 py-4">
        <Wordmark size={56} />
      </div>

      <nav className="flex-1 px-3 overflow-y-auto scroll-thin pb-3">
        {NAV.map(group => {
          const items = group.items.filter(it => allow(it.perm));
          if (!items.length) return null;
          return (
            <div key={group.title} className="mb-5">
              <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">{group.title}</div>
              {items.map((it, idx) => {
                const active = pathname === it.href || pathname.startsWith(it.href + '/');
                return (
                  <motion.div
                    key={it.href}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.02 * idx, ease: 'easeOut' }}
                  >
                    <Link
                      href={it.href}
                      className={cn(
                        'group/nav relative flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 transition-colors',
                        !active && 'hover:bg-slate-50',
                      )}
                    >
                      {/* elegant dark indicator that glides between items */}
                      {active && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-xl bg-slate-900"
                          style={{ boxShadow: '0 6px 16px -6px rgb(15 23 42 / 0.45)' }}
                          transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center justify-center shrink-0 w-6 h-6">
                        <Fi
                          name={it.icon}
                          className={cn('text-lg transition-colors', active ? 'text-white' : 'text-slate-400 group-hover/nav:text-slate-700')}
                        />
                      </span>
                      <span className={cn(
                        'relative z-10 text-sm transition-all duration-200',
                        active ? 'text-white font-medium tracking-wide' : 'text-slate-500 group-hover/nav:text-slate-800 group-hover/nav:translate-x-0.5',
                      )}>
                        {it.label}
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2.5">
          <Link href="/admin/profile" className="flex items-center gap-2.5 flex-1 min-w-0 group">
            <Avatar name={user?.name} src={user?.avatar} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate group-hover:text-brand-700">{user?.name || '-'}</div>
              <div className="text-[10px] text-slate-500">{user ? ROLE_LABELS[user.role] : ''}</div>
            </div>
          </Link>
          <NotificationBell />
          <Link href="/admin/profile" className="p-1.5 text-slate-400 hover:text-brand-600" title="โปรไฟล์">
            <Fi name="user-gear" className="text-lg" />
          </Link>
          <button onClick={signOut} className="p-1.5 text-slate-400 hover:text-rose-600" title="ออกจากระบบ">
            <Fi name="sign-out-alt" className="text-lg" />
          </button>
        </div>
      </div>
    </aside>
  );
}
