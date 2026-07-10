import { getCurrentContext } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { commentsConfigured } from '@/lib/comments/db';
import { replyConfigured } from '@/lib/comments/shopee-reply';
import { CommentsClient } from './comments.client';

export const dynamic = 'force-dynamic';

export default async function CommentsPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  if (!ctx.can('chat.read')) redirect('/admin/dashboard');
  return (
    <CommentsClient
      configured={commentsConfigured()}
      canSend={ctx.can('chat.reply') && replyConfigured()}
      replyLive={replyConfigured()}
    />
  );
}
