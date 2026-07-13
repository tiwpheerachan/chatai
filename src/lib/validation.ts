import { z } from 'zod';
import { NextResponse } from 'next/server';

/** Reusable primitives */
export const uuid = z.string().uuid();
export const channelEnum = z.enum([
  'line', 'facebook', 'instagram', 'shopee', 'tiktok', 'lazada', 'whatsapp', 'web', 'email', 'sms', 'shopify',
]);

/** Returns the value only if it is a valid UUID, else undefined — for safe query filters. */
export function safeUuid(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return uuid.safeParse(value).success ? value : undefined;
}

/** Clamp a user-supplied numeric query param into a sane range. */
export function clampInt(value: string | null | undefined, def: number, min: number, max: number): number {
  const n = parseInt(value || '', 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/**
 * Parse + validate a JSON request body against a zod schema.
 * Returns either { data } or { res } (a ready 400 response).
 */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T>; res?: undefined } | { data?: undefined; res: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { res: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      res: NextResponse.json(
        { error: 'Validation failed', issues: result.error.flatten() },
        { status: 400 },
      ),
    };
  }
  return { data: result.data };
}

// ---- Domain schemas ----

export const ingestSchema = z.object({
  channel: channelEnum,
  channel_user_id: z.string().min(1).max(255),
  display_name: z.string().max(255).optional(),
  text: z.string().min(1).max(5000),
  brand_id: uuid.nullish(),
  avatar: z.string().max(16).optional(),
});

export const webWidgetSchema = z.object({
  session_id: z.string().min(1).max(255),
  name: z.string().max(255).optional(),
  text: z.string().min(1).max(5000),
  brand_id: uuid.nullish(),
});

export const kbUpsertSchema = z.object({
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(20000),
  brand_id: uuid.nullish(),
  tags: z.array(z.string().max(50)).max(30).optional(),
  source: z.string().max(300).optional(),
});

export const kbRetrieveSchema = z.object({
  query: z.string().min(1).max(2000),
  brand_id: uuid.nullish(),
  k: z.number().int().min(1).max(10).optional(),
});

export const botTestSchema = z.object({
  text: z.string().min(1).max(5000),
  brand_id: uuid.nullish(),
});

export const botRuleSchema = z.object({
  brand_id: uuid.nullish(),
  pattern: z.string().min(1).max(200),
  intent: z.string().max(100).optional(),
  response_template: z.string().max(2000).optional(),
  action: z.enum(['reply', 'handoff', 'tag', 'escalate']).optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

export const macroSchema = z.object({
  brand_id: uuid.nullish(),
  title: z.string().min(1).max(200),
  shortcut: z.string().max(50).optional(),
  text: z.string().min(1).max(4000),
});

export const brandSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(120).optional(),
  color: z.string().max(20).optional(),
  logo_url: z.string().url().max(1000).optional(),
});

export const sendMessageSchema = z.object({
  text: z.string().min(1).max(5000),
  note: z.boolean().optional(), // true = private internal note (not sent to the buyer)
});

export const transferSchema = z.object({
  to_user_id: uuid,
});

export const roleEnum = z.enum(['owner', 'admin', 'supervisor', 'agent', 'viewer', 'ai']);

export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatar_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  password: z.string().min(8).max(72).optional(),
}).refine(o => o.name !== undefined || o.avatar_color !== undefined || o.password !== undefined, {
  message: 'No fields to update',
});

export const userAdminUpdateSchema = z.object({
  role: roleEnum.optional(),
  status: z.enum(['online', 'offline', 'away', 'disabled']).optional(),
  brand_id: uuid.nullish(),
  allowed_brand_ids: z.array(uuid).nullable().optional(),     // null = inherit role
  allowed_channels: z.array(channelEnum).nullable().optional(),
  auto_assign: z.boolean().optional(),                        // opt-in to the auto-distribution queue
  max_open_chats: z.number().int().min(0).max(100000).nullable().optional(), // null = unlimited
}).strict();

export const rolePermissionsUpdateSchema = z.object({
  permissions: z.array(z.string().max(50)).max(50),
  brand_scope: z.array(uuid).nullable(),       // null = all
  channel_scope: z.array(channelEnum).nullable(),
}).strict();

export const conversationPatchSchema = z.object({
  status: z.enum(['open', 'pending', 'solved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assigned_to: uuid.nullish(),
  ai_handling: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(50).optional(),
  pinned: z.boolean().optional(),
}).strict();
