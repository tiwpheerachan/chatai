'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNEL_META, PLATFORM_CHANNELS, brandIcon, cn } from '@/lib/utils';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Avatar } from '@/components/ui/avatar';
import { AnimatedChat, AnimatedInbox, AnimatedAI, AnimatedRobot } from '@/components/ui/animated-icons';
import { Search, Send, Bot, ArrowLeftRight, Check, Paperclip, Image as ImageIcon, CreditCard, RefreshCw, X, Loader2, StickyNote } from 'lucide-react';
import type { Conversation, Message, MessageAttachment, Macro } from '@/types/database';

const BRANDS = [
  '70mai', 'Anker', 'DDpai', 'Dreame', 'Jimmy', 'Levoit', 'Mibro', 'Mova', 'Soundcore',
  'Thaimall', 'Toptoy', 'Uwant', 'Vinko', 'Wanbo', 'Xiaomi Home Appliances', 'Xiaomi MG',
  'Xiaomi Smart App', 'Zepp',
];

// Compact relative time for the inbox list (Thai).
function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'เมื่อกี้';
  if (s < 3600) return `${Math.floor(s / 60)} น.`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.`;
  if (s < 604800) return `${Math.floor(s / 86400)} วัน`;
  const d = new Date(t);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

// Small brand pill — logo + name, tinted by the brand color.
function BrandChip({ name, color, size = 'sm' }: { name?: string | null; color?: string | null; size?: 'xs' | 'sm' }) {
  if (!name) return null;
  const c = color || '#64748b';
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[9px] gap-1' : 'px-2 py-0.5 text-[10px] gap-1';
  return (
    <span className={cn('inline-flex items-center rounded-full font-semibold whitespace-nowrap', pad)}
      style={{ backgroundColor: `${c}1a`, color: c }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={brandIcon(name)} alt="" className={size === 'xs' ? 'w-3 h-3 rounded-full object-cover' : 'w-3.5 h-3.5 rounded-full object-cover'} />
      {name}
    </span>
  );
}

function AttachmentView({ att, onSeller, onOpenImage }: { att: MessageAttachment; onSeller: boolean; onOpenImage?: (url: string) => void }) {
  const frame = onSeller ? 'border-white/25' : 'border-slate-200';
  const a = att as any; // jsonb-sourced; fields vary by type
  switch (a.type) {
    case 'image':
      return a.url
        // eslint-disable-next-line @next/next/no-img-element
        ? <button type="button" onClick={() => onOpenImage?.(a.url)} className="block cursor-zoom-in"><img src={a.url} alt="" className="rounded-lg max-w-[220px] max-h-64 object-cover" /></button>
        : <span className="inline-flex items-center gap-1 text-xs opacity-80"><ImageIcon className="w-3.5 h-3.5" /> ส่งรูปแล้ว</span>;
    case 'video':
      return a.url
        ? <video src={a.url} controls className="rounded-lg max-w-[240px] max-h-64" />
        : <span className="text-xs opacity-80">[วิดีโอ]</span>;
    case 'sticker':
      // eslint-disable-next-line @next/next/no-img-element
      return a.url ? <button type="button" onClick={() => onOpenImage?.(a.url)} className="block cursor-zoom-in"><img src={a.url} alt="sticker" className="w-24 h-24 object-contain" /></button> : <span>[sticker]</span>;
    case 'item':
      return <div className={`flex items-center gap-2 rounded-lg border ${frame} px-2.5 py-1.5 text-xs`}><CreditCard className="w-3.5 h-3.5" /> สินค้า #{String(a.item_id ?? '')}</div>;
    case 'order':
      return <div className={`flex items-center gap-2 rounded-lg border ${frame} px-2.5 py-1.5 text-xs`}><CreditCard className="w-3.5 h-3.5" /> ออเดอร์ {String(a.order_sn ?? '')}</div>;
    default:
      return <span className="text-xs opacity-70">[{a.type}]</span>;
  }
}

export function InboxClient({ userId }: { userId: string }) {
  const supabase = createClient();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<(Conversation & { messages: Message[] }) | null>(null);
  const [filter, setFilter] = useState('all');
  const [brandSel, setBrandSel] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [macros, setMacros] = useState<Macro[]>([]);
  const [sending, setSending] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  const [autoSync, setAutoSync] = useState(false); // server cron handles continuous sync now; toggle on for extra browser-driven pulls
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [cardForm, setCardForm] = useState<null | 'item' | 'order'>(null);
  const [cardVal, setCardVal] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [loadError, setLoadError] = useState(false);
  const loadConvos = useCallback(async () => {
    try {
      const r = await fetch('/api/conversations');
      const d = await r.json();
      // Only replace the list with a real array. A transient error response
      // ({error:...}) must NOT wipe the inbox (that caused "list appears then vanishes").
      if (Array.isArray(d)) { setConvos(d); setLoadError(false); }
      else setLoadError(true);
    } catch { setLoadError(true); }
  }, []);

  useEffect(() => {
    loadConvos();
    fetch('/api/macros').then(r => r.json()).then(setMacros).catch(() => {});
  }, [loadConvos]);

  // Track the currently-selected conversation so late-arriving fetches (from a
  // previous conversation's request or a poll) never overwrite the open thread.
  const activeIdRef = useRef<string | null>(null);

  // Single guarded thread loader: applies its result ONLY if that conversation is
  // still the active one. Prevents the "old chat stays / hangs on switch" bug.
  const loadThread = useCallback((id: string, opts: { live?: boolean; noHydrate?: boolean } = {}) => {
    const q = opts.live ? '?live=1' : opts.noHydrate ? '?nohydrate=1' : '';
    return fetch(`/api/conversations/${id}${q}`)
      .then(r => r.json())
      .then(d => { if (d?.id === activeIdRef.current) setActive(d); return d; })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setThreadLoading(true);
    // Single load. The server hydrates from the platform only the first time (when
    // just the preview is stored), then persists — so re-opening is instant from DB.
    loadThread(activeId).finally(() => { if (activeId === activeIdRef.current) setThreadLoading(false); });
  }, [activeId, loadThread]);

  // Open a conversation with an instant optimistic shell (header + profile from the
  // list row) so the UI responds immediately while the full thread loads.
  const openConvo = useCallback((c: Conversation) => {
    if (c.id === activeIdRef.current) return;
    activeIdRef.current = c.id; // set first so stale in-flight loads for the old id are ignored
    const shell: any = {
      ...c,
      brand: c.brand ?? (c.brand_name ? { name: c.brand_name, slug: c.brand_slug ?? null, color: c.brand_color ?? null } : null),
      messages: [],
    };
    setActive(shell);
    setActiveId(c.id);
    setDraft(''); setAttachOpen(false); setCardForm(null); setNoteMode(false);
  }, []);

  // Supabase realtime
  useEffect(() => {
    const channel = supabase
      .channel('messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        loadConvos();
        if (activeId && (payload.new as Message).conversation_id === activeId) {
          loadThread(activeId);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId, loadConvos, supabase, loadThread]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [active?.messages?.length]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const filtered = useMemo(() => {
    let base = Array.isArray(convos) ? convos : [];
    if (filter === 'unread') base = convos.filter(c => c.unread > 0);
    else if (filter === 'mine') base = convos.filter(c => c.assigned_to === userId);
    else if (filter === 'ai') base = convos.filter(c => c.ai_handling);
    else if (filter !== 'all') base = convos.filter(c => c.channel === filter);
    // Brand filter — matches the DB-joined brand name (populated for synced Shopee convos).
    if (brandSel.length) base = base.filter(c => { const b = c.brand_name; return !!b && brandSel.includes(b); });
    // Free-text search over customer name + last snippet + brand.
    const q = search.trim().toLowerCase();
    if (q) base = base.filter(c =>
      (c.customer_name || '').toLowerCase().includes(q) ||
      (c.last_snippet || '').toLowerCase().includes(q) ||
      (c.brand_name || '').toLowerCase().includes(q));
    return base;
  }, [convos, filter, userId, brandSel, search]);

  useEffect(() => {
    if (!activeId && filtered.length) openConvo(filtered[0]);
  }, [filtered, activeId, openConvo]);

  const refreshActive = useCallback(() => {
    if (activeIdRef.current) loadThread(activeIdRef.current);
  }, [loadThread]);

  const send = async () => {
    if (!draft.trim() || !active || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/conversations/${active.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft, note: noteMode }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'ส่งไม่สำเร็จ'); }
      else { setDraft(''); refreshActive(); }
    } finally { setSending(false); }
  };

  const sendImageFile = async (file: File) => {
    if (!active || sending) return;
    setAttachOpen(false);
    setSending(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const r = await fetch(`/api/conversations/${active.id}/images`, { method: 'POST', body: fd });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'ส่งรูปไม่สำเร็จ'); }
      else refreshActive();
    } finally { setSending(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const sendCardMsg = async () => {
    if (!active || !cardForm || !cardVal.trim() || sending) return;
    setSending(true);
    try {
      const payload = cardForm === 'item' ? { type: 'item', item_id: cardVal.trim() } : { type: 'order', order_sn: cardVal.trim() };
      const r = await fetch(`/api/conversations/${active.id}/card`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'ส่งการ์ดไม่สำเร็จ'); }
      else { setCardForm(null); setCardVal(''); setAttachOpen(false); refreshActive(); }
    } finally { setSending(false); }
  };

  const runSync = useCallback(async (opts: { silent?: boolean; maxPages?: number } = {}) => {
    if (syncing) return;
    setSyncing(true);
    if (!opts.silent) setSyncNote('กำลังซิงค์ Shopee…');
    try {
      const r = await fetch('/api/chat-source/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all', max_pages: opts.maxPages ?? 3, since_days: 7 }),
      });
      const d = await r.json();
      if (r.ok) {
        const res = Array.isArray(d.result) ? d.result : [];
        const convs = res.reduce((s: number, x: any) => s + (x.conversations || 0), 0);
        const msgs = res.reduce((s: number, x: any) => s + (x.messages || 0), 0);
        if (convs || msgs || !opts.silent) setSyncNote(`ซิงค์แล้ว +${convs} แชท, +${msgs} ข้อความ`);
        await loadConvos();
      } else if (!opts.silent) setSyncNote(d.error || 'ซิงค์ไม่สำเร็จ');
    } catch (e) { if (!opts.silent) setSyncNote('ซิงค์ไม่สำเร็จ'); }
    finally { setSyncing(false); setTimeout(() => setSyncNote(null), 6000); }
  }, [syncing, loadConvos]);

  // Auto-update: light background sync so new Shopee messages arrive on their own.
  useEffect(() => {
    if (!autoSync) return;
    const id = setInterval(() => { runSync({ silent: true, maxPages: 1 }); }, 120000);
    return () => clearInterval(id);
  }, [autoSync, runSync]);

  // Cheap list refresh (reflects DB changes even without a full sync).
  useEffect(() => {
    const id = setInterval(() => { loadConvos(); }, 15000);
    return () => clearInterval(id);
  }, [loadConvos]);

  // Keep the open thread live — re-pull it from the platform to catch new replies.
  useEffect(() => {
    if (!activeId) return;
    // Keep the open thread fresh from the DB (cheap — no upstream re-fetch). New
    // messages arrive in the DB via the server sync/webhook + Supabase Realtime.
    const id = setInterval(() => { loadThread(activeId, { noHydrate: true }); }, 20000);
    return () => clearInterval(id);
  }, [activeId, loadThread]);

  const aiSuggest = async () => {
    if (!active) return;
    const r = await fetch(`/api/conversations/${active.id}/ai-reply`, { method: 'POST' });
    const data = await r.json();
    if (data.text) setDraft(data.text);
  };

  const aiSendNow = async () => {
    if (!active || sending) return;
    setSending(true);
    try {
      await fetch(`/api/conversations/${active.id}/send-ai`, { method: 'POST' });
    } finally { setSending(false); }
  };

  const close = async () => {
    if (!active || !confirm('ปิดเคสนี้?')) return;
    await fetch(`/api/conversations/${active.id}/close`, { method: 'POST' });
    loadConvos();
  };

  const filterTabs = [
    { id: 'all',    label: 'ทั้งหมด',    count: convos.length },
    { id: 'unread', label: 'ยังไม่อ่าน', count: convos.filter(c => c.unread > 0).length },
    { id: 'mine',   label: 'ของฉัน',     count: convos.filter(c => c.assigned_to === userId).length },
    { id: 'ai',     label: 'AI ดูแล',    count: convos.filter(c => c.ai_handling).length },
  ];

  const channelApps = PLATFORM_CHANNELS.map(k => ({ id: k, name: CHANNEL_META[k]?.name || k, icon: `/channels/${k}.png` }));
  const brandApps = BRANDS.map(b => ({ id: b, name: b, icon: brandIcon(b) }));
  const channelOpen = (PLATFORM_CHANNELS as readonly string[]).includes(filter) ? [filter] : [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Filter toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-col gap-1.5">
        {/* Row 1: search + status */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-56">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-100 rounded-lg pl-9 pr-3 py-2 text-sm border-0 focus:ring-2 focus:ring-brand-400" placeholder="ค้นหาชื่อ / ข้อความ / แบรนด์..." />
          </div>
          <div className="flex items-center gap-1.5">
            {filterTabs.map(t => {
              const on = filter === t.id;
              return (
                <button key={t.id} onClick={() => setFilter(t.id)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition', on ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                  {t.label} <span className={on ? 'text-white/80' : 'text-slate-400'}>({t.count})</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {loadError && <span className="text-xs text-amber-600">เชื่อมต่อสะดุด · กำลังลองใหม่…</span>}
            {syncNote && <span className="text-xs text-slate-500">{syncNote}</span>}
            <button onClick={() => setAutoSync(a => !a)} title="ดึงข้อความใหม่อัตโนมัติทุก ~45 วินาที"
              className={cn('px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition',
                autoSync ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200')}>
              <span className={cn('w-1.5 h-1.5 rounded-full', autoSync ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300')} />
              อัตโนมัติ {autoSync ? 'เปิด' : 'ปิด'}
            </button>
            <button onClick={() => runSync()} disabled={syncing}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5">
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              ซิงค์ Shopee
            </button>
          </div>
        </div>

        {/* Row 2: channel + brand filters — plain circular toggles (no dock magnify) */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">ช่องทาง</span>
            <div className="flex items-center gap-1">
              {channelApps.map(a => {
                const on = channelOpen.includes(a.id);
                return (
                  <button key={a.id} title={a.name} onClick={() => setFilter(filter === a.id ? 'all' : a.id)}
                    className={cn('w-7 h-7 rounded-lg overflow-hidden ring-2 transition-shadow',
                      on ? 'ring-brand-500' : 'ring-transparent opacity-75 hover:opacity-100 hover:ring-slate-200')}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.icon} alt={a.name} className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-6 w-px bg-slate-200" />

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">
              แบรนด์{brandSel.length ? ` (${brandSel.length})` : ''}
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {brandApps.map(a => {
                const on = brandSel.includes(a.id);
                return (
                  <button key={a.id} title={a.name}
                    onClick={() => setBrandSel(s => s.includes(a.id) ? s.filter(x => x !== a.id) : [...s, a.id])}
                    className={cn('w-7 h-7 rounded-lg overflow-hidden ring-2 transition-shadow',
                      on ? 'ring-brand-500' : 'ring-transparent opacity-60 hover:opacity-100 hover:ring-slate-200')}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.icon} alt={a.name} className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
            {brandSel.length > 0 && <button onClick={() => setBrandSel([])} className="text-[10px] text-brand-600 hover:underline shrink-0">ล้าง</button>}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Conversation list */}
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
          <div className="flex-1 overflow-y-auto scroll-thin">
          {filtered.map(c => {
            const on = activeId === c.id;
            const unread = c.unread > 0;
            return (
              <button key={c.id} onClick={() => openConvo(c)}
                className={cn('w-full text-left px-3 py-2.5 border-b border-slate-50 transition-colors',
                  on ? 'bg-indigo-50' : 'hover:bg-slate-50')}>
                <div className="flex gap-2.5 items-center">
                  <div className="relative shrink-0">
                    <Avatar name={c.customer_name} src={c.customer_avatar} size="md" />
                    <div className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white rounded-full">
                      <ChannelIcon channel={c.channel} size="xs" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center gap-2">
                      <span className={cn('text-sm truncate', unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800')}>{c.customer_name || '-'}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(c.last_message_at)}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2 mt-0.5">
                      <span className={cn('text-xs truncate', unread ? 'text-slate-700' : 'text-slate-400')}>{c.last_snippet || '—'}</span>
                      {unread && <span className="bg-indigo-600 text-white text-[10px] rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center font-bold shrink-0">{c.unread}</span>}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <BrandChip name={c.brand_name} color={c.brand_color} size="xs" />
                      {c.priority === 'high' && <span className="text-[9px] px-1 rounded bg-red-100 text-red-700 font-semibold">ด่วน</span>}
                      {c.priority === 'urgent' && <span className="text-[9px] px-1 rounded bg-red-100 text-red-700 font-semibold">ด่วนมาก</span>}
                      {c.ai_handling && <span className="inline-flex items-center gap-0.5 text-[9px] px-1 rounded bg-violet-100 text-violet-700 font-semibold"><Bot className="w-2.5 h-2.5" /> AI</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {!filtered.length && (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <AnimatedInbox size={56} />
              <span className="text-sm text-slate-400">ไม่มีแชท</span>
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {active && (
          <>
            <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={active.customer?.display_name} src={active.customer?.avatar} size="md" />
                <div>
                  <div className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                    {active.customer?.display_name}
                    <BrandChip name={active.brand?.name} color={active.brand?.color} />
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${CHANNEL_META[active.channel]?.bg} ${CHANNEL_META[active.channel]?.text}`}>
                      <ChannelIcon channel={active.channel} size="xs" /> {CHANNEL_META[active.channel]?.name}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">สถานะ: {active.status} · ความสำคัญ: {active.priority}</div>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
                  <ArrowLeftRight className="w-3.5 h-3.5" />โอน
                </button>
                <button onClick={close} className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />ปิดเคส
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin px-6 py-4 space-y-3">
              {threadLoading && !(active.messages || []).length && (
                <div className="space-y-3 animate-pulse">
                  <div className="flex justify-start"><div className="h-9 w-48 rounded-2xl bg-slate-200" /></div>
                  <div className="flex justify-end"><div className="h-9 w-56 rounded-2xl bg-indigo-200" /></div>
                  <div className="flex justify-start"><div className="h-9 w-40 rounded-2xl bg-slate-200" /></div>
                  <div className="flex justify-end"><div className="h-14 w-64 rounded-2xl bg-indigo-200" /></div>
                </div>
              )}
              {(active.messages || []).map(m => (
                <div key={m.id} className={cn('flex', m.sender_type === 'customer' ? 'justify-start' : 'justify-end')}>
                  <div className="max-w-md">
                    {m.sender_type === 'ai' && (
                      <div className="text-[10px] text-violet-600 font-semibold mb-1">
                        🤖 Aria {m.metadata?.confidence && `(${Math.round(m.metadata.confidence * 100)}%)`}
                      </div>
                    )}
                    {m.sender_type === 'agent' && <div className="text-[10px] text-slate-500 mb-1 text-right">พนักงาน</div>}
                    {m.sender_type === 'note' && <div className="text-[10px] text-amber-600 mb-1 text-right font-semibold">โน้ตภายใน · เห็นเฉพาะทีม</div>}
                    {m.sender_type === 'system' && <div className="text-center text-[10px] text-slate-400 italic">{m.text}</div>}
                    {m.sender_type !== 'system' && (
                      <div className={cn(
                        'px-4 py-2.5 rounded-2xl text-sm space-y-2',
                        m.sender_type === 'customer' && 'bg-white border border-slate-200 rounded-bl-md',
                        m.sender_type === 'ai' && 'bg-violet-100 text-violet-900 rounded-br-md',
                        m.sender_type === 'agent' && 'bg-indigo-600 text-white rounded-br-md',
                        m.sender_type === 'note' && 'bg-amber-100 text-amber-900 border border-amber-200 rounded-br-md',
                      )}>
                        {(m.attachments || []).map((att, i) => (
                          <AttachmentView key={i} att={att} onSeller={m.sender_type !== 'customer'} onOpenImage={setLightbox} />
                        ))}
                        {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                      </div>
                    )}
                    {(m.metadata?.sources?.length ?? 0) > 0 && (
                      <div className="text-[9px] text-violet-500 mt-1">
                        Sources: {m.metadata!.sources!.map(s => s.title).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white border-t border-slate-200">
              <div className="px-4 py-2 border-b border-slate-100 flex gap-2 items-center text-xs flex-wrap">
                {active.channel === 'shopee' ? (
                  // Shopee is human-agent only — no AI auto-reply (policy + your setting).
                  <span className="text-[10px] text-slate-400">ตอบโดยแอดมินเท่านั้น · ไม่มี AI ตอบอัตโนมัติ</span>
                ) : (
                  <>
                    <button onClick={aiSuggest} className="px-2.5 py-1 rounded-md bg-violet-100 text-violet-700 hover:bg-violet-200 flex items-center gap-1.5 font-medium">
                      <AnimatedAI size={18} />AI Suggest
                    </button>
                    <button onClick={aiSendNow} className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center gap-1.5 font-medium">
                      <AnimatedRobot size={18} />AI ตอบเอง
                    </button>
                  </>
                )}
                <span className="text-slate-400">|</span>
                {macros.slice(0, 4).map(m => (
                  <button key={m.id} onClick={() => setDraft(m.text)} className="px-2 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200">
                    {m.shortcut}
                  </button>
                ))}
                <button onClick={() => setNoteMode(n => !n)}
                  className={cn('ml-auto px-2 py-1 rounded-md flex items-center gap-1 font-medium', noteMode ? 'bg-amber-200 text-amber-800' : 'bg-amber-50 text-amber-700 hover:bg-amber-100')}>
                  <StickyNote className="w-3.5 h-3.5" /> โน้ตภายใน
                </button>
              </div>
              {cardForm && (
                <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 text-xs bg-slate-50">
                  <span className="text-slate-500">{cardForm === 'item' ? 'ส่งการ์ดสินค้า — item_id' : 'ส่งการ์ดออเดอร์ — order_sn'}</span>
                  <input value={cardVal} onChange={e => setCardVal(e.target.value)} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') sendCardMsg(); }}
                    placeholder={cardForm === 'item' ? 'เช่น 22001' : 'เช่น 240505FR5QG0CF'}
                    className="flex-1 max-w-xs border border-slate-200 rounded-md px-2 py-1" />
                  <button onClick={sendCardMsg} disabled={sending} className="px-2 py-1 rounded-md bg-indigo-600 text-white disabled:opacity-50">ส่ง</button>
                  <button onClick={() => { setCardForm(null); setCardVal(''); }} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
              <div className="p-3 flex items-end gap-2 relative">
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) sendImageFile(f); }} />
                <div className="relative">
                  <button onClick={() => setAttachOpen(o => !o)} className={cn('p-2 hover:text-slate-600', attachOpen ? 'text-indigo-600' : 'text-slate-400')}>
                    <Paperclip className="w-4 h-4" />
                  </button>
                  {attachOpen && (
                    <div className="absolute bottom-11 left-0 z-10 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-sm">
                      <button onClick={() => { setAttachOpen(false); fileRef.current?.click(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
                        <ImageIcon className="w-4 h-4 text-emerald-600" /> ส่งรูปภาพ
                      </button>
                      <button onClick={() => { setCardForm('item'); setAttachOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
                        <CreditCard className="w-4 h-4 text-amber-600" /> การ์ดสินค้า
                      </button>
                      <button onClick={() => { setCardForm('order'); setAttachOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
                        <CreditCard className="w-4 h-4 text-blue-600" /> การ์ดออเดอร์
                      </button>
                      <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100 mt-1">Shopee ส่งวิดีโอไม่ได้</div>
                    </div>
                  )}
                </div>
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  rows={1}
                  placeholder={noteMode ? 'เขียนโน้ตภายใน (ไม่ส่งถึงลูกค้า)...' : 'พิมพ์ข้อความ... (Shift+Enter = บรรทัดใหม่)'}
                  className={cn('flex-1 resize-none border rounded-lg px-3 py-2 text-sm focus:ring-2',
                    noteMode ? 'border-amber-300 bg-amber-50 focus:ring-amber-300' : 'border-slate-200 focus:ring-indigo-400')}
                />
                <button onClick={send} disabled={sending}
                  className={cn('text-white px-4 py-2 rounded-lg flex items-center gap-1.5 text-sm font-semibold disabled:opacity-50',
                    noteMode ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700')}>
                  {noteMode ? <StickyNote className="w-4 h-4" /> : <Send className="w-4 h-4" />}{sending ? '...' : (noteMode ? 'บันทึก' : 'ส่ง')}
                </button>
              </div>
            </div>
          </>
        )}
        {!active && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
            <AnimatedChat size={88} />
            <span className="text-sm">เลือกแชทจากด้านซ้ายเพื่อเริ่มสนทนา</span>
          </div>
        )}
      </div>

      {/* Customer panel */}
      {active && (
        <div className="w-72 bg-white border-l border-slate-200 overflow-y-auto scroll-thin">
          <div className="p-4 border-b border-slate-100 text-center">
            <div className="mx-auto mb-2 w-fit"><Avatar name={active.customer?.display_name} src={active.customer?.avatar} size="xl" /></div>
            <div className="font-semibold text-slate-900 truncate">{active.customer?.display_name}</div>
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              <BrandChip name={active.brand?.name} color={active.brand?.color} />
              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${CHANNEL_META[active.channel]?.bg} ${CHANNEL_META[active.channel]?.text}`}>
                <ChannelIcon channel={active.channel} size="xs" /> {CHANNEL_META[active.channel]?.name}
              </span>
            </div>
          </div>

          {/* Identity — the data we actually have from the platform */}
          <div className="p-4 space-y-1.5 text-xs border-b border-slate-100">
            <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1.5">ข้อมูลลูกค้า</div>
            <div className="flex justify-between gap-2"><span className="text-slate-500">ชื่อผู้ใช้</span><span className="font-medium text-slate-800 truncate">{active.customer?.display_name || '—'}</span></div>
            <div className="flex justify-between gap-2"><span className="text-slate-500">Buyer ID</span><span className="font-mono text-slate-700 truncate">{active.buyer_id || active.customer?.channel_user_id || '—'}</span></div>
            <div className="flex justify-between gap-2"><span className="text-slate-500">แบรนด์</span><span className="font-medium text-slate-800">{active.brand?.name || '—'}</span></div>
            <div className="flex justify-between gap-2"><span className="text-slate-500">Shop ID</span><span className="font-mono text-slate-700 truncate">{active.shop_id || '—'}</span></div>
          </div>

          {/* Activity */}
          <div className="p-4 space-y-1.5 text-xs border-b border-slate-100">
            <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1.5">กิจกรรม</div>
            <div className="flex justify-between gap-2"><span className="text-slate-500">ติดต่อครั้งแรก</span><span className="text-slate-700">{fmtDate(active.customer?.created_at || active.created_at)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-slate-500">ข้อความล่าสุด</span><span className="text-slate-700">{timeAgo(active.last_message_at) || '—'}</span></div>
            <div className="flex justify-between gap-2"><span className="text-slate-500">จำนวนข้อความ</span><span className="font-semibold text-slate-800">{active.messages?.length ?? 0}</span></div>
            <div className="flex justify-between gap-2"><span className="text-slate-500">ยังไม่อ่าน</span><span className="font-semibold text-slate-800">{active.unread ?? 0}</span></div>
          </div>

          {/* Contact — only when present */}
          {(active.customer?.email || active.customer?.phone) && (
            <div className="p-4 space-y-1.5 text-xs border-b border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1.5">ติดต่อ</div>
              {active.customer?.email && <div className="flex justify-between gap-2"><span className="text-slate-500">Email</span><span className="text-slate-700 truncate">{active.customer.email}</span></div>}
              {active.customer?.phone && <div className="flex justify-between gap-2"><span className="text-slate-500">โทร</span><span className="text-slate-700">{active.customer.phone}</span></div>}
            </div>
          )}

          {/* Commerce — real numbers if enriched, else a hint */}
          <div className="p-4 space-y-1.5 text-xs">
            <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1.5">การซื้อ</div>
            {(active.customer?.order_count || active.customer?.ltv) ? (
              <>
                <div className="flex justify-between gap-2"><span className="text-slate-500">ยอดซื้อสะสม (LTV)</span><span className="font-semibold text-slate-800">฿{(active.customer?.ltv || 0).toLocaleString()}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">จำนวนออเดอร์</span><span className="font-semibold text-slate-800">{active.customer?.order_count || 0}</span></div>
              </>
            ) : (
              <div className="text-[11px] text-slate-400 leading-relaxed">ยังไม่มีข้อมูลยอดซื้อ — เชื่อม Order API เพื่อดึงยอดซื้อ/จำนวนออเดอร์ของลูกค้ารายนี้</div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Image lightbox — pops up in-page (no new tab) */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white" title="ปิด (Esc)">
            <X className="w-7 h-7" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg object-contain shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
