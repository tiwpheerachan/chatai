import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { createClient } from '@/lib/supabase/server';
import { FileText, Sparkles, Tag, Trash2, Pencil } from 'lucide-react';
import Link from 'next/link';

export default async function KBPage() {
  const supabase = createClient();
  const { data: docs } = await supabase
    .from('knowledge_base')
    .select('id,title,content,tags,brand_id,embedding,updated_at')
    .order('updated_at', { ascending: false });

  const withEmb = (docs || []).filter(d => d.embedding).length;
  const allTags = [...new Set((docs || []).flatMap(d => d.tags || []))];

  return (
    <>
      <Topbar title="Knowledge Base" subtitle="คลังข้อมูล AI (RAG)">
        <Link href="/admin/knowledge-base/new" className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold">+ เพิ่มเอกสาร</Link>
      </Topbar>
      <div className="p-6 space-y-4 overflow-y-auto scroll-thin flex-1">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="เอกสารทั้งหมด" value={docs?.length || 0} icon={FileText} tone="indigo" />
          <Stat label="With Embeddings" value={withEmb} icon={Sparkles} tone="emerald" />
          <Stat label="Total Tags" value={allTags.length} icon={Tag} tone="amber" />
        </div>
        <Card>
          <div className="divide-y divide-slate-100">
            {(docs || []).map(d => (
              <div key={d.id} className="p-4 hover:bg-slate-50 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-xl">📄</div>
                <div className="flex-1">
                  <div className="font-semibold text-slate-900">{d.title}</div>
                  <div className="text-xs text-slate-600 mt-1 line-clamp-2">{d.content}</div>
                  <div className="flex gap-1 mt-1.5">
                    {((d.tags || []) as string[]).map((t: string) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">#{t}</span>
                    ))}
                  </div>
                </div>
                <button className="p-1.5 text-slate-400 hover:text-indigo-600"><Pencil className="w-4 h-4" /></button>
                <button className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {!docs?.length && <div className="py-8 text-center text-slate-400 text-sm">ยังไม่มีเอกสาร — เพิ่มเอกสารเพื่อให้ AI ตอบฉลาดขึ้น</div>}
          </div>
        </Card>
      </div>
    </>
  );
}
