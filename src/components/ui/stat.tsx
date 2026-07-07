import { Card } from './card';
import { cn, type IconComponent } from '@/lib/utils';

const toneMap: Record<string, { grad: string; shadow: string }> = {
  indigo:  { grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)', shadow: '#6366f180' },
  emerald: { grad: 'linear-gradient(135deg,#10b981,#06b6d4)', shadow: '#10b98180' },
  amber:   { grad: 'linear-gradient(135deg,#f59e0b,#f97316)', shadow: '#f59e0b80' },
  rose:    { grad: 'linear-gradient(135deg,#f43f5e,#ec4899)', shadow: '#f43f5e80' },
};

export function Stat({
  label,
  value,
  change,
  icon: Icon,
  tone = 'indigo',
}: {
  label: string;
  value: string | number;
  change?: string;
  icon?: IconComponent;
  tone?: keyof typeof toneMap;
}) {
  const t = toneMap[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-slate-500 mb-1">{label}</div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
          {change && (
            <div className={cn('text-xs mt-1', change.startsWith('+') ? 'text-emerald-600' : 'text-rose-600')}>
              {change}
            </div>
          )}
        </div>
        {Icon && (
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white"
            style={{ background: t.grad, boxShadow: `0 6px 14px -4px ${t.shadow}` }}
          >
            <Icon size={22} weight="duotone" />
          </div>
        )}
      </div>
    </Card>
  );
}
