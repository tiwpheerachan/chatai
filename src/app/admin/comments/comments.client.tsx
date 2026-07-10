'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Fi } from '@/components/ui/fi';
import { cn } from '@/lib/utils';
import { suggestReply } from '@/lib/comments/template';

type Comment = {
  comment_id: string; brand: string | null; shop_id: string | null;
  product_name: string | null; rating: number | null; comment_text: string | null;
  username: string | null; created_at: string | null; sentiment: string | null;
  category: string | null; severity: number | null; summary: string | null;
  suggested_action: string | null; urgent: boolean | null; status: string | null;
  seller_reply: string | null; images: string[] | null;
  product_item_name: string | null; product_image: string | null;
};

const CARD = 'bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_-6px_rgba(15,23,42,0.15)]';
const REPLY_MAX = 500;
const PAGE_SIZE = 30;

const SENT_META: Record<string, { label: string; cls: string }> = {
  positive: { label: 'บวก', cls: 'bg-emerald-100 text-emerald-700' },
  negative: { label: 'ลบ', cls: 'bg-rose-100 text-rose-700' },
  neutral: { label: 'กลาง', cls: 'bg-slate-100 text-slate-600' },
};
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

export function CommentsClient({ configured, canSend, replyLive }: { configured: boolean; canSend: boolean; replyLive: boolean }) {
  const [rows, setRows] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // filters
  const [q, setQ] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [status, setStatus] = useState('');
  const [replied, setReplied] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [sort, setSort] = useState('created_desc');
  const reqId = useRef(0);

  const load = useCallback(async (pg: number, replace: boolean) => {
    if (!configured) return;
    const my = ++reqId.current;
    setLoading(true); setErr(null);
    const sp = new URLSearchParams({ page: String(pg), pageSize: String(PAGE_SIZE), sort });
    if (q.trim()) sp.set('q', q.trim());
    if (sentiment) sp.set('sentiment', sentiment);
    if (status) sp.set('status', status);
    if (replied) sp.set('replied', replied);
    if (urgent) sp.set('urgent', '1');
    try {
      const r = await fetch(`/api/comments?${sp}`);
      const d = await r.json();
      if (my !== reqId.current) return;
      if (d.error) setErr(d.error);
      setTotal(d.total || 0);
      setRows(prev => (replace ? (d.rows || []) : [...prev, ...(d.rows || [])]));
    } catch (e) { if (my === reqId.current) setErr((e as Error).message); }
    finally { if (my === reqId.current) setLoading(false); }
  }, [configured, q, sentiment, status, replied, urgent, sort]);

  // reload on filter change (debounced for search)
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(1, true); }, 300);
    return () => clearTimeout(t);
  }, [load]);

  const loadMore = () => { const next = page + 1; setPage(next); load(next, false); };

  const sel = 'border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white';

  return (
    <div className="flex-1 overflow-y-auto scroll-thin bg-[#eef0f4] p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 flex items-center gap-2"><Fi name="comment-alt" className="text-indigo-500" /> คอมเมนต์รีวิว (Shopee)</h1>
          <p className="text-sm text-slate-500 mt-0.5">ตอบกลับรีวิว/คอมเมนต์บนหน้าสินค้า — ร่างด้วย AI แล้วกดส่งไป Shopee</p>
        </div>
        <div className="flex items-center gap-1.5">
          {replyLive
            ? <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">ส่งได้จริง</span>
            : <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">โหมดร่าง (ยังไม่ตั้ง API key)</span>}
        </div>
      </div>

      {!configured && (
        <div className={`${CARD} p-4 text-sm text-amber-800 bg-amber-50 border-amber-200`}>
          ยังไม่ได้เชื่อมแหล่งข้อมูลคอมเมนต์ — ตั้งค่า <code className="text-[12px]">COMMENTS_SUPABASE_URL</code> และ <code className="text-[12px]">COMMENTS_SUPABASE_SERVICE_ROLE_KEY</code> ใน Render ก่อนนะคะ
        </div>
      )}

      {/* Filters */}
      <div className={`${CARD} p-3 flex items-center gap-2 flex-wrap`}>
        <div className="relative flex-1 min-w-[200px]">
          <Fi name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาในคอมเมนต์…" className={`${sel} w-full pl-8`} />
        </div>
        <select className={sel} value={sentiment} onChange={e => setSentiment(e.target.value)}>
          <option value="">ทุกโทน</option><option value="negative">เชิงลบ</option><option value="neutral">กลาง</option><option value="positive">เชิงบวก</option>
        </select>
        <select className={sel} value={replied} onChange={e => setReplied(e.target.value)}>
          <option value="">ตอบ/ยังไม่ตอบ</option><option value="no">ยังไม่ตอบ</option><option value="yes">ตอบแล้ว</option>
        </select>
        <select className={sel} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option><option value="new">ใหม่</option><option value="in_progress">กำลังจัดการ</option><option value="resolved">เสร็จแล้ว</option>
        </select>
        <select className={sel} value={sort} onChange={e => setSort(e.target.value)}>
          <option value="created_desc">ใหม่สุดก่อน</option><option value="severity_desc">รุนแรงสุดก่อน</option><option value="rating_asc">ดาวน้อยก่อน</option><option value="created_asc">เก่าสุดก่อน</option>
        </select>
        <button onClick={() => setUrgent(u => !u)} className={cn('px-3 py-2 rounded-lg text-sm font-medium border', urgent ? 'bg-rose-600 text-white border-rose-600' : 'bg-white border-slate-200 text-slate-600')}>
          <Fi name="triangle-warning" className="text-sm mr-1" /> ด่วน
        </button>
        <span className="text-[12px] text-slate-400 ml-auto">{total.toLocaleString()} รายการ</span>
      </div>

      {err && <div className={`${CARD} p-3 text-sm text-rose-700 bg-rose-50 border-rose-200`}>โหลดคอมเมนต์ไม่สำเร็จ: {err}</div>}

      {/* List */}
      <div className="space-y-2.5">
        {rows.map(c => (
          <CommentCard key={c.comment_id} c={c} canSend={canSend} />
        ))}
        {!loading && configured && !rows.length && !err && (
          <div className={`${CARD} p-8 text-center text-sm text-slate-400`}>ไม่พบคอมเมนต์ตามเงื่อนไข</div>
        )}
        {loading && <div className="flex items-center gap-2 text-sm text-slate-400 py-3"><Fi name="spinner" className="animate-spin" /> กำลังโหลด…</div>}
        {!loading && rows.length < total && (
          <button onClick={loadMore} className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-indigo-600 hover:bg-slate-50">โหลดเพิ่ม ({total - rows.length} รายการ)</button>
        )}
      </div>
    </div>
  );
}

function CommentCard({ c, canSend }: { c: Comment; canSend: boolean }) {
  const [text, setText] = useState(() => suggestReply({ category: c.category, sentiment: c.sentiment, urgent: c.urgent, seed: c.comment_id }));
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentOk, setSentOk] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const len = text.trim().length;
  const over = len > REPLY_MAX;
  const sent = SENT_META[c.sentiment || ''];

  const aiDraft = async () => {
    setDrafting(true);
    try {
      const r = await fetch('/api/comments/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment_id: c.comment_id, comment_text: c.comment_text, rating: c.rating,
          category: c.category, sentiment: c.sentiment, urgent: c.urgent,
          product_item_name: c.product_item_name, product_name: c.product_name,
        }),
      });
      const d = await r.json();
      if (d.reply) setText(d.reply);
    } catch { /* keep current text */ }
    finally { setDrafting(false); }
  };

  const send = async () => {
    if (over || !len || sending) return;
    setSending(true); setMsg(null);
    try {
      const r = await fetch('/api/comments/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: c.comment_id, reply_text: text.trim(), shop_id: c.shop_id }),
      });
      const d = await r.json().catch(() => ({}));
      const ok = r.ok && d.ok !== false;
      setSentOk(ok); setMsg(d.message || (ok ? 'สำเร็จ' : 'ผิดพลาด'));
    } catch (e) { setSentOk(false); setMsg((e as Error).message); }
    finally { setSending(false); }
  };

  return (
    <div className={`${CARD} p-3.5`}>
      {/* product + meta */}
      <div className="flex items-start gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.product_image ? <img src={c.product_image} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" /> : <div className="w-11 h-11 rounded-lg bg-slate-100 shrink-0 flex items-center justify-center"><Fi name="box-open" className="text-slate-300" /></div>}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-slate-900 truncate">{c.product_item_name || c.product_name || '-'}</div>
          <div className="text-[11px] text-slate-400 truncate">{c.brand ? `${c.brand} · ` : ''}{c.username || 'ลูกค้า'} · {fmtDate(c.created_at)}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {c.rating != null && <span className="text-[11px] font-semibold text-amber-500">{'★'.repeat(Math.max(0, Math.min(5, c.rating)))}<span className="text-slate-300">{'★'.repeat(Math.max(0, 5 - (c.rating || 0)))}</span></span>}
        </div>
      </div>

      {/* badges */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        {sent && <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', sent.cls)}>{sent.label}</span>}
        {c.category && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">{c.category}</span>}
        {c.urgent && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold">ด่วน</span>}
        {c.status === 'resolved' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">เสร็จแล้ว</span>}
      </div>

      {/* comment text + images */}
      {c.comment_text && (
        <div className="mt-2 text-[13px] text-slate-700 leading-snug border-l-2 border-slate-200 pl-2.5">“{c.comment_text}”</div>
      )}
      {(c.images?.length ?? 0) > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {c.images!.slice(0, 6).map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-100" /></a>
          ))}
        </div>
      )}
      {c.suggested_action && (
        <div className="mt-2 text-[11px] text-slate-500 flex items-start gap-1"><Fi name="bulb" className="text-[11px] mt-0.5 text-amber-500" /> {c.suggested_action}</div>
      )}
      {c.seller_reply && (
        <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">มีคำตอบจากผู้ขายบน Shopee แล้ว — ส่งใหม่จะเป็นการตอบ/แก้ทับ</div>
      )}

      {/* reply box */}
      <div className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
          className={cn('w-full bg-white border rounded-lg p-2.5 text-[13px] leading-relaxed outline-none focus:ring-1', over ? 'border-rose-400 focus:ring-rose-300' : 'border-slate-200 focus:ring-indigo-300')} />
        <div className="flex items-center justify-between mt-1">
          <span className={cn('text-[11px]', over ? 'text-rose-600 font-semibold' : 'text-slate-400')}>{len}/{REPLY_MAX}{over ? ' — ยาวเกินกำหนด' : ''}</span>
          {msg && <span className={cn('text-[11px] font-medium', sentOk ? 'text-emerald-600' : 'text-rose-600')}>{msg}</span>}
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <button onClick={aiDraft} disabled={drafting} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-50 flex items-center gap-1">
            <Fi name={drafting ? 'spinner' : 'sparkles'} className={cn('text-[13px]', drafting && 'animate-spin')} /> {drafting ? 'กำลังร่าง…' : 'ร่างด้วย AI'}
          </button>
          <button onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 flex items-center gap-1">
            <Fi name={copied ? 'check' : 'copy'} className="text-[13px]" /> {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
          </button>
          <button onClick={() => setText(suggestReply({ category: c.category, sentiment: c.sentiment, urgent: c.urgent, seed: c.comment_id }))}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-400">รีเซ็ต</button>
          <button onClick={send} disabled={!canSend || sending || over || !len}
            className="ml-auto px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white disabled:opacity-50 flex items-center gap-1"
            title={canSend ? '' : 'ต้องมีสิทธิ์ chat.reply + ตั้ง SHOPEE_REPLY_API_KEY'}>
            <Fi name="paper-plane" className="text-[13px]" /> {sending ? 'กำลังส่ง…' : 'ส่งไป Shopee'}
          </button>
        </div>
      </div>
    </div>
  );
}
