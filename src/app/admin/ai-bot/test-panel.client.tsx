'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';

interface BotReply {
  text: string;
  confidence: number;
  intent: string;
  sources: { id: string; title: string }[];
  handoff: boolean;
}

export function BotTestPanel() {
  const [test, setTest] = useState('');
  const [reply, setReply] = useState<BotReply | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    if (!test.trim()) return;
    setLoading(true);
    try {
      const r = await fetch('/api/bot/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: test }),
      });
      setReply(await r.json());
    } finally { setLoading(false); }
  };

  const samples = ['ขอคืนเงินค่ะ', 'serum ใช้ตอนไหน', 'พัสดุของถึงเมื่อไหร่', 'มีโค้ดส่วนลดมั้ย', 'สวัสดีค่ะ'];

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3">🧪 ทดสอบ Bot</h3>
      <textarea
        value={test}
        onChange={e => setTest(e.target.value)}
        rows={3}
        placeholder="พิมพ์เหมือนลูกค้าถาม..."
        className="w-full border border-slate-200 rounded-lg p-2 text-sm"
      />
      <button
        onClick={handleTest}
        disabled={loading}
        className="mt-2 w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
      >
        {loading ? 'กำลังคิด...' : 'ทดสอบ'}
      </button>
      {reply && (
        <div className="mt-3 p-3 bg-violet-50 rounded-lg">
          <div className="text-[10px] text-violet-700 font-semibold mb-1">🤖 Aria ({Math.round(reply.confidence * 100)}%)</div>
          <div className="text-sm">{reply.text}</div>
          {reply.sources?.length > 0 && (
            <div className="text-[10px] text-slate-500 mt-2">Sources: {reply.sources.map(s => s.title).join(', ')}</div>
          )}
          {reply.handoff && <div className="text-[10px] text-amber-600 mt-1 font-semibold">⚠️ Will hand off to human</div>}
        </div>
      )}
      <div className="mt-4 text-xs">
        <div className="font-semibold mb-1">💡 ลองพิมพ์:</div>
        {samples.map(s => (
          <button key={s} onClick={() => setTest(s)} className="block text-left text-indigo-600 hover:underline">→ {s}</button>
        ))}
      </div>
    </Card>
  );
}
