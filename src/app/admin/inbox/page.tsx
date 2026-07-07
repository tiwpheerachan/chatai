import { InboxClient } from './inbox.client';
import { createClient } from '@/lib/supabase/server';

export default async function InboxPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <InboxClient userId={user?.id || ''} />;
}
