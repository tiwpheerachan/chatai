import { Topbar } from '@/components/layout/topbar';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { QuestionsClient } from './questions.client';

export const dynamic = 'force-dynamic';

export default async function QuestionsPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  return (
    <>
      <Topbar title="คำถามยอดฮิต" subtitle="ลูกค้าถามอะไรบ่อยที่สุด — เตรียมคำตอบล่วงหน้า" />
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <QuestionsClient />
      </div>
    </>
  );
}
