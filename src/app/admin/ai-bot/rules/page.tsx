import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function BotRulesPage() {
  const supabase = createClient();
  const { data: rules } = await supabase.from('bot_rules').select('*').order('priority', { ascending: false });
  return (
    <>
      <Topbar title="Bot Rules" subtitle="Pattern matching + intent + action" />
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Pattern (regex)</th>
                <th className="text-left px-4 py-3">Intent</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-right px-4 py-3">Priority</th>
                <th className="text-center px-4 py-3">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {(rules || []).map(r => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3"><code className="text-xs bg-slate-100 px-2 py-1 rounded text-rose-600">{r.pattern}</code></td>
                  <td className="px-4 py-3">{r.intent}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">{r.action}</span></td>
                  <td className="px-4 py-3 text-right font-semibold">{r.priority}</td>
                  <td className="px-4 py-3 text-center">{r.enabled ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
