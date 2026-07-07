'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Select } from '@/components/ui/input';
import { AnimatedChat } from '@/components/ui/animated-icons';
import { RefreshCw, AlertTriangle, Code, MessageSquare, Send } from 'lucide-react';

const PLATFORM = 'shopee' as const;

interface Shop { shop_id: string; shop_name: string; brand_id: string | null }

// The upstream payload is the platform's raw Shopee SellerChat shape — read defensively.
function convName(c: any): string {
  return c?.to_name || c?.user_nickname || c?.nickname || c?.conversation_id || 'unknown';
}
function convAvatar(c: any): string | null {
  return c?.to_avatar || null;
}
function convLast(c: any): string {
  return (
    c?.latest_message_content?.text ||
    c?.last_message?.plaintext ||
    c?.latest_message?.content ||
    (c?.latest_message_type ? `[${c.latest_message_type}]` : '') ||
    ''
  );
}
/** Buyer's user id — required to send a Shopee reply. */
function convToId(c: any): string | undefined {
  const v = c?.to_id;
  return v === undefined || v === null ? undefined : String(v);
}
function msgText(m: any): string {
  return (
    m?.content?.text ||
    m?.plaintext ||
    (typeof m?.content === 'string' ? m.content : '') ||
    m?.content?.content ||
    `[${m?.message_type || m?.type || 'message'}]`
  );
}
/** In Shopee, a message is from us (the seller) when from_shop_id === the shop we're viewing. */
function isFromSeller(m: any, shopId: string): boolean {
  if (m?.from_shop_id !== undefined) return String(m.from_shop_id) === String(shopId);
  // fallback for TikTok-shaped payloads
  return (m?.sender?.role || m?.role || '').toUpperCase() === 'SELLER';
}

function ErrorBanner({ error, status }: { error: string; status?: number }) {
  const tiktokDown = /502|customer_service|re-authoriz/i.test(error);
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 text-amber-800 text-sm">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold">ดึงข้อมูลไม่สำเร็จ</div>
        <div className="text-amber-700 mt-0.5 break-all">{error}</div>
        {tiktokDown && (
          <div className="text-xs text-amber-600 mt-1">
            ตอนนี้ใช้ได้เฉพาะ Shopee — TikTok จะตอบ 502 จนกว่าร้านจะ re-authorize สิทธิ์ customer_service
          </div>
        )}
      </div>
    </div>
  );
}

function RawToggle({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
        <Code className="w-3 h-3" /> {open ? 'ซ่อน' : 'ดู'} JSON ดิบ
      </button>
      {open && (
        <pre className="mt-2 text-[11px] bg-slate-900 text-slate-100 p-3 rounded-lg overflow-auto max-h-72 scroll-thin">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ChatImportClient({ canReply = false }: { canReply?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState('');
  const [loadingShops, setLoadingShops] = useState(true);
  const [shopErr, setShopErr] = useState<{ error: string; status?: number } | null>(null);

  const [convData, setConvData] = useState<any>(null);
  const [convErr, setConvErr] = useState<{ error: string; status?: number } | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);

  const [activeConv, setActiveConv] = useState<any | null>(null);
  const [msgData, setMsgData] = useState<any>(null);
  const [msgErr, setMsgErr] = useState<{ error: string; status?: number } | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(false);

  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/chat-source/shops?platform=${PLATFORM}`).then(async r => {
      const d = await r.json();
      if (r.ok) { setShops(d.shops || []); if (d.shops?.[0]) setShopId(d.shops[0].shop_id); }
      else setShopErr({ error: d.error || 'error', status: r.status });
    }).catch(e => setShopErr({ error: String(e) })).finally(() => setLoadingShops(false));
  }, []);

  const loadConversations = async (sid = shopId) => {
    if (!sid) return;
    setLoadingConv(true); setConvErr(null); setConvData(null); setActiveConv(null); setMsgData(null);
    const r = await fetch(`/api/chat-source/conversations?platform=${PLATFORM}&shop_id=${encodeURIComponent(sid)}&page_size=20`);
    const d = await r.json();
    if (r.ok) setConvData(d); else setConvErr({ error: d.error || 'error', status: r.status });
    setLoadingConv(false);
  };

  const loadMessages = async (conv: any) => {
    const convId = conv.conversation_id || conv.id;
    setActiveConv(conv); setLoadingMsg(true); setMsgErr(null); setMsgData(null); setSendErr(null);
    const r = await fetch(`/api/chat-source/messages?platform=${PLATFORM}&shop_id=${encodeURIComponent(shopId)}&conversation_id=${encodeURIComponent(convId)}`);
    const d = await r.json();
    if (r.ok) setMsgData(d); else setMsgErr({ error: d.error || 'error', status: r.status });
    setLoadingMsg(false);
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !activeConv) return;
    const toId = convToId(activeConv);
    if (!toId) { setSendErr('ไม่พบ buyer id (to_id) ของบทสนทนานี้ — ส่งไม่ได้'); return; }
    setSending(true); setSendErr(null);
    const r = await fetch('/api/chat-source/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: PLATFORM,
        shop_id: shopId,
        conversation_id: activeConv.conversation_id || activeConv.id,
        to_id: toId,
        text,
      }),
    });
    const d = await r.json();
    setSending(false);
    if (r.ok) { setReply(''); await loadMessages(activeConv); }
    else setSendErr(d.error || 'ส่งไม่สำเร็จ');
  };

  const conversations: any[] = convData?.conversations || [];
  // Shopee returns newest-first; show oldest→newest so the reply box sits at the bottom.
  const messages: any[] = [...(msgData?.messages || [])].reverse();

  return (
    <div className="space-y-4">
      {/* Shop picker */}
      <Card className="p-4 flex items-center gap-3 flex-wrap">
        <ChannelIcon channel="shopee" size="md" />
        <div className="text-sm font-semibold text-slate-700">ร้าน Shopee</div>
        {loadingShops ? (
          <span className="text-sm text-slate-400">กำลังโหลดร้าน...</span>
        ) : shopErr ? (
          <div className="flex-1"><ErrorBanner {...shopErr} /></div>
        ) : (
          <>
            <Select value={shopId} onChange={e => setShopId(e.target.value)} className="max-w-xs">
              {shops.map(s => (
                <option key={s.shop_id} value={s.shop_id}>
                  {s.brand_id ? `[${s.brand_id}] ` : ''}{s.shop_name}
                </option>
              ))}
            </Select>
            <Button onClick={() => loadConversations()} loading={loadingConv} icon={RefreshCw}>ดึงบทสนทนา</Button>
            <span className="text-xs text-slate-400">{shops.length} ร้าน</span>
          </>
        )}
      </Card>

      {convErr && <ErrorBanner {...convErr} />}

      {convData && (
        <div className="grid grid-cols-5 gap-4">
          {/* Conversation list */}
          <Card className="col-span-2 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="font-semibold text-sm">บทสนทนา ({conversations.length})</span>
            </div>
            <div className="divide-y divide-slate-50 max-h-[60vh] overflow-y-auto scroll-thin">
              {conversations.map((c, i) => {
                const id = c.conversation_id || c.id || String(i);
                const active = (activeConv?.conversation_id || activeConv?.id) === id;
                return (
                  <button key={id} onClick={() => loadMessages(c)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 ${active ? 'bg-brand-50' : ''}`}>
                    <Avatar name={convName(c)} src={convAvatar(c)} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{convName(c)}</div>
                      <div className="text-xs text-slate-400 truncate">{convLast(c) || id}</div>
                    </div>
                    {Number(c.unread_count) > 0 && <Badge tone="brand">{c.unread_count}</Badge>}
                  </button>
                );
              })}
              {!conversations.length && <div className="p-6 text-center text-sm text-slate-400">ไม่มีบทสนทนา</div>}
            </div>
            <div className="p-3 border-t border-slate-100"><RawToggle data={convData} /></div>
          </Card>

          {/* Messages + reply */}
          <Card className="col-span-3 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-slate-400" />
              {activeConv ? convName(activeConv) : 'ข้อความ'}
            </div>
            <div className="p-4 max-h-[52vh] overflow-y-auto scroll-thin space-y-2 flex-1">
              {!activeConv && (
                <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
                  <AnimatedChat size={72} />
                  <span className="text-sm">เลือกบทสนทนาทางซ้าย</span>
                </div>
              )}
              {loadingMsg && <div className="text-center text-sm text-slate-400 py-10">กำลังโหลด...</div>}
              {msgErr && <ErrorBanner {...msgErr} />}
              {messages.map((m, i) => {
                const seller = isFromSeller(m, shopId);
                return (
                  <div key={m.message_id || i} className={`flex ${seller ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-md px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${seller ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                      {msgText(m)}
                    </div>
                  </div>
                );
              })}
              {activeConv && !loadingMsg && !msgErr && !messages.length && (
                <div className="text-center text-sm text-slate-400 py-10">ไม่มีข้อความ</div>
              )}
              <div ref={msgEndRef} />
            </div>

            {/* Reply box — human-triggered only */}
            {activeConv && !msgErr && (
              <div className="border-t border-slate-100 p-3 space-y-2">
                {canReply ? (
                  <>
                    <div className="flex items-end gap-2">
                      <textarea
                        value={reply}
                        onChange={e => setReply(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply(); } }}
                        placeholder="พิมพ์ข้อความตอบกลับ… (⌘/Ctrl + Enter เพื่อส่ง)"
                        rows={2}
                        maxLength={2000}
                        className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                      />
                      <Button onClick={sendReply} loading={sending} icon={Send} disabled={!reply.trim()}>ส่ง</Button>
                    </div>
                    {sendErr && <div className="text-xs text-rose-600">{sendErr}</div>}
                    <div className="text-[11px] text-slate-400">ข้อความจะถูกส่งจริงไปยังลูกค้าในนามร้าน — ตอบโดยแอดมินเท่านั้น ยังไม่มี AI ตอบอัตโนมัติ</div>
                  </>
                ) : (
                  <div className="text-xs text-slate-400">บัญชีของคุณไม่มีสิทธิ์ตอบแชท (chat.reply) — ดูได้อย่างเดียว</div>
                )}
              </div>
            )}

            {msgData && <div className="p-3 border-t border-slate-100"><RawToggle data={msgData} /></div>}
          </Card>
        </div>
      )}
    </div>
  );
}
