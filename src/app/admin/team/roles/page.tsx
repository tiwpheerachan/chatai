import { Topbar } from '@/components/layout/topbar';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { RolesClient } from './roles.client';
import type { Brand } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function RoleMatrixPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');

  const { data: brands } = await ctx.sb.from('brands').select('id,name,color').order('name');

  return (
    <>
      <Topbar title="สิทธิ์ตาม Role" subtitle="กำหนดสิทธิ์การทำงาน + แบรนด์/ช่องทางที่แต่ละ Role เห็นได้" />
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <RolesClient
          brands={(brands as Pick<Brand, 'id' | 'name' | 'color'>[]) || []}
          canManage={ctx.can('team.write')}
        />
      </div>
    </>
  );
}
