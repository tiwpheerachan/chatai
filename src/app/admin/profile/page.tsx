import { Topbar } from '@/components/layout/topbar';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ProfileClient } from './profile.client';
import { GreetingNames } from './greeting-names.client';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');

  const { data: profile } = await ctx.sb.from('profiles').select('*').eq('id', ctx.userId).maybeSingle();

  return (
    <>
      <Topbar title="โปรไฟล์ของฉัน" subtitle="จัดการบัญชีและความปลอดภัย" />
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <ProfileClient
          profile={{
            name: profile?.name || '',
            email: ctx.email,
            role: ctx.role,
            avatar: profile?.avatar || null,
            avatar_color: profile?.avatar_color || null,
          }}
          permissions={ctx.permissions}
          scope={ctx.scope}
        />
        <div className="max-w-3xl mt-5"><GreetingNames /></div>
      </div>
    </>
  );
}
