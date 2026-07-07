import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui/card';
import { BotTestPanel } from './test-panel.client';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default async function BotPage() {
  const supabase = createClient();
  const { data: rules } = await supabase
    .from('bot_rules')
    .select('*')
    .order('priority', { ascending: false });

  return (
    <>
      <Topbar title="AI Bot — Aria" subtitle="ตั้งค่า + ทดสอบ AI agent">
        <Link href="/admin/ai-bot/rules" className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold">+ เพิ่ม Rule</Link>
      </Topbar>
      <div className="p-6 grid grid-cols-3 gap-6 overflow-y-auto scroll-thin flex-1">
        <div className="col-span-2 space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-1">🤖 Aria — AI Agent</h3>
            <p className="text-xs text-slate-500 mb-4">ตอบจาก Knowledge Base + Pattern + LLM ({process.env.LLM_PROVIDER || 'mock'})</p>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs font-semibold">บุคลิก (System Prompt)</label>
                <textarea rows={4} defaultValue="คุณคือ Aria ผู้ช่วยลูกค้า ตอบสุภาพ เป็นกันเอง ใช้คำว่า 'ค่ะ' ลงท้าย" className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold">Confidence Threshold</label>
                  <input type="range" min="0" max="100" defaultValue="50" className="w-full mt-2" />
                  <div className="text-xs text-slate-500">หาก confidence &lt; 50% → handoff</div>
                </div>
                <div>
                  <label className="text-xs font-semibold">Auto Handoff</label>
                  <div className="mt-2 space-y-1.5">
                    <label className="flex items-center gap-2"><input type="checkbox" defaultChecked />ลูกค้าโกรธ</label>
                    <label className="flex items-center gap-2"><input type="checkbox" defaultChecked />คำขอ refund</label>
                    <label className="flex items-center gap-2"><input type="checkbox" />VIP customer</label>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">⚙️ Pattern / Intent Rules</h3>
            <div className="space-y-2">
              {(rules || []).map(r => (
                <div key={r.id} className="p-3 rounded-lg bg-slate-50 flex items-center gap-3 text-sm">
                  <code className="bg-white px-2 py-1 rounded text-xs text-rose-600 truncate max-w-xs">{r.pattern}</code>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="flex-1 text-slate-700 truncate">{r.response_template || r.action}</span>
                  <span className="text-xs font-semibold text-emerald-600">{r.action}</span>
                </div>
              ))}
              {!rules?.length && <div className="text-sm text-slate-400">ยังไม่มี rules</div>}
            </div>
          </Card>
        </div>
        <BotTestPanel />
      </div>
    </>
  );
}
