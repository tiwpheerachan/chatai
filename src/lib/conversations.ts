import { createAdminClient } from './supabase/admin';
import type { ChannelType, SenderType } from '@/types/database';

/** Short preview text for the inbox list, given a message's type + text. */
export function messageSnippet(messageType: string | undefined, text: string | null): string {
  if (text && text.trim()) return text.trim().slice(0, 140);
  switch (messageType) {
    case 'image': return 'รูปภาพ';
    case 'video': return 'วิดีโอ';
    case 'sticker': return 'สติกเกอร์';
    case 'item': return 'การ์ดสินค้า';
    case 'order': return 'การ์ดออเดอร์';
    default: return '';
  }
}

export async function upsertCustomer(opts: {
  channel: ChannelType;
  channel_user_id: string;
  display_name?: string;
  brand_id?: string | null;
  avatar?: string;
}) {
  const sb = createAdminClient();
  const { data: existing } = await sb
    .from('customers')
    .select('id')
    .eq('channel', opts.channel)
    .eq('channel_user_id', opts.channel_user_id)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await sb
    .from('customers')
    .insert({
      brand_id: opts.brand_id || null,
      display_name: opts.display_name || 'Customer',
      channel: opts.channel,
      channel_user_id: opts.channel_user_id,
      avatar: opts.avatar || '👤',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function getOrCreateConversation(opts: {
  customer_id: string;
  channel: ChannelType;
  brand_id?: string | null;
}) {
  const sb = createAdminClient();
  const { data: open } = await sb
    .from('conversations')
    .select('id')
    .eq('customer_id', opts.customer_id)
    .in('status', ['open', 'pending'])
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) return open.id;

  const slaDue = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from('conversations')
    .insert({
      customer_id: opts.customer_id,
      channel: opts.channel,
      brand_id: opts.brand_id || null,
      sla_due_at: slaDue,
      ai_handling: false,   // human-first: no AI auto-reply until a person turns it on
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function addMessage(opts: {
  conversation_id: string;
  sender_type: SenderType;
  sender_id?: string | null;
  text: string | null;
  message_type?: string;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
}) {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('messages')
    .insert({
      conversation_id: opts.conversation_id,
      sender_type: opts.sender_type,
      sender_id: opts.sender_id || null,
      text: opts.text,
      message_type: opts.message_type || 'text',
      attachments: opts.attachments || [],
      metadata: opts.metadata || {},
    })
    .select('*')
    .single();
  if (error) throw error;

  // keep the inbox-list preview fresh
  await sb.from('conversations').update({
    last_snippet: messageSnippet(opts.message_type, opts.text),
    last_message_type: opts.message_type || 'text',
  }).eq('id', opts.conversation_id);

  // log analytics
  await sb.from('analytics_events').insert({
    event: `message.${opts.sender_type}`,
    conversation_id: opts.conversation_id,
    user_id: opts.sender_id || null,
    value: 1,
  });

  return data;
}
