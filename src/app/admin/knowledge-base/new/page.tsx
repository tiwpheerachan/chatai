'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui/card';

export default function NewKBPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/kb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, tags: tags.split(',').map(t => t.trim()).filter(Boolean) }),
    });
    setLoading(false);
    router.push('/admin/knowledge-base');
    router.refresh();
  };

  return (
    <>
      <Topbar title="เพิ่มเอกสาร Knowledge Base" subtitle="AI จะใช้เอกสารนี้ตอบลูกค้า" />
      <div className="p-6 max-w-2xl overflow-y-auto scroll-thin flex-1">
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold">หัวข้อ</label>
              <input required value={title} onChange={e => setTitle(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="text-xs font-semibold">เนื้อหา</label>
              <textarea required rows={8} value={content} onChange={e => setContent(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2 font-mono text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold">แท็ก (คั่นด้วย ,)</label>
              <input value={tags} onChange={e => setTags(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2" />
            </div>
            <button disabled={loading} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50">
              {loading ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
