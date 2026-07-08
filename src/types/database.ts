// Auto-generatable via `supabase gen types typescript` — manual version here
export type UserRole = 'owner' | 'admin' | 'supervisor' | 'agent' | 'viewer' | 'ai';
export type ChannelType = 'line' | 'facebook' | 'instagram' | 'shopee' | 'tiktok' | 'lazada' | 'whatsapp' | 'web' | 'email' | 'sms' | 'shopify';
export type ConversationStatus = 'open' | 'pending' | 'solved' | 'closed';
export type ConversationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SenderType = 'customer' | 'agent' | 'ai' | 'system' | 'note';

export interface Brand {
  id: string;
  name: string;
  slug: string | null;
  color: string;
  logo_url: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  avatar_color: string | null;
  role: UserRole;
  brand_id: string | null;
  status: string;
  allowed_brand_ids: string[] | null;   // null = inherit role default
  allowed_channels: ChannelType[] | null; // null = inherit role default
  created_at: string;
}

export interface RolePermissionRow {
  role: UserRole;
  permissions: string[];
  brand_scope: string[] | null;
  channel_scope: ChannelType[] | null;
  updated_at: string;
}

export interface Customer {
  id: string;
  brand_id: string | null;
  display_name: string | null;
  channel: ChannelType | null;
  channel_user_id: string | null;
  email: string | null;
  phone: string | null;
  avatar: string;
  ltv: number;
  order_count: number;
  sentiment: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Conversation {
  id: string;
  customer_id: string;
  brand_id: string | null;
  channel: ChannelType;
  status: ConversationStatus;
  priority: ConversationPriority;
  assigned_to: string | null;
  ai_handling: boolean;
  pinned?: boolean;
  unread: number;
  tags: string[];
  sla_due_at: string | null;
  last_message_at: string;
  created_at: string;
  // external chat-source linkage (Shopee/TikTok)
  external_id?: string | null;
  shop_id?: string | null;
  buyer_id?: string | null;
  // denormalized list preview
  last_snippet?: string | null;
  last_message_type?: string | null;
  // joined
  customer?: Customer;
  customer_name?: string;
  customer_avatar?: string | null;
  brand?: { name: string | null; slug: string | null; color: string | null } | null;
  brand_name?: string | null;
  brand_slug?: string | null;
  brand_color?: string | null;
  assignee?: { id: string; name: string | null } | null;
  assignee_name?: string | null;
}

export type MessageAttachment =
  | { type: 'image'; url: string | null; thumb_url?: string | null; width?: number; height?: number }
  | { type: 'video'; url: string | null }
  | { type: 'sticker'; url: string | null; sticker_id?: string; sticker_package_id?: string }
  | { type: 'item'; item_id?: string | number; shop_id?: string | number }
  | { type: 'order'; order_sn?: string }
  | { type: string; [k: string]: unknown };

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  sender_id: string | null;
  text: string | null;
  message_type?: string;
  attachments: MessageAttachment[];
  metadata: { confidence?: number; sources?: { id: string; title: string }[]; intent?: string };
  created_at: string;
}

export interface KnowledgeBaseDoc {
  id: string;
  brand_id: string | null;
  title: string;
  content: string;
  tags: string[];
  embedding: number[] | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface Macro {
  id: string;
  brand_id: string | null;
  title: string;
  shortcut: string | null;
  text: string;
  uses: number;
  created_at: string;
}

export interface BotRule {
  id: string;
  brand_id: string | null;
  pattern: string;
  intent: string | null;
  response_template: string | null;
  action: 'reply' | 'handoff' | 'tag' | 'escalate';
  priority: number;
  enabled: boolean;
  created_at: string;
}

export interface Channel {
  id: string;
  brand_id: string | null;
  type: ChannelType;
  name: string | null;
  status: 'connected' | 'pending' | 'error';
  credentials: Record<string, unknown>;
  webhook_url: string | null;
  created_at: string;
}
