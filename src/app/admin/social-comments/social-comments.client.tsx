'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Fi } from '@/components/ui/fi';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Brand { id: string; name: string; color?: string }
interface Comment { id: string; platform: 'facebook' | 'instagram'; text: string; from: string | null; at: string | null; post_id: string; post_excerpt: string; replied: boolean }

function ago(iso: string | null) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} น.`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.`;
  return `${Math.floor(s / 86400)} วัน`;
}

export function SocialCommentsClient() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<string>('');
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/social/comments').then(r => r.json()).then(d => {
      setBrands(d.brands || []);
      if (d.brands?.[0]) setBrand(d.brands[0].id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!brand) return;
    setLoading(true); setComments(null);
    fetch(`/api/social/comments?brand=${brand}`).then(r => r.json()).then(d => setComments(d.comments || [])).catch(() => setComments([])).finally(() => setLoading(false));
  }, [brand]);

  const send = async (c: Comment) => {
    const msg = (reply[c.id] || '').trim();
    if (!msg || sending) return;
    setSending(c.id);
    const r = await fetch('/api/social/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand, comment_id: c.id, platform: c.platform, message: msg }) });
    setSending(null);
    if (r.ok) { setDone(s => new Set(s).add(c.id)); setReply(p => ({ ...p, [c.id]: '' })); }
    else { const d = await r.json().catch(() => ({})); alert(d.error || 'ตอบไม่สำเร็จ'); }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2 flex-wrap">
        {brands.map(b => (
          <button key={b.id} onClick={() => setBrand(b.id)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', brand === b.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            {b.name}
          </button>
        ))}
        {!brands.length && !loading && <span className="text-sm text-slate-400">ยังไม่มีเพจที่เชื่อมต่อ — ไปเชื่อมที่ Channels → Facebook</span>}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดคอมเมนต์…</div>
      ) : (
        <div className="space-y-2.5">
          {(comments || []).map(c => {
            const isDone = done.has(c.id) || c.replied;
            return (
              <Card key={c.id} className="p-3">
                <div className="flex items-start gap-2.5">
                  <ChannelIcon channel={c.platform} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-800">{c.from || 'ผู้ใช้'}</span>
                      <span className="text-slate-400">· {ago(c.at)}</span>
                      {isDone && <span className="text-[10px] px-1.5 rounded-full bg-emerald-100 text-emerald-700">ตอบแล้ว</span>}
                    </div>
                    <div className="text-sm text-slate-700 mt-0.5">{c.text || '(ไม่มีข้อความ)'}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">ใต้โพสต์: {c.post_excerpt}</div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <input value={reply[c.id] || ''} onChange={e => setReply(p => ({ ...p, [c.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') send(c); }}
                        placeholder="พิมพ์ตอบคอมเมนต์นี้…" className="flex-1 text-sm rounded-lg border border-slate-200 px-2.5 py-1.5" />
                      <button onClick={() => send(c)} disabled={sending === c.id || !(reply[c.id] || '').trim()}
                        className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium disabled:opacity-50 flex items-center gap-1">
                        {sending === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Fi name="paper-plane" className="text-[11px]" />} ตอบ
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {comments && !comments.length && <div className="text-sm text-slate-400 py-8 text-center">ยังไม่มีคอมเมนต์ในโพสต์ล่าสุด</div>}
        </div>
      )}
    </div>
  );
}
