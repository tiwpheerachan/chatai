import { Sidebar } from '@/components/layout/sidebar';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');

  return (
    <div className="flex h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-fuchsia-50/70">
      <Sidebar
        user={{ name: ctx.name, email: ctx.email, avatar: ctx.avatarUrl, role: ctx.role }}
        permissions={ctx.permissions}
      />
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
