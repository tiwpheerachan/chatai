import { Topbar } from '@/components/layout/topbar';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { MetaConnect } from './meta.client';

export const dynamic = 'force-dynamic';

export default async function MetaChannelPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  return (
    <>
      <Topbar title="เชื่อมต่อ Facebook หลายแบรนด์" subtitle="จับคู่เพจ Meta → แบรนด์ แล้วรับ-ตอบแชทแยกแบรนด์" />
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <MetaConnect />
      </div>
    </>
  );
}
