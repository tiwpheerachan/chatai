import { Topbar } from '@/components/layout/topbar';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SocialCommentsClient } from './social-comments.client';

export const dynamic = 'force-dynamic';

export default async function SocialCommentsPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  return (
    <>
      <Topbar title="คอมเมนต์ Facebook / Instagram" subtitle="อ่าน + ตอบคอมเมนต์ใต้โพสต์เพจ ในที่เดียว" />
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <SocialCommentsClient />
      </div>
    </>
  );
}
