import type { ChannelType } from '@/types/database';

interface SendResult {
  ok?: boolean;
  mock?: boolean;
  sent?: string;
  error?: string;
}

async function sendLINE(userId: string, text: string): Promise<SendResult> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return { mock: true, sent: text };
  const r = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
  });
  if (!r.ok) return { error: `LINE: ${r.status}` };
  return { ok: true };
}

async function sendMeta(recipientId: string, text: string): Promise<SendResult> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return { mock: true, sent: text };
  const r = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text }, messaging_type: 'RESPONSE' }),
  });
  if (!r.ok) return { error: `Meta: ${r.status}` };
  return { ok: true };
}

async function sendWhatsApp(phone: string, text: string): Promise<SendResult> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !phoneId) return { mock: true, sent: text };
  const r = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }),
  });
  if (!r.ok) return { error: `WA: ${r.status}` };
  return { ok: true };
}

async function sendShopee(_conversationId: string, text: string): Promise<SendResult> {
  if (!process.env.SHOPEE_PARTNER_KEY) return { mock: true, sent: text };
  // TODO: HMAC sign + POST /api/v2/sellerchat/send_message
  return { ok: true };
}

async function sendTikTok(_conversationId: string, text: string): Promise<SendResult> {
  if (!process.env.TIKTOK_APP_SECRET) return { mock: true, sent: text };
  // TODO: TikTok Shop Open Platform call
  return { ok: true };
}

export async function sendTo(channel: ChannelType, target: string, text: string): Promise<SendResult> {
  try {
    switch (channel) {
      case 'line':      return await sendLINE(target, text);
      case 'facebook':
      case 'instagram': return await sendMeta(target, text);
      case 'whatsapp':  return await sendWhatsApp(target, text);
      case 'shopee':    return await sendShopee(target, text);
      case 'tiktok':    return await sendTikTok(target, text);
      case 'web':       return { ok: true };
      default:          return { error: `unsupported channel: ${channel}` };
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
}
