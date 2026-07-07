import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { CHANNEL_META, PLATFORM_CHANNELS } from '@/lib/utils';
import { ChannelIcon } from '@/components/ui/channel-icon';
import Link from 'next/link';
import type { Channel } from '@/types/database';

export default async function ChannelsPage() {
  const supabase = createClient();
  const { data: channels } = await supabase.from('channels').select('*').order('created_at', { ascending: false });
  return (
    <>
      <Topbar title="Channels" subtitle="เชื่อมต่อทุกแพลตฟอร์ม">
        <button className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold">+ เพิ่ม Channel</button>
      </Topbar>
      <div className="p-6 grid grid-cols-3 gap-4 overflow-y-auto scroll-thin flex-1">
        {PLATFORM_CHANNELS.map((k) => {
          const v = CHANNEL_META[k];
          const inst = (channels as Channel[] || []).filter(c => c.type === k);
          const connected = inst.some(i => i.status === 'connected');
          return (
            <Card key={k} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <ChannelIcon channel={k} size="lg" />
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  ● {connected ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม'}
                </span>
              </div>
              <div className="font-semibold">{v.name}</div>
              <div className="text-xs text-slate-500 mb-2">{inst.length} บัญชี</div>
              {inst[0]?.webhook_url && (
                <div className="text-[9px] font-mono bg-slate-50 p-2 rounded mb-2 break-all">{inst[0].webhook_url}</div>
              )}
              <Link href={`/admin/channels/${k}`} className="block w-full text-center text-xs py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                {connected ? 'จัดการ' : '+ เชื่อมต่อ'}
              </Link>
            </Card>
          );
        })}
      </div>
    </>
  );
}
