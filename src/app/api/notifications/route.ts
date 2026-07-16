import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { detectRisk } from '@/lib/risk';

export const dynamic = 'force-dynamic';

// ============================================================
// #7 Notifications — a live "needs attention" feed over conversations that still
// have unread customer messages (brand-scoped). Each item is classified into one
// primary bucket so the bell can show per-type counts:
//   urgent  — ด่วน/เสี่ยง (priority high/urgent OR a risk word in the snippet)
//   vip     — ลูกค้า VIP (manual vip flag OR high order_count / ltv)
//   new     — แชทใหม่ (conversation created in the last 24h)
//   repeat  — ลูกค้าเก่าทักมา (returning customer: order_count >= 1)
// Not a persistent read/unread log — it reflects what currently needs a human.
// ============================================================
const VIP_ORDERS = 3;
const VIP_LTV = 10000;
const DAY = 24 * 3600 * 1000;

export async function GET(_req: Request) {
  const { ctx, res } = await authorize('chat.read');
  if (!ctx) return res;

  const sb = createAdminClient();
  const brands = ctx.scope.brands; // null = all
  let q = sb
    .from('conversations')
    .select('id, status, priority, unread, last_snippet, last_message_at, created_at, customer:customers(display_name,avatar,ltv,order_count), brand:brands(name,color)')
    .gt('unread', 0)
    .order('last_message_at', { ascending: false })
    .limit(60);
  if (brands) q = q.in('brand_id', brands.length ? brands : ['00000000-0000-0000-0000-000000000000']);
  const { data } = await q;

  const now = Date.now();
  const items = ((data as any[]) || []).map((c) => {
    const cu = c.customer || {};
    const isVip = (cu.order_count || 0) >= VIP_ORDERS || Number(cu.ltv || 0) >= VIP_LTV;
    const risk = detectRisk(c.last_snippet);
    const urgent = c.priority === 'high' || c.priority === 'urgent' || !!risk;
    const isNew = c.created_at && now - new Date(c.created_at).getTime() < DAY;
    const repeat = (cu.order_count || 0) >= 1;

    // Primary bucket (most-important-first).
    const type: 'urgent' | 'vip' | 'new' | 'repeat' =
      urgent ? 'urgent' : isVip ? 'vip' : isNew ? 'new' : repeat ? 'repeat' : 'new';

    return {
      id: c.id,
      type,
      name: cu.display_name || '-',
      avatar: cu.avatar || null,
      snippet: c.last_snippet || '',
      unread: c.unread || 0,
      at: c.last_message_at,
      brand_name: c.brand?.name || null,
      brand_color: c.brand?.color || null,
      vip: isVip,
      risk: risk ? risk.severity : null,
    };
  });

  const counts = {
    total: items.length,
    urgent: items.filter(i => i.type === 'urgent').length,
    vip: items.filter(i => i.type === 'vip').length,
    new: items.filter(i => i.type === 'new').length,
    repeat: items.filter(i => i.type === 'repeat').length,
  };

  return NextResponse.json({ counts, items: items.slice(0, 40) });
}
