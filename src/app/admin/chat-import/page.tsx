import { Topbar } from '@/components/layout/topbar';
import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ChatImportClient } from './chat-import.client';

export const dynamic = 'force-dynamic';

export default async function ChatImportPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  if (!ctx.can('chat.read')) redirect('/admin/dashboard');

  const configured = !!process.env.CHAT_API_KEY;
  const canReply = ctx.can('chat.reply');

  return (
    <>
      <Topbar title="แชท Shopee (หลายแบรนด์)" subtitle="อ่านบทสนทนาจริง + ตอบกลับด้วยแอดมิน — ยังไม่เปิด AI ตอบอัตโนมัติ">
        <Badge tone="brand">Shopee</Badge>
        <Badge tone={configured ? 'emerald' : 'rose'}>{configured ? 'API key พร้อม' : 'ยังไม่ตั้ง CHAT_API_KEY'}</Badge>
      </Topbar>
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <ChatImportClient canReply={canReply} />
      </div>
    </>
  );
}
