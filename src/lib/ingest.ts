/**
 * Inbound message ingestion — used by ALL webhook handlers.
 * Normalize → upsert customer → create conversation → store message →
 * trigger AI if ai_handling=true → send reply back to channel.
 */
import { createAdminClient } from './supabase/admin';
import { upsertCustomer, getOrCreateConversation, addMessage } from './conversations';
import { generateReply } from './bot';
import { sendTo } from './channels';
import type { ChannelType } from '@/types/database';

export interface IngestInput {
  channel: ChannelType;
  channel_user_id: string;
  display_name?: string;
  text: string;
  brand_id?: string | null;
  avatar?: string;
}

export async function ingest(input: IngestInput): Promise<{ conversationId: string; aiReplyText?: string }> {
  const sb = createAdminClient();

  const customer_id = await upsertCustomer(input);
  const conversationId = await getOrCreateConversation({
    customer_id,
    channel: input.channel,
    brand_id: input.brand_id || null,
  });

  await addMessage({
    conversation_id: conversationId,
    sender_type: 'customer',
    text: input.text,
  });

  const { data: conv } = await sb
    .from('conversations')
    .select('ai_handling, brand_id')
    .eq('id', conversationId)
    .single();

  // GLOBAL KILL-SWITCH: never auto-generate/auto-send an AI reply to a real
  // customer unless AI_AUTOREPLY_ENABLED is explicitly "true". Default OFF —
  // Nexus is human-reply-only (drafts are copy/send by a person). This guards
  // the webhook path even for legacy conversations whose ai_handling is true.
  const autoReplyOn = process.env.AI_AUTOREPLY_ENABLED === 'true';

  if (autoReplyOn && conv?.ai_handling) {
    const { data: history } = await sb
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(8);

    const reply = await generateReply({
      userMessage: input.text,
      brand_id: conv.brand_id,
      history: (history as never) || [],
      customerName: input.display_name,
    });

    await addMessage({
      conversation_id: conversationId,
      sender_type: 'ai',
      text: reply.text,
      metadata: {
        confidence: reply.confidence,
        sources: reply.sources,
        intent: reply.intent,
      },
    });

    if (reply.handoff || reply.confidence < 0.5) {
      await sb.from('conversations').update({ ai_handling: false, priority: 'high' }).eq('id', conversationId);
    }

    await sendTo(input.channel, input.channel_user_id, reply.text);
    return { conversationId, aiReplyText: reply.text };
  }

  return { conversationId };
}
