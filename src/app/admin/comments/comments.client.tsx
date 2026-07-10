'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Fi } from '@/components/ui/fi';
import { cn } from '@/lib/utils';
import { suggestReply } from '@/lib/comments/template';
import { commentPriority } from '@/lib/comments/priority';

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
const POLL_MS = 60_000; // auto-refresh interval

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
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // filters
  const [q, setQ] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [status, setStatus] = useState('');
  const [replied, setReplied] = useState('no');
  const [urgent, setUrgent] = useState(false);
  const [sort, setSort] = useState('priority');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const reqId = useRef(0);
  const seen = useRef<Set<string>>(new Set());

  const buildParams = useCallback((pg: number) => {
    const sp = new URLSearchParams({ page: String(pg), pageSize: String(PAGE_SIZE), sort });
    if (q.trim()) sp.set('q', q.trim());
    if (sentiment) sp.set('sentiment', sentiment);
    if (status) sp.set('status', status);
    if (replied) sp.set('replied', replied);
    if (urgent) sp.set('urgent', '1');
    if (from) sp.set('from', `${from}T00:00:00`);
    if (to) sp.set('to', `${to}T23:59:59`);
    return sp;
  }, [sort, q, sentiment, status, replied, urgent, from, to]);

  const load = useCallback(async (pg: number, replace: boolean) => {
    if (!configured) return;
    const my = ++reqId.current;
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/comments?${buildParams(pg)}`);
      const d = await r.json();
      if (my !== reqId.current) return;
      if (d.error) setErr(d.error);
      setTotal(d.total || 0);
      const incoming: Comment[] = d.rows || [];
      if (replace) { seen.current = new Set(incoming.map(c => c.comment_id)); setNewIds(new Set()); setRows(incoming); }
      else { incoming.forEach(c => seen.current.add(c.comment_id)); setRows(prev => [...prev, ...incoming]); }
    } catch (e) { if (my === reqId.current) setErr((e as Error).message); }
    finally { if (my === reqId.current) setLoading(false); }
  }, [configured, buildParams]);

  // reload on filter change (debounced)
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(1, true); }, 300);
    return () => clearTimeout(t);
  }, [load]);

  // Auto-refresh: silently poll page 1; prepend genuinely-new comments (highlighted).
  useEffect(() => {
    if (!configured) return;
    const id = setInterval(async () => {
      if (document.hidden || page !== 1) return;
      try {
        const r = await fetch(`/api/comments?${buildParams(1)}`);
        const d = await r.json();
        const fresh: Comment[] = (d.rows || []).filter((c: Comment) => !seen.current.has(c.comment_id));
        if (fresh.length) {
          fresh.forEach(c => seen.current.add(c.comment_id));
          setRows(prev => [...fresh, ...prev]);
          setNewIds(prev => { const s = new Set(prev); fresh.forEach(c => s.add(c.comment_id)); return s; });
          setTotal(d.total || 0);
        }
      } catch { /* ignore poll errors */ }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [configured, page, buildParams]);

  const loadMore = () => { const next = page + 1; setPage(next); load(next, false); };
  const preset = (days: number) => {
    const d = new Date(); const toS = d.toISOString().slice(0, 10);
    const f = new Date(d.getTime() - days * 86400000).toISOString().slice(0, 10);
    setFrom(f); setTo(toS);
  };

  const sel = 'border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white';

  return (
    <div className="flex-1 overflow-y-auto scroll-thin bg-[#eef0f4] p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 flex items-center gap-2"><Fi name="comment-alt" className="text-indigo-500" /> คอมเมนต์รีวิว (Shopee)</h1>
          <p className="text-sm text-slate-500 mt-0.5">จัดลำดับความเร่งด่วนอัตโนมัติ · ร่างด้วย AI · อัปเดตคอมเมนต์ใหม่เอง</p>
        </div>
        <div className="flex items-center gap-1.5">
          {newIds.size > 0 && <span className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-600 text-white font-medium animate-pulse">🔔 ใหม่ {newIds.size}</span>}
          {replyLive
            ? <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">ส่งได้จริง</span>
            : <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">โหมดร่าง</span>}
        </div>
      </div>

      {!configured && (
        <div className={`${CARD} p-4 text-sm text-amber-800 bg-amber-50 border-amber-200`}>
          ยังไม่ได้เชื่อมแหล่งข้อมูลคอมเมนต์ — ตั้งค่า <code className="text-[12px]">COMMENTS_SUPABASE_URL</code> และ <code className="text-[12px]">COMMENTS_SUPABASE_SERVICE_ROLE_KEY</code> ใน Render ก่อนนะคะ
        </div>
      )}

      {/* Filters */}
      <div className={`${CARD} p-3 space-y-2.5`}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Fi name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาในคอมเมนต์…" className={`${sel} w-full pl-8`} />
          </div>
          <select className={sel} value={sort} onChange={e => setSort(e.target.value)} title="เรียงลำดับ">
            <option value="priority">⚡ เร่งด่วนก่อน</option>
            <option value="created_desc">วันที่: ใหม่ → เก่า</option>
            <option value="created_asc">วันที่: เก่า → ใหม่</option>
            <option value="rating_asc">ดาว: น้อย → มาก</option>
            <option value="rating_desc">ดาว: มาก → น้อย</option>
            <option value="severity_desc">ความรุนแรงมากก่อน</option>
          </select>
          <select className={sel} value={sentiment} onChange={e => setSentiment(e.target.value)}>
            <option value="">ทุกโทน</option><option value="negative">เชิงลบ</option><option value="neutral">กลาง</option><option value="positive">เชิงบวก</option>
          </select>
          <select className={sel} value={replied} onChange={e => setReplied(e.target.value)}>
            <option value="">ตอบ/ยังไม่ตอบ</option><option value="no">ยังไม่ตอบ</option><option value="yes">ตอบแล้ว</option>
          </select>
          <button onClick={() => setUrgent(u => !u)} className={cn('px-3 py-2 rounded-lg text-sm font-medium border', urgent ? 'bg-rose-600 text-white border-rose-600' : 'bg-white border-slate-200 text-slate-600')}>
            <Fi name="triangle-warning" className="text-sm mr-1" /> เฉพาะด่วน
          </button>
        </div>
        {/* Date range + presets */}
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-[12px] text-slate-400">ช่วงวันที่</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={sel} />
          <span className="text-slate-400">–</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={sel} />
          {[['วันนี้', 0], ['7 วัน', 7], ['30 วัน', 30]].map(([label, d]) => (
            <button key={label} onClick={() => preset(d as number)} className="px-2.5 py-1.5 rounded-lg text-[12px] bg-slate-100 text-slate-600 hover:bg-slate-200">{label as string}</button>
          ))}
          {(from || to) && <button onClick={() => { setFrom(''); setTo(''); }} className="px-2.5 py-1.5 rounded-lg text-[12px] text-indigo-600 hover:underline">ล้างวันที่</button>}
          <span className="text-[12px] text-slate-400 ml-auto">{total.toLocaleString()} รายการ</span>
        </div>
      </div>

      {err && <div className={`${CARD} p-3 text-sm text-rose-700 bg-rose-50 border-rose-200`}>โหลดคอมเมนต์ไม่สำเร็จ: {err}</div>}

      {/* List */}
      <div className="space-y-2.5">
        {rows.map(c => (
          <CommentCard key={c.comment_id} c={c} canSend={canSend} isNew={newIds.has(c.comment_id)} />
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

type Triage = { level: 'critical' | 'high' | 'medium' | 'low'; reason: string; steps: string[]; sla: string };

function CommentCard({ c, canSend, isNew }: { c: Comment; canSend: boolean; isNew: boolean }) {
  const [text, setText] = useState(() => suggestReply({ category: c.category, sentiment: c.sentiment, urgent: c.urgent, seed: c.comment_id }));
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentOk, setSentOk] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [triage, setTriage] = useState<Triage | null>(null);
  const [triaging, setTriaging] = useState(false);

  const len = text.trim().length;
  const over = len > REPLY_MAX;
  const sent = SENT_META[c.sentiment || ''];
  const pri = commentPriority(c);
  const LEVEL_META = {
    critical: { label: 'วิกฤต', cls: 'bg-rose-600 text-white', sla: 'ควรตอบทันที' },
    high: { label: 'ด่วน', cls: 'bg-rose-100 text-rose-700', sla: 'ควรตอบภายใน 1 ชม.' },
    medium: { label: 'ปานกลาง', cls: 'bg-amber-100 text-amber-700', sla: 'ควรตอบภายใน 24 ชม.' },
    low: { label: 'ปกติ', cls: 'bg-slate-100 text-slate-500', sla: 'ตอบเมื่อสะดวก' },
  } as const;
  const eff = triage
    ? { level: triage.level, label: LEVEL_META[triage.level].label, cls: LEVEL_META[triage.level].cls, sla: triage.sla || LEVEL_META[triage.level].sla }
    : pri;

  const runTriage = async () => {
    setTriaging(true);
    try {
      const r = await fetch('/api/comments/triage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_text: c.comment_text, rating: c.rating, category: c.category, sentiment: c.sentiment, urgent: c.urgent, severity: c.severity, product_item_name: c.product_item_name }),
      });
      const d = await r.json();
      if (d?.level) setTriage(d);
    } catch { /* ignore */ } finally { setTriaging(false); }
  };

  const aiDraft = async () => {
    setDrafting(true);
    try {
      const r = await fetch('/api/comments/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: c.comment_id, comment_text: c.comment_text, rating: c.rating, category: c.category, sentiment: c.sentiment, urgent: c.urgent, product_item_name: c.product_item_name, product_name: c.product_name }),
      });
      const d = await r.json();
      if (d.reply) setText(d.reply);
    } catch { /* keep */ } finally { setDrafting(false); }
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
    <div className={cn(CARD, 'p-3.5', isNew && 'ring-2 ring-indigo-400', eff.level === 'critical' && 'border-l-4 border-l-rose-500')}>
      <div className="flex items-start gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.product_image ? <img src={c.product_image} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" /> : <div className="w-11 h-11 rounded-lg bg-slate-100 shrink-0 flex items-center justify-center"><Fi name="box-open" className="text-slate-300" /></div>}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-slate-900 truncate">{c.product_item_name || c.product_name || '-'}</div>
          <div className="text-[11px] text-slate-400 truncate">{c.brand ? `${c.brand} · ` : ''}{c.username || 'ลูกค้า'} · {fmtDate(c.created_at)}</div>
        </div>
        {c.rating != null && <span className="text-[11px] font-semibold text-amber-500 shrink-0">{'★'.repeat(Math.max(0, Math.min(5, c.rating)))}<span className="text-slate-300">{'★'.repeat(Math.max(0, 5 - (c.rating || 0)))}</span></span>}
      </div>

      {/* priority + badges */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', eff.cls)} title={eff.sla}>{isNew && '🔔 '}{eff.label}</span>
        <span className="text-[10px] text-slate-400">{eff.sla}</span>
        {sent && <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', sent.cls)}>{sent.label}</span>}
        {c.category && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">{c.category}</span>}
        {c.status === 'resolved' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">เสร็จแล้ว</span>}
      </div>

      {c.comment_text && <div className="mt-2 text-[13px] text-slate-700 leading-snug border-l-2 border-slate-200 pl-2.5">“{c.comment_text}”</div>}
      {(c.images?.length ?? 0) > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {c.images!.slice(0, 6).map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-100" /></a>
          ))}
        </div>
      )}

      {/* AI triage: how to handle */}
      {triage ? (
        <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-2.5 text-[12px]">
          <div className="font-semibold text-indigo-700 flex items-center gap-1"><Fi name="siren-on" className="text-[12px]" /> วิธีจัดการ ({eff.label} · {triage.sla})</div>
          <div className="text-slate-500 mt-0.5">{triage.reason}</div>
          <ol className="mt-1 space-y-0.5 list-decimal list-inside text-slate-700">
            {triage.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      ) : c.suggested_action ? (
        <div className="mt-2 text-[11px] text-slate-500 flex items-start gap-1"><Fi name="bulb" className="text-[11px] mt-0.5 text-amber-500" /> {c.suggested_action}</div>
      ) : null}

      {c.seller_reply && <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">มีคำตอบจากผู้ขายบน Shopee แล้ว — ส่งใหม่จะเป็นการตอบ/แก้ทับ</div>}

      {/* reply box */}
      <div className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
          className={cn('w-full bg-white border rounded-lg p-2.5 text-[13px] leading-relaxed outline-none focus:ring-1', over ? 'border-rose-400 focus:ring-rose-300' : 'border-slate-200 focus:ring-indigo-300')} />
        <div className="flex items-center justify-between mt-1">
          <span className={cn('text-[11px]', over ? 'text-rose-600 font-semibold' : 'text-slate-400')}>{len}/{REPLY_MAX}{over ? ' — ยาวเกินกำหนด' : ''}</span>
          {msg && <span className={cn('text-[11px] font-medium', sentOk ? 'text-emerald-600' : 'text-rose-600')}>{msg}</span>}
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <button onClick={runTriage} disabled={triaging} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 flex items-center gap-1">
            <Fi name={triaging ? 'spinner' : 'siren-on'} className={cn('text-[13px]', triaging && 'animate-spin')} /> {triaging ? 'วิเคราะห์…' : 'แนะนำวิธีจัดการ'}
          </button>
          <button onClick={aiDraft} disabled={drafting} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-50 flex items-center gap-1">
            <Fi name={drafting ? 'spinner' : 'sparkles'} className={cn('text-[13px]', drafting && 'animate-spin')} /> {drafting ? 'กำลังร่าง…' : 'ร่างด้วย AI'}
          </button>
          <button onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 flex items-center gap-1">
            <Fi name={copied ? 'check' : 'copy'} className="text-[13px]" /> {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
          </button>
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
