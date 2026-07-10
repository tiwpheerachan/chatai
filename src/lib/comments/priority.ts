// Instant, dependency-free urgency triage (the "format" that tells the team how
// fast to handle a comment). Derived from the fields the AI pipeline already set
// (urgent / severity / sentiment / rating / category) — no API cost, client-safe.

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface PriorityInfo {
  level: PriorityLevel;
  label: string;   // Thai chip label
  cls: string;     // tailwind classes for the chip
  sla: string;     // "how soon to reply" hint
  rank: number;    // for sorting (0 = most urgent)
}

export const PRIORITY_RANK: Record<PriorityLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };

type PriInput = {
  urgent?: boolean | null; severity?: number | null;
  sentiment?: string | null; rating?: number | null; category?: string | null;
};

export function commentPriority(c: PriInput): PriorityInfo {
  const neg = c.sentiment === 'negative';
  const rating = c.rating ?? 5;
  const sev = c.severity ?? 0;
  const safety = /ความปลอดภัย|สุขภาพ|อันตราย|ไฟ|ระเบิด|บาดเจ็บ/.test(c.category || '');

  let level: PriorityLevel;
  if ((c.urgent && safety) || sev >= 9 || (safety && neg)) level = 'critical';
  else if (c.urgent || sev >= 7 || (neg && rating <= 2)) level = 'high';
  else if (neg || sev >= 4 || rating === 3 || c.sentiment === 'neutral') level = 'medium';
  else level = 'low';

  const meta: Record<PriorityLevel, Omit<PriorityInfo, 'level' | 'rank'>> = {
    critical: { label: 'วิกฤต', cls: 'bg-rose-600 text-white', sla: 'ควรตอบทันที' },
    high: { label: 'ด่วน', cls: 'bg-rose-100 text-rose-700', sla: 'ควรตอบภายใน 1 ชม.' },
    medium: { label: 'ปานกลาง', cls: 'bg-amber-100 text-amber-700', sla: 'ควรตอบภายใน 24 ชม.' },
    low: { label: 'ปกติ', cls: 'bg-slate-100 text-slate-500', sla: 'ตอบเมื่อสะดวก' },
  };
  return { level, rank: PRIORITY_RANK[level], ...meta[level] };
}
