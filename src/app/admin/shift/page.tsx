import { Topbar } from '@/components/layout/topbar';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ShiftClient } from './shift.client';

export const dynamic = 'force-dynamic';

export default async function ShiftPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  return (
    <>
      <Topbar title="สรุปปิดกะ" subtitle="สรุปงานกะนี้ + เคสค้างที่ต้องส่งต่อ" />
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <ShiftClient />
      </div>
    </>
  );
}
