import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function MacrosPage() {
  const supabase = createClient();
  const { data: macros } = await supabase.from('macros').select('*').order('uses', { ascending: false });
  return (
    <>
      <Topbar title="Macros / Quick Replies" subtitle="เทมเพลตตอบเร็ว">
        <button className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold">+ เพิ่ม Macro</button>
      </Topbar>
      <div className="p-6 overflow-y-auto scroll-thin flex-1">
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">ชื่อ</th>
                <th className="text-left px-4 py-3">Shortcut</th>
                <th className="text-left px-4 py-3">เนื้อหา</th>
                <th className="text-right px-4 py-3">การใช้</th>
              </tr>
            </thead>
            <tbody>
              {(macros || []).map(m => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{m.title}</td>
                  <td className="px-4 py-3"><code className="text-xs bg-slate-100 px-2 py-1 rounded">{m.shortcut}</code></td>
                  <td className="px-4 py-3 text-slate-600 max-w-md truncate">{m.text}</td>
                  <td className="px-4 py-3 text-right">{m.uses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
