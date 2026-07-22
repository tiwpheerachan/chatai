'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Brand { id: string; name: string; color?: string }
interface Insights {
  fb: { name: string | null; fans: number | null; followers: number | null; reach28: number | null; engagement28: number | null };
  ig: { username: string | null; followers: number | null; media: number | null; reach28: number | null } | null;
}
const n = (v: number | null) => (v == null ? '—' : v.toLocaleString());

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 px-3 py-2.5"><div className="text-xl font-bold text-slate-900">{value}</div><div className="text-[11px] text-slate-500">{label}</div></div>;
}

export function SocialInsightsClient() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState('');
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/social/insights').then(r => r.json()).then(d => { setBrands(d.brands || []); if (d.brands?.[0]) setBrand(d.brands[0].id); }).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!brand) return;
    setLoading(true); setData(null);
    fetch(`/api/social/insights?brand=${brand}`).then(r => r.json()).then(d => setData(d.insights)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [brand]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2 flex-wrap">
        {brands.map(b => (
          <button key={b.id} onClick={() => setBrand(b.id)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', brand === b.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{b.name}</button>
        ))}
        {!brands.length && !loading && <span className="text-sm text-slate-400">ยังไม่มีเพจที่เชื่อมต่อ</span>}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดสถิติ…</div>
      ) : data ? (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3"><ChannelIcon channel="facebook" size="sm" /><span className="font-semibold text-slate-800">Facebook — {data.fb.name || '-'}</span></div>
            <div className="grid grid-cols-4 gap-2.5">
              <Stat label="ผู้ติดตาม" value={n(data.fb.followers ?? data.fb.fans)} />
              <Stat label="ไลก์เพจ" value={n(data.fb.fans)} />
              <Stat label="การเข้าถึง 28 วัน" value={n(data.fb.reach28)} />
              <Stat label="มีส่วนร่วม 28 วัน" value={n(data.fb.engagement28)} />
            </div>
          </Card>
          {data.ig ? (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3"><ChannelIcon channel="instagram" size="sm" /><span className="font-semibold text-slate-800">Instagram — @{data.ig.username || '-'}</span></div>
              <div className="grid grid-cols-3 gap-2.5">
                <Stat label="ผู้ติดตาม" value={n(data.ig.followers)} />
                <Stat label="โพสต์ทั้งหมด" value={n(data.ig.media)} />
                <Stat label="การเข้าถึง 28 วัน" value={n(data.ig.reach28)} />
              </div>
            </Card>
          ) : (
            <div className="text-xs text-slate-400">แบรนด์นี้ยังไม่ได้ผูกบัญชี Instagram</div>
          )}
          <p className="text-[11px] text-slate-400">* บางค่าอาจขึ้น "—" ถ้า Meta ยังไม่ให้สิทธิ์ metric นั้น หรือเพจใหม่ยังไม่มีข้อมูล 28 วัน</p>
        </div>
      ) : (
        <div className="text-sm text-slate-400 py-8 text-center">ดึงสถิติไม่ได้ (ตรวจสิทธิ์ read_insights หรือเพจยังไม่เชื่อม)</div>
      )}
    </div>
  );
}
