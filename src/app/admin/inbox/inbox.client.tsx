'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNEL_META, PLATFORM_CHANNELS, brandIcon, cn } from '@/lib/utils';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Avatar } from '@/components/ui/avatar';
import { Fi } from '@/components/ui/fi';
import { AnimatedChat, AnimatedInbox, AnimatedAI, AnimatedRobot } from '@/components/ui/animated-icons';
import { Bot, Loader2 } from 'lucide-react';
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

// Shopee order status → short Thai label + a tint for the panel badge.
const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  UNPAID: { label: 'รอชำระ', cls: 'bg-amber-100 text-amber-700' },
  TO_CONFIRM_RECEIVE: { label: 'กำลังส่ง', cls: 'bg-blue-100 text-blue-700' },
  READY_TO_SHIP: { label: 'เตรียมส่ง', cls: 'bg-indigo-100 text-indigo-700' },
  SHIPPED: { label: 'จัดส่งแล้ว', cls: 'bg-blue-100 text-blue-700' },
  PROCESSED: { label: 'กำลังจัดการ', cls: 'bg-indigo-100 text-indigo-700' },
  COMPLETED: { label: 'สำเร็จ', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'ยกเลิก', cls: 'bg-rose-100 text-rose-700' },
  IN_CANCEL: { label: 'กำลังยกเลิก', cls: 'bg-rose-100 text-rose-700' },
  TO_RETURN: { label: 'คืนสินค้า', cls: 'bg-orange-100 text-orange-700' },
};
const orderStatusLabel = (s?: string) => ORDER_STATUS[s || '']?.label || (s || '—');
const orderStatusStyle = (s?: string) => ORDER_STATUS[s || '']?.cls || 'bg-slate-100 text-slate-600';

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
        : <span className="inline-flex items-center gap-1 text-xs opacity-80"><Fi name="picture" className="text-sm" /> ส่งรูปแล้ว</span>;
    case 'video':
      return a.url
        ? <video src={a.url} controls className="rounded-lg max-w-[240px] max-h-64" />
        : <span className="text-xs opacity-80">[วิดีโอ]</span>;
    case 'sticker':
      // eslint-disable-next-line @next/next/no-img-element
      return a.url ? <button type="button" onClick={() => onOpenImage?.(a.url)} className="block cursor-zoom-in"><img src={a.url} alt="sticker" className="w-24 h-24 object-contain" /></button> : <span>[sticker]</span>;
    case 'item':
      return <div className={`flex items-center gap-2 rounded-lg border ${frame} px-2.5 py-1.5 text-xs`}><Fi name="box-open" className="text-sm" /> สินค้า #{String(a.item_id ?? '')}</div>;
    case 'order':
      return <div className={`flex items-center gap-2 rounded-lg border ${frame} px-2.5 py-1.5 text-xs`}><Fi name="credit-card" className="text-sm" /> ออเดอร์ {String(a.order_sn ?? '')}</div>;
    case 'voucher':
      return <div className={`flex items-center gap-2 rounded-lg border ${frame} px-2.5 py-1.5 text-xs`}><Fi name="ticket" className="text-sm" /> คูปอง {String(a.voucher_code ?? '')}</div>;
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
  const [hydrating, setHydrating] = useState(false);
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
  // Buyer order history (customer panel) + product search (composer card picker).
  const [buyerOrders, setBuyerOrders] = useState<{ list: any[]; matched: boolean } | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [prodQ, setProdQ] = useState('');
  const [prods, setProds] = useState<any[] | null>(null);
  const [prodLoading, setProdLoading] = useState(false);
  // Team (for assignment), tasks (ใบสั่งงาน), recommended products (panel).
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [newTask, setNewTask] = useState('');
  const [recProds, setRecProds] = useState<any[] | null>(null);
  const [panelProdQ, setPanelProdQ] = useState('');
  const [vouchers, setVouchers] = useState<{ list: any[]; scopeMissing: boolean } | null>(null);
  const [aiDraft, setAiDraft] = useState<any | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftCopied, setDraftCopied] = useState(false);
  // Right customer panel: resizable width + tabbed sections (Chat++ style).
  const [panelW, setPanelW] = useState(360);
  const [panelTab, setPanelTab] = useState<'draft' | 'info' | 'orders' | 'products' | 'tasks' | 'coupon'>('draft');
  const panelWRef = useRef(360);
  const [listW, setListW] = useState(320);
  const listWRef = useRef(320);
  const listElRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Per-conversation cache for the (slow, upstream) panel data so re-opening a
  // chat shows orders/products/vouchers instantly instead of re-fetching.
  const panelCache = useRef<Map<string, { orders?: any; products?: any[]; vouchers?: any }>>(new Map());

  const [loadError, setLoadError] = useState(false);
  const failRef = useRef(0);
  const convoSig = (arr: any[]) => arr.map(c => `${c.id}:${c.last_message_at}:${c.unread}:${c.last_snippet || ''}`).join('|');
  const loadConvos = useCallback(async () => {
    try {
      const r = await fetch('/api/conversations');
      const d = await r.json();
      // Only replace the list with a real array. A transient error response
      // ({error:...}) must NOT wipe the inbox. And only re-render when it actually
      // changed (same data → keep the old array → no flicker/reorder churn).
      if (Array.isArray(d)) {
        setConvos(prev => (convoSig(prev) === convoSig(d) ? prev : d));
        failRef.current = 0; setLoadError(false);
      } else { failRef.current += 1; if (failRef.current >= 3) setLoadError(true); }
    } catch { failRef.current += 1; if (failRef.current >= 3) setLoadError(true); }
  }, []);

  useEffect(() => {
    loadConvos();
    fetch('/api/macros').then(r => r.json()).then(setMacros).catch(() => {});
    fetch('/api/users').then(r => r.json()).then(d => setTeam(Array.isArray(d) ? d.map((u: any) => ({ id: u.id, name: u.name || u.email })) : [])).catch(() => {});
  }, [loadConvos]);

  const userName = useCallback((id: string | null | undefined) => (id ? team.find(u => u.id === id)?.name || null : null), [team]);

  // Restore saved column widths once on mount.
  useEffect(() => {
    const s = Number(localStorage.getItem('inboxPanelW'));
    if (s >= 300 && s <= 680) { setPanelW(s); panelWRef.current = s; }
    const l = Number(localStorage.getItem('inboxListW'));
    if (l >= 260 && l <= 560) { setListW(l); listWRef.current = l; }
  }, []);
  // Drag the chat-list column's right edge to resize it.
  const startListResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const left = listElRef.current?.getBoundingClientRect().left ?? 256;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(560, Math.max(260, ev.clientX - left));
      listWRef.current = w;
      setListW(w);
    };
    const onUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem('inboxListW', String(Math.round(listWRef.current)));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);
  // Drag the panel's left edge to resize (panel is right-docked, so width grows as
  // the cursor moves left). Clamped, persisted to localStorage on release.
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(680, Math.max(300, window.innerWidth - ev.clientX));
      panelWRef.current = w;
      setPanelW(w);
    };
    const onUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem('inboxPanelW', String(Math.round(panelWRef.current)));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Track the currently-selected conversation so late-arriving fetches (from a
  // previous conversation's request or a poll) never overwrite the open thread.
  const activeIdRef = useRef<string | null>(null);

  // Single guarded thread loader: applies its result ONLY if that conversation is
  // still the active one. Prevents the "old chat stays / hangs on switch" bug.
  const loadThread = useCallback((id: string, opts: { live?: boolean; noHydrate?: boolean } = {}) => {
    const q = opts.live ? '?live=1' : opts.noHydrate ? '?nohydrate=1' : '';
    return fetch(`/api/conversations/${id}${q}`)
      .then(r => r.json())
      .then(d => {
        if (d?.id !== activeIdRef.current) return d;
        setActive(prev => {
          // Skip the state update when nothing changed → no re-render, no scroll jump,
          // no "message flashes then disappears" flicker on every poll.
          if (prev && prev.id === d.id) {
            const pm = prev.messages || [], nm = d.messages || [];
            const same = pm.length === nm.length
              && pm[pm.length - 1]?.id === nm[nm.length - 1]?.id
              && prev.unread === d.unread;
            if (same) return prev;
          }
          return d;
        });
        return d;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const id = activeId;
    setThreadLoading(true); setHydrating(false);
    // 1) Instant: render from the DB right away (no blocking upstream fetch).
    loadThread(id).then((d: any) => {
      if (id !== activeIdRef.current) return;
      setThreadLoading(false);
      // 2) If only the preview is stored, pull the full history in the BACKGROUND
      //    (thread already visible; fills in a moment). Persisted → next open instant.
      if (((d && d.messages) || []).length <= 1) {
        setHydrating(true);
        loadThread(id, { live: true }).finally(() => { if (id === activeIdRef.current) setHydrating(false); });
      }
    });
  }, [activeId, loadThread]);

  // Load the buyer's real order history when a conversation opens (Shopee only,
  // lazy — never blocks the thread). Cleared per open so panels don't cross-bleed.
  const loadTasks = useCallback((id: string) => {
    fetch(`/api/conversations/${id}/tasks`).then(r => r.json())
      .then(d => { if (id === activeIdRef.current) setTasks(Array.isArray(d?.tasks) ? d.tasks : []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeId) { setBuyerOrders(null); setTasks([]); setRecProds(null); return; }
    const id = activeId;
    setProdQ(''); setTasks([]); setAssignOpen(false); setPanelProdQ(''); setAiDraft(null); setDraftCopied(false);
    // Restore cached panel data instantly (orders/products/vouchers); only fetch
    // what isn't cached. Orders (buyer-orders) is a ~4–5s BigQuery-backed upstream,
    // so caching makes every re-open instant.
    const cached = panelCache.current.get(id);
    setBuyerOrders(cached?.orders ?? null);
    setRecProds(cached?.products ?? null);
    setVouchers(cached?.vouchers ?? null);
    if (cached?.orders) {
      setOrdersLoading(false);
    } else {
      setOrdersLoading(true);
      fetch(`/api/conversations/${id}/orders`)
        .then(r => r.json())
        .then(d => {
          const val = { list: Array.isArray(d?.orders) ? d.orders : [], matched: !!d?.matched };
          panelCache.current.set(id, { ...panelCache.current.get(id), orders: val });
          if (id === activeIdRef.current) setBuyerOrders(val);
        })
        .catch(() => { if (id === activeIdRef.current) setBuyerOrders({ list: [], matched: false }); })
        .finally(() => { if (id === activeIdRef.current) setOrdersLoading(false); });
    }
    loadTasks(id);
    // NOTE: products + vouchers are NOT fetched here — they hit the rate-limited
    // Shopee API and most opens never look at those tabs. They load lazily the
    // first time their tab is viewed (see the effect below) and are cached per
    // conversation, so opening a chat stays light + fast.
  }, [activeId, loadTasks]);

  // Lazy-load the สินค้า / คูปอง tab data only when the tab is actually opened
  // (once per conversation — cached in state until the conversation changes).
  useEffect(() => {
    const id = activeId;
    if (!id) return;
    if (panelTab === 'products' && recProds === null) {
      fetch(`/api/conversations/${id}/products`).then(r => r.json())
        .then(d => {
          const list = Array.isArray(d?.products) ? d.products : [];
          panelCache.current.set(id, { ...panelCache.current.get(id), products: list });
          if (id === activeIdRef.current) setRecProds(list);
        })
        .catch(() => { if (id === activeIdRef.current) setRecProds([]); });
    }
    if (panelTab === 'coupon' && vouchers === null) {
      fetch(`/api/conversations/${id}/vouchers`).then(r => r.json())
        .then(d => {
          const val = { list: Array.isArray(d?.vouchers) ? d.vouchers : [], scopeMissing: !!d?.scopeMissing };
          panelCache.current.set(id, { ...panelCache.current.get(id), vouchers: val });
          if (id === activeIdRef.current) setVouchers(val);
        })
        .catch(() => { if (id === activeIdRef.current) setVouchers({ list: [], scopeMissing: false }); });
    }
  }, [panelTab, activeId, recProds, vouchers]);

  // ---- AI draft ("ช่วยตอบ") — learns the team's style; human copies/sends ----
  const messages = active?.messages;
  const lastMsg = messages && messages.length ? messages[messages.length - 1] : null;
  const needsReply = !!lastMsg && (lastMsg as any).sender_type === 'customer'; // last word is the customer's
  const fetchDraft = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    setDraftLoading(true); setDraftCopied(false);
    fetch(`/api/conversations/${id}/draft`).then(r => r.json())
      .then(d => { if (id === activeIdRef.current) setAiDraft(d); })
      .catch(() => { if (id === activeIdRef.current) setAiDraft({ text: '', error: true }); })
      .finally(() => { if (id === activeIdRef.current) setDraftLoading(false); });
  }, []);
  useEffect(() => {
    // Auto-draft only when the chat is actually waiting on us (last message is the
    // customer's) — don't burn LLM calls on chats we've already answered.
    if (!activeId || panelTab !== 'draft' || !needsReply) return;
    const lcId = lastMsg ? (lastMsg as any).id : null;
    if (aiDraft && aiDraft.forMessageId === lcId) return; // already drafted for this exact message
    fetchDraft();
  }, [panelTab, activeId, needsReply, lastMsg, aiDraft, fetchDraft]);

  const copyDraft = () => { if (aiDraft?.text) { navigator.clipboard?.writeText(aiDraft.text).catch(() => {}); setDraftCopied(true); setTimeout(() => setDraftCopied(false), 1500); } };
  const useDraft = () => { if (aiDraft?.text) setDraft(aiDraft.text); };  // fill the composer to edit
  const regenDraft = () => fetchDraft();
  const sendDraft = async () => {
    if (!active || !aiDraft?.text || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/conversations/${active.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: aiDraft.text }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'ส่งไม่สำเร็จ'); }
      else { setAiDraft(null); refreshActive(); }
    } finally { setSending(false); }
  };

  const sendVoucherCard = async (v: any) => {
    if (!active || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/conversations/${active.id}/vouchers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucher_id: v.voucher_id, voucher_code: v.voucher_code }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'ส่งคูปองไม่สำเร็จ'); }
      else refreshActive();
    } finally { setSending(false); }
  };
  const voucherLabel = (v: any) => v.reward_type === 2 ? `ลด ${v.percentage}%${v.max_price ? ` (สูงสุด ฿${Number(v.max_price).toLocaleString()})` : ''}` : `ลด ฿${Number(v.discount_amount || 0).toLocaleString()}`;

  // สินค้า tab search — empty query = best-sellers / all.
  const searchPanelProds = useCallback((q: string) => {
    const id = activeIdRef.current;
    if (!id) return;
    setRecProds(null);
    fetch(`/api/conversations/${id}/products?q=${encodeURIComponent(q)}`).then(r => r.json())
      .then(d => { if (id === activeIdRef.current) setRecProds(Array.isArray(d?.products) ? d.products : []); })
      .catch(() => { if (id === activeIdRef.current) setRecProds([]); });
  }, []);

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

  // Supabase realtime — subscribe ONCE. A cron sweep can insert hundreds of
  // messages in a burst; firing loadConvos/loadThread on every INSERT would storm
  // the UI. Debounce so a burst collapses into a single refresh. Uses activeIdRef
  // (not activeId) so switching conversations doesn't tear down + resubscribe.
  const rtConvosTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rtThreadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel('messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if (rtConvosTimer.current) clearTimeout(rtConvosTimer.current);
        rtConvosTimer.current = setTimeout(() => loadConvos(), 1200);
        const cid = (payload.new as Message).conversation_id;
        if (activeIdRef.current && cid === activeIdRef.current) {
          if (rtThreadTimer.current) clearTimeout(rtThreadTimer.current);
          rtThreadTimer.current = setTimeout(() => { if (activeIdRef.current) loadThread(activeIdRef.current); }, 700);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadConvos, supabase, loadThread]);

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

  // Product search (catalog) → pick a result → send it as an item card.
  const searchProds = useCallback(async (q: string) => {
    if (!activeIdRef.current) return;
    const id = activeIdRef.current;
    setProdLoading(true);
    try {
      const r = await fetch(`/api/conversations/${id}/products?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (id === activeIdRef.current) setProds(Array.isArray(d?.products) ? d.products : []);
    } catch { if (id === activeIdRef.current) setProds([]); }
    finally { if (id === activeIdRef.current) setProdLoading(false); }
  }, []);

  const sendItemCard = async (itemId: number) => {
    if (!active || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/conversations/${active.id}/card`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'item', item_id: itemId }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'ส่งการ์ดไม่สำเร็จ'); }
      else { setCardForm(null); setProds(null); setProdQ(''); setCardVal(''); setAttachOpen(false); refreshActive(); }
    } finally { setSending(false); }
  };

  // Pin / assign — write via the conversation PATCH, then reflect locally + refresh list.
  const patchConvo = async (patch: Record<string, unknown>) => {
    if (!active) return;
    const id = active.id;
    setActive(prev => (prev && prev.id === id ? { ...prev, ...patch } as any : prev));
    await fetch(`/api/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => {});
    loadConvos();
  };
  const togglePin = () => patchConvo({ pinned: !(active as any)?.pinned });
  const assignTo = async (uid: string | null) => {
    setAssignOpen(false);
    if (!active) return;
    const id = active.id;
    setActive(prev => (prev && prev.id === id ? { ...prev, assigned_to: uid, assignee: uid ? { id: uid, name: userName(uid) } : null } as any : prev));
    await fetch(`/api/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigned_to: uid }) }).catch(() => {});
    loadConvos();
  };

  // Tasks (ใบสั่งงาน)
  const addTask = async () => {
    const title = newTask.trim();
    if (!title || !active) return;
    setNewTask('');
    const r = await fetch(`/api/conversations/${active.id}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    if (r.ok && active) loadTasks(active.id);
  };
  const toggleTask = async (taskId: string, done: boolean) => {
    if (!active) return;
    setTasks(ts => ts.map(t => (t.id === taskId ? { ...t, done } : t)));
    await fetch(`/api/conversations/${active.id}/tasks`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, done }),
    }).catch(() => {});
    loadTasks(active.id);
  };
  const deleteTask = async (taskId: string) => {
    if (!active) return;
    setTasks(ts => ts.filter(t => t.id !== taskId));
    await fetch(`/api/conversations/${active.id}/tasks?task_id=${taskId}`, { method: 'DELETE' }).catch(() => {});
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
    const id = setInterval(() => { loadConvos(); }, 30000);
    return () => clearInterval(id);
  }, [loadConvos]);

  // Keep the open thread live — re-pull it from the platform to catch new replies.
  useEffect(() => {
    if (!activeId) return;
    // Keep the OPEN thread near-live: pull it from Shopee every 15s (just this one
    // conversation — cheap). Change-detection means no flicker when nothing is new.
    // This is what makes the active chat feel realtime (like Chat++) without a webhook.
    const id = setInterval(() => { loadThread(activeId, { live: true }); }, 15000);
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
      <div className="bg-white/60 supports-[backdrop-filter]:bg-white/50 backdrop-blur-2xl border-b border-white/60 px-4 py-2 flex flex-col gap-1.5">
        {/* Row 1: search + status */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-56">
            <Fi name="search" className="text-base absolute left-3 top-2.5 text-slate-400" />
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
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Fi name="refresh" className="text-sm" />}
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
        {/* Conversation list — resizable */}
        <div ref={listElRef} className="bg-white border-r border-slate-200 flex flex-col shrink-0 relative" style={{ width: listW }}>
          {/* Drag handle on the right edge */}
          <div onMouseDown={startListResize} title="ลากเพื่อปรับความกว้าง"
            className="absolute right-0 top-0 h-full w-1.5 -mr-1 cursor-col-resize z-20 hover:bg-indigo-400/40 active:bg-indigo-500/50" />
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
                    <span className="absolute -bottom-0.5 -right-0.5 flex">
                      <ChannelIcon channel={c.channel} size="xs" className="ring-2 ring-white" />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center gap-2">
                      <span className={cn('text-sm truncate flex items-center gap-1', unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800')}>
                        {(c as any).pinned && <Fi name="thumbtack" className="text-[11px] text-amber-500 shrink-0" />}
                        <span className="truncate">{c.customer_name || '-'}</span>
                      </span>
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
                      {c.assignee_name && <span className="inline-flex items-center gap-0.5 text-[9px] px-1 rounded bg-slate-100 text-slate-600 font-medium truncate max-w-[80px]"><Fi name="user" className="text-[10px] shrink-0" />{c.assignee_name}</span>}
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
                  <div className="text-xs text-slate-500">
                    สถานะ: {active.status} · ความสำคัญ: {active.priority}
                    {(active as any).assignee?.name || userName(active.assigned_to)
                      ? <> · ผู้ดูแล: <span className="font-medium text-slate-700">{(active as any).assignee?.name || userName(active.assigned_to)}</span></>
                      : <> · <span className="text-amber-600">ยังไม่มีผู้ดูแล</span></>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5">
                {/* Pin */}
                <button onClick={togglePin} title={(active as any).pinned ? 'เลิกปักหมุด' : 'ปักหมุดแชทนี้'}
                  className={cn('px-2.5 py-1.5 text-xs rounded-lg border flex items-center gap-1.5',
                    (active as any).pinned ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 hover:bg-slate-50')}>
                  <Fi name="thumbtack" className="text-[13px]" />{(active as any).pinned ? 'ปักหมุดแล้ว' : 'ปักหมุด'}
                </button>
                {/* Assign */}
                <div className="relative">
                  <button onClick={() => setAssignOpen(o => !o)}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
                    <Fi name="user-add" className="text-[13px]" />
                    {(active as any).assignee?.name || userName(active.assigned_to) || 'มอบหมาย'}
                    <Fi name="angle-small-down" className="text-[12px] opacity-60" />
                  </button>
                  {assignOpen && (
                    <div className="absolute right-0 top-10 z-20 w-52 max-h-72 overflow-y-auto scroll-thin bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-sm">
                      <button onClick={() => assignTo(userId)} className="w-full text-left px-3 py-2 hover:bg-indigo-50 font-medium text-indigo-700">ฉันรับเคสนี้เอง</button>
                      {active.assigned_to && <button onClick={() => assignTo(null)} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-500">เอาผู้ดูแลออก</button>}
                      <div className="border-t border-slate-100 my-1" />
                      {team.map(u => (
                        <button key={u.id} onClick={() => assignTo(u.id)}
                          className={cn('w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between', active.assigned_to === u.id && 'bg-slate-50 font-medium')}>
                          {u.name}{active.assigned_to === u.id && <Fi name="check" className="text-[13px] text-emerald-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={close} className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
                  <Fi name="check" className="text-[13px]" />ปิดเคส
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin px-6 py-4 space-y-3">
              {hydrating && (
                <div className="sticky top-0 z-10 flex justify-center">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 bg-white/90 border border-slate-200 rounded-full px-2.5 py-1 shadow-sm">
                    <Loader2 className="w-3 h-3 animate-spin" /> กำลังโหลดประวัติแชท…
                  </span>
                </div>
              )}
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
                  <Fi name="note-sticky" className="text-sm" /> โน้ตภายใน
                </button>
              </div>
              {cardForm === 'order' && (
                <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 text-xs bg-slate-50">
                  <span className="text-slate-500">ส่งการ์ดออเดอร์ — order_sn</span>
                  <input value={cardVal} onChange={e => setCardVal(e.target.value)} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') sendCardMsg(); }}
                    placeholder="เช่น 240505FR5QG0CF"
                    className="flex-1 max-w-xs border border-slate-200 rounded-md px-2 py-1" />
                  <button onClick={sendCardMsg} disabled={sending} className="px-2 py-1 rounded-md bg-indigo-600 text-white disabled:opacity-50">ส่ง</button>
                  <button onClick={() => { setCardForm(null); setCardVal(''); }} className="text-slate-400 hover:text-slate-600"><Fi name="cross-small" className="text-sm" /></button>
                </div>
              )}
              {cardForm === 'item' && (
                <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 whitespace-nowrap">ค้นหาสินค้า</span>
                    <input value={prodQ} onChange={e => setProdQ(e.target.value)} autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') searchProds(prodQ); }}
                      placeholder="พิมพ์ชื่อสินค้า/SKU แล้วกด Enter (เว้นว่าง = ขายดี)"
                      className="flex-1 border border-slate-200 rounded-md px-2 py-1" />
                    <button onClick={() => searchProds(prodQ)} disabled={prodLoading} className="px-2 py-1 rounded-md bg-indigo-600 text-white disabled:opacity-50">ค้นหา</button>
                    <button onClick={() => { setCardForm(null); setProds(null); setProdQ(''); }} className="text-slate-400 hover:text-slate-600"><Fi name="cross-small" className="text-sm" /></button>
                  </div>
                  {prodLoading ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 py-2"><Loader2 className="w-3 h-3 animate-spin" /> กำลังค้นหา…</div>
                  ) : prods && prods.length > 0 ? (
                    <div className="max-h-56 overflow-y-auto scroll-thin grid grid-cols-1 gap-1">
                      {prods.map((p: any) => (
                        <button key={p.item_id} onClick={() => sendItemCard(p.item_id)} disabled={sending}
                          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left hover:border-indigo-300 hover:bg-indigo-50/40 disabled:opacity-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p.image_url ? <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" /> : <div className="w-10 h-10 rounded bg-slate-100 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] text-slate-800 line-clamp-2 leading-tight">{p.item_name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                              <span className="font-semibold text-indigo-600">฿{Number(p.price).toLocaleString()}</span>
                              {p.original_price > p.price && <span className="text-slate-400 line-through">฿{Number(p.original_price).toLocaleString()}</span>}
                              <span className={cn('rounded px-1 py-0.5 font-medium', p.in_stock ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                                {p.in_stock ? `สต็อก ${p.stock}` : 'หมด'}
                              </span>
                              {p.lifetime_sales ? <span className="text-slate-400">ขาย {Number(p.lifetime_sales).toLocaleString()}</span> : null}
                            </div>
                          </div>
                          <Fi name="paper-plane" className="text-sm text-slate-300 shrink-0" />
                        </button>
                      ))}
                    </div>
                  ) : prods ? (
                    <div className="text-[11px] text-slate-400 py-1.5">ไม่พบสินค้า — ลองคำค้นอื่น หรือใส่ item_id เอง:
                      <span className="inline-flex items-center gap-1 ml-1">
                        <input value={cardVal} onChange={e => setCardVal(e.target.value)} placeholder="item_id"
                          className="w-24 border border-slate-200 rounded px-1.5 py-0.5" onKeyDown={e => { if (e.key === 'Enter') sendCardMsg(); }} />
                        <button onClick={sendCardMsg} disabled={sending} className="px-1.5 py-0.5 rounded bg-indigo-600 text-white disabled:opacity-50">ส่ง</button>
                      </span>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400">แคตตาล็อกอัปเดตรายวัน · สต็อกเป็นค่าประมาณ · กดสินค้าเพื่อส่งการ์ดให้ลูกค้า</div>
                  )}
                </div>
              )}
              <div className="p-3 flex items-end gap-2 relative">
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) sendImageFile(f); }} />
                <div className="relative">
                  <button onClick={() => setAttachOpen(o => !o)} className={cn('p-2 hover:text-slate-600', attachOpen ? 'text-indigo-600' : 'text-slate-400')}>
                    <Fi name="clip" className="text-base" />
                  </button>
                  {attachOpen && (
                    <div className="absolute bottom-11 left-0 z-10 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-sm">
                      <button onClick={() => { setAttachOpen(false); fileRef.current?.click(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
                        <Fi name="picture" className="text-base text-emerald-600" /> ส่งรูปภาพ
                      </button>
                      <button onClick={() => { setCardForm('item'); setAttachOpen(false); setProds(null); setProdQ(''); searchProds(''); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
                        <Fi name="box-open" className="text-base text-amber-600" /> การ์ดสินค้า
                      </button>
                      <button onClick={() => { setCardForm('order'); setAttachOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
                        <Fi name="credit-card" className="text-base text-blue-600" /> การ์ดออเดอร์
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
                  {noteMode ? <Fi name="note-sticky" className="text-base" /> : <Fi name="paper-plane" className="text-base" />}{sending ? '...' : (noteMode ? 'บันทึก' : 'ส่ง')}
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

      {/* Customer panel — resizable + tabbed (Chat++ style) */}
      {active && (
        <div className="bg-white border-l border-slate-200 flex flex-col shrink-0 relative" style={{ width: panelW }}>
          {/* Drag handle on the left edge to resize the panel */}
          <div onMouseDown={startResize} title="ลากเพื่อปรับความกว้าง"
            className="absolute left-0 top-0 h-full w-1.5 -ml-1 cursor-col-resize z-20 hover:bg-indigo-400/40 active:bg-indigo-500/50" />

          {/* Header — always visible */}
          <div className="p-4 border-b border-slate-100 text-center shrink-0">
            <div className="mx-auto mb-2 w-fit"><Avatar name={active.customer?.display_name} src={active.customer?.avatar} size="xl" /></div>
            <div className="font-semibold text-slate-900 truncate">{active.customer?.display_name}</div>
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              <BrandChip name={active.brand?.name} color={active.brand?.color} />
              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${CHANNEL_META[active.channel]?.bg} ${CHANNEL_META[active.channel]?.text}`}>
                <ChannelIcon channel={active.channel} size="xs" /> {CHANNEL_META[active.channel]?.name}
              </span>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-slate-200 shrink-0 text-[11px] font-medium overflow-x-auto scroll-thin">
            {([
              { key: 'draft', label: 'ช่วยตอบ', icon: 'sparkles', badge: 0 },
              { key: 'info', label: 'ข้อมูล', icon: 'user', badge: 0 },
              { key: 'orders', label: 'ออเดอร์', icon: 'shopping-bag', badge: buyerOrders?.list.length || 0 },
              { key: 'products', label: 'สินค้า', icon: 'box-open', badge: 0 },
              { key: 'tasks', label: 'งาน', icon: 'list-check', badge: tasks.filter((t: any) => !t.done).length },
              { key: 'coupon', label: 'คูปอง', icon: 'ticket', badge: 0 },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setPanelTab(t.key)}
                className={cn('flex-1 min-w-[56px] px-1 py-2 flex flex-col items-center gap-1 border-b-2 -mb-px whitespace-nowrap',
                  panelTab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
                <Fi name={t.icon} className="text-[15px]" />
                <span className="flex items-center gap-1">
                  {t.label}
                  {t.badge > 0 && <span className="rounded-full bg-slate-200 text-slate-600 text-[9px] px-1 leading-4">{t.badge}</span>}
                </span>
              </button>
            ))}
          </div>

          {/* Tab content (scrolls) */}
          <div className="flex-1 overflow-y-auto scroll-thin">

            {panelTab === 'draft' && (
              <div className="p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
                    <Fi name="sparkles" className="text-amber-400 text-sm" /> ช่วยร่างคำตอบ
                  </span>
                  <button onClick={regenDraft} disabled={draftLoading} className="text-[10px] text-indigo-600 hover:underline disabled:opacity-50 flex items-center gap-1">
                    <Fi name="refresh" className="text-[11px]" /> ร่างใหม่
                  </button>
                </div>
                <div className="text-[10px] text-slate-400 leading-relaxed">เรียนรู้จากสำนวนที่ทีมเคยตอบจริง · แอดมินตรวจแล้วกดส่งเอง (ไม่ส่งอัตโนมัติ)</div>

                {draftLoading ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 py-3"><Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังร่างคำตอบ…</div>
                ) : !aiDraft || aiDraft.empty ? (
                  <div className="text-[11px] text-slate-400 py-2">{aiDraft?.empty ? 'ยังไม่มีคำถามจากลูกค้าให้ตอบ' : 'กด “ร่างใหม่” เพื่อให้ช่วยร่างคำตอบ'}</div>
                ) : (
                  <div className="space-y-2">
                    {aiDraft.question && (
                      <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500">
                        <span className="text-slate-400">ลูกค้าถาม: </span>{String(aiDraft.question).slice(0, 160)}
                      </div>
                    )}
                    {aiDraft.needsHuman && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-[11px] text-amber-800 flex gap-1.5">
                        <Fi name="triangle-warning" className="text-sm shrink-0 mt-0.5" />
                        <div><span className="font-semibold">ควรให้แอดมินตอบเอง</span>{aiDraft.reason ? ` — ${aiDraft.reason}` : ' — ข้อมูลไม่พอ'}</div>
                      </div>
                    )}
                    {aiDraft.answered && (
                      <div className="text-[10px] text-emerald-600">✓ ตอบข้อความนี้ไปแล้ว (นี่คือร่างเผื่อใช้)</div>
                    )}
                    {aiDraft.text ? (
                      <>
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5 text-[13px] text-slate-800 whitespace-pre-wrap leading-relaxed">{aiDraft.text}</div>
                        {(aiDraft.sources?.length ?? 0) > 0 && (
                          <div className="text-[10px] text-slate-400">อ้างอิง: {aiDraft.sources.map((s: any) => s.title).join(', ')}</div>
                        )}
                        <div className="grid grid-cols-3 gap-1.5">
                          <button onClick={copyDraft} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 hover:bg-slate-50 text-slate-700">
                            <Fi name={draftCopied ? 'check' : 'copy'} className="text-[13px]" />{draftCopied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                          </button>
                          <button onClick={useDraft} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 hover:bg-slate-50 text-slate-700">
                            <Fi name="edit" className="text-[13px]" /> แก้ก่อนส่ง
                          </button>
                          <button onClick={sendDraft} disabled={sending} className="flex items-center justify-center gap-1 rounded-lg bg-indigo-600 text-white py-1.5 disabled:opacity-50">
                            <Fi name="paper-plane" className="text-[13px]" /> ส่งเลย
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] text-slate-400">— ไม่มีข้อความร่าง ให้แอดมินตอบเอง —</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {panelTab === 'info' && (<>
              <div className="p-4 space-y-1.5 text-xs border-b border-slate-100">
                <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1.5">ข้อมูลลูกค้า</div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">ชื่อผู้ใช้</span><span className="font-medium text-slate-800 truncate">{active.customer?.display_name || '—'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Buyer ID</span><span className="font-mono text-slate-700 truncate">{active.buyer_id || active.customer?.channel_user_id || '—'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">แบรนด์</span><span className="font-medium text-slate-800">{active.brand?.name || '—'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Shop ID</span><span className="font-mono text-slate-700 truncate">{active.shop_id || '—'}</span></div>
              </div>
              <div className="p-4 space-y-1.5 text-xs border-b border-slate-100">
                <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1.5">กิจกรรม</div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">ติดต่อครั้งแรก</span><span className="text-slate-700">{fmtDate(active.customer?.created_at || active.created_at)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">ข้อความล่าสุด</span><span className="text-slate-700">{timeAgo(active.last_message_at) || '—'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">จำนวนข้อความ</span><span className="font-semibold text-slate-800">{active.messages?.length ?? 0}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">ยังไม่อ่าน</span><span className="font-semibold text-slate-800">{active.unread ?? 0}</span></div>
              </div>
              {(active.customer?.email || active.customer?.phone) && (
                <div className="p-4 space-y-1.5 text-xs border-b border-slate-100">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1.5">ติดต่อ</div>
                  {active.customer?.email && <div className="flex justify-between gap-2"><span className="text-slate-500">Email</span><span className="text-slate-700 truncate">{active.customer.email}</span></div>}
                  {active.customer?.phone && <div className="flex justify-between gap-2"><span className="text-slate-500">โทร</span><span className="text-slate-700">{active.customer.phone}</span></div>}
                </div>
              )}
              <div className="p-4 space-y-1.5 text-xs">
                <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1.5">ยอดซื้อ</div>
                {(active.customer?.order_count || active.customer?.ltv) ? (
                  <>
                    <div className="flex justify-between gap-2"><span className="text-slate-500">ยอดซื้อสะสม (LTV)</span><span className="font-semibold text-slate-800">฿{(active.customer?.ltv || 0).toLocaleString()}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-500">จำนวนออเดอร์</span><span className="font-semibold text-slate-800">{active.customer?.order_count || 0}</span></div>
                  </>
                ) : (
                  <div className="text-[11px] text-slate-400 leading-relaxed">ยังไม่มียอดซื้อสะสม — ต้องเชื่อม Order API (ecom ยังไม่เปิดให้ดึง)</div>
                )}
              </div>
            </>)}

            {panelTab === 'orders' && (<>
              <div className="p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">ประวัติการสั่งซื้อ</span>
                  {buyerOrders && buyerOrders.list.length > 0 && (
                    <span className="text-[10px] font-semibold text-slate-500">{buyerOrders.list.length} ออเดอร์</span>
                  )}
                </div>
                {ordersLoading ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> กำลังโหลด…</div>
                ) : buyerOrders && buyerOrders.list.length > 0 ? (
                  <div className="space-y-1.5">
                    {buyerOrders.list.map((o: any) => (
                      <div key={o.order_sn} className="rounded-lg border border-slate-200 px-2.5 py-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] text-slate-500 truncate">{o.order_sn}</span>
                          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold', orderStatusStyle(o.order_status))}>{orderStatusLabel(o.order_status)}</span>
                        </div>
                        {(o.items || []).map((it: any, i: number) => (
                          <div key={i} className="flex gap-2 items-start">
                            {it.image_url
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <button type="button" onClick={() => setLightbox(it.image_url)} className="shrink-0 cursor-zoom-in"><img src={it.image_url} alt="" className="w-9 h-9 rounded object-cover" /></button>
                              : <div className="w-9 h-9 rounded bg-slate-100 shrink-0 flex items-center justify-center"><Fi name="box-open" className="text-base text-slate-300" /></div>}
                            <div className="min-w-0 flex-1 leading-tight">
                              <div className="text-slate-700 line-clamp-2">{it.item_name}</div>
                              <div className="text-slate-400">{it.model_name ? `${it.model_name} · ` : ''}× {it.quantity}</div>
                              {it.item_id && (
                                <button onClick={() => sendItemCard(it.item_id)} disabled={sending}
                                  className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:underline disabled:opacity-50">
                                  <Fi name="paper-plane" className="text-[11px]" /> ส่งการ์ดสินค้านี้ให้ลูกค้า
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                          <span>{o.order_date}{o.cod ? ' · เก็บเงินปลายทาง' : ''}</span>
                          <a href="https://seller.shopee.co.th/portal/sale/order" target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">เปิด ↗</a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">
                    {buyerOrders && !buyerOrders.matched
                      ? 'ไม่พบประวัติการสั่งซื้อสำหรับชื่อผู้ใช้นี้ (ชื่อร้านค้าอาจต่างจากตอนสั่ง)'
                      : 'ยังไม่พบประวัติการสั่งซื้อ'}
                  </div>
                )}
              </div>
              {((active as any).order_refs?.length ?? 0) > 0 && (
                <div className="p-4 space-y-1.5 text-xs border-t border-slate-100">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-1.5">อ้างถึงในแชทนี้</div>
                  <div className="space-y-1">
                    {((active as any).order_refs as string[]).map((sn) => (
                      <a key={sn} href="https://seller.shopee.co.th/portal/sale/order" target="_blank" rel="noreferrer"
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2 py-1.5 hover:bg-slate-50 group">
                        <span className="font-mono text-slate-700 truncate">{sn}</span>
                        <span className="text-[10px] text-brand-600 opacity-0 group-hover:opacity-100 shrink-0">เปิด ↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>)}

            {panelTab === 'products' && (
              <div className="p-4 space-y-2 text-xs">
                {/* Search the whole catalog; empty = best-sellers */}
                <div className="flex items-center gap-1">
                  <div className="relative flex-1">
                    <Fi name="search" className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[13px]" />
                    <input value={panelProdQ} onChange={e => setPanelProdQ(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') searchPanelProds(panelProdQ); }}
                      placeholder="ค้นหาสินค้า / SKU…" className="w-full border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 text-[11px]" />
                  </div>
                  <button onClick={() => searchPanelProds(panelProdQ)} className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white">ค้นหา</button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-semibold">{panelProdQ.trim() ? `ผลการค้นหา “${panelProdQ.trim()}”` : 'สินค้าขายดี'}</span>
                  {panelProdQ.trim() && <button onClick={() => { setPanelProdQ(''); searchPanelProds(''); }} className="text-[10px] text-indigo-600 hover:underline">ดูขายดีทั้งหมด</button>}
                </div>
                {recProds === null ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> กำลังโหลด…</div>
                ) : recProds.length > 0 ? (
                  <div className="space-y-1">
                    {recProds.map((p: any) => (
                      <div key={p.item_id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 hover:border-indigo-300 hover:bg-indigo-50/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {p.image_url ? <button type="button" onClick={() => setLightbox(p.image_url)} className="shrink-0 cursor-zoom-in"><img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover" /></button> : <div className="w-10 h-10 rounded bg-slate-100 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-slate-800 line-clamp-2 leading-tight">{p.item_name}</div>
                          <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                            <span className="font-semibold text-indigo-600">฿{Number(p.price).toLocaleString()}</span>
                            {p.original_price > p.price && <span className="text-slate-400 line-through">฿{Number(p.original_price).toLocaleString()}</span>}
                            <span className={cn('rounded px-1 py-0.5 font-medium', p.in_stock ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>{p.in_stock ? `สต็อก ${p.stock}` : 'หมด'}</span>
                          </div>
                        </div>
                        <button onClick={() => sendItemCard(p.item_id)} disabled={sending} title="ส่งการ์ดสินค้านี้ให้ลูกค้า"
                          className="shrink-0 p-1.5 rounded-md bg-indigo-600 text-white disabled:opacity-50"><Fi name="paper-plane" className="text-[12px]" /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">{panelProdQ.trim() ? 'ไม่พบสินค้าตามคำค้น' : 'ไม่มีข้อมูลสินค้าสำหรับร้านนี้'}</div>
                )}
              </div>
            )}

            {panelTab === 'tasks' && (
              <div className="p-4 space-y-2 text-xs">
                <div className="flex items-center gap-1.5"><Fi name="list-check" className="text-sm text-slate-400" /><span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">ใบสั่งงาน</span></div>
                <div className="flex items-center gap-1">
                  <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
                    placeholder="เพิ่มงานที่ต้องทำต่อ…" className="flex-1 border border-slate-200 rounded-md px-2 py-1.5 text-[11px]" />
                  <button onClick={addTask} className="p-1.5 rounded-md bg-indigo-600 text-white"><Fi name="plus" className="text-sm" /></button>
                </div>
                {tasks.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    {tasks.map((t: any) => (
                      <div key={t.id} className="flex items-start gap-1.5 group">
                        <button onClick={() => toggleTask(t.id, !t.done)} className={cn('mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center', t.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300')}>
                          {t.done && <Fi name="check" className="text-[11px]" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className={cn('leading-snug', t.done ? 'line-through text-slate-400' : 'text-slate-700')}>{t.title}</div>
                          {t.assignee?.name && <div className="text-[9px] text-slate-400">→ {t.assignee.name}</div>}
                        </div>
                        <button onClick={() => deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 shrink-0"><Fi name="trash" className="text-sm" /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 pt-1">ยังไม่มีงาน — เพิ่มสิ่งที่ต้องทำต่อกับแชทนี้ เช่น “ตามเลขพัสดุ”, “โทรกลับ”</div>
                )}
              </div>
            )}

            {panelTab === 'coupon' && (
              <div className="p-4 space-y-2 text-xs">
                <div className="flex items-center gap-1.5"><Fi name="ticket" className="text-sm text-slate-400" /><span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">คูปองที่กำลังใช้ได้</span></div>
                {vouchers === null ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> กำลังโหลด…</div>
                ) : vouchers.scopeMissing ? (
                  <div className="text-[11px] text-amber-600 leading-relaxed">ยังส่งคูปองไม่ได้ — API key ยังไม่มีสิทธิ์ <span className="font-mono">shopee_voucher</span> (ให้ทีม platform ผูก scope นี้กับคีย์ที่ใช้อยู่ก่อน) พอผูกแล้วคูปองจะขึ้นที่นี่ทันที</div>
                ) : vouchers.list.length > 0 ? (
                  <div className="space-y-1.5">
                    {vouchers.list.map((v: any) => (
                      <div key={v.voucher_id} className="rounded-lg border border-slate-200 px-2.5 py-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800 truncate">{v.voucher_name || v.voucher_code}</span>
                          <span className="shrink-0 rounded bg-rose-100 text-rose-700 px-1.5 py-0.5 text-[10px] font-semibold">{voucherLabel(v)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span className="font-mono">{v.voucher_code}</span>
                          {v.min_basket_price ? <span>· ขั้นต่ำ ฿{Number(v.min_basket_price).toLocaleString()}</span> : null}
                          {v.usage_quantity ? <span>· เหลือ {Math.max(0, (v.usage_quantity || 0) - (v.current_usage || 0))}/{v.usage_quantity}</span> : null}
                        </div>
                        <button onClick={() => sendVoucherCard(v)} disabled={sending}
                          className="w-full mt-0.5 inline-flex items-center justify-center gap-1 rounded-md bg-indigo-600 text-white py-1 disabled:opacity-50">
                          <Fi name="paper-plane" className="text-[11px]" /> ส่งคูปองให้ลูกค้า
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">ร้านนี้ไม่มีคูปองที่กำลังใช้งานอยู่</div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
      </div>

      {/* Image lightbox — pops up in-page (no new tab) */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white" title="ปิด (Esc)">
            <Fi name="cross" className="text-2xl" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg object-contain shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
