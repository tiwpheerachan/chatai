import { Topbar } from '@/components/layout/topbar';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SocialInsightsClient } from './social-insights.client';

export const dynamic = 'force-dynamic';

export default async function SocialInsightsPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  return (
    <>
      <Topbar title="สถิติเพจ Facebook / Instagram" subtitle="ผู้ติดตาม · การเข้าถึง · การมีส่วนร่วม (28 วัน)" />
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <SocialInsightsClient />
      </div>
    </>
  );
}
